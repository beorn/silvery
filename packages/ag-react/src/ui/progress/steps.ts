/**
 * Sequential step runner with progress display
 *
 * Supports two modes:
 *
 * ## Declarative Mode (recommended)
 *
 * Pass an object to declare all steps upfront:
 *
 * ```typescript
 * import { steps, step } from "./index";
 *
 * const loader = steps({
 *   loadModules,           // Auto-named: "Load modules"
 *   loadRepo: {           // Group: "Load repo"
 *     discover,            //   "Discover"
 *     parse,               //   "Parse"
 *   },
 * });
 *
 * const results = await loader.run({ clear: true });
 *
 * // Inside work functions, use step() to report progress:
 * async function discover() {
 *   const files = await glob("**\/*.md");
 *   for (let i = 0; i < files.length; i++) {
 *     step().progress(i + 1, files.length);
 *     await process(files[i]);
 *   }
 *   return files;
 * }
 * ```
 *
 * ## Fluent Mode (legacy)
 *
 * Chain steps with `.run()` and execute with `.execute()`:
 *
 * ```typescript
 * await steps()
 *   .run("Loading modules", () => import("./app"))
 *   .run("Building view", async () => buildView())
 *   .execute();
 * ```
 *
 * Generators can yield sub-step progress:
 * - Yield a **string** to create a new sub-step
 * - Yield an **object** `{ current, total }` to update progress on current sub-step
 */

import { MultiProgress, type TaskHandle } from "../cli/multi-progress"
import { stepsDeclarative, type StepsRunner } from "./declarative"
import type { StepsDef } from "./step-node"

// Re-export step() context helper
export { step } from "./als-context"

// Re-export types from declarative
export type { StepsRunner } from "./declarative"
export type { StepsDef, StepNode } from "./step-node"
export type { StepContext } from "./als-context"

// Node.js globals for yielding to event loop
declare function setImmediate(callback: (value?: unknown) => void): unknown
declare function setTimeout(callback: (value?: unknown) => void, ms: number): unknown

/** Progress update (object form) */
interface ProgressUpdate {
  current?: number
  total?: number
}

/** Declare all sub-steps upfront (optional, yield as first value) */
interface DeclareSteps {
  declare: string[]
}

/** What generators can yield */
type StepYield = string | ProgressUpdate | DeclareSteps

/**
 * Controller for creating and updating sub-steps
 *
 * Passed to work functions that need to report sub-step progress.
 */
export interface StepController {
  /** Create a new sub-step (auto-completes previous sub-step) */
  new (label: string): void

  /** Update progress on current sub-step */
  progress(current: number, total: number): void

  /** Explicitly complete current sub-step (optional - new() auto-completes) */
  done(): void
}

/** Work function types */
type SyncWork<T> = () => T
type AsyncWork<T> = () => PromiseLike<T>
type SyncGeneratorWork<T> = () => Generator<StepYield, T, unknown>
type AsyncGeneratorWork<T> = () => AsyncGenerator<StepYield, T, unknown>
/** Work function with step controller for sub-step progress */
type WorkWithStep<T> = (step: StepController) => T | PromiseLike<T>

type WorkFn<T> =
  | SyncWork<T>
  | AsyncWork<T>
  | SyncGeneratorWork<T>
  | AsyncGeneratorWork<T>
  | WorkWithStep<T>

/** Step definition */
interface StepDef<T = unknown> {
  title: string
  work: WorkFn<T>
}

/** Options for execute() */
export interface ExecuteOptions {
  /** Clear progress display after completion (default: false) */
  clear?: boolean
}

export interface StepBuilder {
  /**
   * Add a step to run
   *
   * @param title - Display title for this step
   * @param work - Function to execute. Can be:
   *   - Sync function: `() => result`
   *   - Async function: `async () => result`
   *   - Sync generator: `function* () { yield "sub-step"; return result; }`
   *   - Async generator: `async function* () { yield "sub-step"; return result; }`
   *
   * Generators can yield:
   *   - `"string"` - Creates a new sub-step with that label
   *   - `{ current: N, total: M }` - Updates progress on current sub-step
   */
  run<T>(title: string, work: WorkFn<T>): StepBuilder

