/**
 * Text Decorations Tests
 *
 * Bead: km-silvery.decorations
 *
 * Tests the pure functions for splitting text into styled segments,
 * search decoration generation, and decoration position adjustment.
 */

import { describe, test, expect } from "vitest"
import {
  splitIntoSegments,
  createSearchDecorations,
  adjustDecorations,
  type Decoration,
  type DecorationStyle,
} from "@silvery/create/text-decorations"

// ============================================================================
// splitIntoSegments
// ============================================================================

describe("splitIntoSegments", () => {
  test("returns empty array for zero-width range", () => {
    expect(splitIntoSegments(5, 5, [], null)).toEqual([])
  })

  test("returns single unstyled segment when no decorations", () => {
    const segments = splitIntoSegments(0, 10, [], null)
    expect(segments).toEqual([{ from: 0, to: 10, style: {} }])
  })

  test("splits at decoration boundaries", () => {
    const decs: Decoration[] = [{ from: 3, to: 7, style: { bold: true } }]
    const segments = splitIntoSegments(0, 10, decs, null)

    expect(segments).toEqual([
      { from: 0, to: 3, style: {} },
      { from: 3, to: 7, style: { bold: true } },
      { from: 7, to: 10, style: {} },
    ])
  })

  test("clips decorations to line range", () => {
    const decs: Decoration[] = [{ from: 0, to: 100, style: { color: "red" } }]
    const segments = splitIntoSegments(10, 20, decs, null)

    expect(segments).toEqual([{ from: 10, to: 20, style: { color: "red" } }])
  })

  test("ignores decorations outside line range", () => {
    const decs: Decoration[] = [
      { from: 0, to: 5, style: { bold: true } },
      { from: 25, to: 30, style: { italic: true } },
    ]
    const segments = splitIntoSegments(10, 20, decs, null)

    expect(segments).toEqual([{ from: 10, to: 20, style: {} }])
  })

  test("merges overlapping decorations (later wins)", () => {
    const decs: Decoration[] = [
      { from: 0, to: 10, style: { color: "red" } },
      { from: 5, to: 15, style: { color: "blue", bold: true } },
    ]
    const segments = splitIntoSegments(0, 15, decs, null)

    expect(segments).toEqual([
      { from: 0, to: 5, style: { color: "red" } },
      { from: 5, to: 10, style: { color: "blue", bold: true } },
      { from: 10, to: 15, style: { color: "blue", bold: true } },
    ])
  })

  test("handles selection marking", () => {
    const segments = splitIntoSegments(0, 10, [], { start: 3, end: 7 })

    expect(segments).toEqual([
      { from: 0, to: 3, style: {} },
      { from: 3, to: 7, style: {}, selected: true },
      { from: 7, to: 10, style: {} },
    ])
  })

  test("selection and decorations combine", () => {
    const decs: Decoration[] = [{ from: 2, to: 8, style: { backgroundColor: "yellow" } }]
    const segments = splitIntoSegments(0, 10, decs, { start: 5, end: 10 })

    expect(segments).toHaveLength(4)
    // 0-2: no decoration, no selection
    expect(segments[0]).toEqual({ from: 0, to: 2, style: {} })
    // 2-5: decoration, no selection
    expect(segments[1]).toEqual({ from: 2, to: 5, style: { backgroundColor: "yellow" } })
    // 5-8: decoration + selection
    expect(segments[2]).toEqual({
      from: 5,
      to: 8,
      style: { backgroundColor: "yellow" },
      selected: true,
    })
    // 8-10: no decoration, selected
    expect(segments[3]).toEqual({ from: 8, to: 10, style: {}, selected: true })
  })

  test("multiple non-overlapping decorations", () => {
    const decs: Decoration[] = [
      { from: 0, to: 3, style: { bold: true } },
      { from: 5, to: 8, style: { italic: true } },
    ]
    const segments = splitIntoSegments(0, 10, decs, null)

    expect(segments).toEqual([
      { from: 0, to: 3, style: { bold: true } },
      { from: 3, to: 5, style: {} },
      { from: 5, to: 8, style: { italic: true } },
      { from: 8, to: 10, style: {} },
    ])
  })

  test("decoration at exact line boundaries", () => {
    const decs: Decoration[] = [{ from: 10, to: 20, style: { underline: true } }]
    const segments = splitIntoSegments(10, 20, decs, null)

    expect(segments).toEqual([{ from: 10, to: 20, style: { underline: true } }])
  })
})

