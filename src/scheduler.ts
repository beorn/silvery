/**
 * Inkx Render Scheduler
 *
 * Batches rapid state updates to prevent flicker and improve performance.
 * Uses queueMicrotask for coalescing multiple synchronous state changes
 * into a single render pass.
 *
 * Features:
 * - Microtask-based batching (coalesces synchronous updates)
 * - Frame batching to prevent flicker
 * - Resize handling with debounce
 * - Clean shutdown
 */

import { appendFileSync } from "node:fs"
import {
  type Logger,
  createConditionalLogger,
  createLogger,
} from "@beorn/logger"
import { type TerminalBuffer, bufferToText, cellEquals } from "./buffer.js"
import {
  type ResolvedNonTTYMode as ResolvedMode,
  countLines,
  createOutputTransformer,
  resolveNonTTYMode,
  stripAnsi,
} from "./non-tty.js"
import { executeRender } from "./pipeline.js"
import type { InkxNode } from "./types.js"

const log = createConditionalLogger("inkx:scheduler")

// ============================================================================
// Types
// ============================================================================

/**
 * Non-TTY mode for rendering in non-interactive environments.
 */
export type NonTTYMode = "auto" | "tty" | "line-by-line" | "static" | "plain"

/**
 * Resolved non-TTY mode after auto-detection.
 */
export type ResolvedNonTTYMode = Exclude<NonTTYMode, "auto">

export interface SchedulerOptions {
  /** stdout stream for writing output */
  stdout: NodeJS.WriteStream
  /** Root Inkx node */
  root: InkxNode
  /** Debug mode - logs render timing */
  debug?: boolean
  /** Minimum time between frames in ms (default: 16 for ~60fps) */
  minFrameTime?: number
  /** Render mode: fullscreen (absolute positioning) or inline (relative positioning) */
  mode?: "fullscreen" | "inline"
  /**
   * Non-TTY mode for non-interactive environments (default: 'auto')
   *
   * - 'auto': Detect based on environment
   * - 'tty': Force TTY mode
   * - 'line-by-line': Simple line output
   * - 'static': Only output final frame
   * - 'plain': Strip all ANSI codes
   */
  nonTTYMode?: NonTTYMode
}

export interface RenderStats {
  /** Number of renders executed */
  renderCount: number
  /** Number of renders skipped (batched) */
  skippedCount: number
  /** Last render duration in ms */
  lastRenderTime: number
  /** Average render time in ms */
  avgRenderTime: number
}

// ============================================================================
// RenderScheduler Class
// ============================================================================

/**
 * Schedules and batches render operations.
 *
 * Usage:
 * ```ts
 * const scheduler = new RenderScheduler({
 *   stdout: process.stdout,
 *   root: rootNode,
 * });
 *
 * // Schedule renders (automatically batched)
 * scheduler.scheduleRender();
 * scheduler.scheduleRender(); // This won't cause duplicate render
 *
 * // Force immediate render
 * scheduler.forceRender();
 *
 * // Clean shutdown
 * scheduler.dispose();
 * ```
 */
export class RenderScheduler {
  private stdout: NodeJS.WriteStream
  private root: InkxNode
  private debugMode: boolean
  private minFrameTime: number
  private mode: "fullscreen" | "inline"
  private nonTTYMode: ResolvedMode
  private outputTransformer: (content: string, prevLineCount: number) => string
  private log: Logger

  /** Previous buffer for diffing */
  private prevBuffer: TerminalBuffer | null = null

  /** Line count of previous render (for non-TTY modes) */
  private prevLineCount = 0

  /** Accumulated output for static mode */
  private staticOutput = ""

  /** Is a render currently scheduled? */
  private renderScheduled = false

  /** Last render timestamp */
  private lastRenderTime = 0

  /** Pending frame timeout (for frame rate limiting) */
  private frameTimeout: ReturnType<typeof setTimeout> | null = null

  /** Resize listener cleanup */
  private resizeCleanup: (() => void) | null = null

  /** Render statistics */
  private stats: RenderStats = {
    renderCount: 0,
    skippedCount: 0,
    lastRenderTime: 0,
    avgRenderTime: 0,
  }

  /** Is the scheduler disposed? */
  private disposed = false

  constructor(options: SchedulerOptions) {
    this.stdout = options.stdout
    this.root = options.root
    this.debugMode = options.debug ?? false
    this.minFrameTime = options.minFrameTime ?? 16
    this.mode = options.mode ?? "fullscreen"
    this.log = createLogger("inkx:scheduler")

    // Resolve non-TTY mode based on environment
    this.nonTTYMode = resolveNonTTYMode({
      mode: options.nonTTYMode,
      stdout: this.stdout,
    })
    this.outputTransformer = createOutputTransformer(this.nonTTYMode)

    log.debug?.(`non-TTY mode resolved to: ${this.nonTTYMode}`)

    // Listen for terminal resize (only in TTY mode)
    if (this.nonTTYMode === "tty") {
      this.setupResizeListener()
    }
  }

