/**
 * Tests for search overlay state machine.
 */
import { describe, test, expect } from "vitest"
import { createSearchState, searchUpdate, renderSearchBar, type SearchMatch } from "@silvery/ag-term/search-overlay"

// ============================================================================
// Search State Machine
// ============================================================================

describe("searchUpdate", () => {
  test("open activates search", () => {
    const state = createSearchState()
    const [next, effects] = searchUpdate({ type: "open" }, state)
    expect(next.active).toBe(true)
    expect(next.query).toBe("")
    expect(next.matches).toEqual([])
    expect(next.currentMatch).toBe(-1)
    expect(effects).toEqual([{ type: "render" }])
  })

  test("close deactivates and resets", () => {
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "h" }, state)
    const [next, effects] = searchUpdate({ type: "close" }, state)
    expect(next.active).toBe(false)
    expect(next.query).toBe("")
    expect(effects).toEqual([{ type: "render" }])
  })

  test("input appends character and calls searchFn", () => {
    const mockSearch = (query: string): SearchMatch[] => {
      if (query === "h") return [{ row: 0, startCol: 0, endCol: 0 }]
      return []
    }
    const [state] = searchUpdate({ type: "open" }, createSearchState())
    const [next, effects] = searchUpdate({ type: "input", char: "h" }, state, mockSearch)
    expect(next.query).toBe("h")
    expect(next.cursorPosition).toBe(1)
    expect(next.matches).toHaveLength(1)
    expect(next.currentMatch).toBe(0)
    // Should have render + scrollTo effects
    expect(effects).toContainEqual({ type: "render" })
    expect(effects).toContainEqual({ type: "scrollTo", row: 0 })
  })

  test("backspace removes character", () => {
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "a" }, state)
    ;[state] = searchUpdate({ type: "input", char: "b" }, state)
    const [next] = searchUpdate({ type: "backspace" }, state)
    expect(next.query).toBe("a")
    expect(next.cursorPosition).toBe(1)
  })

  test("backspace at start is no-op", () => {
    const [state] = searchUpdate({ type: "open" }, createSearchState())
    const [next, effects] = searchUpdate({ type: "backspace" }, state)
    expect(next.query).toBe("")
    expect(effects).toEqual([])
  })

  test("nextMatch cycles forward", () => {
    const matches: SearchMatch[] = [
      { row: 0, startCol: 0, endCol: 2 },
      { row: 5, startCol: 0, endCol: 2 },
      { row: 10, startCol: 0, endCol: 2 },
    ]
    const state = { ...createSearchState(), active: true, query: "foo", matches, currentMatch: 0 }
    const [next1] = searchUpdate({ type: "nextMatch" }, state)
    expect(next1.currentMatch).toBe(1)
    const [next2] = searchUpdate({ type: "nextMatch" }, next1)
    expect(next2.currentMatch).toBe(2)
    const [next3] = searchUpdate({ type: "nextMatch" }, next2)
    expect(next3.currentMatch).toBe(0) // Wraps around
  })

  test("prevMatch cycles backward", () => {
    const matches: SearchMatch[] = [
      { row: 0, startCol: 0, endCol: 2 },
      { row: 5, startCol: 0, endCol: 2 },
    ]
    const state = { ...createSearchState(), active: true, query: "foo", matches, currentMatch: 0 }
    const [next] = searchUpdate({ type: "prevMatch" }, state)
    expect(next.currentMatch).toBe(1) // Wraps to end
  })

  test("nextMatch/prevMatch with no matches is no-op", () => {
    const [state] = searchUpdate({ type: "open" }, createSearchState())
    const [next1, effects1] = searchUpdate({ type: "nextMatch" }, state)
    expect(next1.currentMatch).toBe(-1)
    expect(effects1).toEqual([])

    const [next2, effects2] = searchUpdate({ type: "prevMatch" }, state)
    expect(next2.currentMatch).toBe(-1)
    expect(effects2).toEqual([])
  })

  test("cursorLeft and cursorRight", () => {
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "a" }, state)
    ;[state] = searchUpdate({ type: "input", char: "b" }, state)
    expect(state.cursorPosition).toBe(2)

    let [left] = searchUpdate({ type: "cursorLeft" }, state)
    expect(left.cursorPosition).toBe(1)
    ;[left] = searchUpdate({ type: "cursorLeft" }, left)
    expect(left.cursorPosition).toBe(0)
    // Can't go below 0
    ;[left] = searchUpdate({ type: "cursorLeft" }, left)
    expect(left.cursorPosition).toBe(0)

    const [right] = searchUpdate({ type: "cursorRight" }, state)
    // Can't go past query length
    expect(right.cursorPosition).toBe(2)
  })

  test("cursorToStart jumps to position 0", () => {
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "h" }, state)
    ;[state] = searchUpdate({ type: "input", char: "e" }, state)
    ;[state] = searchUpdate({ type: "input", char: "l" }, state)
    expect(state.cursorPosition).toBe(3)

    const [next] = searchUpdate({ type: "cursorToStart" }, state)
    expect(next.cursorPosition).toBe(0)
    expect(next.query).toBe("hel")
  })

  test("cursorToStart at position 0 is no-op", () => {
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "a" }, state)
    ;[state] = searchUpdate({ type: "cursorLeft" }, state)
    expect(state.cursorPosition).toBe(0)

    const [next] = searchUpdate({ type: "cursorToStart" }, state)
    expect(next).toBe(state) // Same reference — no-op
  })

  test("cursorToEnd jumps to end of query", () => {
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "a" }, state)
    ;[state] = searchUpdate({ type: "input", char: "b" }, state)
    ;[state] = searchUpdate({ type: "cursorLeft" }, state)
    ;[state] = searchUpdate({ type: "cursorLeft" }, state)
    expect(state.cursorPosition).toBe(0)

    const [next] = searchUpdate({ type: "cursorToEnd" }, state)
    expect(next.cursorPosition).toBe(2)
    expect(next.query).toBe("ab")
  })

  test("cursorToEnd at end is no-op", () => {
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "a" }, state)
    expect(state.cursorPosition).toBe(1)

    const [next] = searchUpdate({ type: "cursorToEnd" }, state)
    expect(next).toBe(state) // Same reference — no-op
  })

  test("deleteWordBack removes word before cursor", () => {
    const mockSearch = (): SearchMatch[] => []
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "h" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "e" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "l" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "l" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "o" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: " " }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "w" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "o" }, state, mockSearch)
    expect(state.query).toBe("hello wo")
    expect(state.cursorPosition).toBe(8)

    const [next] = searchUpdate({ type: "deleteWordBack" }, state, mockSearch)
    expect(next.query).toBe("hello ")
    expect(next.cursorPosition).toBe(6)
  })

  test("deleteWordBack at position 0 is no-op", () => {
    const [state] = searchUpdate({ type: "open" }, createSearchState())
    const [next, effects] = searchUpdate({ type: "deleteWordBack" }, state)
    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  test("deleteToStart removes everything before cursor", () => {
    const mockSearch = (): SearchMatch[] => []
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    ;[state] = searchUpdate({ type: "input", char: "a" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "b" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "c" }, state, mockSearch)
    ;[state] = searchUpdate({ type: "input", char: "d" }, state, mockSearch)
    // Move cursor to position 2 (after "ab")
    ;[state] = searchUpdate({ type: "cursorLeft" }, state)
    ;[state] = searchUpdate({ type: "cursorLeft" }, state)
    expect(state.cursorPosition).toBe(2)

    const [next] = searchUpdate({ type: "deleteToStart" }, state, mockSearch)
    expect(next.query).toBe("cd")
    expect(next.cursorPosition).toBe(0)
  })

  test("deleteToStart at position 0 is no-op", () => {
    const [state] = searchUpdate({ type: "open" }, createSearchState())
    const [next, effects] = searchUpdate({ type: "deleteToStart" }, state)
    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  test("deleteWordBack re-searches with updated query", () => {
    const mockSearch = (query: string): SearchMatch[] => {
      if (query === "hello") return [{ row: 3, startCol: 0, endCol: 5 }]
      return []
    }
    let [state] = searchUpdate({ type: "open" }, createSearchState())
    for (const ch of "hello world") {
      ;[state] = searchUpdate({ type: "input", char: ch }, state, mockSearch)
    }
    expect(state.query).toBe("hello world")

    const [next, effects] = searchUpdate({ type: "deleteWordBack" }, state, mockSearch)
    expect(next.query).toBe("hello ")
    // "hello " doesn't match "hello" exactly, so no matches from our mock
    expect(next.matches).toEqual([])
  })
})

// ============================================================================
// renderSearchBar
// ============================================================================

describe("renderSearchBar", () => {
  test("renders query with prefix", () => {
    const state = { ...createSearchState(), active: true, query: "hello" }
    const bar = renderSearchBar(state, 40)
    // Should contain the query
    expect(bar).toContain("hello")
    // Should be inverse
    expect(bar).toContain("\x1b[7m")
    expect(bar).toContain("\x1b[27m")
  })

  test("renders match count", () => {
    const matches: SearchMatch[] = [
      { row: 0, startCol: 0, endCol: 4 },
      { row: 5, startCol: 0, endCol: 4 },
    ]
    const state = { ...createSearchState(), active: true, query: "hello", matches, currentMatch: 0 }
    const bar = renderSearchBar(state, 40)
    expect(bar).toContain("[1/2]")
  })

  test("renders no matches indicator", () => {
    const state = {
      ...createSearchState(),
      active: true,
      query: "xyz",
      matches: [],
      currentMatch: -1,
    }
    const bar = renderSearchBar(state, 40)
    expect(bar).toContain("[no matches]")
  })

  test("empty query shows no match info", () => {
    const state = { ...createSearchState(), active: true, query: "" }
    const bar = renderSearchBar(state, 40)
    // No match count indicator (like [1/2] or [no matches])
    expect(bar).not.toContain("[no matches]")
    expect(bar).not.toMatch(/\[\d+\/\d+\]/)
  })
})
