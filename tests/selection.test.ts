/**
 * Tests for selection state machine and text extraction.
 */
import { describe, test, expect } from "vitest"
import { createSelectionState, selectionUpdate, normalizeRange, extractText } from "@silvery/term/selection"
import { TerminalBuffer } from "@silvery/term/buffer"

// ============================================================================
// State Machine
// ============================================================================

describe("selectionUpdate", () => {
  test("start sets anchor and head, marks selecting", () => {
    const state = createSelectionState()
    const [next, effects] = selectionUpdate({ type: "start", col: 5, row: 3 }, state)

    expect(next.selecting).toBe(true)
    expect(next.range).toEqual({
      anchor: { col: 5, row: 3 },
      head: { col: 5, row: 3 },
    })
    expect(effects).toEqual([{ type: "render" }])
  })

  test("extend updates head while selecting", () => {
    const [state] = selectionUpdate({ type: "start", col: 0, row: 0 }, createSelectionState())
    const [next, effects] = selectionUpdate({ type: "extend", col: 10, row: 2 }, state)

    expect(next.range!.anchor).toEqual({ col: 0, row: 0 })
    expect(next.range!.head).toEqual({ col: 10, row: 2 })
    expect(next.selecting).toBe(true)
    expect(effects).toEqual([{ type: "render" }])
  })

  test("extend is a no-op when not selecting", () => {
    const state = createSelectionState()
    const [next, effects] = selectionUpdate({ type: "extend", col: 5, row: 5 }, state)

    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  test("finish sets selecting=false, emits no effects", () => {
    let [state] = selectionUpdate({ type: "start", col: 0, row: 0 }, createSelectionState())
    ;[state] = selectionUpdate({ type: "extend", col: 10, row: 2 }, state)
    const [next, effects] = selectionUpdate({ type: "finish" }, state)

    expect(next.selecting).toBe(false)
    expect(next.range).toBeDefined()
    expect(effects).toEqual([])
  })

  test("finish with no range", () => {
    const state = createSelectionState()
    const [next, effects] = selectionUpdate({ type: "finish" }, state)

    expect(next.selecting).toBe(false)
    expect(next.range).toBeNull()
    expect(effects).toEqual([])
  })

  test("clear resets to initial state, emits render if had range", () => {
    const [state] = selectionUpdate({ type: "start", col: 0, row: 0 }, createSelectionState())
    const [next, effects] = selectionUpdate({ type: "clear" }, state)

    expect(next.range).toBeNull()
    expect(next.selecting).toBe(false)
    expect(effects).toEqual([{ type: "render" }])
  })

  test("clear with no range emits no effects", () => {
    const state = createSelectionState()
    const [next, effects] = selectionUpdate({ type: "clear" }, state)

    expect(next.range).toBeNull()
    expect(effects).toEqual([])
  })

  test("multiple start/extend cycles", () => {
    let [state] = selectionUpdate({ type: "start", col: 0, row: 0 }, createSelectionState())
    ;[state] = selectionUpdate({ type: "extend", col: 5, row: 0 }, state)
    ;[state] = selectionUpdate({ type: "extend", col: 10, row: 1 }, state)
    ;[state] = selectionUpdate({ type: "extend", col: 3, row: 2 }, state)

    expect(state.range!.anchor).toEqual({ col: 0, row: 0 })
    expect(state.range!.head).toEqual({ col: 3, row: 2 })
  })
})

// ============================================================================
// normalizeRange
// ============================================================================

describe("normalizeRange", () => {
  test("anchor before head (forward selection)", () => {
    const result = normalizeRange({
      anchor: { col: 2, row: 1 },
      head: { col: 8, row: 3 },
    })
    expect(result).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 8 })
  })

  test("head before anchor (backward selection)", () => {
    const result = normalizeRange({
      anchor: { col: 8, row: 3 },
      head: { col: 2, row: 1 },
    })
    expect(result).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 8 })
  })

  test("same row, anchor col < head col", () => {
    const result = normalizeRange({
      anchor: { col: 2, row: 5 },
      head: { col: 10, row: 5 },
    })
    expect(result).toEqual({ startRow: 5, startCol: 2, endRow: 5, endCol: 10 })
  })

  test("same row, head col < anchor col", () => {
    const result = normalizeRange({
      anchor: { col: 10, row: 5 },
      head: { col: 2, row: 5 },
    })
    expect(result).toEqual({ startRow: 5, startCol: 2, endRow: 5, endCol: 10 })
  })

  test("same position", () => {
    const result = normalizeRange({
      anchor: { col: 5, row: 5 },
      head: { col: 5, row: 5 },
    })
    expect(result).toEqual({ startRow: 5, startCol: 5, endRow: 5, endCol: 5 })
  })
})

// ============================================================================
// extractText
// ============================================================================

describe("extractText", () => {
  function createBufferWithText(lines: string[], width = 20): TerminalBuffer {
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

  test("single row extraction", () => {
    const buf = createBufferWithText(["Hello, World!"])
    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    })
    expect(text).toBe("Hello")
  })

  test("multi-row extraction", () => {
    const buf = createBufferWithText(["First line here", "Second line", "Third line"])
    const text = extractText(buf, {
      anchor: { col: 6, row: 0 },
      head: { col: 5, row: 2 },
    })
    expect(text).toBe("line here\nSecond line\nThird")
  })

  test("trims trailing spaces", () => {
    const buf = createBufferWithText(["Hello     "], 10)
    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 9, row: 0 },
    })
    expect(text).toBe("Hello")
  })

  test("skips completely empty rows", () => {
    const buf = createBufferWithText(["Hello", "     ", "World"], 10)
    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 2 },
    })
    expect(text).toBe("Hello\nWorld")
  })

  test("backward selection (head before anchor)", () => {
    const buf = createBufferWithText(["Hello, World!"])
    const text = extractText(buf, {
      anchor: { col: 7, row: 0 },
      head: { col: 0, row: 0 },
    })
    expect(text).toBe("Hello, W")
  })
})
