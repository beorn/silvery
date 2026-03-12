/**
 * Declarative steps implementation
 *
 * Provides the declarative overload for steps() that accepts an object
 * structure and shows all steps upfront before execution.
 */

import { MultiProgress, type TaskHandle } from "../cli/multi-progress"
import {
  step as getStepContext,
  createStepContext,
  runWithStepContext,
  type InternalStepContext,
} from "./als-context"
import {
  parseStepsDef,
  flattenStepNodes,
  getLeafNodes,
  type StepNode,
  type StepsDef,
} from "./step-node"

// Re-export step() for convenience
export { step } from "./als-context"

// Node.js globals for yielding to event loop
declare function setImmediate(callback: (value?: unknown) => void): unknown
declare function setTimeout(callback: (value?: unknown) => void, ms: number): unknown

/**
 * Options for run() and pipe() execution
 */
export interface ExecuteOptions {
  /** Clear progress display after completion (default: false) */
  clear?: boolean
}

/**
 * Extract the return type from a generator or async generator
 */
type GeneratorReturn<T> =
  T extends Generator<unknown, infer R, unknown>
    ? R
    : T extends AsyncGenerator<unknown, infer R, unknown>
      ? R
      : T

/**
 * Unwrap the result type, handling generators specially
 */
type UnwrapResult<T> = Awaited<GeneratorReturn<Awaited<T>>>

/**
 * Result type: maps step keys to their return values
 */
type StepResults<T extends StepsDef> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => infer R
    ? UnwrapResult<R>
    : T[K] extends [string, (...args: unknown[]) => infer R]
      ? UnwrapResult<R>
      : T[K] extends StepsDef
        ? StepResults<T[K]>
        : unknown
}

/**
 * The runner object returned by steps()
 */
export interface StepsRunner<T extends StepsDef> {
  /** Internal: the parsed step nodes (for testing) */
  readonly _steps: StepNode[]

  /**
   * Execute all steps sequentially
   * @returns Results keyed by step name
   */
  run(options?: ExecuteOptions): Promise<StepResults<T>>

  /**
   * Execute all steps in a pipeline (each receives previous result)
   * @returns Final step's result
   */
  pipe(options?: ExecuteOptions): Promise<unknown>

  /**
   * Manually signal completion (for manual execution mode)
   */
  done(options?: { clear?: boolean }): void
}

/**
 * Create a declarative steps runner
 *
 * @param def - Object structure defining steps
 * @returns StepsRunner with run(), pipe(), and done() methods
 *
 * @example
 * ```typescript
 * const loader = stepsDeclarative({
 *   loadModules,           // "Load modules"
 *   loadRepo: {           // "Load repo" (group)
 *     discover,            //   "Discover"
 *     parse,               //   "Parse"
 *   },
 * });
 *
 * const results = await loader.run({ clear: true });
 * ```
 */
