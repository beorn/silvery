/**
 * TEA Store Tests
 *
 * Tests for the TEA (The Elm Architecture) store implementation:
 * - Store initialization with init()
 * - dispatch() runs update and returns new model
 * - subscribe() notifies on changes
 * - Effect dispatch queues messages (no re-entrant dispatch)
 * - compose() chains plugins correctly
 * - Built-in focus management plugin
 */

import { describe, expect, test, vi } from "vitest"
import {
  type Effect,
  type InkxModel,
  type InkxMsg,
  type Plugin,
  batch,
  compose,
  dispatch as dispatchEffect,
  none,
} from "inkx/core"
import { type StoreApi, type StoreConfig, createStore, defaultInit, inkxUpdate, withFocusManagement } from "inkx/store"

// =============================================================================
// Helpers
// =============================================================================

function createDefaultStore(): StoreApi<InkxModel, InkxMsg> {
  return createStore({
    init: defaultInit,
    update: inkxUpdate,
  })
}

/** Extended model for testing custom fields alongside focus. */
interface CounterModel extends InkxModel {
  count: number
}

type CounterMsg = InkxMsg | { type: "increment" } | { type: "decrement" }

function counterUpdate(msg: CounterMsg, model: CounterModel): [CounterModel, Effect[]] {
  switch (msg.type) {
    case "increment":
      return [{ ...model, count: model.count + 1 }, [none]]
    case "decrement":
      return [{ ...model, count: model.count - 1 }, [none]]
    default:
      return [model, [none]]
  }
}

function createCounterStore(
  update?: (msg: CounterMsg, model: CounterModel) => [CounterModel, Effect[]],
): StoreApi<CounterModel, CounterMsg> {
  return createStore<CounterModel, CounterMsg>({
    init: () => [
      {
        count: 0,
        focus: {
          activeId: null,
          previousId: null,
          origin: null,
          scopeStack: [],
          scopeMemory: {},
        },
      },
      [none],
    ],
    update: update ?? counterUpdate,
  })
}

// =============================================================================
// Store Initialization
// =============================================================================

describe("createStore — initialization", () => {
  test("initializes with init() model", () => {
    const store = createDefaultStore()
    const model = store.getModel()

    expect(model.focus.activeId).toBe(null)
    expect(model.focus.previousId).toBe(null)
    expect(model.focus.origin).toBe(null)
    expect(model.focus.scopeStack).toEqual([])
    expect(model.focus.scopeMemory).toEqual({})
  })

  test("initializes custom model fields", () => {
    const store = createCounterStore()
    expect(store.getModel().count).toBe(0)
  })

  test("executes initial effects", () => {
    const dispatched: InkxMsg[] = []

    const store = createStore<InkxModel, InkxMsg>({
      init: () => [
        {
          focus: {
            activeId: null,
            previousId: null,
            origin: null,
            scopeStack: [],
            scopeMemory: {},
          },
        },
        [dispatchEffect({ type: "focus", nodeId: "initial" })],
      ],
      update: (msg, model) => {
        dispatched.push(msg)
        if (msg.type === "focus") {
          return [
            {
              ...model,
              focus: { ...model.focus, activeId: (msg as Extract<InkxMsg, { type: "focus" }>).nodeId },
            },
            [none],
          ]
        }
        return [model, [none]]
      },
    })

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]!.type).toBe("focus")
    expect(store.getModel().focus.activeId).toBe("initial")
  })
})

// =============================================================================
// Dispatch + Update
// =============================================================================

describe("dispatch — runs update", () => {
  test("updates model on dispatch", () => {
    const store = createCounterStore()

    store.dispatch({ type: "increment" })
    expect(store.getModel().count).toBe(1)

    store.dispatch({ type: "increment" })
    expect(store.getModel().count).toBe(2)

    store.dispatch({ type: "decrement" })
    expect(store.getModel().count).toBe(1)
  })

  test("unhandled messages leave model unchanged", () => {
    const store = createDefaultStore()
    const before = store.getModel()

    store.dispatch({ type: "term:resize", cols: 120, rows: 40 })

    // inkxUpdate returns model unchanged, so reference equality holds
    expect(store.getModel()).toBe(before)
  })
})

