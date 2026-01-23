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

import createDebug from "debug";
import type { TerminalBuffer } from "./buffer.js";
import { executeRender } from "./pipeline.js";
import type { InkxNode } from "./types.js";

const debug = createDebug("inkx:scheduler");

// ============================================================================
// Types
// ============================================================================

export interface SchedulerOptions {
  /** stdout stream for writing output */
  stdout: NodeJS.WriteStream;
  /** Root Inkx node */
  root: InkxNode;
  /** Debug mode - logs render timing */
  debug?: boolean;
  /** Minimum time between frames in ms (default: 16 for ~60fps) */
  minFrameTime?: number;
}

export interface RenderStats {
  /** Number of renders executed */
  renderCount: number;
  /** Number of renders skipped (batched) */
  skippedCount: number;
  /** Last render duration in ms */
  lastRenderTime: number;
  /** Average render time in ms */
  avgRenderTime: number;
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
  private stdout: NodeJS.WriteStream;
  private root: InkxNode;
  private debug: boolean;
  private minFrameTime: number;

  /** Previous buffer for diffing */
  private prevBuffer: TerminalBuffer | null = null;

  /** Is a render currently scheduled? */
  private renderScheduled = false;

  /** Last render timestamp */
  private lastRenderTime = 0;

  /** Pending frame timeout (for frame rate limiting) */
  private frameTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Resize listener cleanup */
  private resizeCleanup: (() => void) | null = null;

  /** Render statistics */
  private stats: RenderStats = {
    renderCount: 0,
    skippedCount: 0,
    lastRenderTime: 0,
    avgRenderTime: 0,
  };

  /** Is the scheduler disposed? */
  private disposed = false;

  constructor(options: SchedulerOptions) {
    this.stdout = options.stdout;
    this.root = options.root;
    this.debug = options.debug ?? false;
    this.minFrameTime = options.minFrameTime ?? 16;

    // Listen for terminal resize
    this.setupResizeListener();
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
    if (this.disposed) return;

    if (this.renderScheduled) {
      this.stats.skippedCount++;
      debug("render skipped (batched), total: %d", this.stats.skippedCount);
      return;
    }

    this.renderScheduled = true;
    debug("render scheduled");

    // Use queueMicrotask for batching synchronous updates
    queueMicrotask(() => {
      this.renderScheduled = false;

      if (this.disposed) return;

      // Check frame rate limiting
      const now = Date.now();
      const timeSinceLastRender = now - this.lastRenderTime;

      if (timeSinceLastRender < this.minFrameTime) {
        // Schedule for next frame
        debug(
          "frame limited, delay: %dms",
          this.minFrameTime - timeSinceLastRender,
        );
        this.scheduleNextFrame(this.minFrameTime - timeSinceLastRender);
      } else {
        this.executeRender();
      }
    });
  }

  /**
   * Force an immediate render, bypassing batching.
   */
  forceRender(): void {
    if (this.disposed) return;

    // Cancel any pending scheduled render
    this.renderScheduled = false;
    if (this.frameTimeout) {
      clearTimeout(this.frameTimeout);
      this.frameTimeout = null;
    }

    this.executeRender();
  }

  /**
   * Get render statistics.
   */
  getStats(): RenderStats {
    return { ...this.stats };
  }

  /**
   * Clear the terminal and reset buffer.
   */
  clear(): void {
    if (this.disposed) return;

    // Clear screen and keep cursor hidden
    this.stdout.write("\x1b[2J\x1b[H\x1b[?25l");

    // Reset buffer so next render outputs everything
    this.prevBuffer = null;
  }

  /**
   * Dispose the scheduler and clean up resources.
   */
  dispose(): void {
    if (this.disposed) return;

    debug(
      "dispose: renders=%d, skipped=%d, avg=%dms",
      this.stats.renderCount,
      this.stats.skippedCount,
      Math.round(this.stats.avgRenderTime),
    );
    this.disposed = true;

    // Cancel pending renders
    this.renderScheduled = false;
    if (this.frameTimeout) {
      clearTimeout(this.frameTimeout);
      this.frameTimeout = null;
    }

    // Remove resize listener
    if (this.resizeCleanup) {
      this.resizeCleanup();
      this.resizeCleanup = null;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Schedule render for next frame (frame rate limiting).
   */
  private scheduleNextFrame(delay: number): void {
    if (this.frameTimeout) return;

    this.frameTimeout = setTimeout(() => {
      this.frameTimeout = null;
      if (!this.disposed) {
        this.executeRender();
      }
    }, delay);
  }

  /**
   * Execute the actual render.
   */
  private executeRender(): void {
    const startTime = Date.now();

    try {
      // Get terminal dimensions
      const width = this.stdout.columns ?? 80;
      const height = this.stdout.rows ?? 24;

      debug("render #%d: %dx%d", this.stats.renderCount + 1, width, height);

      // Run render pipeline
      const { output, buffer } = executeRender(
        this.root,
        width,
        height,
        this.prevBuffer,
      );

      // Write output if there's any
      if (output.length > 0) {
        this.stdout.write(output);
      }

      // Save buffer for next diff
      this.prevBuffer = buffer;

      // Update stats
      const renderTime = Date.now() - startTime;
      this.stats.renderCount++;
      this.stats.lastRenderTime = renderTime;
      this.stats.avgRenderTime =
        (this.stats.avgRenderTime * (this.stats.renderCount - 1) + renderTime) /
        this.stats.renderCount;
      this.lastRenderTime = Date.now();

      debug(
        "render #%d complete: %dms, output: %d bytes",
        this.stats.renderCount,
        renderTime,
        output.length,
      );

      if (this.debug) {
        this.logDebug(`Render #${this.stats.renderCount} took ${renderTime}ms`);
      }
    } catch (error) {
      // Don't crash on render errors - log and continue
      debug("render error: %O", error);
      this.logError("Render error:", error);

      // Show error indicator in terminal
      this.stdout.write("\x1b[0m\x1b[31mRender error (see console)\x1b[0m");
    }
  }

  /**
   * Set up terminal resize listener.
   */
  private setupResizeListener(): void {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      // Debounce resize events
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        resizeTimeout = null;

        // Reset buffer to force full redraw
        this.prevBuffer = null;

        // Schedule render
        this.scheduleRender();
      }, 50); // 50ms debounce
    };

    this.stdout.on("resize", handleResize);

    this.resizeCleanup = () => {
      this.stdout.off("resize", handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }

  /**
   * Log debug message.
   */
  private logDebug(message: string): void {
    // Write to stderr to avoid corrupting terminal output
    process.stderr.write(`[Inkx Debug] ${message}\n`);
  }

  /**
   * Log error message.
   */
  private logError(message: string, error: unknown): void {
    process.stderr.write(`[Inkx Error] ${message}\n`);
    if (error instanceof Error) {
      process.stderr.write(`${error.stack ?? error.message}\n`);
    } else {
      process.stderr.write(`${String(error)}\n`);
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
  return new RenderScheduler(options);
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
  const { output } = executeRender(root, width, height, null);
  return output;
}
