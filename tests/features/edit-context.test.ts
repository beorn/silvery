/**
 * Edit Context Tests
 *
 * Tests for createTermEditContext: undo of replacements (P0-1),
 * selection-aware deleteWord/deleteToStart/deleteToEnd (P0-2),
 * and text-ops replace type correctness.
 */

import { describe, test, expect } from "vitest"
import { createTermEditContext } from "@silvery/react"
import { applyTextOp, invertTextOp } from "@silvery/tea/text-ops"
import type { TextOp } from "@silvery/tea/text-ops"

// ============================================================================
// P0-1: updateText replacement undo
// ============================================================================

describe("updateText replacement produces correct undo op", () => {
  test("replace emits a replace op with both deleted and inserted text", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 0, selectionEnd: 5 })
    const ops: TextOp[] = []
    ctx.onTextUpdate((op) => ops.push(op))

    // Replace "hello" (0..5) with "goodbye"
    const op = ctx.updateText(0, 5, "goodbye")

    expect(op.type).toBe("replace")
    if (op.type === "replace") {
      expect(op.offset).toBe(0)
      expect(op.text).toBe("goodbye")
      expect(op.deleted).toBe("hello")
    }
    expect(ctx.text).toBe("goodbye world")
  })

  test("undo of replacement fully restores original text", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 0, selectionEnd: 5 })

    // Replace "hello" with "goodbye"
    const op = ctx.updateText(0, 5, "goodbye")
    expect(ctx.text).toBe("goodbye world")

    // Invert and apply to get back to original
    const inv = invertTextOp(op)
    const restored = applyTextOp(ctx.text, inv)
    expect(restored).toBe("hello world")
  })

  test("undo of insertChar over selection restores original", () => {
    using ctx = createTermEditContext({ text: "abcdef", selectionStart: 1, selectionEnd: 4 })

    // insertChar with selection replaces "bcd" with "X"
    const op = ctx.insertChar("X")
    expect(ctx.text).toBe("aXef")

    // Undo should restore "abcdef"
    const inv = invertTextOp(op)
    const restored = applyTextOp(ctx.text, inv)
    expect(restored).toBe("abcdef")
  })

  test("pure delete still emits delete op", () => {
    using ctx = createTermEditContext({ text: "hello world" })
    const op = ctx.updateText(0, 5, "")
    expect(op.type).toBe("delete")
    expect(op).toEqual({ type: "delete", offset: 0, text: "hello" })
  })

  test("pure insert still emits insert op", () => {
    using ctx = createTermEditContext({ text: "hello" })
    const op = ctx.updateText(5, 5, " world")
    expect(op.type).toBe("insert")
    expect(op).toEqual({ type: "insert", offset: 5, text: " world" })
  })
})

// ============================================================================
// P0-2: deleteWord/deleteToStart/deleteToEnd with active selection
// ============================================================================

describe("deleteWord respects active selection", () => {
  test("deleteWord with selection deletes selected text", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 2, selectionEnd: 8 })

    const op = ctx.deleteWord()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("herld")
    expect(ctx.selectionStart).toBe(2)
    expect(ctx.selectionEnd).toBe(2)
  })

  test("deleteWord without selection still deletes word backward", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 11 })

    const op = ctx.deleteWord()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("hello ")
  })
})

describe("deleteToStart respects active selection", () => {
  test("deleteToStart with selection deletes selected text", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 2, selectionEnd: 8 })

    const op = ctx.deleteToStart()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("herld")
    expect(ctx.selectionStart).toBe(2)
    expect(ctx.selectionEnd).toBe(2)
  })

  test("deleteToStart without selection deletes to line start", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 5 })

    const op = ctx.deleteToStart()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe(" world")
  })
})

describe("deleteToEnd respects active selection", () => {
  test("deleteToEnd with selection deletes selected text", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 2, selectionEnd: 8 })

    const op = ctx.deleteToEnd()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("herld")
    expect(ctx.selectionStart).toBe(2)
    expect(ctx.selectionEnd).toBe(2)
  })

  test("deleteToEnd without selection deletes to line end", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 5 })

    const op = ctx.deleteToEnd()
    expect(op).not.toBeNull()
    expect(ctx.text).toBe("hello")
  })
})

// ============================================================================
// Selection collapse on arrow keys
// ============================================================================

