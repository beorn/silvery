/**
 * Tests for selection overlay rendering.
 */
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/term/buffer"
import { renderSelectionOverlay } from "@silvery/term/selection-renderer"
import type { SelectionRange } from "@silvery/term/selection"

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// renderSelectionOverlay
// ============================================================================

describe("renderSelectionOverlay", () => {
  test("returns empty string for null selection", () => {
    const buf = createBufferWithText(["Hello"])
    expect(renderSelectionOverlay(null, buf)).toBe("")
  })

  test("single-row selection emits inverse characters", () => {
    const buf = createBufferWithText(["Hello, World!"])
    const range: SelectionRange = {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    }
    const output = renderSelectionOverlay(range, buf)

    // Should move cursor to row 1, col 1 (1-based)
    expect(output).toContain("\x1b[1;1H")
    // Should enable inverse
    expect(output).toContain("\x1b[7m")
    // Should contain the selected characters
    expect(output).toContain("Hello")
    // Should disable inverse
    expect(output).toContain("\x1b[27m")
  })

  test("multi-row selection covers all rows", () => {
    const buf = createBufferWithText(["First line", "Second line", "Third line"], 20)
    const range: SelectionRange = {
      anchor: { col: 6, row: 0 },
      head: { col: 5, row: 2 },
    }
    const output = renderSelectionOverlay(range, buf)

    // Should have cursor moves for all 3 rows
    expect(output).toContain("\x1b[1;7H") // Row 0, col 6 (1-based: row 1, col 7)
    expect(output).toContain("\x1b[2;1H") // Row 1, col 0 (1-based: row 2, col 1)
    expect(output).toContain("\x1b[3;1H") // Row 2, col 0 (1-based: row 3, col 1)
  })

  test("backward selection is normalized", () => {
    const buf = createBufferWithText(["Hello"])
    const forwardRange: SelectionRange = {
      anchor: { col: 1, row: 0 },
      head: { col: 3, row: 0 },
    }
    const backwardRange: SelectionRange = {
      anchor: { col: 3, row: 0 },
      head: { col: 1, row: 0 },
    }

    const forwardOutput = renderSelectionOverlay(forwardRange, buf)
    const backwardOutput = renderSelectionOverlay(backwardRange, buf)

    // Both should produce the same output
    expect(forwardOutput).toBe(backwardOutput)
  })

  test("first row starts at startCol, middle rows at 0, last row ends at endCol", () => {
    const buf = createBufferWithText(["AAAAAAAAAA", "BBBBBBBBBB", "CCCCCCCCCC"], 10)
    const range: SelectionRange = {
      anchor: { col: 3, row: 0 },
      head: { col: 6, row: 2 },
    }
    const output = renderSelectionOverlay(range, buf)

    // Row 0: from col 3 to end (cols 3-9 = 7 A's)
    // Row 1: full row (cols 0-9 = 10 B's)
    // Row 2: from col 0 to 6 (cols 0-6 = 7 C's)
    // Count inverse enable/disable pairs (one per row)
    const inverseEnables = output.split("\x1b[7m").length - 1
    const inverseDisables = output.split("\x1b[27m").length - 1
    expect(inverseEnables).toBe(3)
    expect(inverseDisables).toBe(3)
  })
})
