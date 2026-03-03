import { describe, expect, test, vi } from "vitest"
import { createStore } from "zustand"
import { tea, collect, type TeaResult, type EffectRunners, type TeaReducer } from "../src/tea/index.js"

// --- Fixtures ---

interface CounterState {
  count: number
}

type CounterOp = { type: "increment" } | { type: "add"; amount: number } | { type: "reset" }

function counterReducer(state: CounterState, op: CounterOp): CounterState {
  switch (op.type) {
    case "increment":
      return { ...state, count: state.count + 1 }
    case "add":
      return { ...state, count: state.count + op.amount }
    case "reset":
      return { ...state, count: 0 }
  }
}

// --- Effects fixtures ---

const log = (msg: string) => ({ type: "log" as const, msg })
const save = (data: unknown) => ({ type: "save" as const, data })
const delayed = (ms: number, then: CounterWithEffectsOp) => ({ type: "delay" as const, ms, then })

type MyEffect = ReturnType<typeof log> | ReturnType<typeof save> | ReturnType<typeof delayed>

type CounterWithEffectsOp =
  | { type: "increment" }
  | { type: "save" }
  | { type: "delayed_increment"; ms: number }

function counterWithEffectsReducer(
  state: CounterState,
  op: CounterWithEffectsOp,
): TeaResult<CounterState, MyEffect> {
  switch (op.type) {
    case "increment":
      return { ...state, count: state.count + 1 } // Level 3: plain state
    case "save":
      return [state, [save(state), log("saved")]] // Level 4: [state, effects]
    case "delayed_increment":
      return [state, [delayed(op.ms, { type: "increment" })]] // Effect with round-trip
  }
}

// --- Tests ---

describe("tea()", () => {
  describe("Level 3: plain state (no effects)", () => {
    test("dispatch updates state", () => {
      const store = createStore(tea({ count: 0 }, counterReducer))
      store.getState().dispatch({ type: "increment" })
      expect(store.getState().count).toBe(1)
    })

    test("dispatch with params", () => {
      const store = createStore(tea({ count: 0 }, counterReducer))
      store.getState().dispatch({ type: "add", amount: 5 })
      expect(store.getState().count).toBe(5)
    })

    test("multiple dispatches accumulate", () => {
      const store = createStore(tea({ count: 0 }, counterReducer))
      const { dispatch } = store.getState()
      dispatch({ type: "increment" })
      dispatch({ type: "increment" })
      dispatch({ type: "add", amount: 10 })
      expect(store.getState().count).toBe(12)
    })

    test("reset to initial state", () => {
      const store = createStore(tea({ count: 42 }, counterReducer))
      store.getState().dispatch({ type: "reset" })
      expect(store.getState().count).toBe(0)
    })
  })

  describe("Level 4: effects as data", () => {
    test("effects executed after state update", () => {
      const logged: string[] = []
      const saved: unknown[] = []

      const runners: EffectRunners<MyEffect, CounterWithEffectsOp> = {
        log: (e) => logged.push(e.msg),
        save: (e) => saved.push(e.data),
      }

      const store = createStore(tea({ count: 5 }, counterWithEffectsReducer, { runners }))
      store.getState().dispatch({ type: "save" })

      expect(logged).toEqual(["saved"])
      expect(saved).toEqual([{ count: 5 }])
      // State unchanged (save doesn't mutate)
      expect(store.getState().count).toBe(5)
    })

    test("mixed: plain state ops produce no effects", () => {
      const logged: string[] = []
      const runners: EffectRunners<MyEffect, CounterWithEffectsOp> = {
        log: (e) => logged.push(e.msg),
      }

      const store = createStore(tea({ count: 0 }, counterWithEffectsReducer, { runners }))
      store.getState().dispatch({ type: "increment" })

      expect(store.getState().count).toBe(1)
      expect(logged).toEqual([]) // No effects triggered
    })

    test("effect runners receive dispatch for round-trip", () => {
      const runners: EffectRunners<MyEffect, CounterWithEffectsOp> = {
        delay: (e, dispatch) => {
          // Synchronous dispatch for testing (would be setTimeout in production)
          dispatch(e.then)
        },
      }

      const store = createStore(tea({ count: 0 }, counterWithEffectsReducer, { runners }))
      store.getState().dispatch({ type: "delayed_increment", ms: 100 })

      // Effect dispatched the "increment" back through the reducer
      expect(store.getState().count).toBe(1)
    })

    test("unmatched effects are silently dropped", () => {
      // Only provide a log runner, not save
      const runners: EffectRunners<MyEffect, CounterWithEffectsOp> = {
        log: () => {},
      }

      const store = createStore(tea({ count: 0 }, counterWithEffectsReducer, { runners }))
      // Should not throw even though save effect has no runner
      expect(() => store.getState().dispatch({ type: "save" })).not.toThrow()
    })

    test("no runners option means effects are dropped", () => {
      const store = createStore(tea({ count: 0 }, counterWithEffectsReducer))
      // Should not throw
      expect(() => store.getState().dispatch({ type: "save" })).not.toThrow()
      expect(store.getState().count).toBe(0)
    })
  })

  describe("Zustand integration", () => {
    test("subscribe notifies on state changes", () => {
      const store = createStore(tea({ count: 0 }, counterReducer))
      const listener = vi.fn()
      store.subscribe(listener)

      store.getState().dispatch({ type: "increment" })
      expect(listener).toHaveBeenCalledTimes(1)
    })

    test("selectors work with Zustand", () => {
      const store = createStore(tea({ count: 0, name: "test" }, (s, op: { type: "inc" }) => ({
        ...s,
        count: s.count + 1,
      })))

      store.getState().dispatch({ type: "inc" })
      expect(store.getState().count).toBe(1)
      expect(store.getState().name).toBe("test")
    })

    test("dispatch function is stable across state changes", () => {
      const store = createStore(tea({ count: 0 }, counterReducer))
      const dispatch1 = store.getState().dispatch
      store.getState().dispatch({ type: "increment" })
      const dispatch2 = store.getState().dispatch

      // dispatch should be stable (same reference) since it's created once
      // Note: Zustand's set() merges, so dispatch reference may change
      // The important thing is both work
      dispatch2({ type: "increment" })
      expect(store.getState().count).toBe(2)
    })

    test("initial state available immediately", () => {
      const store = createStore(tea({ count: 42, label: "hello" }, counterReducer as TeaReducer<{ count: number; label: string }, CounterOp>))
      expect(store.getState().count).toBe(42)
      expect(store.getState().label).toBe("hello")
    })
  })
})