describe("moveCursor collapses selection on arrow keys", () => {
  // "hello world" with selection [2,8) = "llo wo"

  test("arrow left collapses to left edge of selection", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 2, selectionEnd: 8 })

    const moved = ctx.moveCursor("left")
    expect(moved).toBe(true)
    expect(ctx.selectionStart).toBe(2) // min(2, 8)
    expect(ctx.selectionEnd).toBe(2)
  })

  test("arrow right collapses to right edge of selection", () => {
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 2, selectionEnd: 8 })

    const moved = ctx.moveCursor("right")
    expect(moved).toBe(true)
    expect(ctx.selectionStart).toBe(8) // max(2, 8)
    expect(ctx.selectionEnd).toBe(8)
  })

  test("arrow left collapses reversed selection (start > end) to left edge", () => {
    // Reversed selection: start=8, end=2
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 8, selectionEnd: 2 })

    const moved = ctx.moveCursor("left")
    expect(moved).toBe(true)
    expect(ctx.selectionStart).toBe(2) // min(8, 2)
    expect(ctx.selectionEnd).toBe(2)
  })

  test("arrow right collapses reversed selection (start > end) to right edge", () => {
    // Reversed selection: start=8, end=2
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 8, selectionEnd: 2 })

    const moved = ctx.moveCursor("right")
    expect(moved).toBe(true)
    expect(ctx.selectionStart).toBe(8) // max(8, 2)
    expect(ctx.selectionEnd).toBe(8)
  })

  test("arrow left with selection at position 0 collapses to 0", () => {
    // Selection from 0 to 5
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 0, selectionEnd: 5 })

    const moved = ctx.moveCursor("left")
    expect(moved).toBe(true)
    expect(ctx.selectionStart).toBe(0)
    expect(ctx.selectionEnd).toBe(0)
  })

  test("arrow right with selection at end collapses to end", () => {
    // Selection from 5 to 11 (end of "hello world")
    using ctx = createTermEditContext({ text: "hello world", selectionStart: 5, selectionEnd: 11 })

    const moved = ctx.moveCursor("right")
    expect(moved).toBe(true)
    expect(ctx.selectionStart).toBe(11)
    expect(ctx.selectionEnd).toBe(11)
  })

  test("arrow up with selection collapses then moves up", () => {
    // Multi-line text, selection in the second visual line
    // wrapWidth=10, "abcdefghij" wraps: line0="abcdefghij", line1="klmno"
    using ctx = createTermEditContext({
      text: "abcdefghijklmno",
      selectionStart: 3,
      selectionEnd: 12,
      wrapWidth: 10,
    })

    const moved = ctx.moveCursor("up")
    // With selection, should collapse first, then attempt up movement
    // After collapse to min(3,12)=3, cursor is at col 3 of row 0 — already top row
    expect(moved).toBe(false)
    expect(ctx.selectionStart).toBe(ctx.selectionEnd) // selection collapsed
  })

  test("arrow down with selection collapses then moves down", () => {
    // wrapWidth=10: "abcdefghij" (row0), "klmno" (row1)
    using ctx = createTermEditContext({
      text: "abcdefghijklmno",
      selectionStart: 3,
      selectionEnd: 12,
      wrapWidth: 10,
    })

    const moved = ctx.moveCursor("down")
    // After collapse to max(3,12)=12, cursor at row 1 col 2 — already last row
    expect(moved).toBe(false)
    expect(ctx.selectionStart).toBe(ctx.selectionEnd) // selection collapsed
  })

  test("no-op without selection: left/right behave normally", () => {
    using ctx = createTermEditContext({ text: "hello", selectionStart: 3 })

    ctx.moveCursor("left")
    expect(ctx.selectionStart).toBe(2)
    expect(ctx.selectionEnd).toBe(2)

    ctx.moveCursor("right")
    expect(ctx.selectionStart).toBe(3)
    expect(ctx.selectionEnd).toBe(3)
  })
})

// ============================================================================
// text-ops: replace type
// ============================================================================

describe("applyTextOp handles replace ops", () => {
  test("apply replace op", () => {
    const result = applyTextOp("hello world", {
      type: "replace",
      offset: 0,
      text: "goodbye",
      deleted: "hello",
    })
    expect(result).toBe("goodbye world")
  })

  test("apply inverted replace op", () => {
    const op: TextOp = { type: "replace", offset: 0, text: "goodbye", deleted: "hello" }
    const inv = invertTextOp(op)
    expect(inv).toEqual({ type: "replace", offset: 0, text: "hello", deleted: "goodbye" })

    // Apply original then inverse should round-trip
    const after = applyTextOp("hello world", op)
    expect(after).toBe("goodbye world")
    const restored = applyTextOp(after, inv)
    expect(restored).toBe("hello world")
  })

  test("replace op with mismatched text throws", () => {
    expect(() =>
      applyTextOp("hello world", {
        type: "replace",
        offset: 0,
        text: "goodbye",
        deleted: "WRONG",
      }),
    ).toThrow("replace mismatch")
  })
})
