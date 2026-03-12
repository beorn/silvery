/**
 * withProgress - Wrap callback-based progress functions
 *
 * @deprecated Use `steps()` from `@silvery/ui/progress` instead.
 *
 * @example
 * ```typescript
 * // OLD (deprecated):
 * import { withProgress } from "@silvery/ui/wrappers";
 * const result = await withProgress(
 *   (onProgress) => manager.syncFromFs(onProgress),
 *   { phases: SYNC_PHASES }
 * );
 *
 * // NEW:
 * import { steps } from "@silvery/ui/progress";
 * const results = await steps({ syncFiles: () => manager.syncFromFs() }).run();
 * ```
 */

import type { ProgressInfo, ProgressCallback, WithProgressOptions } from "../types.js"
import { ProgressBar } from "../cli/progress-bar"
import { Spinner } from "../cli/spinner"
import { CURSOR_HIDE, CURSOR_SHOW, write, isTTY } from "../cli/ansi"

// Declare timer globals (not exposed by bun-types)
declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(id: unknown): void

// Timer type - opaque handle, we only store and clear it
type TimerId = unknown

/**
 * Wrap a function that takes a progress callback
 *
 * @example
 * ```ts
 * // Wrap existing km sync API
 * const result = await withProgress(
 *   (onProgress) => manager.syncFromFs(onProgress),
 *   {
 *     phases: {
 *       scanning: "Scanning files",
 *       reconciling: "Reconciling changes",
 *       rules: "Evaluating rules"
 *     }
 *   }
 * );
 *
 * // Simple usage without phases
 * await withProgress((onProgress) => rebuildState(onProgress));
 *
 * // With custom format
 * await withProgress(
 *   (p) => processFiles(p),
 *   { format: ":phase :bar :percent" }
 * );
 *
 * // Show loading immediately (showAfter: 0) or after delay
 * await withProgress(
 *   (p) => slowOperation(p),
 *   { showAfter: 1000, initialMessage: "Loading..." }
 * );
 * ```
 */
export async function withProgress<T>(
  fn: (onProgress: ProgressCallback) => T | Promise<T>,
  options: WithProgressOptions = {},
): Promise<T> {
  const stream = process.stdout
  const isTty = isTTY(stream)

  // Determine format
  const format =
    options.format ?? (options.phases ? ":phase [:bar] :current/:total" : "[:bar] :current/:total :percent")

  const bar = new ProgressBar({
    format,
    phases: options.phases ?? {},
    hideCursor: true,
  })

  let lastPhase: string | null = null
  let started = false

  // Initial spinner (shown before progress starts)
  const showAfter = options.showAfter ?? 1000
  const initialMessage = options.initialMessage ?? "Loading..."
  let spinner: Spinner | null = null
  let spinnerTimerId: TimerId | null = null

  // Hide cursor
  if (isTty) {
    write(CURSOR_HIDE, stream)
  }

  // Schedule initial spinner if configured
  if (isTty && showAfter >= 0) {
    spinnerTimerId = setTimeout(() => {
      if (!started) {
        spinner = new Spinner({ text: initialMessage })
        spinner.start()
      }
    }, showAfter)
  }

  const onProgress: ProgressCallback = (info: ProgressInfo) => {
    // Stop initial spinner if it was shown
    if (spinner) {
      spinner.stop()
      spinner = null
    }
    if (spinnerTimerId !== null) {
      clearTimeout(spinnerTimerId)
      spinnerTimerId = null
    }

    // Handle phase transitions
    if (info.phase && info.phase !== lastPhase) {
      if (lastPhase !== null && isTty) {
        // Print newline before switching phases
        write("\n", stream)
      }
      lastPhase = info.phase

      // Start or update bar with new phase
      if (!started) {
        bar.start(info.current, info.total)
        started = true
      }
      bar.setPhase(info.phase, { current: info.current, total: info.total })
    } else {
      if (!started) {
        bar.start(info.current, info.total)
        started = true
      }
      bar.update(info.current)
    }
  }

  try {
    const result = await fn(onProgress)

    // Clean up spinner if still pending
    if (spinnerTimerId !== null) {
      clearTimeout(spinnerTimerId)
    }
    // Note: spinner may be set by setTimeout callback - TS can't track this
    const pendingSpinner = spinner as unknown as Spinner | null
    if (pendingSpinner) {
      pendingSpinner.stop()
    }

    // Stop and show cursor
    if (started) {
      bar.stop(options.clearOnComplete)
    }
    if (isTty) {
      write(CURSOR_SHOW, stream)
    }

    return result
  } catch (error) {
    // Clean up spinner
    if (spinnerTimerId !== null) {
      clearTimeout(spinnerTimerId)
    }
    // Note: spinner may be set by setTimeout callback - TS can't track this
    const errorSpinner = spinner as unknown as Spinner | null
    if (errorSpinner) {
      errorSpinner.stop()
    }

    // Restore cursor on error
    if (started) {
      bar.stop()
    }
    if (isTty) {
      write(CURSOR_SHOW, stream)
    }
    throw error
  }
}

/**
 * Create a progress callback that can be passed to existing APIs
 * Returns [callback, complete] tuple
 *
 * @example
 * ```ts
 * const [onProgress, complete] = createProgressCallback({
 *   phases: { scanning: "Scanning", reconciling: "Reconciling" }
 * });
 *
 * const result = await manager.syncFromFs(onProgress);
 * complete();
 * ```
 */
export function createProgressCallback(options: WithProgressOptions = {}): [ProgressCallback, () => void] {
  const stream = process.stdout
  const isTty = isTTY(stream)

  const format =
    options.format ?? (options.phases ? ":phase [:bar] :current/:total" : "[:bar] :current/:total :percent")

  const bar = new ProgressBar({
    format,
    phases: options.phases ?? {},
    hideCursor: true,
  })

  let lastPhase: string | null = null
  let started = false

  if (isTty) {
    write(CURSOR_HIDE, stream)
  }

  const callback: ProgressCallback = (info: ProgressInfo) => {
    if (info.phase && info.phase !== lastPhase) {
      if (lastPhase !== null && isTty) {
        write("\n", stream)
      }
      lastPhase = info.phase

      if (!started) {
        bar.start(info.current, info.total)
        started = true
      }
      bar.setPhase(info.phase, { current: info.current, total: info.total })
    } else {
      if (!started) {
        bar.start(info.current, info.total)
        started = true
      }
      bar.update(info.current)
    }
  }

  const complete = () => {
    if (started) {
      bar.stop(options.clearOnComplete)
    }
    if (isTty) {
      write(CURSOR_SHOW, stream)
    }
  }

  return [callback, complete]
}