export function stepsDeclarative<T extends StepsDef>(def: T): StepsRunner<T> {
  const rootNodes = parseStepsDef(def)
  const allNodes = flattenStepNodes(rootNodes)

  let multi: MultiProgress | null = null
  const handles = new Map<StepNode, TaskHandle>()

  // Build group tracking: map each group to its leaf nodes
  const groupLeaves = new Map<StepNode, StepNode[]>()
  const leafToGroups = new Map<StepNode, StepNode[]>()

  for (const node of allNodes) {
    if (node.children) {
      const leaves = getLeafNodes([node])
      groupLeaves.set(node, leaves)
      for (const leaf of leaves) {
        const groups = leafToGroups.get(leaf) ?? []
        groups.push(node)
        leafToGroups.set(leaf, groups)
      }
    }
  }

  return {
    get _steps() {
      return rootNodes
    },

    async run(options?: ExecuteOptions): Promise<StepResults<T>> {
      multi = new MultiProgress()

      // Register all steps upfront (shows pending state)
      registerAllSteps(allNodes, multi, handles)

      // Group timing tracking
      const groupStartTimes = new Map<StepNode, number>()
      const completedLeaves = new Set<StepNode>()

      multi.start()

      // Yield to event loop to ensure initial render is displayed
      // before we start modifying task states
      await new Promise((resolve) => setImmediate(resolve))

      const results: Record<string, unknown> = {}

      try {
        // Execute each step with work
        for (const node of allNodes) {
          if (node.work) {
            // Start parent groups if not started
            const groups = leafToGroups.get(node) ?? []
            for (const group of groups) {
              if (!groupStartTimes.has(group)) {
                groupStartTimes.set(group, Date.now())
                handles.get(group)?.start()
              }
            }

            const result = await executeStep(node, handles, multi)
            setNestedResult(results, node.key, result)

            // Mark leaf as complete and check group completion
            completedLeaves.add(node)
            for (const group of groups) {
              const leaves = groupLeaves.get(group) ?? []
              if (leaves.every((l) => completedLeaves.has(l))) {
                const elapsed = Date.now() - groupStartTimes.get(group)!
                handles.get(group)?.complete(elapsed)
              }
            }
          }
        }
      } finally {
        multi.stop(options?.clear ?? false)
      }

      return results as StepResults<T>
    },

    async pipe(options?: ExecuteOptions): Promise<unknown> {
      multi = new MultiProgress()

      // Register all steps upfront
      registerAllSteps(allNodes, multi, handles)

      // Group timing tracking
      const groupStartTimes = new Map<StepNode, number>()
      const completedLeaves = new Set<StepNode>()

      multi.start()

      // Yield to event loop to ensure initial render is displayed
      // before we start modifying task states
      await new Promise((resolve) => setImmediate(resolve))

      let previousResult: unknown = undefined

      try {
        // Execute each step, passing previous result
        for (const node of allNodes) {
          if (node.work) {
            // Start parent groups if not started
            const groups = leafToGroups.get(node) ?? []
            for (const group of groups) {
              if (!groupStartTimes.has(group)) {
                groupStartTimes.set(group, Date.now())
                handles.get(group)?.start()
              }
            }

            previousResult = await executeStep(node, handles, multi, previousResult)

            // Mark leaf as complete and check group completion
            completedLeaves.add(node)
            for (const group of groups) {
              const leaves = groupLeaves.get(group) ?? []
              if (leaves.every((l) => completedLeaves.has(l))) {
                const elapsed = Date.now() - groupStartTimes.get(group)!
                handles.get(group)?.complete(elapsed)
              }
            }
          }
        }
      } finally {
        multi.stop(options?.clear ?? false)
      }

      return previousResult
    },

    done(options?: { clear?: boolean }) {
      if (multi) {
        multi.stop(options?.clear ?? false)
        multi = null
      }
    },
  }
}

/**
 * Register all steps with MultiProgress upfront
 */
function registerAllSteps(
  nodes: StepNode[],
  multi: MultiProgress,
  handles: Map<StepNode, TaskHandle>,
): void {
  // Register in order without insertAfter - simpler and correct
  for (const node of nodes) {
    const isGroup = node.children && !node.work
    const handle = multi.add(node.label, {
      type: isGroup ? "group" : "spinner",
      indent: node.indent,
    })
    handles.set(node, handle)
  }
}

/**
 * Execute a single step
 */
async function executeStep(
  node: StepNode,
  handles: Map<StepNode, TaskHandle>,
  multi: MultiProgress,
  input?: unknown,
): Promise<unknown> {
  const handle = handles.get(node)!
  const startTime = Date.now()

  // Yield to event loop before starting
  await new Promise((resolve) => setImmediate(resolve))

  // Create step context for ALS
  const ctx = createStepContext(node.label, handle, (subLabel) => {
    // Create sub-step handle when step().sub() is called
    return multi.add(subLabel, {
      type: "spinner",
      indent: node.indent + 1,
      insertAfter: handle.id,
    })
  })

  handle.start()

  try {
    // Run work function with ALS context
    const result = await runWithStepContext(ctx, () => {
      if (input !== undefined) {
        return (node.work as (input: unknown) => unknown)(input)
      }
      return node.work!()
    })

    // Handle generator results
    if (isGenerator(result)) {
      return await runGenerator(result, ctx, node, multi)
    }

    if (isAsyncGenerator(result)) {
      return await runAsyncGenerator(result, ctx, node, multi)
    }

    // Complete any remaining sub-step
    ctx._completeSubStep()

    // Complete the step with timing
    const elapsed = Date.now() - startTime
    handle.complete(elapsed)

    return result
  } catch (error) {
    handle.fail()
    throw error
  }
}

/**
 * Run a sync generator step
 */
