/**
 * Tests for @silvery/headless prototypes.
 *
 * Validates the API design: pure state machines, identity returns,
 * kill ring sharing, and the createMachine wrapper.
 *
 * Run: bun vitest run vendor/silvery-internal/prototype/headless/
 */
import { describe, expect, test } from "vitest"
import {
  createSelectListState,
  selectListUpdate,
  type SelectListAction,
  type SelectListState,
} from "@silvery/headless/select-list"
import {
  createReadlineContext,
  createReadlineState,
  readlineUpdate,
  type ReadlineAction,
  type ReadlineState,
} from "@silvery/headless/readline"
import { createMachine } from "@silvery/headless/machine"

// =============================================================================
// SelectList
// =============================================================================

describe("SelectListState", () => {
  test("factory creates valid initial state", () => {
    const s = createSelectListState({ count: 5 })
    expect(s).toEqual({ index: 0, count: 5 })
  })

  test("factory clamps initial index", () => {
    expect(createSelectListState({ count: 5, index: 10 })).toEqual({ index: 4, count: 5 })
    expect(createSelectListState({ count: 5, index: -1 })).toEqual({ index: 0, count: 5 })
  })

  test("factory handles empty list", () => {
    expect(createSelectListState({ count: 0 })).toEqual({ index: 0, count: 0 })
  })

  test("move_down increments index", () => {
    const s0 = createSelectListState({ count: 5 })
    const s1 = selectListUpdate(s0, { type: "move_down" })
    expect(s1.index).toBe(1)
  })

  test("move_down at end returns identity", () => {
    const s0 = createSelectListState({ count: 5, index: 4 })
    const s1 = selectListUpdate(s0, { type: "move_down" })
    expect(s1).toBe(s0) // identity reference
  })

  test("move_up decrements index", () => {
    const s0 = createSelectListState({ count: 5, index: 3 })
    const s1 = selectListUpdate(s0, { type: "move_up" })
    expect(s1.index).toBe(2)
  })

  test("move_up at start returns identity", () => {
    const s0 = createSelectListState({ count: 5, index: 0 })
    const s1 = selectListUpdate(s0, { type: "move_up" })
    expect(s1).toBe(s0)
  })

  test("move_first goes to index 0", () => {
    const s0 = createSelectListState({ count: 5, index: 3 })
    const s1 = selectListUpdate(s0, { type: "move_first" })
    expect(s1.index).toBe(0)
  })

  test("move_last goes to count - 1", () => {
    const s0 = createSelectListState({ count: 5, index: 1 })
    const s1 = selectListUpdate(s0, { type: "move_last" })
    expect(s1.index).toBe(4)
  })

  test("move_to clamps to valid range", () => {
    const s0 = createSelectListState({ count: 5 })
    expect(selectListUpdate(s0, { type: "move_to", index: 3 }).index).toBe(3)
    expect(selectListUpdate(s0, { type: "move_to", index: 100 }).index).toBe(4)
    expect(selectListUpdate(s0, { type: "move_to", index: -5 }).index).toBe(0)
  })

  test("page_down jumps by page size", () => {
    const s0 = createSelectListState({ count: 20, index: 5 })
    const s1 = selectListUpdate(s0, { type: "page_down", pageSize: 5 })
    expect(s1.index).toBe(10)
  })

  test("page_down clamps at end", () => {
    const s0 = createSelectListState({ count: 20, index: 18 })
    const s1 = selectListUpdate(s0, { type: "page_down", pageSize: 5 })
    expect(s1.index).toBe(19)
  })

  test("set_count adjusts index if needed", () => {
    const s0 = createSelectListState({ count: 10, index: 8 })
    const s1 = selectListUpdate(s0, { type: "set_count", count: 5 })
    expect(s1).toEqual({ index: 4, count: 5 })
  })

  test("set_count preserves index if still valid", () => {
    const s0 = createSelectListState({ count: 10, index: 3 })
    const s1 = selectListUpdate(s0, { type: "set_count", count: 5 })
    expect(s1).toEqual({ index: 3, count: 5 })
  })

  test("disabled items are skipped", () => {
    const isDisabled = (i: number) => i === 1 || i === 2
    const s0 = createSelectListState({ count: 5, index: 0 })
    const s1 = selectListUpdate(s0, { type: "move_down", isDisabled })
    expect(s1.index).toBe(3) // skips 1 and 2
  })

  test("all items disabled returns identity", () => {
    const isDisabled = () => true
    const s0 = createSelectListState({ count: 5, index: 2 })
    const s1 = selectListUpdate(s0, { type: "move_down", isDisabled })
    expect(s1).toBe(s0)
  })

  test("empty list returns identity for all actions", () => {
    const s0 = createSelectListState({ count: 0 })
    const actions: SelectListAction[] = [
      { type: "move_down" },
      { type: "move_up" },
      { type: "move_first" },
      { type: "move_last" },
      { type: "page_down", pageSize: 5 },
    ]
    for (const action of actions) {
      expect(selectListUpdate(s0, action)).toBe(s0)
    }
  })
})

