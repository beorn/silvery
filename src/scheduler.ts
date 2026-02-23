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
import { type Logger, createLogger } from "@beorn/logger"
import { type TerminalBuffer, bufferToText, cellEquals } from "./buffer.js"
import { buildMismatchContext, formatMismatchContext } from "./debug-mismatch.js"
import {
  type ResolvedNonTTYMode as ResolvedMode,
  countLines,
  createOutputTransformer,
  resolveNonTTYMode,
  stripAnsi,
} from "./non-tty.js"
import { getCursorState } from "./hooks/useCursor.js"
import { copyToClipboard as copyToClipboardImpl } from "./clipboard.js"
import { ANSI, notify as notifyTerminal } from "./output.js"
import { executeRender } from "./pipeline.js"
import type { InkxNode } from "./types.js"

const log = createLogger("inkx:scheduler")

/**
 * Whether synchronized update mode is enabled.
 * Enabled by default. Set INKX_SYNC_UPDATE=0 to disable.
 */
const SYNC_UPDATE_ENABLED = process.env.INKX_SYNC_UPDATE !== "0" && process.env.INKX_SYNC_UPDATE !== "false"

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown when INKX_CHECK_INCREMENTAL detects a mismatch.
 * This error should NOT be caught by general error handlers - it indicates
 * a bug in incremental rendering that needs to be fixed.
 */