  /**
   * Execute all steps in sequence
   * @param options - Execution options
   * @returns Results keyed by step title
   */
  execute(options?: ExecuteOptions): Promise<Record<string, unknown>>
}

/**
 * Create a step runner
 *
 * @overload Declarative mode - pass an object to declare steps upfront
 * @overload Fluent mode - chain steps with .run() and execute with .execute()
 *
 * @example Declarative mode (recommended)
 * ```typescript
 * const loader = steps({
 *   loadModules,
 *   loadRepo: { discover, parse },
 * });
 * const results = await loader.run({ clear: true });
 * ```
 *
 * @example Fluent mode
 * ```typescript
 * await steps()
 *   .run("Step 1", doStep1)
 *   .run("Step 2", doStep2)
 *   .execute();
 * ```
 */
export function steps<T extends StepsDef>(def: T): StepsRunner<T>
export function steps(): StepBuilder
export function steps<T extends StepsDef>(def?: T): StepsRunner<T> | StepBuilder {
  // Declarative mode: object passed
  if (def !== undefined) {
    return stepsDeclarative(def)
  }

  // Fluent mode: no arguments
  return createFluentBuilder()
}

/**
 * Create a no-op StepController for work functions that don't use sub-steps.
 * This satisfies the type union while being harmless if not used.
 */
function createNoopStepController(): StepController {
  const controller = (_label: string) => {}
  controller.progress = (_current: number, _total: number) => {}
  controller.done = () => {}
  // StepController uses `new` as a callable signature, not a constructor
  return controller as unknown as StepController
}

/**
 * Create the fluent step builder (legacy mode)
 */
