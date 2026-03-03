import { describe, expect, expectTypeOf, test } from "vitest"
import { createSlice, type InferOp } from "../src/core/slice.js"

// --- Test fixtures ---

type State = { count: number; items: string[] }

const makeState = (): State => ({ count: 0, items: ["a", "b", "c"] })

const Counter = createSlice(makeState, {
  increment(s) {
    s.count++
  },
  add(s, { amount }: { amount: number }) {
    s.count += amount
  },
  reset(s) {
    s.count = 0
  },
})

type Effect = { effect: string; data?: unknown }

const WithEffects = createSlice(makeState, {
  addItem(s, { text }: { text: string }): Effect[] {
    s.items.push(text)
    return [
      { effect: "persist", data: s.items },
      { effect: "toast" },
    ]
  },
  clear(s): Effect[] {
    s.items = []
    return [{ effect: "persist", data: [] }]
  },
})

// --- Tests ---

describe("createSlice", () => {
  describe("dispatch", () => {
    test("correct handler called by op name", () => {
      const state = makeState()
      Counter.apply(state, { op: "increment" })
      expect(state.count).toBe(1)
    })

    test("params passed to handler", () => {
      const state = makeState()
      Counter.apply(state, { op: "add", amount: 5 })
      expect(state.count).toBe(5)
    })

    test("no-params op works", () => {
      const state = makeState()
      state.count = 42
      Counter.apply(state, { op: "reset" })
      expect(state.count).toBe(0)
    })

    test("unknown op throws", () => {
      const state = makeState()
      expect(() => Counter.apply(state, { op: "nonexistent" } as any)).toThrow("Unknown op: nonexistent")
    })
  })

  describe("effects", () => {
    test("handler returning Effect[] passes through", () => {
      const state = makeState()
      const effects = WithEffects.apply(state, { op: "addItem", text: "d" })
      expect(effects).toEqual([{ effect: "persist", data: ["a", "b", "c", "d"] }, { effect: "toast" }])
    })

    test("void handlers return undefined", () => {
      const state = makeState()
      const result = Counter.apply(state, { op: "increment" })
      expect(result).toBeUndefined()
    })
  })

  describe("direct access", () => {
    test("handlers callable directly on slice", () => {
      const state = makeState()
      Counter.increment(state)
      expect(state.count).toBe(1)
      Counter.add(state, { amount: 10 })
      expect(state.count).toBe(11)
    })
  })

  describe("create()", () => {
    test("returns state and bound apply", () => {
      const { state, apply } = Counter.create()
      apply({ op: "add", amount: 3 })
      expect(state.count).toBe(3)
    })

    test("two create() calls produce independent state", () => {
      const a = Counter.create()
      const b = Counter.create()
      a.apply({ op: "add", amount: 10 })
      b.apply({ op: "add", amount: 20 })
      expect(a.state.count).toBe(10)
      expect(b.state.count).toBe(20)
    })
  })

  describe("curried form", () => {
    test("creates handlers-only slice", () => {
      const Slice = createSlice<State>()({
        increment(s) {
          s.count++
        },
        add(s, { amount }: { amount: number }) {
          s.count += amount
        },
      })
      const state = makeState()
      Slice.apply(state, { op: "add", amount: 7 })
      expect(state.count).toBe(7)
    })
  })

  describe("type inference", () => {
    test("Op type inferred correctly", () => {
      type CounterOp = typeof Counter.Op
      expectTypeOf<CounterOp>().toEqualTypeOf<
        { op: "increment" } | { op: "add"; amount: number } | { op: "reset" }
      >()
    })

    test("InferOp utility works", () => {
      type Handlers = {
        move: (s: State, p: { delta: number }) => void
        stop: (s: State) => void
      }
      type Op = InferOp<Handlers>
      expectTypeOf<Op>().toEqualTypeOf<{ op: "move"; delta: number } | { op: "stop" }>()
    })

    test("effects return type flows through apply", () => {
      const state = makeState()
      const result = WithEffects.apply(state, { op: "addItem", text: "x" })
      expectTypeOf(result).toEqualTypeOf<Effect[]>()
    })
  })
})
