/**
 * @silvery/core — TEA runtime, React reconciler, store, and effect system.
 *
 * Portable core that doesn't depend on terminal specifics. Can target
 * terminal, canvas, DOM, or any custom render backend.
 *
 * @packageDocumentation
 */

/**
 * silvery/core — Pure functions and types, NO React dependency.
 *
 * This sub-path export provides:
 * - TEA (The Elm Architecture) types: SilveryModel, SilveryMsg, Effect, Sub, Plugin
 * - Focus manager: createFocusManager + types
 * - Focus events: event factories + dispatch functions
 * - Focus queries: tree query functions
 * - Plugin composition: compose() for middleware-style plugin chaining
 *
 * Everything here is pure TypeScript — no React import anywhere in the
 * dependency graph. Safe for use in non-React contexts (CLI tools, tests,
 * server-side logic).
 *
 * @packageDocumentation
 */

// =============================================================================
// TEA Types (The Elm Architecture)
// =============================================================================

import type { FocusOrigin } from "../focus-manager.js"
export type { FocusOrigin } from "../focus-manager.js"

/**
 * The model type that silvery manages for focus state.
 *
 * Applications extend this with their own model fields.
 * The store's update function receives the full model and returns
 * a new model + effects tuple.
 */
export interface SilveryModel {
  focus: {
    activeId: string | null
    previousId: string | null
    origin: FocusOrigin | null
    scopeStack: string[]
    scopeMemory: Record<string, string>
  }
}

/**
 * Direction type used in spatial navigation messages.
 */
export type Direction = "up" | "down" | "left" | "right"

/**
 * Message types that silvery understands.
 *
 * Applications can extend this union with their own message types.
 * The store's update function pattern-matches on `type` to decide
 * how to update the model.
 */
export type SilveryMsg =
  | { type: "focus"; nodeId: string; origin?: FocusOrigin }
  | { type: "blur" }
  | { type: "focus-next" }
  | { type: "focus-prev" }
  | { type: "focus-direction"; direction: Direction }
  | { type: "scope-enter"; scopeId: string }
  | { type: "scope-exit" }
  | {
      type: "term:key"
      key: string
      input: string
      ctrl: boolean
      meta: boolean
      shift: boolean
    }
  | {
      type: "term:mouse"
      action: "down" | "up" | "move" | "scroll"
      x: number
      y: number
      button: number
    }
  | { type: "term:resize"; cols: number; rows: number }

/**
 * Effect commands returned by update functions.
 *
 * Effects are declarative descriptions of side effects. The store
 * executes them after the model update, keeping the update function pure.
 *
 * - `none`: No effect (useful as a default)
 * - `batch`: Multiple effects to execute
 * - `dispatch`: Queue another message (no re-entrant dispatch)
 */
export type Effect =
  | { type: "none" }
  | { type: "batch"; effects: Effect[] }
  | { type: "dispatch"; msg: SilveryMsg }

/**
 * Subscription descriptor (for future use).
 *
 * Subscriptions represent long-running side effects (timers, event listeners)
 * that produce messages over time. The store manages their lifecycle.
 */
export type Sub = {
  type: "none"
}

// =============================================================================
// Effect Constructors
// =============================================================================

/** No-op effect. */
export const none: Effect = { type: "none" }

/** Batch multiple effects. */
export function batch(...effects: Effect[]): Effect {
  // Flatten nested batches and filter out none effects
  const flat: Effect[] = []
  for (const e of effects) {
    if (e.type === "none") continue
    if (e.type === "batch") {
      flat.push(...e.effects)
    } else {
      flat.push(e)
    }
  }
  if (flat.length === 0) return none
  if (flat.length === 1) return flat[0]!
  return { type: "batch", effects: flat }
}

/** Queue a message dispatch as an effect. */
export function dispatch(msg: SilveryMsg): Effect {
  return { type: "dispatch", msg }
}

// =============================================================================
// Plugin Type (Middleware Composition)
// =============================================================================

/**
 * A plugin wraps an update function, adding behavior before/after/around it.
 *
 * Plugins compose via `compose()` — the outermost plugin runs first on
 * message receive, but the innermost (original) update runs first for
 * model updates. This is the standard middleware pattern.
 *
 * @example
 * ```ts
 * const logging: Plugin<MyModel, MyMsg> = (inner) => (msg, model) => {
 *   console.log('msg:', msg.type)
 *   const result = inner(msg, model)
 *   console.log('new model:', result[0])
 *   return result
 * }
 * ```
 */
export type Plugin<Model, Msg> = (
  innerUpdate: (msg: Msg, model: Model) => [Model, Effect[]],
) => (msg: Msg, model: Model) => [Model, Effect[]]

/**
 * Compose multiple plugins into a single update function wrapper.
 *
 * Plugins are applied right-to-left (innermost first), so the first
 * plugin in the array is the outermost wrapper — it sees messages first
 * and model changes last.
 *
 * @example
 * ```ts
 * const update = compose(logging, focusNav, spatialNav)(baseUpdate)
 * // Equivalent to: logging(focusNav(spatialNav(baseUpdate)))
 * ```
 */
export function compose<Model, Msg>(...plugins: Plugin<Model, Msg>[]): Plugin<Model, Msg> {
  return (innerUpdate) => {
    let update = innerUpdate
    // Apply right-to-left so first plugin is outermost
    for (let i = plugins.length - 1; i >= 0; i--) {
      update = plugins[i]!(update)
    }
    return update
  }
}

// =============================================================================
// Focus Manager (pure, no React)
// =============================================================================

export { createFocusManager } from "../focus-manager.js"
export type {
  FocusManager,
  FocusManagerOptions,
  FocusChangeCallback,
  FocusSnapshot,
} from "../focus-manager.js"

// =============================================================================
// Focus Events (pure, no React)
// =============================================================================

export {
  createKeyEvent,
  createFocusEvent,
  dispatchKeyEvent,
  dispatchFocusEvent,
} from "../focus-events.js"
export type { SilveryKeyEvent, SilveryFocusEvent, FocusEventProps } from "../focus-events.js"

// =============================================================================
// Focus Queries (pure, no React)
// =============================================================================

export {
  findFocusableAncestor,
  getTabOrder,
  findByTestID,
  findSpatialTarget,
  getExplicitFocusLink,
} from "@silvery/ag/focus-queries"

// =============================================================================
// Slices (ops-as-data helper)
// =============================================================================

export { createSlice } from "./slice.js"
export type { Slice, SliceWithInit, InferOp } from "./slice.js"

// =============================================================================
// Shared Types (pure)
// =============================================================================

export type { AgNode, Rect } from "../types.js"
