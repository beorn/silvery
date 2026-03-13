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