async function runGenerator<T>(
  gen: Generator<unknown, T, unknown>,
  ctx: InternalStepContext,
  node: StepNode,
  multi: MultiProgress,
): Promise<T> {
  const startTime = Date.now()
  let result = gen.next()
  let hasSubSteps = false
  // Track last inserted handle to maintain correct order
  // Each new sub-step inserts after the previous one, not after parent
  let lastInsertedId = ctx.handle.id

  while (!result.done) {
    const value = result.value

    // Handle yielded values
    if (isDeclareSteps(value)) {
      // Declare all sub-steps upfront (show as pending)
      if (!hasSubSteps) {
        hasSubSteps = true
        ctx.handle.setType("group")
      }
      for (const label of value.declare) {
        const subHandle = multi.add(label, {
          type: "spinner",
          indent: node.indent + 1,
          insertAfter: lastInsertedId,
        })
        lastInsertedId = subHandle.id
        ctx._addSubHandle(label, subHandle)
      }
    } else if (typeof value === "string") {
      // String = start a sub-step with this label
      ctx._completeSubStep()

      // First sub-step: change parent from spinner to group (no animation)
      if (!hasSubSteps) {
        hasSubSteps = true
        ctx.handle.setType("group")
      }

      // Check if already declared, otherwise create new
      const existingHandle = ctx._getSubHandle?.(value)
      if (existingHandle) {
        ctx._setCurrentSubHandle(value, existingHandle)
        existingHandle.start()
      } else {
        const subHandle = multi.add(value, {
          type: "spinner",
          indent: node.indent + 1,
          insertAfter: lastInsertedId,
        })
        lastInsertedId = subHandle.id
        ctx._addSubHandle(value, subHandle)
        subHandle.start()
      }
    } else if (isProgressUpdate(value)) {
      // Progress update
      ctx.progress(value.current ?? 0, value.total ?? 0)
    }

    // Yield to event loop for animation
    await new Promise((resolve) => setTimeout(resolve, 0))

    result = gen.next()
  }

  // Complete any remaining sub-step
  ctx._completeSubStep()

  // Complete the step with timing
  const elapsed = Date.now() - startTime
  ctx.handle.complete(elapsed)

  return result.value
}

/**
 * Run an async generator step
 */
async function runAsyncGenerator<T>(
  gen: AsyncGenerator<unknown, T, unknown>,
  ctx: InternalStepContext,
  node: StepNode,
  multi: MultiProgress,
): Promise<T> {
  const startTime = Date.now()
  let result = await gen.next()
  let hasSubSteps = false
  // Track last inserted handle to maintain correct order
  // Each new sub-step inserts after the previous one, not after parent
  let lastInsertedId = ctx.handle.id

  while (!result.done) {
    const value = result.value

    // Handle yielded values
    if (isDeclareSteps(value)) {
      // Declare all sub-steps upfront (show as pending)
      if (!hasSubSteps) {
        hasSubSteps = true
        ctx.handle.setType("group")
      }
      for (const label of value.declare) {
        const subHandle = multi.add(label, {
          type: "spinner",
          indent: node.indent + 1,
          insertAfter: lastInsertedId,
        })
        lastInsertedId = subHandle.id
        ctx._addSubHandle(label, subHandle)
      }
    } else if (typeof value === "string") {
      // String = start a sub-step with this label
      ctx._completeSubStep()

      // First sub-step: change parent from spinner to group (no animation)
      if (!hasSubSteps) {
        hasSubSteps = true
        ctx.handle.setType("group")
      }

      // Check if already declared, otherwise create new
      const existingHandle = ctx._getSubHandle(value)
      if (existingHandle) {
        ctx._setCurrentSubHandle(value, existingHandle)
        existingHandle.start()
      } else {
        const subHandle = multi.add(value, {
          type: "spinner",
          indent: node.indent + 1,
          insertAfter: lastInsertedId,
        })
        lastInsertedId = subHandle.id
        ctx._addSubHandle(value, subHandle)
        subHandle.start()
      }
    } else if (isProgressUpdate(value)) {
      // Progress update
      ctx.progress(value.current ?? 0, value.total ?? 0)
    }

    // Yield to event loop for animation
    await new Promise((resolve) => setTimeout(resolve, 0))

    result = await gen.next()
  }

  // Complete any remaining sub-step
  ctx._completeSubStep()

  // Complete the step with timing
  const elapsed = Date.now() - startTime
  ctx.handle.complete(elapsed)

  return result.value
}

/**
 * Set a nested result value by key path
 */
function setNestedResult(results: Record<string, unknown>, key: string, value: unknown): void {
  // For now, flat keys only - nested groups would need path handling
  results[key] = value
}

/**
 * Type guards
 */
function isGenerator(value: unknown): value is Generator<unknown, unknown, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Generator).next === "function" &&
    typeof (value as Generator)[Symbol.iterator] === "function"
  )
}

function isAsyncGenerator(value: unknown): value is AsyncGenerator<unknown, unknown, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as AsyncGenerator).next === "function" &&
    typeof (value as AsyncGenerator)[Symbol.asyncIterator] === "function"
  )
}

interface ProgressUpdate {
  current?: number
  total?: number
}

interface DeclareSteps {
  declare: string[]
}

function isProgressUpdate(value: unknown): value is ProgressUpdate {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("current" in value || "total" in value)
  )
}

function isDeclareSteps(value: unknown): value is DeclareSteps {
  return (
    value !== null &&
    typeof value === "object" &&
    "declare" in value &&
    Array.isArray((value as DeclareSteps).declare)
  )
}
