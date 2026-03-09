/**
 * AsyncLocalStorage context for step progress reporting
 *
 * Provides a `step()` function that work functions can call to report progress.
 * Returns a no-op context when called outside of a steps() execution context,
 * so functions work in tests without the progress UI.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import type { TaskHandle } from "../cli/multi-progress"

/**
 * Context available to work functions during step execution
 */
export interface StepContext {
  /** Update progress on current step */
  progress(current: number, total: number): void

  /** Create a sub-step (auto-completes previous sub-step) */
  sub(label: string): void

  /** Get current step label (for debugging) */
  readonly label: string
}

/**
 * Internal context with additional fields for the runner
 */
export interface InternalStepContext extends StepContext {
  /** TaskHandle for this step */
  readonly handle: TaskHandle

  /** Add a sub-step handle (called by runner) */
  _addSubHandle(label: string, handle: TaskHandle): void

  /** Get a pre-declared sub-step handle by label */
  _getSubHandle(label: string): TaskHandle | undefined

  /** Set the current sub-step (when starting a pre-declared step) */
  _setCurrentSubHandle(label: string, handle: TaskHandle): void

  /** Complete current sub-step (called by runner) */
  _completeSubStep(): void
}

// AsyncLocalStorage instance
const stepContext = new AsyncLocalStorage<InternalStepContext>()

/**
 * Get the current step context
 *
 * Safe to call anywhere - returns a no-op context when called outside
 * of a steps() execution context.
 *
 * @example
 * ```typescript
 * async function processFiles(files: string[]) {
 *   for (let i = 0; i < files.length; i++) {
 *     step().progress(i + 1, files.length);
 *     await process(files[i]);
 *   }
 * }
 *
 * // In tests (no steps context)
 * await processFiles(["a.md", "b.md"]);  // step() returns no-op, no errors
 *
 * // In production (with steps context)
 * await steps({ process: processFiles }).run();  // Shows progress
 * ```
 */
export function step(): StepContext {
  return stepContext.getStore() ?? NO_OP_CONTEXT
}

/**
 * Run a function with step context (internal use by runner)
 */
export function runWithStepContext<T>(ctx: InternalStepContext, fn: () => T): T {
  return stepContext.run(ctx, fn)
}

/**
 * Create an internal step context for the runner
 */
export function createStepContext(
  label: string,
  handle: TaskHandle,
  onSubStep?: (label: string) => TaskHandle,
): InternalStepContext {
  let currentSubLabel: string | undefined
  let currentSubHandle: TaskHandle | null = null
  let subStepStartTime = 0
  const declaredHandles = new Map<string, TaskHandle>()

  return {
    get label() {
      return label
    },

    get handle() {
      return handle
    },

    progress(current: number, total: number) {
      if (currentSubHandle) {
        currentSubHandle.setTitle(`${currentSubLabel} (${current}/${total})`)
      } else {
        handle.setTitle(`${label} (${current}/${total})`)
      }
    },

    sub(subLabel: string) {
      // Complete previous sub-step if any
      this._completeSubStep()

      currentSubLabel = subLabel
      subStepStartTime = Date.now()

      if (onSubStep) {
        currentSubHandle = onSubStep(subLabel)
        currentSubHandle.start()
      }
    },

    _addSubHandle(subLabel: string, subHandle: TaskHandle) {
      declaredHandles.set(subLabel, subHandle)
    },

    _getSubHandle(subLabel: string) {
      return declaredHandles.get(subLabel)
    },

    _setCurrentSubHandle(subLabel: string, subHandle: TaskHandle) {
      currentSubLabel = subLabel
      currentSubHandle = subHandle
      subStepStartTime = Date.now()
    },

    _completeSubStep() {
      if (currentSubHandle && currentSubLabel) {
        const elapsed = Date.now() - subStepStartTime
        // Use numeric timing - preserves current title (which may have progress info)
        currentSubHandle.complete(elapsed)
        currentSubHandle = null
        currentSubLabel = undefined
      }
    },
  }
}

/**
 * No-op context for when step() is called outside execution context
 */
const NO_OP_CONTEXT: StepContext = {
  progress: () => {},
  sub: () => {},
  get label() {
    return ""
  },
}