export class IncrementalRenderMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IncrementalRenderMismatchError"
  }
}

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
  /** Slow frame warning threshold in ms (default: 50). Set to 0 to disable. */
  slowFrameThreshold?: number
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
  private slowFrameThreshold: number
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

  /** Is the scheduler paused? When paused, renders are deferred until resume. */
  private paused = false

  /** Was a render requested while paused? */
  private pendingWhilePaused = false

  /**
   * Lines written to stdout between renders (inline mode only).
   * When useScrollback or other code writes to stdout, those lines
   * displace the terminal cursor. This offset is consumed on the next render.
   */
  private scrollbackOffset = 0

  constructor(options: SchedulerOptions) {
    this.stdout = options.stdout
    this.root = options.root
    this.debugMode = options.debug ?? false
    this.minFrameTime = options.minFrameTime ?? 16
    this.slowFrameThreshold = options.slowFrameThreshold ?? 50
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

    if (this.paused) {
      this.pendingWhilePaused = true
      return
    }

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
        log.debug?.(`frame limited, delay: ${this.minFrameTime - timeSinceLastRender}ms`)
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

    if (this.paused) {
      this.pendingWhilePaused = true
      return
    }

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
   * Report lines written to stdout between renders (inline mode only).
   * This adjusts cursor position tracking so the next render accounts
   * for the extra lines. Used by useScrollback to notify the scheduler
   * when it writes frozen items to stdout.
   */
  addScrollbackLines(lines: number): void {
    if (this.mode !== "inline" || lines <= 0) return
    this.scrollbackOffset += lines
  }

  /**
   * Send a terminal notification.
   *
   * Auto-detects terminal type and uses the best available method:
   * - iTerm2 → OSC 9
   * - Kitty → OSC 99
   * - Others → BEL
   */
  notify(message: string, opts?: { title?: string }): void {
    if (this.disposed) return
    notifyTerminal(this.stdout, message, opts)
  }

  /**
   * Copy text to the system clipboard via OSC 52.
   * Works across SSH sessions in terminals that support it.
   */
  copyToClipboard(text: string): void {
    if (this.disposed) return
    copyToClipboardImpl(this.stdout, text)
  }

  /**
   * Pause rendering. While paused, scheduled and forced renders are deferred.
   * Input handling continues normally. Call resume() to unpause and force a
   * full redraw. Used for screen-switching (alt screen ↔ normal screen).
   */
  pause(): void {
    if (this.disposed || this.paused) return
    this.paused = true
    this.pendingWhilePaused = false
    log.debug?.("scheduler paused")
  }

  /**
   * Resume rendering after pause. Resets the previous buffer so the next
   * render outputs everything (full redraw), then forces an immediate render.
   */
  resume(): void {
    if (this.disposed || !this.paused) return
    this.paused = false
    log.debug?.("scheduler resumed")

    // Reset buffer for full redraw (alt screen was switched)
    this.prevBuffer = null

    // If anything was deferred, render now
    if (this.pendingWhilePaused) {
      this.pendingWhilePaused = false
      this.executeRender()
    }
  }

  /**
   * Whether the scheduler is currently paused.
   */
  isPaused(): boolean {
    return this.paused
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
  [Symbol.dispose](): void {
    this.dispose()
  }

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
      // Inline mode: use NaN height so layout engine auto-sizes to content.
      // Fullscreen mode: use terminal rows as the constraint.
      const height = this.mode === "inline" ? NaN : (this.stdout.rows ?? 24)

      log.debug?.(`render #${this.stats.renderCount + 1}: ${width}x${height}, nonTTYMode=${this.nonTTYMode}`)

      // Run render pipeline
      const scrollbackOffset = this.scrollbackOffset
      this.scrollbackOffset = 0 // Consume the offset
      const { output, buffer } = executeRender(this.root, width, height, this.prevBuffer, {
        mode: this.mode,
        scrollbackOffset,
        termRows: this.mode === "inline" ? (this.stdout.rows ?? 24) : undefined,
      })

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

      // Build cursor control suffix (position + show/hide).
      // This goes after rendered content so the terminal cursor lands
      // at the right spot after painting.
      let cursorSuffix = ""
      if (this.nonTTYMode === "tty") {
        const cursor = getCursorState()
        if (cursor?.visible) {
          cursorSuffix = ANSI.moveCursor(cursor.x, cursor.y) + ANSI.CURSOR_SHOW
        } else {
          cursorSuffix = ANSI.CURSOR_HIDE
        }
      }

      // Write output wrapped with synchronized update (DEC 2026) for TTY mode.
      // This tells the terminal to batch the output and paint atomically,
      // preventing tearing during rapid screen updates.
      if (transformedOutput.length > 0 || cursorSuffix.length > 0) {
        if (this.nonTTYMode === "tty" && SYNC_UPDATE_ENABLED) {
          this.stdout.write(`${ANSI.SYNC_BEGIN}${transformedOutput}${cursorSuffix}${ANSI.SYNC_END}`)
        } else {
          this.stdout.write(transformedOutput + cursorSuffix)
        }
      }

      // Save buffer for next diff
      this.prevBuffer = buffer

      // INKX_STRICT or INKX_CHECK_INCREMENTAL: compare incremental render against fresh render
      const strictEnv = process.env.INKX_STRICT || process.env.INKX_CHECK_INCREMENTAL
      const strictMode = strictEnv && strictEnv !== "0" && strictEnv !== "false"
      if (strictMode && this.stats.renderCount > 0) {
        const renderNum = this.stats.renderCount + 1
        const { buffer: freshBuffer } = executeRender(this.root, width, height, null, {
          mode: this.mode === "fullscreen" ? "fullscreen" : "inline",
          skipLayoutNotifications: true,
        })
        let found = false
        for (let y = 0; y < buffer.height && !found; y++) {
          for (let x = 0; x < buffer.width && !found; x++) {
            const a = buffer.getCell(x, y)
            const b = freshBuffer.getCell(x, y)
            if (!cellEquals(a, b)) {
              found = true

              // Build rich debug context
              const ctx = buildMismatchContext(this.root, x, y, a, b, renderNum)
              const debugInfo = formatMismatchContext(ctx)

              // Include text output for full picture
              const incText = bufferToText(buffer)
              const freshText = bufferToText(freshBuffer)
              const msg = debugInfo + `--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`

              if (process.env.DEBUG_LOG) {
                appendFileSync(process.env.DEBUG_LOG, msg + "\n")
              }
              log.error(msg)
              // Throw special error that won't be caught by general error handler
              throw new IncrementalRenderMismatchError(msg)
            }
          }
        }
        if (!found && process.env.DEBUG_LOG) {
          appendFileSync(process.env.DEBUG_LOG, `INKX_CHECK_INCREMENTAL: render #${renderNum} OK\n`)
        }
      }

      // Update stats
      const renderTime = Date.now() - startTime
      this.stats.renderCount++
      this.stats.lastRenderTime = renderTime
      this.stats.avgRenderTime =
        (this.stats.avgRenderTime * (this.stats.renderCount - 1) + renderTime) / this.stats.renderCount
      this.lastRenderTime = Date.now()

      // Record span data
      render.spanData.renderCount = this.stats.renderCount
      render.spanData.renderTime = renderTime
      render.spanData.bytes = transformedOutput.length

      log.debug?.(
        `render #${this.stats.renderCount} complete: ${renderTime}ms, output: ${transformedOutput.length} bytes`,
      )

      // First render is always slow (initialization); use 5x threshold for it
      const threshold = this.stats.renderCount <= 1 ? this.slowFrameThreshold * 5 : this.slowFrameThreshold
      if (threshold > 0 && renderTime > threshold) {
        log.warn?.(
          `slow frame: render #${this.stats.renderCount} took ${renderTime}ms (threshold: ${this.slowFrameThreshold}ms, bytes: ${transformedOutput.length})`,
        )
      }

      if (this.debugMode) {
        this.logDebug(`Render #${this.stats.renderCount} took ${renderTime}ms`)
      }
    } catch (error) {
      // Log and re-throw all render errors - the app should handle cleanup
      log.error(`render error: ${error}`)
      this.logError("Render error:", error)
      throw error
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
export function renderToString(root: InkxNode, width: number, height: number): string {
  const { output } = executeRender(root, width, height, null)
  return output
}