// =============================================================================
// Subscribe / Notify
// =============================================================================

describe("subscribe — notifications", () => {
  test("notifies on model change", () => {
    const store = createCounterStore()
    const listener = vi.fn()

    store.subscribe(listener)
    store.dispatch({ type: "increment" })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  test("does NOT notify when model is unchanged", () => {
    const store = createDefaultStore()
    const listener = vi.fn()

    store.subscribe(listener)
    // inkxUpdate returns same model reference for unhandled msgs
    store.dispatch({ type: "term:resize", cols: 80, rows: 24 })

    expect(listener).not.toHaveBeenCalled()
  })

  test("unsubscribe stops notifications", () => {
    const store = createCounterStore()
    const listener = vi.fn()

    const unsub = store.subscribe(listener)
    store.dispatch({ type: "increment" })
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    store.dispatch({ type: "increment" })
    expect(listener).toHaveBeenCalledTimes(1) // Still 1 — not called again
  })

  test("multiple subscribers all notified", () => {
    const store = createCounterStore()
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    store.subscribe(listener1)
    store.subscribe(listener2)
    store.dispatch({ type: "increment" })

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// getSnapshot (selector)
// =============================================================================

describe("getSnapshot — selector-based access", () => {
  test("extracts value via selector", () => {
    const store = createCounterStore()
    store.dispatch({ type: "increment" })
    store.dispatch({ type: "increment" })

    const count = store.getSnapshot((m) => m.count)
    expect(count).toBe(2)
  })

  test("extracts focus state", () => {
    const store = createDefaultStore()
    const activeId = store.getSnapshot((m) => m.focus.activeId)
    expect(activeId).toBe(null)
  })
})

// =============================================================================
// Effect Execution
// =============================================================================

describe("effects — execution", () => {
  test("dispatch effect queues message (no re-entrant dispatch)", () => {
    const callOrder: string[] = []

    const store = createStore<CounterModel, CounterMsg>({
      init: () => [
        {
          count: 0,
          focus: {
            activeId: null,
            previousId: null,
            origin: null,
            scopeStack: [],
            scopeMemory: {},
          },
        },
        [none],
      ],
      update: (msg, model) => {
        callOrder.push(msg.type)
        if (msg.type === "increment") {
          // When we get increment, also dispatch a decrement
          return [{ ...model, count: model.count + 1 }, [dispatchEffect({ type: "decrement" } as CounterMsg)]]
        }
        if (msg.type === "decrement") {
          return [{ ...model, count: model.count - 1 }, [none]]
        }
        return [model, [none]]
      },
    })

    store.dispatch({ type: "increment" })

    // Both messages processed: increment then decrement
    expect(callOrder).toEqual(["increment", "decrement"])
    // Net effect: +1 -1 = 0
    expect(store.getModel().count).toBe(0)
  })

  test("batch effect executes all sub-effects", () => {
    const callOrder: string[] = []

    const store = createStore<CounterModel, CounterMsg>({
      init: () => [
        {
          count: 0,
          focus: {
            activeId: null,
            previousId: null,
            origin: null,
            scopeStack: [],
            scopeMemory: {},
          },
        },
        [none],
      ],
      update: (msg, model) => {
        callOrder.push(msg.type)
        if (msg.type === "increment") {
          // Batch: dispatch two decrements
          return [
            { ...model, count: model.count + 1 },
            [
              batch(
                dispatchEffect({ type: "decrement" } as CounterMsg),
                dispatchEffect({ type: "decrement" } as CounterMsg),
              ),
            ],
          ]
        }
        if (msg.type === "decrement") {
          return [{ ...model, count: model.count - 1 }, [none]]
        }
        return [model, [none]]
      },
    })

    store.dispatch({ type: "increment" })

    expect(callOrder).toEqual(["increment", "decrement", "decrement"])
    // +1 -1 -1 = -1
    expect(store.getModel().count).toBe(-1)
  })

  test("none effect is a no-op", () => {
    const store = createCounterStore()
    const listener = vi.fn()
    store.subscribe(listener)

    // inkxUpdate returns [model, [none]] — model unchanged, no notification
    store.dispatch({ type: "term:resize", cols: 80, rows: 24 })
    expect(listener).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Effect Constructors
// =============================================================================

describe("effect constructors", () => {
  test("none is a no-op effect", () => {
    expect(none).toEqual({ type: "none" })
  })

  test("batch flattens nested batches", () => {
    const inner = batch(dispatchEffect({ type: "blur" }), dispatchEffect({ type: "blur" }))
    const outer = batch(inner, dispatchEffect({ type: "blur" }))

    // Should flatten to a single batch with 3 dispatch effects
    expect(outer.type).toBe("batch")
    if (outer.type === "batch") {
      expect(outer.effects).toHaveLength(3)
    }
  })

  test("batch filters out none effects", () => {
    const result = batch(none, dispatchEffect({ type: "blur" }), none)
    // Should simplify to just the dispatch effect
    expect(result.type).toBe("dispatch")
  })

  test("batch of all none returns none", () => {
    const result = batch(none, none, none)
    expect(result).toBe(none)
  })

  test("batch of single item returns that item", () => {
    const effect = dispatchEffect({ type: "blur" })
    const result = batch(effect)
    expect(result).toBe(effect)
  })

  test("dispatch creates a dispatch effect", () => {
    const msg: InkxMsg = { type: "focus", nodeId: "test" }
    const effect = dispatchEffect(msg)
    expect(effect).toEqual({ type: "dispatch", msg })
  })
})

// =============================================================================
// compose() — Plugin Composition
// =============================================================================

describe("compose — plugin chaining", () => {
  test("identity: no plugins returns inner update", () => {
    const update = compose<CounterModel, CounterMsg>()(counterUpdate)

    const model: CounterModel = {
      count: 0,
      focus: {
        activeId: null,
        previousId: null,
        origin: null,
        scopeStack: [],
        scopeMemory: {},
      },
    }

    const [newModel] = update({ type: "increment" }, model)
    expect(newModel.count).toBe(1)
  })

  test("single plugin wraps update", () => {
    const doublePlugin: Plugin<CounterModel, CounterMsg> = (inner) => (msg, model) => {
      if (msg.type === "increment") {
        // Run inner twice
        const [m1, e1] = inner(msg, model)
        const [m2, e2] = inner(msg, m1)
        return [m2, [...e1, ...e2]]
      }
      return inner(msg, model)
    }

    const update = compose(doublePlugin)(counterUpdate)

    const model: CounterModel = {
      count: 0,
      focus: {
        activeId: null,
        previousId: null,
        origin: null,
        scopeStack: [],
        scopeMemory: {},
      },
    }

    const [newModel] = update({ type: "increment" }, model)
    expect(newModel.count).toBe(2)
  })

  test("multiple plugins compose left-to-right (first = outermost)", () => {
    const order: string[] = []

    const pluginA: Plugin<CounterModel, CounterMsg> = (inner) => (msg, model) => {
      order.push("A-before")
      const result = inner(msg, model)
      order.push("A-after")
      return result
    }

    const pluginB: Plugin<CounterModel, CounterMsg> = (inner) => (msg, model) => {
      order.push("B-before")
      const result = inner(msg, model)
      order.push("B-after")
      return result
    }

    const update = compose(pluginA, pluginB)(counterUpdate)

    const model: CounterModel = {
      count: 0,
      focus: {
        activeId: null,
        previousId: null,
        origin: null,
        scopeStack: [],
        scopeMemory: {},
      },
    }

    update({ type: "increment" }, model)

    // A is outermost: A-before, B-before, (inner), B-after, A-after
    expect(order).toEqual(["A-before", "B-before", "B-after", "A-after"])
  })
})

// =============================================================================
// withFocusManagement Plugin
// =============================================================================

describe("withFocusManagement — plugin", () => {
  function createFocusStore(): StoreApi<CounterModel, CounterMsg> {
    const update = compose<CounterModel, CounterMsg>(withFocusManagement<CounterModel, CounterMsg>())(counterUpdate)

    return createStore<CounterModel, CounterMsg>({
      init: () => [
        {
          count: 0,
          focus: {
            activeId: null,
            previousId: null,
            origin: null,
            scopeStack: [],
            scopeMemory: {},
          },
        },
        [none],
      ],
      update,
    })
  }

  test("focus message sets activeId", () => {
    const store = createFocusStore()

    store.dispatch({ type: "focus", nodeId: "btn1" })

    const model = store.getModel()
    expect(model.focus.activeId).toBe("btn1")
    expect(model.focus.origin).toBe("programmatic")
    expect(model.focus.previousId).toBe(null)
  })

  test("focus message tracks previousId", () => {
    const store = createFocusStore()

    store.dispatch({ type: "focus", nodeId: "btn1" })
    store.dispatch({ type: "focus", nodeId: "btn2", origin: "keyboard" })

    const model = store.getModel()
    expect(model.focus.activeId).toBe("btn2")
    expect(model.focus.previousId).toBe("btn1")
    expect(model.focus.origin).toBe("keyboard")
  })

  test("blur message clears focus", () => {
    const store = createFocusStore()

    store.dispatch({ type: "focus", nodeId: "btn1" })
    store.dispatch({ type: "blur" })

    const model = store.getModel()
    expect(model.focus.activeId).toBe(null)
    expect(model.focus.previousId).toBe("btn1")
    expect(model.focus.origin).toBe(null)
  })

  test("scope-enter pushes to scopeStack", () => {
    const store = createFocusStore()

    store.dispatch({ type: "scope-enter", scopeId: "dialog" })

    expect(store.getModel().focus.scopeStack).toEqual(["dialog"])

    store.dispatch({ type: "scope-enter", scopeId: "modal" })

    expect(store.getModel().focus.scopeStack).toEqual(["dialog", "modal"])
  })

  test("scope-exit pops from scopeStack", () => {
    const store = createFocusStore()

    store.dispatch({ type: "scope-enter", scopeId: "dialog" })
    store.dispatch({ type: "scope-enter", scopeId: "modal" })
    store.dispatch({ type: "scope-exit" })

    expect(store.getModel().focus.scopeStack).toEqual(["dialog"])
  })

  test("focus within scope records scopeMemory", () => {
    const store = createFocusStore()

    store.dispatch({ type: "scope-enter", scopeId: "sidebar" })
    store.dispatch({ type: "focus", nodeId: "item-3" })

    expect(store.getModel().focus.scopeMemory).toEqual({
      sidebar: "item-3",
    })
  })

  test("non-focus messages pass through to inner update", () => {
    const store = createFocusStore()

    store.dispatch({ type: "increment" })
    expect(store.getModel().count).toBe(1)

    store.dispatch({ type: "decrement" })
    expect(store.getModel().count).toBe(0)
  })

  test("focus and custom messages work together", () => {
    const store = createFocusStore()

    store.dispatch({ type: "increment" })
    store.dispatch({ type: "focus", nodeId: "counter-display" })
    store.dispatch({ type: "increment" })

    const model = store.getModel()
    expect(model.count).toBe(2)
    expect(model.focus.activeId).toBe("counter-display")
  })
})

// =============================================================================
// Re-entrant Dispatch Safety
// =============================================================================

describe("re-entrant dispatch", () => {
  test("dispatch during dispatch is queued", () => {
    const callOrder: string[] = []

    const store = createStore<CounterModel, CounterMsg>({
      init: () => [
        {
          count: 0,
          focus: {
            activeId: null,
            previousId: null,
            origin: null,
            scopeStack: [],
            scopeMemory: {},
          },
        },
        [none],
      ],
      update: (msg, model) => {
        callOrder.push(msg.type)
        if (msg.type === "increment") {
          return [{ ...model, count: model.count + 1 }, [none]]
        }
        return [model, [none]]
      },
    })

    // Subscribe and dispatch within subscriber
    store.subscribe(() => {
      if (store.getModel().count === 1) {
        // This dispatch happens during notification — should be queued
        store.dispatch({ type: "increment" })
      }
    })

    store.dispatch({ type: "increment" })

    // Both increments should have processed
    expect(store.getModel().count).toBe(2)
    expect(callOrder).toEqual(["increment", "increment"])
  })
})

// =============================================================================
// Core Exports (smoke test)
// =============================================================================

describe("inkx/core — exports", () => {
  test("re-exports focus manager", async () => {
    const { createFocusManager } = await import("inkx/core")
    expect(typeof createFocusManager).toBe("function")
  })

  test("re-exports focus events", async () => {
    const { createKeyEvent, createFocusEvent, dispatchKeyEvent, dispatchFocusEvent } = await import("inkx/core")
    expect(typeof createKeyEvent).toBe("function")
    expect(typeof createFocusEvent).toBe("function")
    expect(typeof dispatchKeyEvent).toBe("function")
    expect(typeof dispatchFocusEvent).toBe("function")
  })

  test("re-exports focus queries", async () => {
    const { findFocusableAncestor, getTabOrder, findByTestID, findSpatialTarget, getExplicitFocusLink } =
      await import("inkx/core")
    expect(typeof findFocusableAncestor).toBe("function")
    expect(typeof getTabOrder).toBe("function")
    expect(typeof findByTestID).toBe("function")
    expect(typeof findSpatialTarget).toBe("function")
    expect(typeof getExplicitFocusLink).toBe("function")
  })

  test("re-exports compose and effect constructors", async () => {
    const { compose, none, batch, dispatch } = await import("inkx/core")
    expect(typeof compose).toBe("function")
    expect(none).toEqual({ type: "none" })
    expect(typeof batch).toBe("function")
    expect(typeof dispatch).toBe("function")
  })
})

describe("inkx/store — exports", () => {
  test("exports createStore", async () => {
    const { createStore } = await import("inkx/store")
    expect(typeof createStore).toBe("function")
  })

  test("exports inkxUpdate and defaultInit", async () => {
    const { inkxUpdate, defaultInit } = await import("inkx/store")
    expect(typeof inkxUpdate).toBe("function")
    expect(typeof defaultInit).toBe("function")
  })

  test("exports withFocusManagement", async () => {
    const { withFocusManagement } = await import("inkx/store")
    expect(typeof withFocusManagement).toBe("function")
  })
})

describe("inkx/react — exports", () => {
  test("exports focus hooks", async () => {
    const { useFocusable, useFocusWithin, useFocusManager } = await import("inkx/react")
    expect(typeof useFocusable).toBe("function")
    expect(typeof useFocusWithin).toBe("function")
    expect(typeof useFocusManager).toBe("function")
  })

  test("exports layout hooks", async () => {
    const { useContentRect, useScreenRect } = await import("inkx/react")
    expect(typeof useContentRect).toBe("function")
    expect(typeof useScreenRect).toBe("function")
  })

  test("exports app hooks", async () => {
    const { useApp, useInput, useTerm } = await import("inkx/react")
    expect(typeof useApp).toBe("function")
    expect(typeof useInput).toBe("function")
    expect(typeof useTerm).toBe("function")
  })

  test("exports FocusManagerContext", async () => {
    const { FocusManagerContext } = await import("inkx/react")
    expect(FocusManagerContext).toBeDefined()
  })

  test("exports runtime run()", async () => {
    const { run } = await import("inkx/react")
    expect(typeof run).toBe("function")
  })

  test("exports createApp()", async () => {
    const { createApp } = await import("inkx/react")
    expect(typeof createApp).toBe("function")
  })
})
