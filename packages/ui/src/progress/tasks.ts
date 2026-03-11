/**
 * Fluent sequential task builder
 *
 * @deprecated Use `steps()` from `@silvery/ui/progress` instead.
 *
 * @example
 * ```typescript
 * // OLD (deprecated):
 * import { tasks } from "@silvery/ui/progress";
 * const results = await tasks()
 *   .add("Loading", loadModules)
 *   .add("Processing", processData)
 *   .run({ clear: true });
 *
 * // NEW:
 * import { steps } from "@silvery/ui/progress";
 * const results = await steps({
 *   loadModules,
 *   processData,
 * }).run({ clear: true });
 * ```
 */

import type { ProgressInfo } from "../types.js"
import { MultiProgress, type TaskHandle } from "../cli/multi-progress"

// Node.js globals for yielding to event loop
declare function setImmediate(callback: (value?: unknown) => void): unknown
declare function setTimeout(callback: (value?: unknown) => void, ms: number): unknown

/** Phase labels for common operations */
const PHASE_LABELS: Record<string, string> = {
  // Repo loading phases
  discover: "Discovering files",
  parse: "Parsing markdown",
  apply: "Applying changes",
  resolve: "Resolving links",
  materialize: "Evaluating rules",
  // Board building
  board: "Building view",
  // Legacy/alternative names
  reading: "Reading events",
  applying: "Applying events",
  rules: "Evaluating rules",
  scanning: "Scanning files",
  reconciling: "Reconciling changes",
}

/** Task definition */
interface TaskDef<T = unknown> {
  title: string
  work: () => T | PromiseLike<T> | Generator<ProgressInfo, T, unknown>
}

/** Options for run() */
export interface RunOptions {
  /** Clear progress display after completion (default: false) */
  clear?: boolean
}

export interface TaskBuilder {
  /**
   * Add a task to the sequence
   * @param title - Display title
   * @param work - Function, async function, or generator
   */
  add<T>(title: string, work: () => T | PromiseLike<T> | Generator<ProgressInfo, T, unknown>): TaskBuilder

  /**
   * Run all tasks in sequence
   * @param options - Run options
   * @returns Results keyed by task title
   */
  run(options?: RunOptions): Promise<Record<string, unknown>>
}

/**
 * Create a sequential task builder
 *
 * @returns TaskBuilder with add() and run() methods
 */
export function tasks(): TaskBuilder {
  const taskList: TaskDef[] = []

  const builder: TaskBuilder = {
    add<T>(title: string, work: () => T | PromiseLike<T> | Generator<ProgressInfo, T, unknown>): TaskBuilder {
      taskList.push({ title, work })
      return builder
    },

    async run(options?: RunOptions): Promise<Record<string, unknown>> {
      const multi = new MultiProgress()
      const handles = new Map<string, TaskHandle>()
      const results: Record<string, unknown> = {}

      // Register all tasks upfront (shows pending state)
      for (const task of taskList) {
        handles.set(task.title, multi.add(task.title, { type: "spinner" }))
      }

      multi.start()

      try {
        for (const task of taskList) {
          const handle = handles.get(task.title)!

          // Force render before potentially blocking operation
          await new Promise((resolve) => setImmediate(resolve))

          const result = task.work()

          if (isGenerator(result)) {
            // Generator: parent stays static, phases animate underneath
            results[task.title] = await runGenerator(result, handle, task.title, multi)
          } else if (isPromiseLike(result)) {
            handle.start()
            results[task.title] = await result
            handle.complete()
          } else {
            handle.start()
            results[task.title] = result
            handle.complete()
          }
        }
      } finally {
        multi.stop(options?.clear ?? false)
      }

      return results
    },
  }

  return builder
}

/**
 * Run a generator task with progress updates
 * Parent task stays visible while sub-phases are indented below
 */
async function runGenerator<T>(
  gen: Generator<ProgressInfo, T, unknown>,
  parentHandle: TaskHandle,
  baseTitle: string,
  multi: MultiProgress,
): Promise<T> {
  let result = gen.next()
  let currentPhase: string | undefined
  let currentPhaseHandle: TaskHandle | null = null
  let lastInsertId = parentHandle.id // Insert phases after parent (then after each other)
  let phaseStartTime = Date.now()
  const taskStartTime = Date.now()

  while (!result.done) {
    const info = result.value
    const phase = info.phase ?? ""

    // When phase changes, complete current phase and start new one (indented)
    if (phase && phase !== currentPhase) {
      if (currentPhaseHandle && currentPhase) {
        // Complete previous phase with timing
        const elapsed = Date.now() - phaseStartTime
        const prevLabel = PHASE_LABELS[currentPhase] ?? currentPhase
        currentPhaseHandle.complete(`${prevLabel} (${elapsed}ms)`)
      }

      // Start new phase line (indented under parent, inserted after last phase)
      currentPhase = phase
      phaseStartTime = Date.now()
      const phaseLabel = PHASE_LABELS[phase] ?? phase
      currentPhaseHandle = multi.add(phaseLabel, {
        type: "spinner",
        indent: 1,
        insertAfter: lastInsertId,
      })
      lastInsertId = currentPhaseHandle.id
      currentPhaseHandle.start()
    }

    // Update progress count on current phase line
    if (currentPhaseHandle && info.total && info.total > 0) {
      const phaseLabel = PHASE_LABELS[phase] ?? phase
      currentPhaseHandle.setTitle(`${phaseLabel} (${info.current}/${info.total})`)
    }

    // Yield to event loop for animation
    await new Promise((resolve) => setTimeout(resolve, 0))

    result = gen.next()
  }

  // Complete final phase
  if (currentPhaseHandle && currentPhase) {
    const elapsed = Date.now() - phaseStartTime
    const finalLabel = PHASE_LABELS[currentPhase] ?? currentPhase
    currentPhaseHandle.complete(`${finalLabel} (${elapsed}ms)`)
  }

  // Complete parent task with total timing
  const totalElapsed = Date.now() - taskStartTime
  parentHandle.complete(`${baseTitle} (${totalElapsed}ms)`)

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
  return value !== null && typeof value === "object" && typeof (value as PromiseLike<unknown>).then === "function"
}
