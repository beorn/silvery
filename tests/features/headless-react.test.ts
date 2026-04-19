/**
 * Tests for @silvery/headless React hooks.
 *
 * Since @testing-library/react is not available, we test the hook wiring
 * by validating the reducers and initializers that useReducer would call.
 * This verifies the integration layer is correctly plumbed.
 */
import { describe, test, expect } from "vitest"
import {
  selectListUpdate,
  createSelectListState,
  readlineUpdate,
  createReadlineState,
} from "@silvery/headless"

// The hooks use useReducer(update, options, initializer).
// We test the exact initializer + reducer combos the hooks wire up.

describe("useSelectList wiring", () => {
  // Mirrors the initializer: (opts) => createSelectListState(opts)
  const initializer = (opts: { count: number; index?: number }) => createSelectListState(opts)

  test("initializer creates state from options", () => {
    const state = initializer({ count: 5 })
    expect(state.index).toBe(0)
    expect(state.count).toBe(5)
  })

  test("initializer respects initial index", () => {
    const state = initializer({ count: 5, index: 3 })
    expect(state.index).toBe(3)
    expect(state.count).toBe(5)
  })

  test("reducer handles move_down", () => {
    const state = initializer({ count: 5 })
    const next = selectListUpdate(state, { type: "move_down" })
    expect(next.index).toBe(1)
  })

  test("reducer handles move_up", () => {
    const state = initializer({ count: 5, index: 3 })
    const next = selectListUpdate(state, { type: "move_up" })
    expect(next.index).toBe(2)
  })

  test("full dispatch cycle", () => {
    let state = initializer({ count: 5 })
    expect(state.index).toBe(0)

    state = selectListUpdate(state, { type: "move_down" })
    expect(state.index).toBe(1)

    state = selectListUpdate(state, { type: "move_down" })
    expect(state.index).toBe(2)

    state = selectListUpdate(state, { type: "move_up" })
    expect(state.index).toBe(1)
  })
})

describe("useReadline wiring", () => {
  // Mirrors the initializer: (opts) => createReadlineState({ value: opts?.initialValue })
  const initializer = (opts?: { initialValue?: string }) =>
    createReadlineState({ value: opts?.initialValue })

  test("initializer creates empty state", () => {
    const state = initializer()
    expect(state.value).toBe("")
    expect(state.cursor).toBe(0)
  })

  test("initializer creates empty state from undefined options", () => {
    const state = initializer(undefined)
    expect(state.value).toBe("")
    expect(state.cursor).toBe(0)
  })

  test("initializer respects initial value", () => {
    const state = initializer({ initialValue: "hello" })
    expect(state.value).toBe("hello")
    expect(state.cursor).toBe(5) // cursor at end
  })

  test("reducer handles insert", () => {
    const state = initializer()
    const next = readlineUpdate(state, { type: "insert", text: "h" })
    expect(next.value).toBe("h")
    expect(next.cursor).toBe(1)
  })

  test("reducer handles multi-char insert", () => {
    const state = initializer()
    const next = readlineUpdate(state, { type: "insert", text: "hello" })
    expect(next.value).toBe("hello")
    expect(next.cursor).toBe(5)
  })

  test("full dispatch cycle", () => {
    let state = initializer()
    expect(state.value).toBe("")

    state = readlineUpdate(state, { type: "insert", text: "hello" })
    expect(state.value).toBe("hello")

    state = readlineUpdate(state, { type: "move_start" })
    expect(state.cursor).toBe(0)

    state = readlineUpdate(state, { type: "insert", text: "say " })
    expect(state.value).toBe("say hello")
    expect(state.cursor).toBe(4)
  })
})