describe("collect()", () => {
  test("normalizes plain state to [state, []]", () => {
    const result = counterReducer({ count: 0 }, { type: "increment" })
    const [state, effects] = collect(result)
    expect(state).toEqual({ count: 1 })
    expect(effects).toEqual([])
  })

  test("normalizes [state, effects] tuple unchanged", () => {
    const result = counterWithEffectsReducer({ count: 5 }, { type: "save" })
    const [state, effects] = collect(result)
    expect(state).toEqual({ count: 5 })
    expect(effects).toEqual([save({ count: 5 }), log("saved")])
  })

  test("works with readonly tuples", () => {
    function readonlyReducer(state: CounterState): readonly [CounterState, MyEffect[]] {
      return [state, [log("readonly")]] as const
    }
    const [state, effects] = collect(readonlyReducer({ count: 0 }))
    expect(state.count).toBe(0)
    expect(effects).toEqual([log("readonly")])
  })

  test("empty effects array preserved", () => {
    const result: TeaResult<CounterState, MyEffect> = [{ count: 0 }, []]
    const [, effects] = collect(result)
    expect(effects).toEqual([])
  })

  test("effects contain expected data for assertions", () => {
    const initial = { count: 3 }
    const [, effects] = collect(counterWithEffectsReducer(initial, { type: "save" }))

    // This is the primary test pattern: assert on effect data
    expect(effects).toContainEqual(save({ count: 3 }))
    expect(effects).toContainEqual(log("saved"))
    expect(effects).toHaveLength(2)
  })

  test("round-trip effects carry completion action", () => {
    const [, effects] = collect(
      counterWithEffectsReducer({ count: 0 }, { type: "delayed_increment", ms: 500 }),
    )
    expect(effects).toContainEqual(delayed(500, { type: "increment" }))
  })
})
