/**
 * Tests for word/line selection granularity and boundary detection.
 */
import { describe, test, expect } from "vitest"
import {
  createTerminalSelectionState,
  terminalSelectionUpdate,
  findWordBoundary,
  findLineBoundary,
} from "@silvery/headless/selection"
import { TerminalBuffer } from "@silvery/ag-term/buffer"

// ============================================================================
// Helpers
// ============================================================================

function createBufferWithText(lines: string[], width = 40): TerminalBuffer {
  const height = lines.length
  const buf = new TerminalBuffer(width, height)
  for (let y = 0; y < height; y++) {
    const line = lines[y]!
    for (let x = 0; x < line.length && x < width; x++) {
      buf.setCell(x, y, { char: line[x]!, fg: null, bg: null })
    }
  }
  return buf
}

// ============================================================================
// findWordBoundary
// ============================================================================

describe("findWordBoundary", () => {
  test("selects a word in the middle of text", () => {
    const buf = createBufferWithText(["hello world foo"])
    const result = findWordBoundary(buf, 7, 0) // cursor on 'o' in 'world'
    expect(result).toEqual({ startCol: 6, endCol: 10 })
  })

  test("selects first word", () => {
    const buf = createBufferWithText(["hello world"])
    const result = findWordBoundary(buf, 0, 0)
    expect(result).toEqual({ startCol: 0, endCol: 4 })
  })

  test("selects last word", () => {
    const buf = createBufferWithText(["hello world"])
    const result = findWordBoundary(buf, 10, 0)
    expect(result).toEqual({ startCol: 6, endCol: 10 })
  })

  test("on whitespace returns single char", () => {
    const buf = createBufferWithText(["hello world"])
    const result = findWordBoundary(buf, 5, 0) // the space
    expect(result).toEqual({ startCol: 5, endCol: 5 })
  })

  test("on punctuation returns single char", () => {
    const buf = createBufferWithText(["hello, world!"])
    const result = findWordBoundary(buf, 5, 0) // the comma
    expect(result).toEqual({ startCol: 5, endCol: 5 })
  })

  test("word with underscores", () => {
    const buf = createBufferWithText(["foo_bar baz"])
    const result = findWordBoundary(buf, 2, 0) // 'o' in 'foo_bar'
    expect(result).toEqual({ startCol: 0, endCol: 6 })
  })

  test("word with digits", () => {
    const buf = createBufferWithText(["item42 next"])
    const result = findWordBoundary(buf, 3, 0) // 'm' in 'item42'
    expect(result).toEqual({ startCol: 0, endCol: 5 })
  })

  test("single character word", () => {
    const buf = createBufferWithText(["a b c"])
    const result = findWordBoundary(buf, 0, 0)
    expect(result).toEqual({ startCol: 0, endCol: 0 })
  })
})

// ============================================================================
// findLineBoundary
// ============================================================================

describe("findLineBoundary", () => {
  test("finds content boundaries on a normal line", () => {
    const buf = createBufferWithText(["  hello world  "], 20)
    const result = findLineBoundary(buf, 0)
    expect(result).toEqual({ startCol: 2, endCol: 12 })
  })

  test("line with no leading/trailing spaces", () => {
    const buf = createBufferWithText(["hello"], 10)
    const result = findLineBoundary(buf, 0)
    expect(result).toEqual({ startCol: 0, endCol: 4 })
  })

  test("empty line returns full width", () => {
    const buf = createBufferWithText([""], 10)
    const result = findLineBoundary(buf, 0)
    expect(result).toEqual({ startCol: 0, endCol: 9 })
  })

  test("line with only spaces returns full width", () => {
    const buf = createBufferWithText(["          "], 10)
    const result = findLineBoundary(buf, 0)
    expect(result).toEqual({ startCol: 0, endCol: 9 })
  })

  test("different rows have different boundaries", () => {
    const buf = createBufferWithText(["  hello  ", "world    "], 10)
    expect(findLineBoundary(buf, 0)).toEqual({ startCol: 2, endCol: 6 })
    expect(findLineBoundary(buf, 1)).toEqual({ startCol: 0, endCol: 4 })
  })
})

// ============================================================================
// startWord action
// ============================================================================

describe("terminalSelectionUpdate — startWord (double-click)", () => {
  test("selects the word under cursor", () => {
    const buf = createBufferWithText(["hello world"])
    const state = createTerminalSelectionState()
    const [next, effects] = terminalSelectionUpdate(
      { type: "startWord", col: 7, row: 0, buffer: buf },
      state,
    )

    expect(next.selecting).toBe(true)
    expect(next.granularity).toBe("word")
    expect(next.range).toEqual({
      anchor: { col: 6, row: 0 },
      head: { col: 10, row: 0 },
    })
    expect(effects).toEqual([{ type: "render" }])
  })

  test("selects punctuation as single char", () => {
    const buf = createBufferWithText(["hello, world"])
    const state = createTerminalSelectionState()
    const [next] = terminalSelectionUpdate(
      { type: "startWord", col: 5, row: 0, buffer: buf },
      state,
    )

    expect(next.range).toEqual({
      anchor: { col: 5, row: 0 },
      head: { col: 5, row: 0 },
    })
    expect(next.granularity).toBe("word")
  })
})