function createFluentBuilder(): StepBuilder {
  const stepList: StepDef[] = []

  const builder: StepBuilder = {
    run<T>(title: string, work: WorkFn<T>): StepBuilder {
      stepList.push({ title, work: work as WorkFn<unknown> })
      return builder
    },

    async execute(options?: ExecuteOptions): Promise<Record<string, unknown>> {
      const multi = new MultiProgress()
      const handles = new Map<string, TaskHandle>()
      const results: Record<string, unknown> = {}

      // Register all steps upfront (shows pending state)
      for (const step of stepList) {
        handles.set(step.title, multi.add(step.title, { type: "spinner" }))
      }

      multi.start()

      try {
        for (const step of stepList) {
          const handle = handles.get(step.title)!

          // Yield to event loop before potentially blocking work
          await new Promise((resolve) => setImmediate(resolve))

          const result = step.work(createNoopStepController())

          if (isAsyncGenerator(result)) {
            // Async generator: parent stays static while sub-steps animate
            results[step.title] = await runAsyncGenerator(result, handle, step.title, multi)
          } else if (isSyncGenerator(result)) {
            // Sync generator: same handling
            results[step.title] = await runSyncGenerator(result, handle, step.title, multi)
          } else if (isPromiseLike(result)) {
            handle.start()
            results[step.title] = await result
            handle.complete()
          } else {
            handle.start()
            results[step.title] = result
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
 * Process a yielded value:
 * - { declare: [...] } = declare all sub-steps upfront (show as pending)
 * - string = start/create a sub-step with that label
 * - { current, total } = update progress on current sub-step
 */
function processYield(value: StepYield, state: GeneratorState, multi: MultiProgress): void {
  // Handle declaration of all sub-steps upfront
  if (isDeclareSteps(value)) {
    for (const label of value.declare) {
      const handle = multi.add(label, {
        type: "spinner",
        indent: 1,
        insertAfter: state.lastInsertId,
      })
      state.lastInsertId = handle.id
      state.declaredSteps.set(label, handle)
    }
    return
  }

  if (typeof value === "string") {
    // String = start a sub-step with this label
    if (state.currentHandle && state.currentLabel) {
      const elapsed = Date.now() - state.subStepStartTime
      state.currentHandle.complete(elapsed)
    }

    state.currentLabel = value
    state.subStepStartTime = Date.now()

    // Use pre-declared handle if available, otherwise create new one
    const declared = state.declaredSteps.get(value)
    if (declared) {
      state.currentHandle = declared
      state.currentHandle.start()
    } else {
      state.currentHandle = multi.add(value, {
        type: "spinner",
        indent: 1,
        insertAfter: state.lastInsertId,
      })
      state.lastInsertId = state.currentHandle.id
      state.currentHandle.start()
    }
  } else if (value && typeof value === "object") {
    // Object = progress update on current sub-step
    const { current, total } = value as ProgressUpdate
    if (state.currentHandle && total && total > 0) {
      state.currentHandle.setTitle(`${state.currentLabel} (${current ?? 0}/${total})`)
    }
  }
}

function isDeclareSteps(value: StepYield): value is DeclareSteps {
  return (
    value !== null &&
    typeof value === "object" &&
    "declare" in value &&
    Array.isArray((value as DeclareSteps).declare)
  )
}

/** State for generator processing */
interface GeneratorState {
  currentLabel: string | undefined
  currentHandle: TaskHandle | null
  lastInsertId: string
  subStepStartTime: number
  startTime: number
  /** Pre-declared sub-steps (pending until started) */
  declaredSteps: Map<string, TaskHandle>
}

/**
 * Run an async generator step
 */
async function runAsyncGenerator<T>(
  gen: AsyncGenerator<StepYield, T, unknown>,
  parentHandle: TaskHandle,
  parentTitle: string,
  multi: MultiProgress,
): Promise<T> {
  const state: GeneratorState = {
    currentLabel: undefined,
    currentHandle: null,
    lastInsertId: parentHandle.id,
    subStepStartTime: Date.now(),
    startTime: Date.now(),
    declaredSteps: new Map(),
  }

  let result = await gen.next()

  while (!result.done) {
    processYield(result.value, state, multi)

    // Yield to event loop for animation
    await new Promise((resolve) => setTimeout(resolve, 0))

    result = await gen.next()
  }

  // Complete final sub-step
  if (state.currentHandle && state.currentLabel) {
    const elapsed = Date.now() - state.subStepStartTime
    state.currentHandle.complete(elapsed)
  }

  // Complete parent step
  const totalElapsed = Date.now() - state.startTime
  parentHandle.complete(totalElapsed)

  return result.value
}

/**
 * Run a sync generator step
 */
async function runSyncGenerator<T>(
  gen: Generator<StepYield, T, unknown>,
  parentHandle: TaskHandle,
  parentTitle: string,
  multi: MultiProgress,
): Promise<T> {
  const state: GeneratorState = {
    currentLabel: undefined,
    currentHandle: null,
    lastInsertId: parentHandle.id,
    subStepStartTime: Date.now(),
    startTime: Date.now(),
    declaredSteps: new Map(),
  }

  let result = gen.next()

  while (!result.done) {
    processYield(result.value, state, multi)

    // Yield to event loop for animation
    await new Promise((resolve) => setTimeout(resolve, 0))

    result = gen.next()
  }

  // Complete final sub-step
  if (state.currentHandle && state.currentLabel) {
    const elapsed = Date.now() - state.subStepStartTime
    state.currentHandle.complete(elapsed)
  }

  // Complete parent step
  const totalElapsed = Date.now() - state.startTime
  parentHandle.complete(totalElapsed)

  return result.value
}

function isAsyncGenerator(value: unknown): value is AsyncGenerator<StepYield, unknown, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as AsyncGenerator).next === "function" &&
    typeof (value as AsyncGenerator)[Symbol.asyncIterator] === "function"
  )
}

function isSyncGenerator(value: unknown): value is Generator<StepYield, unknown, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Generator).next === "function" &&
    typeof (value as Generator)[Symbol.iterator] === "function"
  )
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as PromiseLike<unknown>).then === "function"
  )
}
