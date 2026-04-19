/**
 * Fluent single-task wrapper
 *
 * @deprecated Use `steps()` from `@silvery/ag-react/ui/progress` instead.
 *
 * @example
 * ```typescript
 * // OLD (deprecated):
 * import { task } from "./index";
 * const data = await task("Loading data").wrap(fetchData());
 *
 * // NEW:
 * import { steps } from "./index";
 * const results = await steps({ loadData: fetchData }).run();
 * ```
 */

import type { ProgressInfo } from "../types.js"
import { createSpinner } from "../cli/spinner"

/** Phase labels for common operations */
const PHASE_LABELS: Record<string, string> = {
  reading: "Reading events",
  applying: "Applying events",
  rules: "Evaluating rules",
  scanning: "Scanning files",
  reconciling: "Reconciling changes",
  board: "Building view",
}

export interface TaskWrapper {
  /**
   * Wrap work with a spinner indicator
   * @param work - Promise, function, or generator
   */
  wrap<T>(
    work:
      | T
      | PromiseLike<T>
      | (() => T | PromiseLike<T>)
      | (() => Generator<ProgressInfo, T, unknown>),
  ): Promise<T>
}

/**
 * Create a task wrapper with spinner
 *
 * @param title - Display title for the task
 * @returns TaskWrapper with wrap() method
 */
export function task(title: string): TaskWrapper {
  return {
    async wrap<T>(
      work:
        | T
        | PromiseLike<T>
        | (() => T | PromiseLike<T>)
        | (() => Generator<ProgressInfo, T, unknown>),
    ): Promise<T> {
      const spinner = createSpinner()
      spinner(title)

      try {
        // If it's a function, call it
        if (typeof work === "function") {
          const result = (work as () => unknown)()

          // Check if it's a generator
          if (isGenerator(result)) {
            return await runGenerator(result as Generator<ProgressInfo, T, unknown>, spinner, title)
          }

          // Check if it's a promise
          if (isPromiseLike(result)) {
            const value = await result
            spinner.succeed(title)
            return value as T
          }

          // Sync function
          spinner.succeed(title)
          return result as T
        }

        // If it's a promise-like, await it
        if (isPromiseLike(work)) {
          const value = await work
          spinner.succeed(title)
          return value as T
        }

        // Otherwise it's a direct value
        spinner.succeed(title)
        return work as T
      } catch (error) {
        spinner.fail(title)
        throw error
      }
    },
  }
}

/**
 * Run a generator with progress updates
 */
async function runGenerator<T>(
  gen: Generator<ProgressInfo, T, unknown>,
  spinner: ReturnType<typeof createSpinner>,
  baseTitle: string,
): Promise<T> {
  let result = gen.next()

  while (!result.done) {
    const info = result.value
    const phase = info.phase ?? ""
    const phaseLabel = PHASE_LABELS[phase] ?? (phase || baseTitle)

    // Update spinner with phase and progress count
    if (info.total && info.total > 0) {
      spinner(`${phaseLabel} (${info.current}/${info.total})`)
    } else {
      spinner(phaseLabel)
    }

    // Yield to event loop for animation
    await new Promise((resolve) => setImmediate(resolve))

    result = gen.next()
  }

  spinner.succeed(baseTitle)
  return result.value
}

function isGenerator(value: unknown): value is Generator<ProgressInfo, unknown, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Generator).next === "function" &&
    typeof (value as Generator).throw === "function"
  )
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as PromiseLike<unknown>).then === "function"
  )
}