// =============================================================================
// Readline
// =============================================================================

describe("ReadlineState", () => {
  test("factory creates empty state", () => {
    const s = createReadlineState()
    expect(s).toEqual({ value: "", cursor: 0, killRing: [], yankState: null })
  })

  test("factory with initial value", () => {
    const s = createReadlineState({ value: "hello", cursor: 3 })
    expect(s.value).toBe("hello")
    expect(s.cursor).toBe(3)
  })

  // Cursor movement
  test("move_left decrements cursor", () => {
    const s0 = createReadlineState({ value: "hello", cursor: 3 })
    const s1 = readlineUpdate(s0, { type: "move_left" })
    expect(s1.cursor).toBe(2)
    expect(s1.value).toBe("hello")
  })

  test("move_left at 0 returns identity", () => {
    const s0 = createReadlineState({ value: "hello", cursor: 0 })
    const s1 = readlineUpdate(s0, { type: "move_left" })
    expect(s1).toBe(s0)
  })

  test("move_right increments cursor", () => {
    const s0 = createReadlineState({ value: "hello", cursor: 3 })
    const s1 = readlineUpdate(s0, { type: "move_right" })
    expect(s1.cursor).toBe(4)
  })

  test("move_word_left jumps to previous word start", () => {
    const s0 = createReadlineState({ value: "hello world", cursor: 8 })
    const s1 = readlineUpdate(s0, { type: "move_word_left" })
    expect(s1.cursor).toBe(6) // start of "world"
  })

  test("move_word_right jumps to next word end", () => {
    const s0 = createReadlineState({ value: "hello world", cursor: 2 })
    const s1 = readlineUpdate(s0, { type: "move_word_right" })
    expect(s1.cursor).toBe(5) // end of "hello"
  })

  test("move_start goes to 0", () => {
    const s0 = createReadlineState({ value: "hello", cursor: 3 })
    const s1 = readlineUpdate(s0, { type: "move_start" })
    expect(s1.cursor).toBe(0)
  })

  test("move_end goes to value.length", () => {
    const s0 = createReadlineState({ value: "hello", cursor: 2 })
    const s1 = readlineUpdate(s0, { type: "move_end" })
    expect(s1.cursor).toBe(5)
  })

  // Character editing
  test("insert adds text at cursor", () => {
    const s0 = createReadlineState({ value: "helo", cursor: 3 })
    const s1 = readlineUpdate(s0, { type: "insert", text: "l" })
    expect(s1.value).toBe("hello")
    expect(s1.cursor).toBe(4)
  })

  test("delete_back removes char before cursor", () => {
    const s0 = createReadlineState({ value: "hello", cursor: 5 })
    const s1 = readlineUpdate(s0, { type: "delete_back" })
    expect(s1.value).toBe("hell")
    expect(s1.cursor).toBe(4)
  })

  test("delete_forward removes char at cursor", () => {
    const s0 = createReadlineState({ value: "hello", cursor: 0 })
    const s1 = readlineUpdate(s0, { type: "delete_forward" })
    expect(s1.value).toBe("ello")
    expect(s1.cursor).toBe(0)
  })

  test("transpose swaps two chars before cursor", () => {
    const s0 = createReadlineState({ value: "ab", cursor: 2 })
    const s1 = readlineUpdate(s0, { type: "transpose" })
    expect(s1.value).toBe("ba")

    const s2 = createReadlineState({ value: "helo", cursor: 4 })
    const s3 = readlineUpdate(s2, { type: "transpose" })
    expect(s3.value).toBe("heol") // swaps l and o
  })

  // Kill operations
  test("kill_word_back kills previous word and adds to kill ring", () => {
    const s0 = createReadlineState({ value: "hello world", cursor: 11 })
    const s1 = readlineUpdate(s0, { type: "kill_word_back" })
    expect(s1.value).toBe("hello ")
    expect(s1.cursor).toBe(6)
    expect(s1.killRing).toEqual(["world"])
  })

  test("kill_word_forward kills next word", () => {
    const s0 = createReadlineState({ value: "hello world", cursor: 0 })
    const s1 = readlineUpdate(s0, { type: "kill_word_forward" })
    expect(s1.value).toBe(" world")
    expect(s1.cursor).toBe(0)
    expect(s1.killRing).toEqual(["hello"])
  })

  test("kill_to_start kills everything before cursor", () => {
    const s0 = createReadlineState({ value: "hello world", cursor: 6 })
    const s1 = readlineUpdate(s0, { type: "kill_to_start" })
    expect(s1.value).toBe("world")
    expect(s1.cursor).toBe(0)
    expect(s1.killRing).toEqual(["hello "])
  })

  test("kill_to_end kills everything after cursor", () => {
    const s0 = createReadlineState({ value: "hello world", cursor: 5 })
    const s1 = readlineUpdate(s0, { type: "kill_to_end" })
    expect(s1.value).toBe("hello")
    expect(s1.cursor).toBe(5)
    expect(s1.killRing).toEqual([" world"])
  })

  // Yank operations
  test("yank pastes from kill ring", () => {
    const s0 = createReadlineState({ value: "hello ", cursor: 6, killRing: ["world"] })
    const s1 = readlineUpdate(s0, { type: "yank" })
    expect(s1.value).toBe("hello world")
    expect(s1.cursor).toBe(11)
    expect(s1.yankState).toEqual({ lastYankIndex: 0, yankStart: 6, yankEnd: 11 })
  })

  test("yank_cycle rotates through kill ring", () => {
    const s0: ReadlineState = {
      value: "hello world",
      cursor: 11,
      killRing: ["world", "earth", "globe"],
      yankState: { lastYankIndex: 0, yankStart: 6, yankEnd: 11 },
    }
    const s1 = readlineUpdate(s0, { type: "yank_cycle" })
    expect(s1.value).toBe("hello earth")
    expect(s1.yankState?.lastYankIndex).toBe(1)

    const s2 = readlineUpdate(s1, { type: "yank_cycle" })
    expect(s2.value).toBe("hello globe")
    expect(s2.yankState?.lastYankIndex).toBe(2)

    // Wraps around
    const s3 = readlineUpdate(s2, { type: "yank_cycle" })
    expect(s3.value).toBe("hello world")
    expect(s3.yankState?.lastYankIndex).toBe(0)
  })

  test("yank with empty kill ring is no-op", () => {
    const s0 = createReadlineState({ value: "hello" })
    const s1 = readlineUpdate(s0, { type: "yank" })
    expect(s1).toBe(s0)
  })

  // Kill ring accumulation
  test("multiple kills accumulate in ring", () => {
    let s = createReadlineState({ value: "one two three", cursor: 13 })
    s = readlineUpdate(s, { type: "kill_word_back" }) // kills "three"
    s = readlineUpdate(s, { type: "kill_word_back" }) // kills "two"
    s = readlineUpdate(s, { type: "kill_word_back" }) // kills "one"
    // kill_word_back includes trailing space because word boundaries include whitespace
    expect(s.killRing).toEqual(["one ", "two ", "three"])
    expect(s.value).toBe("")
  })

  // Kill + yank round-trip
  test("kill and yank round-trip preserves text", () => {
    let s = createReadlineState({ value: "hello world", cursor: 11 })
    s = readlineUpdate(s, { type: "kill_word_back" })
    expect(s.value).toBe("hello ")
    s = readlineUpdate(s, { type: "yank" })
    expect(s.value).toBe("hello world")
  })

  // Yank state reset
  test("non-yank action resets yankState", () => {
    const s0: ReadlineState = {
      value: "hello world",
      cursor: 11,
      killRing: ["world"],
      yankState: { lastYankIndex: 0, yankStart: 6, yankEnd: 11 },
    }
    const s1 = readlineUpdate(s0, { type: "move_left" })
    expect(s1.yankState).toBeNull()
  })

  // Bulk operations
  test("set_value replaces text", () => {
    const s0 = createReadlineState({ value: "old" })
    const s1 = readlineUpdate(s0, { type: "set_value", value: "new" })
    expect(s1.value).toBe("new")
    expect(s1.cursor).toBe(3) // default: end
  })

  test("clear empties state", () => {
    const s0 = createReadlineState({ value: "hello", cursor: 3 })
    const s1 = readlineUpdate(s0, { type: "clear" })
    expect(s1.value).toBe("")
    expect(s1.cursor).toBe(0)
  })
})