// ============================================================================
// createSearchDecorations
// ============================================================================

describe("createSearchDecorations", () => {
  test("returns empty for empty query", () => {
    expect(createSearchDecorations("hello world", "")).toEqual([])
  })

  test("returns empty for empty text", () => {
    expect(createSearchDecorations("", "hello")).toEqual([])
  })

  test("finds single match", () => {
    const decs = createSearchDecorations("hello world", "world")
    expect(decs).toEqual([
      { from: 6, to: 11, style: { backgroundColor: "yellow", color: "black" } },
    ])
  })

  test("finds multiple matches", () => {
    const decs = createSearchDecorations("foo bar foo baz foo", "foo")
    expect(decs).toHaveLength(3)
    expect(decs[0]).toEqual({ from: 0, to: 3, style: expect.any(Object) })
    expect(decs[1]).toEqual({ from: 8, to: 11, style: expect.any(Object) })
    expect(decs[2]).toEqual({ from: 16, to: 19, style: expect.any(Object) })
  })

  test("case-insensitive search", () => {
    const decs = createSearchDecorations("Hello HELLO hello", "hello")
    expect(decs).toHaveLength(3)
  })

  test("custom style", () => {
    const style: DecorationStyle = { backgroundColor: "red", bold: true }
    const decs = createSearchDecorations("test", "test", style)
    expect(decs[0]!.style).toEqual(style)
  })

  test("no matches returns empty", () => {
    const decs = createSearchDecorations("hello world", "xyz")
    expect(decs).toEqual([])
  })
})

// ============================================================================
// adjustDecorations
// ============================================================================

describe("adjustDecorations", () => {
  test("decorations before edit are unchanged", () => {
    const decs: Decoration[] = [{ from: 0, to: 5, style: { bold: true } }]
    const result = adjustDecorations(decs, 10, 0, 3) // insert 3 chars at position 10
    expect(result).toEqual([{ from: 0, to: 5, style: { bold: true } }])
  })

  test("decorations after insert are shifted forward", () => {
    const decs: Decoration[] = [{ from: 10, to: 15, style: { bold: true } }]
    const result = adjustDecorations(decs, 5, 0, 3) // insert 3 chars at position 5
    expect(result).toEqual([{ from: 13, to: 18, style: { bold: true } }])
  })

  test("decorations after delete are shifted backward", () => {
    const decs: Decoration[] = [{ from: 10, to: 15, style: { bold: true } }]
    const result = adjustDecorations(decs, 5, 3, 0) // delete 3 chars at position 5
    expect(result).toEqual([{ from: 7, to: 12, style: { bold: true } }])
  })

  test("decoration fully inside deleted region is removed", () => {
    const decs: Decoration[] = [{ from: 5, to: 8, style: { bold: true } }]
    const result = adjustDecorations(decs, 3, 10, 0) // delete chars 3-13
    expect(result).toEqual([])
  })

  test("decoration partially overlapping delete is adjusted", () => {
    const decs: Decoration[] = [{ from: 5, to: 15, style: { bold: true } }]
    const result = adjustDecorations(decs, 10, 5, 0) // delete chars 10-15
    expect(result).toEqual([{ from: 5, to: 10, style: { bold: true } }])
  })

  test("replace (delete + insert) adjusts correctly", () => {
    const decs: Decoration[] = [{ from: 20, to: 25, style: { bold: true } }]
    const result = adjustDecorations(decs, 10, 3, 5) // replace 3 chars with 5 at position 10
    // delta = 5 - 3 = +2
    expect(result).toEqual([{ from: 22, to: 27, style: { bold: true } }])
  })

  test("preserves style through adjustments", () => {
    const style: DecorationStyle = { color: "red", bold: true, underline: true }
    const decs: Decoration[] = [{ from: 10, to: 20, style }]
    const result = adjustDecorations(decs, 0, 0, 5)
    expect(result[0]!.style).toEqual(style)
  })

  test("returns new array (immutable)", () => {
    const decs: Decoration[] = [{ from: 0, to: 5, style: {} }]
    const result = adjustDecorations(decs, 10, 0, 1)
    expect(result).not.toBe(decs)
  })
})