  /**
   * Get the resolved non-TTY mode.
   */
  getNonTTYMode(): ResolvedMode {
    return this.nonTTYMode
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Schedule a render on the next microtask.
   *
   * Multiple calls within the same synchronous execution will be
   * coalesced into a single render.
   */
  scheduleRender(): void {
    if (this.disposed) return

    if (this.renderScheduled) {
      this.stats.skippedCount++
      log.debug?.(`render skipped (batched), total: ${this.stats.skippedCount}`)
      return
    }

    this.renderScheduled = true
    log.debug?.("render scheduled")

    // Use queueMicrotask for batching synchronous updates
    queueMicrotask(() => {
      this.renderScheduled = false

      if (this.disposed) return

      // Check frame rate limiting
      const now = Date.now()
      const timeSinceLastRender = now - this.lastRenderTime

      if (timeSinceLastRender < this.minFrameTime) {
        // Schedule for next frame
        log.debug?.(
          `frame limited, delay: ${this.minFrameTime - timeSinceLastRender}ms`,
        )
        this.scheduleNextFrame(this.minFrameTime - timeSinceLastRender)
      } else {
        this.executeRender()
      }
    })
  }

  /**
   * Force an immediate render, bypassing batching.
   */
  forceRender(): void {
    if (this.disposed) return

    // Cancel any pending scheduled render
    this.renderScheduled = false
    if (this.frameTimeout) {
      clearTimeout(this.frameTimeout)
      this.frameTimeout = null
    }

    this.executeRender()
  }

  /**
   * Get render statistics.
   */
  getStats(): RenderStats {
    return { ...this.stats }
  }

  /**
   * Clear the terminal and reset buffer.
   */
  clear(): void {
    if (this.disposed) return

    // Clear screen and keep cursor hidden
    this.stdout.write("\x1b[2J\x1b[H\x1b[?25l")

    // Reset buffer so next render outputs everything
    this.prevBuffer = null
  }

  /**
   * Dispose the scheduler and clean up resources.
   */
  dispose(): void {
    if (this.disposed) return

    log.info?.(
      `dispose: renders=${this.stats.renderCount}, skipped=${this.stats.skippedCount}, avg=${Math.round(this.stats.avgRenderTime)}ms`,
    )
    this.disposed = true

    // Cancel pending renders
    this.renderScheduled = false
    if (this.frameTimeout) {
      clearTimeout(this.frameTimeout)
      this.frameTimeout = null
    }

    // Remove resize listener
    if (this.resizeCleanup) {
      this.resizeCleanup()
      this.resizeCleanup = null
    }

    // In static mode, output the final frame on dispose
    if (this.nonTTYMode === "static" && this.staticOutput) {
      this.stdout.write(this.staticOutput)
      this.stdout.write("\n")
    }
  }

  /**
   * Get the last rendered output (for static mode).
   * Returns the plain text output that would be written on dispose.
   */
  getStaticOutput(): string {
    return this.staticOutput
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Schedule render for next frame (frame rate limiting).
   */
  private scheduleNextFrame(delay: number): void {
    if (this.frameTimeout) return

    this.frameTimeout = setTimeout(() => {
      this.frameTimeout = null
      if (!this.disposed) {
        this.executeRender()
      }
    }, delay)
  }

  /**
   * Execute the actual render.
   */
  private executeRender(): void {
    using render = this.log.span("render")
    const startTime = Date.now()

    try {
      // Get terminal dimensions
      const width = this.stdout.columns ?? 80
      const height = this.stdout.rows ?? 24

      log.debug?.(
        `render #${this.stats.renderCount + 1}: ${width}x${height}, nonTTYMode=${this.nonTTYMode}`,
      )

      // Run render pipeline
      const { output, buffer } = executeRender(
        this.root,
        width,
        height,
        this.prevBuffer,
        this.mode,
      )

      // Transform output based on non-TTY mode
      let transformedOutput: string
      if (this.nonTTYMode === "tty") {
        // Pass through unchanged
        transformedOutput = output
      } else if (this.nonTTYMode === "static") {
        // Store for final output, don't write yet
        this.staticOutput = stripAnsi(output)
        transformedOutput = ""
      } else {
        // Apply line-by-line or plain transformation
        transformedOutput = this.outputTransformer(output, this.prevLineCount)
        this.prevLineCount = countLines(output)
      }

      // Write output if there's any
      if (transformedOutput.length > 0) {
        this.stdout.write(transformedOutput)
      }

      // Save buffer for next diff
      this.prevBuffer = buffer

      // INKX_CHECK_INCREMENTAL: compare incremental render against fresh render
      if (process.env.INKX_CHECK_INCREMENTAL && this.stats.renderCount > 0) {
        const renderNum = this.stats.renderCount + 1
        const { buffer: freshBuffer } = executeRender(
          this.root,
          width,
          height,
          null,
          {
            mode: this.mode === "fullscreen" ? "fullscreen" : "inline",
            skipLayoutNotifications: true,
          },
        )
        let found = false
        for (let y = 0; y < buffer.height && !found; y++) {
          for (let x = 0; x < buffer.width && !found; x++) {
            const a = buffer.getCell(x, y)
            const b = freshBuffer.getCell(x, y)
            if (!cellEquals(a, b)) {
              found = true
              const incText = bufferToText(buffer)
              const freshText = bufferToText(freshBuffer)
              const msg =
                `INKX_CHECK_INCREMENTAL: MISMATCH at (${x}, ${y}) on render #${renderNum}\n` +
                `  incremental: char=${JSON.stringify(a.char)} fg=${JSON.stringify(a.fg)} bg=${JSON.stringify(a.bg)}\n` +
                `  fresh:       char=${JSON.stringify(b.char)} fg=${JSON.stringify(b.fg)} bg=${JSON.stringify(b.bg)}\n` +
                `--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`
              if (process.env.DEBUG_LOG) {
                appendFileSync(process.env.DEBUG_LOG, msg + "\n")
              }
              log.error(msg)
            }
          }
        }
        if (!found && process.env.DEBUG_LOG) {
          appendFileSync(
            process.env.DEBUG_LOG,
            `INKX_CHECK_INCREMENTAL: render #${renderNum} OK\n`,
          )
        }
      }

      // Update stats
      const renderTime = Date.now() - startTime
      this.stats.renderCount++
      this.stats.lastRenderTime = renderTime
      this.stats.avgRenderTime =
        (this.stats.avgRenderTime * (this.stats.renderCount - 1) + renderTime) /
        this.stats.renderCount
      this.lastRenderTime = Date.now()

      // Record span data
      render.spanData.renderCount = this.stats.renderCount
      render.spanData.renderTime = renderTime
      render.spanData.bytes = transformedOutput.length

      log.debug?.(
        `render #${this.stats.renderCount} complete: ${renderTime}ms, output: ${transformedOutput.length} bytes`,
      )

      if (this.debugMode) {
        this.logDebug(`Render #${this.stats.renderCount} took ${renderTime}ms`)
      }
    } catch (error) {
      // Don't crash on render errors - log and continue
      log.error(`render error: ${error}`)
      this.logError("Render error:", error)

      // Show error indicator in terminal (only in TTY mode)
      if (this.nonTTYMode === "tty") {
        this.stdout.write("\x1b[0m\x1b[31mRender error (see console)\x1b[0m")
      } else {
        this.stdout.write("Render error (see console)\n")
      }
    }
  }

  /**
   * Set up terminal resize listener.
   */
  private setupResizeListener(): void {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null

    const handleResize = () => {
      // Debounce resize events
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }

      resizeTimeout = setTimeout(() => {
        resizeTimeout = null

        // Reset buffer to force full redraw
        this.prevBuffer = null

        // Schedule render
        this.scheduleRender()
      }, 50) // 50ms debounce
    }

    this.stdout.on("resize", handleResize)

    this.resizeCleanup = () => {
      this.stdout.off("resize", handleResize)
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
    }
  }

  /**
   * Log debug message.
   */
  private logDebug(message: string): void {
    // Write to stderr to avoid corrupting terminal output
    process.stderr.write(`[Inkx Debug] ${message}\n`)
  }

  /**
   * Log error message.
   */
  private logError(message: string, error: unknown): void {
    process.stderr.write(`[Inkx Error] ${message}\n`)
    if (error instanceof Error) {
      process.stderr.write(`${error.stack ?? error.message}\n`)
    } else {
      process.stderr.write(`${String(error)}\n`)
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a render scheduler.
 *
 * @param options Scheduler options
 * @returns A new RenderScheduler instance
 */
export function createScheduler(options: SchedulerOptions): RenderScheduler {
  return new RenderScheduler(options)
}

// ============================================================================
// Utility: Simple Render (for testing/debugging)
// ============================================================================

/**
 * Render once to a string (for testing).
 *
 * Does not batch or diff - just runs the pipeline and returns ANSI output.
 */
export function renderToString(
  root: InkxNode,
  width: number,
  height: number,
): string {
  const { output } = executeRender(root, width, height, null)
  return output
}
