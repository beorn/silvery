/**
 * Tests for selection rendering.
 *
 * The legacy `renderSelectionOverlay` ANSI-overlay function was deleted
 * (see km-silvery.delete-render-selection-overlay) and replaced with
 * `composeSelectionCells` + `applySelectionToBuffer`. Selection styling
 * now lives in the painted buffer cells (so the diff engine can track
 * lifecycle), not in ANSI written past the buffer.
 *
 * Comprehensive composeSelectionCells / applySelectionToBuffer behavior
 * tests live in `tests/selection.test.ts` ("composeSelectionCells" + the
 * applySelectionToBuffer test). These tests cover the row-coverage cases
 * that used to be exercised by renderSelectionOverlay.
 */
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import {
  composeSelectionCells,
  applySelectionToBuffer,
} from "@silvery/ag-term/selection-renderer"
import type { SelectionRange } from "@silvery/headless/selection"

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
// composeSelectionCells — row-coverage parity with the deleted renderer
// ============================================================================

describe("composeSelectionCells — row coverage", () => {
  test("returns empty array for null selection", () => {
    const buf = createBufferWithText(["Hello"])
    expect(composeSelectionCells(buf, null)).toEqual([])
  })

  test("single-row selection covers exactly the selected cells", () => {
    const buf = createBufferWithText(["Hello, World!"])
    const range: SelectionRange = {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    }
    const changes = composeSelectionCells(buf, range)

    // Cells 0..4 inclusive.
    expect(changes.map((c) => c.col).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
    expect(new Set(changes.map((c) => c.row))).toEqual(new Set([0]))
  })

  test("multi-row selection covers all rows in range", () => {
    const buf = createBufferWithText(["First line", "Second line", "Third line"], 20)
    const range: SelectionRange = {
      anchor: { col: 6, row: 0 },
      head: { col: 5, row: 2 },
    }
    const changes = composeSelectionCells(buf, range)

    const rows = new Set(changes.map((c) => c.row))
    expect(rows.has(0)).toBe(true)
    expect(rows.has(1)).toBe(true)
    expect(rows.has(2)).toBe(true)
  })

  test("backward selection is normalized (anchor/head order doesn't matter)", () => {
    const buf = createBufferWithText(["Hello"])
    const forwardRange: SelectionRange = {
      anchor: { col: 1, row: 0 },
      head: { col: 3, row: 0 },
    }
    const backwardRange: SelectionRange = {
      anchor: { col: 3, row: 0 },
      head: { col: 1, row: 0 },
    }

    const forward = composeSelectionCells(buf, forwardRange)
    const backward = composeSelectionCells(buf, backwardRange)

    // Same set of cells affected.
    expect(forward.map((c) => `${c.row},${c.col}`).sort()).toEqual(
      backward.map((c) => `${c.row},${c.col}`).sort(),
    )
  })

  test("first row starts at startCol, middle rows full-width, last row ends at endCol", () => {
    const buf = createBufferWithText(["AAAAAAAAAA", "BBBBBBBBBB", "CCCCCCCCCC"], 10)
    const range: SelectionRange = {
      anchor: { col: 3, row: 0 },
      head: { col: 6, row: 2 },
    }
    const changes = composeSelectionCells(buf, range)

    // Row 0: cols 3..9 = 7 cells
    // Row 1: full row = 10 cells
    // Row 2: cols 0..6 = 7 cells
    const row0 = changes.filter((c) => c.row === 0).length
    const row1 = changes.filter((c) => c.row === 1).length
    const row2 = changes.filter((c) => c.row === 2).length
    expect(row0).toBe(7)
    expect(row1).toBe(10)
    expect(row2).toBe(7)
  })

  test("applying changes mutates the buffer cells (not just an ANSI string)", () => {
    const buf = createBufferWithText(["Hello"])
    buf.setCell(2, 0, { char: "l", fg: 4, bg: 7 })
    const range: SelectionRange = {
      anchor: { col: 2, row: 0 },
      head: { col: 2, row: 0 },
    }

    const changes = composeSelectionCells(buf, range)
    applySelectionToBuffer(buf, changes)

    // fg/bg swap (legacy renderSelectionOverlay behavior preserved)
    const cell = buf.getCell(2, 0)
    expect(cell.fg).toBe(7)
    expect(cell.bg).toBe(4)
    expect(cell.char).toBe("l")
  })
})