// =============================================================================
// ReadlineContext — shared kill ring
// =============================================================================

describe("ReadlineContext", () => {
  test("shared kill ring across instances", () => {
    const ctx = createReadlineContext()
    let s1 = createReadlineState({ value: "hello world", cursor: 11 })
    let s2 = createReadlineState({ value: "foo bar", cursor: 7 })

    // Kill in instance 1
    s1 = ctx.update(s1, { type: "kill_word_back" })
    expect(s1.killRing).toEqual(["world"])

    // Yank in instance 2 — gets the shared kill ring
    s2 = ctx.update(s2, { type: "yank" })
    expect(s2.value).toBe("foo barworld")
  })

  test("kill ring accumulates across instances", () => {
    const ctx = createReadlineContext()
    let s1 = createReadlineState({ value: "hello world", cursor: 11 })
    let s2 = createReadlineState({ value: "foo bar", cursor: 7 })

    s1 = ctx.update(s1, { type: "kill_word_back" }) // kills "world"
    s2 = ctx.update(s2, { type: "kill_word_back" }) // kills "bar"

    expect(ctx.killRing).toEqual(["bar", "world"])
  })
})

// =============================================================================
// createMachine
// =============================================================================

describe("createMachine", () => {
  test("holds state and dispatches actions", () => {
    const machine = createMachine(selectListUpdate, createSelectListState({ count: 5 }))
    expect(machine.state.index).toBe(0)

    machine.send({ type: "move_down" })
    expect(machine.state.index).toBe(1)

    machine.send({ type: "move_down" })
    expect(machine.state.index).toBe(2)
  })

  test("notifies subscribers on state change", () => {
    const machine = createMachine(selectListUpdate, createSelectListState({ count: 5 }))
    const states: SelectListState[] = []
    machine.subscribe((s) => states.push(s))

    machine.send({ type: "move_down" })
    machine.send({ type: "move_down" })

    expect(states).toHaveLength(2)
    expect(states[0]!.index).toBe(1)
    expect(states[1]!.index).toBe(2)
  })

  test("does not notify on no-op actions", () => {
    const machine = createMachine(selectListUpdate, createSelectListState({ count: 5, index: 0 }))
    let called = false
    machine.subscribe(() => {
      called = true
    })

    machine.send({ type: "move_up" }) // at index 0, no-op
    expect(called).toBe(false)
  })

  test("unsubscribe stops notifications", () => {
    const machine = createMachine(selectListUpdate, createSelectListState({ count: 5 }))
    let count = 0
    const unsub = machine.subscribe(() => count++)

    machine.send({ type: "move_down" })
    expect(count).toBe(1)

    unsub()
    machine.send({ type: "move_down" })
    expect(count).toBe(1) // not notified
  })

  test("setState replaces state and notifies", () => {
    const machine = createMachine(selectListUpdate, createSelectListState({ count: 5 }))
    const states: SelectListState[] = []
    machine.subscribe((s) => states.push(s))

    machine.setState(createSelectListState({ count: 10, index: 7 }))
    expect(machine.state).toEqual({ index: 7, count: 10 })
    expect(states).toHaveLength(1)
  })

  test("works with ReadlineState", () => {
    const machine = createMachine(readlineUpdate, createReadlineState({ value: "hello" }))
    machine.send({ type: "insert", text: " world" })
    expect(machine.state.value).toBe("hello world")
  })
})
