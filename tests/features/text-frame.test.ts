/**
 * Tests for createTextFrame() and cellToFrameCell() — immutable TextFrame
 * snapshot factory and cell color resolution.
 */
import { describe, test, expect } from "vitest"
import {
  TerminalBuffer,
  createTextFrame,
  cellToFrameCell,
  EMPTY_FRAME_CELL,
  DEFAULT_BG,
  type Cell,
  type Color,
} from "@silvery/ag-term/buffer"

// ============================================================================
// Helpers
// ============================================================================

/** Create a buffer and set cells from a simple spec. */
function makeBuffer(width: number, height: number, cells?: Array<{ x: number; y: number; cell: Partial<Cell> }>) {
  const buf = new TerminalBuffer(width, height)
  for (const { x, y, cell } of cells ?? []) {
    buf.setCell(x, y, cell)
  }
  return buf
}

// ============================================================================
// createTextFrame — basic properties
// ============================================================================

describe("createTextFrame", () => {
  test("width, height, text, lines, containsText", () => {
    const buf = makeBuffer(10, 3, [
      { x: 0, y: 0, cell: { char: "H" } },
      { x: 1, y: 0, cell: { char: "i" } },
      { x: 0, y: 1, cell: { char: "!" } },
    ])
    const frame = createTextFrame(buf)

    expect(frame.width).toBe(10)
    expect(frame.height).toBe(3)
    expect(frame.containsText("Hi")).toBe(true)
    expect(frame.containsText("!")).toBe(true)
    expect(frame.containsText("missing")).toBe(false)
    expect(frame.lines.length).toBeGreaterThanOrEqual(1)
    expect(frame.lines[0]).toContain("Hi")
  })

  // ==========================================================================
  // Cell access with different color types
  // ==========================================================================

  test("cell() returns FrameCell with resolved RGB for 256-color index", () => {
    // Color index 1 = red (128, 0, 0)
    const buf = makeBuffer(5, 1, [{ x: 0, y: 0, cell: { char: "R", fg: 1, bg: 2 } }])
    const frame = createTextFrame(buf)
    const c = frame.cell(0, 0)

    expect(c.char).toBe("R")
    expect(c.fg).toEqual({ r: 128, g: 0, b: 0 }) // ANSI red
    expect(c.bg).toEqual({ r: 0, g: 128, b: 0 }) // ANSI green
  })

  test("cell() returns FrameCell with passthrough RGB for true color", () => {
    const buf = makeBuffer(5, 1, [
      { x: 0, y: 0, cell: { char: "T", fg: { r: 10, g: 20, b: 30 }, bg: { r: 40, g: 50, b: 60 } } },
    ])
    const frame = createTextFrame(buf)
    const c = frame.cell(0, 0)

    expect(c.fg).toEqual({ r: 10, g: 20, b: 30 })
    expect(c.bg).toEqual({ r: 40, g: 50, b: 60 })
  })

  test("cell() returns null fg/bg for null color", () => {
    const buf = makeBuffer(5, 1, [{ x: 0, y: 0, cell: { char: "N", fg: null, bg: null } }])
    const frame = createTextFrame(buf)
    const c = frame.cell(0, 0)

    expect(c.fg).toBeNull()
    expect(c.bg).toBeNull()
  })

  // ==========================================================================
  // Immutability (snapshot semantics)
  // ==========================================================================

  test("TextFrame is detached from source buffer mutations", () => {
    const buf = makeBuffer(5, 1, [{ x: 0, y: 0, cell: { char: "A", fg: 1 } }])
    const frame = createTextFrame(buf)

    // Mutate the source buffer AFTER snapshot
    buf.setCell(0, 0, { char: "Z", fg: 9 })

    // Frame should still reflect original values
    const c = frame.cell(0, 0)
    expect(c.char).toBe("A")
    expect(c.fg).toEqual({ r: 128, g: 0, b: 0 }) // original ANSI red, not bright red (9)
    expect(frame.containsText("A")).toBe(true)
    expect(frame.containsText("Z")).toBe(false)
  })

  // ==========================================================================
  // ANSI output
  // ==========================================================================

  test("ansi contains ANSI escape codes for styled cells", () => {
    const buf = makeBuffer(10, 1, [
      { x: 0, y: 0, cell: { char: "B", fg: { r: 255, g: 0, b: 0 }, attrs: { bold: true } } },
    ])
    const frame = createTextFrame(buf)

    // Should contain escape sequences (ESC[)
    expect(frame.ansi).toMatch(/\x1b\[/)
    // Should contain the character
    expect(frame.ansi).toContain("B")
  })

  // ==========================================================================
  // Wide characters
  // ==========================================================================

  test("wide character: cell().wide and adjacent cell().continuation", () => {
    const buf = makeBuffer(10, 1, [
      { x: 0, y: 0, cell: { char: "\u4e16", wide: true } }, // CJK character
      { x: 1, y: 0, cell: { char: "", continuation: true } },
    ])
    const frame = createTextFrame(buf)

    expect(frame.cell(0, 0).wide).toBe(true)
    expect(frame.cell(0, 0).continuation).toBe(false)
    expect(frame.cell(1, 0).continuation).toBe(true)
    expect(frame.cell(1, 0).wide).toBe(false)
  })

  // ==========================================================================
  // Underline styles
  // ==========================================================================

  test("underline style is preserved as UnderlineStyle, not boolean", () => {
    const buf = makeBuffer(10, 1, [{ x: 0, y: 0, cell: { char: "U", attrs: { underlineStyle: "curly" } } }])
    const frame = createTextFrame(buf)
    const c = frame.cell(0, 0)

    expect(c.underline).toBe("curly")
  })

  test("simple underline boolean maps to 'single'", () => {
    const buf = makeBuffer(10, 1, [{ x: 0, y: 0, cell: { char: "U", attrs: { underline: true } } }])
    const frame = createTextFrame(buf)
    const c = frame.cell(0, 0)

    expect(c.underline).toBe("single")
  })

  // ==========================================================================
  // Out-of-bounds access
  // ==========================================================================

  test("cell() out-of-bounds returns EMPTY_FRAME_CELL equivalent", () => {
    const buf = makeBuffer(5, 5)
    const frame = createTextFrame(buf)

    const oob = frame.cell(-1, -1)
    expect(oob.char).toBe(" ")
    expect(oob.fg).toBeNull()
    expect(oob.bg).toBeNull()
    expect(oob.bold).toBe(false)
    expect(oob.wide).toBe(false)
    expect(oob.continuation).toBe(false)
    expect(oob.underline).toBe(false)
    expect(oob).toBe(EMPTY_FRAME_CELL) // exact same reference

    // Also test beyond the right/bottom edges
    expect(frame.cell(5, 0)).toBe(EMPTY_FRAME_CELL)
    expect(frame.cell(0, 5)).toBe(EMPTY_FRAME_CELL)
    expect(frame.cell(999, 999)).toBe(EMPTY_FRAME_CELL)
  })
})

// ============================================================================
// cellToFrameCell — color resolution
// ============================================================================

describe("cellToFrameCell", () => {
  const baseCell: Cell = {
    char: "x",
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {},
    wide: false,
    continuation: false,
  }

  test.each<{ label: string; input: Color; expected: { r: number; g: number; b: number } | null }>([
    { label: "null → null", input: null, expected: null },
    { label: "index 0 (black) → RGB", input: 0, expected: { r: 0, g: 0, b: 0 } },
    { label: "index 1 (red) → RGB", input: 1, expected: { r: 128, g: 0, b: 0 } },
    { label: "index 15 (bright white) → RGB", input: 15, expected: { r: 255, g: 255, b: 255 } },
    { label: "index 232 (gray) → RGB", input: 232, expected: { r: 8, g: 8, b: 8 } },
    {
      label: "true color RGB → passthrough",
      input: { r: 42, g: 84, b: 126 },
      expected: { r: 42, g: 84, b: 126 },
    },
    { label: "DEFAULT_BG sentinel → null", input: DEFAULT_BG, expected: null },
  ])("fg color: $label", ({ input, expected }) => {
    const cell: Cell = { ...baseCell, fg: input }
    const fc = cellToFrameCell(cell)
    if (expected === null) {
      expect(fc.fg).toBeNull()
    } else {
      expect(fc.fg).toEqual(expected)
    }
  })

  test.each<{ label: string; input: Color; expected: { r: number; g: number; b: number } | null }>([
    { label: "null → null", input: null, expected: null },
    { label: "index 4 (blue) → RGB", input: 4, expected: { r: 0, g: 0, b: 128 } },
    {
      label: "true color RGB → passthrough",
      input: { r: 1, g: 2, b: 3 },
      expected: { r: 1, g: 2, b: 3 },
    },
    { label: "DEFAULT_BG sentinel → null", input: DEFAULT_BG, expected: null },
  ])("bg color: $label", ({ input, expected }) => {
    const cell: Cell = { ...baseCell, bg: input }
    const fc = cellToFrameCell(cell)
    if (expected === null) {
      expect(fc.bg).toBeNull()
    } else {
      expect(fc.bg).toEqual(expected)
    }
  })

  test("attrs are flattened with defaults", () => {
    const cell: Cell = { ...baseCell, attrs: { bold: true, italic: true } }
    const fc = cellToFrameCell(cell)

    expect(fc.bold).toBe(true)
    expect(fc.italic).toBe(true)
    expect(fc.dim).toBe(false)
    expect(fc.strikethrough).toBe(false)
    expect(fc.inverse).toBe(false)
    expect(fc.blink).toBe(false)
    expect(fc.hidden).toBe(false)
  })

  test("underlineColor resolved same as fg/bg", () => {
    const cell: Cell = { ...baseCell, underlineColor: 9 } // bright red
    const fc = cellToFrameCell(cell)

    expect(fc.underlineColor).toEqual({ r: 255, g: 0, b: 0 })
  })

  test("hyperlink defaults to null when undefined", () => {
    const fc = cellToFrameCell(baseCell)
    expect(fc.hyperlink).toBeNull()
  })

  test("hyperlink preserved when set", () => {
    const cell: Cell = { ...baseCell, hyperlink: "https://example.com" }
    const fc = cellToFrameCell(cell)
    expect(fc.hyperlink).toBe("https://example.com")
  })
})