// ============================================================================
// startLine action
// ============================================================================

describe("terminalSelectionUpdate — startLine (triple-click)", () => {
  test("selects entire line content", () => {
    const buf = createBufferWithText(["  hello world  "], 20)
    const state = createTerminalSelectionState()
    const [next, effects] = terminalSelectionUpdate(
      { type: "startLine", col: 5, row: 0, buffer: buf },
      state,
    )

    expect(next.selecting).toBe(true)
    expect(next.granularity).toBe("line")
    expect(next.range).toEqual({
      anchor: { col: 2, row: 0 },
      head: { col: 12, row: 0 },
    })
    expect(effects).toEqual([{ type: "render" }])
  })
})

// ============================================================================
// Granularity-aware extend
// ============================================================================

describe("terminalSelectionUpdate — granularity-aware extend", () => {
  test("word granularity extend snaps to word boundaries (forward)", () => {
    const buf = createBufferWithText(["hello world foo bar"])
    const state = createTerminalSelectionState()

    // Start with double-click on "hello"
    const [wordState] = terminalSelectionUpdate(
      { type: "startWord", col: 2, row: 0, buffer: buf },
      state,
    )
    expect(wordState.granularity).toBe("word")

    // Extend to "foo" — should snap to end of "foo"
    const [extended] = terminalSelectionUpdate(
      { type: "extend", col: 13, row: 0, buffer: buf },
      wordState,
    )
    expect(extended.range!.head.col).toBe(14) // end of "foo"
  })

  test("word granularity extend snaps backwards", () => {
    const buf = createBufferWithText(["hello world foo bar"])
    const state = createTerminalSelectionState()

    // Start with double-click on "foo" (col 12-14)
    const [wordState] = terminalSelectionUpdate(
      { type: "startWord", col: 13, row: 0, buffer: buf },
      state,
    )

    // Extend backwards towards "hello" — should snap to start of "hello"
    const [extended] = terminalSelectionUpdate(
      { type: "extend", col: 2, row: 0, buffer: buf },
      wordState,
    )
    expect(extended.range!.head.col).toBe(0) // start of "hello"
  })

  test("line granularity extend snaps to line boundaries", () => {
    const buf = createBufferWithText(["  first line  ", "  second line  ", "  third line  "], 20)
    const state = createTerminalSelectionState()

    // Start with triple-click on line 0
    const [lineState] = terminalSelectionUpdate(
      { type: "startLine", col: 5, row: 0, buffer: buf },
      state,
    )
    expect(lineState.granularity).toBe("line")

    // Extend to line 2 — should snap to end of line 2 content
    const [extended] = terminalSelectionUpdate(
      { type: "extend", col: 5, row: 2, buffer: buf },
      lineState,
    )
    expect(extended.range!.head.row).toBe(2)
  })

  test("character granularity extend is unchanged", () => {
    const state = createTerminalSelectionState()
    const [charState] = terminalSelectionUpdate({ type: "start", col: 5, row: 0 }, state)
    expect(charState.granularity).toBe("character")

    const [extended] = terminalSelectionUpdate({ type: "extend", col: 10, row: 2 }, charState)
    expect(extended.range!.head).toEqual({ col: 10, row: 2 })
  })

  test("extend without buffer falls back to character behavior", () => {
    const buf = createBufferWithText(["hello world"])
    const state = createTerminalSelectionState()
    const [wordState] = terminalSelectionUpdate(
      { type: "startWord", col: 2, row: 0, buffer: buf },
      state,
    )

    // Extend without buffer — should just use raw position
    const [extended] = terminalSelectionUpdate({ type: "extend", col: 8, row: 0 }, wordState)
    expect(extended.range!.head).toEqual({ col: 8, row: 0 })
  })
})

// ============================================================================
// State transitions preserve granularity
// ============================================================================

describe("granularity through lifecycle", () => {
  test("finish preserves granularity", () => {
    const buf = createBufferWithText(["hello world"])
    const state = createTerminalSelectionState()
    const [wordState] = terminalSelectionUpdate(
      { type: "startWord", col: 2, row: 0, buffer: buf },
      state,
    )
    const [finished] = terminalSelectionUpdate({ type: "finish" }, wordState)

    expect(finished.granularity).toBe("word")
    expect(finished.selecting).toBe(false)
  })

  test("clear resets granularity to character", () => {
    const buf = createBufferWithText(["hello world"])
    const state = createTerminalSelectionState()
    const [wordState] = terminalSelectionUpdate(
      { type: "startWord", col: 2, row: 0, buffer: buf },
      state,
    )
    const [cleared] = terminalSelectionUpdate({ type: "clear" }, wordState)

    expect(cleared.granularity).toBe("character")
  })

  test("new start resets granularity to character", () => {
    const buf = createBufferWithText(["hello world"])
    const state = createTerminalSelectionState()
    const [wordState] = terminalSelectionUpdate(
      { type: "startWord", col: 2, row: 0, buffer: buf },
      state,
    )
    const [newStart] = terminalSelectionUpdate({ type: "start", col: 0, row: 0 }, wordState)

    expect(newStart.granularity).toBe("character")
  })
})
