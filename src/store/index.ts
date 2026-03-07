/**
 * hightea/store — TEA-style state container with effects.
 *
 * Wraps FocusManager into a dispatch/subscribe loop following
 * The Elm Architecture (TEA): Model + Msg -> [Model, Effect[]].
 *
 * The store provides:
 * - `dispatch(msg)` — send a message, run update, execute effects
 * - `getModel()` — current model snapshot
 * - `subscribe(listener)` — for useSyncExternalStore integration
 * - `getSnapshot(selector)` — selector-based access
 *
 * Effects are executed after each update cycle. `dispatch` effects
 * are queued (not re-entrant) to prevent stack overflow.
 *
 * @packageDocumentation
 */

import type { Effect, HighteaModel, HighteaMsg, Plugin } from "../core/index.js"
import { none } from "../core/index.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for creating a store.
 */
export interface StoreConfig<Model extends HighteaModel, Msg extends HighteaMsg> {
  /** Initialize model and effects. Called once on store creation. */
  init: () => [Model, Effect[]]
  /** Pure update function: (msg, model) -> [newModel, effects] */
  update: (msg: Msg, model: Model) => [Model, Effect[]]
}

/**
 * The store API returned by createStore.
 */
export interface StoreApi<Model extends HighteaModel, Msg extends HighteaMsg> {
  /** Send a message through the update function. */
  dispatch(msg: Msg): void
  /** Get the current model. */
  getModel(): Model
  /** Subscribe to model changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Get a derived value from the model via selector. */
  getSnapshot<T>(selector: (model: Model) => T): T
}

// =============================================================================
// Built-in Plugins
// =============================================================================

/**
 * Plugin that handles focus-related messages by updating the focus slice.
 *
 * Handles: focus, blur, scope-enter, scope-exit.
 * Passes focus-next, focus-prev, focus-direction through (they need
 * the node tree, which the store doesn't have — those are handled
 * at the React integration layer).
 */
export function withFocusManagement<Model extends HighteaModel, Msg extends HighteaMsg>(): Plugin<Model, Msg> {
  return (innerUpdate) => (msg, model) => {
    switch (msg.type) {
      case "focus": {
        const focusMsg = msg as Extract<HighteaMsg, { type: "focus" }>
        const newModel = {
          ...model,
          focus: {
            ...model.focus,
            previousId: model.focus.activeId,
            activeId: focusMsg.nodeId,
            origin: focusMsg.origin ?? "programmatic",
            // Remember in current scope
            scopeMemory:
              model.focus.scopeStack.length > 0
                ? {
                    ...model.focus.scopeMemory,
                    [model.focus.scopeStack[model.focus.scopeStack.length - 1]!]: focusMsg.nodeId,
                  }
                : model.focus.scopeMemory,
          },
        }
        return [newModel as Model, [none]]
      }

      case "blur": {
        const newModel = {
          ...model,
          focus: {
            ...model.focus,
            previousId: model.focus.activeId,
            activeId: null,
            origin: null,
          },
        }
        return [newModel as Model, [none]]
      }

      case "scope-enter": {
        const scopeMsg = msg as Extract<HighteaMsg, { type: "scope-enter" }>
        const newModel = {
          ...model,
          focus: {
            ...model.focus,
            scopeStack: [...model.focus.scopeStack, scopeMsg.scopeId],
          },
        }
        return [newModel as Model, [none]]
      }

      case "scope-exit": {
        const newModel = {
          ...model,
          focus: {
            ...model.focus,
            scopeStack: model.focus.scopeStack.slice(0, -1),
          },
        }
        return [newModel as Model, [none]]
      }

      default:
        return innerUpdate(msg, model)
    }
  }
}

// =============================================================================
// Default Update
// =============================================================================

/**
 * The default hightea update function.
 *
 * Returns the model unchanged with no effects for any unhandled message.
 * Compose with plugins to add behavior.
 */
export function highteaUpdate<Model extends HighteaModel, Msg extends HighteaMsg>(_msg: Msg, model: Model): [Model, Effect[]] {
  return [model, [none]]
}

// =============================================================================
// Default Init
// =============================================================================

/**
 * Create a default initial HighteaModel.
 */
export function defaultInit(): [HighteaModel, Effect[]] {
  return [
    {
      focus: {
        activeId: null,
        previousId: null,
        origin: null,
        scopeStack: [],
        scopeMemory: {},
      },
    },
    [none],
  ]
}

// =============================================================================
// Store Factory
// =============================================================================

/**
 * Create a TEA-style store.
 *
 * The store manages model state and effect execution. Messages are
 * dispatched through the update function, which returns a new model
 * and a list of effects. Effects are executed after each update cycle.
 *
 * Dispatch effects are queued to prevent re-entrant dispatch:
 * if dispatching msg A triggers effect dispatch(B), B is queued and
 * processed after A's full update cycle completes.
 *
 * @example
 * ```ts
 * import { createStore, withFocusManagement, highteaUpdate } from '@hightea/term/store'
 * import { compose } from '@hightea/term/core'
 *
 * const store = createStore({
 *   init: () => [{ focus: { activeId: null, ... }, count: 0 }, []],
 *   update: compose(withFocusManagement())(highteaUpdate),
 * })
 *
 * store.dispatch({ type: 'focus', nodeId: 'btn1' })
 * console.log(store.getModel().focus.activeId) // 'btn1'
 * ```
 */
export function createStore<Model extends HighteaModel, Msg extends HighteaMsg>(
  config: StoreConfig<Model, Msg>,
): StoreApi<Model, Msg> {
  // Initialize
  const [initialModel, initialEffects] = config.init()
  let model = initialModel

  // Subscriber management
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  // Effect execution with queue for dispatch effects
  let isDispatching = false
  const dispatchQueue: Msg[] = []

  function executeEffects(effects: Effect[]): void {
    for (const effect of effects) {
      executeEffect(effect)
    }
  }

  function executeEffect(effect: Effect): void {
    switch (effect.type) {
      case "none":
        break
      case "batch":
        executeEffects(effect.effects)
        break
      case "dispatch":
        // Queue dispatch effects to prevent re-entrant dispatch
        dispatchQueue.push(effect.msg as Msg)
        break
    }
  }

  function dispatch(msg: Msg): void {
    if (isDispatching) {
      // Queue if we're already in a dispatch cycle
      dispatchQueue.push(msg)
      return
    }

    isDispatching = true
    try {
      // Run update
      const [newModel, effects] = config.update(msg, model)
      const changed = newModel !== model
      model = newModel

      // Execute effects (may queue more dispatches)
      executeEffects(effects)

      // Notify subscribers if model changed
      if (changed) {
        notify()
      }

      // Process queued dispatches
      while (dispatchQueue.length > 0) {
        const queued = dispatchQueue.shift()!
        const [nextModel, nextEffects] = config.update(queued, model)
        const nextChanged = nextModel !== model
        model = nextModel
        executeEffects(nextEffects)
        if (nextChanged) {
          notify()
        }
      }
    } finally {
      isDispatching = false
    }
  }

  function getModel(): Model {
    return model
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function getSnapshot<T>(selector: (model: Model) => T): T {
    return selector(model)
  }

  // Execute initial effects and drain any queued dispatches
  executeEffects(initialEffects)
  while (dispatchQueue.length > 0) {
    const queued = dispatchQueue.shift()!
    const [nextModel, nextEffects] = config.update(queued, model)
    model = nextModel
    executeEffects(nextEffects)
    // No notify during init — no subscribers yet
  }

  return {
    dispatch,
    getModel,
    subscribe,
    getSnapshot,
  }
}
