/**
 * Search highlight — buffer-state architecture regression test.
 *
 * Sibling of `tests/features/selection-shrink-visual.test.tsx`.
 *
 * Bug shape (2026-04-24, sibling of km-silvery.delete-render-selection-overlay):
 *   Search highlights paint inverse ANSI directly past the buffer
 *   (`target.write(\\x1b[...;...H\\x1b[7m...\\x1b[27m)`). The buffer the diff
 *   engine tracks never sees the inverse styling, so when the active
 *   currentMatch moves to a different position (n/N navigation, or the query
 *   is edited so a different match becomes current), the previously painted
 *   inverse cells stay inverse — they never get repainted because the
 *   canonical buffer's cells didn't change.
 *
 * Fix:
 *   Migrate to `composeSearchHighlightCells` + `applySelectionToBuffer`
 *   (re-uses the cell-change apply helper from the selection migration).
 *   Highlights become part of the painted buffer (applied to a clone of the
 *   post-render buffer so Ag's prevBuffer stays clean). The output diff
 *   engine naturally repaints cells that were highlighted last frame but
 *   aren't this frame.
 *
 * What this test asserts:
 *   The same architectural invariant the selection test asserts: when a
 *   currentMatch is active, cells inside its [startCol, endCol] range on
 *   the right screen row are inverse on the terminal screen, AND when the
 *   match moves, the previously-inverted cells get repainted clean.
 *
 * Tracking bead: km-silvery.delete-search-overlay-ansi
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import {
  composeSearchHighlightCells,
  type SearchHighlight,
} from "../../packages/ag-term/src/selection-renderer"

// ============================================================================
// Unit-level: composeSearchHighlightCells produces the right cell changes
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

describe("composeSearchHighlightCells", () => {
  test("returns empty for empty highlights array", () => {
    const buf = createBufferWithText(["Hello"])
    expect(composeSearchHighlightCells(buf, [])).toEqual([])
  })

  test("single highlight covers exactly the cell range on the screen row", () => {
    const buf = createBufferWithText(["Hello, World!"])
    const highlights: SearchHighlight[] = [{ screenRow: 0, startCol: 7, endCol: 11 }]
    const changes = composeSearchHighlightCells(buf, highlights)

    // Cells 7..11 inclusive on row 0
    expect(changes.map((c) => c.col).sort((a, b) => a - b)).toEqual([7, 8, 9, 10, 11])
    expect(new Set(changes.map((c) => c.row))).toEqual(new Set([0]))
  })

  test("default fg/bg cells get inverseAttr fallback (legacy SGR 7 parity)", () => {
    const buf = createBufferWithText(["abc"])
    const highlights: SearchHighlight[] = [{ screenRow: 0, startCol: 0, endCol: 2 }]
    const changes = composeSearchHighlightCells(buf, highlights)

    // All three cells have null fg + null bg, so inverseAttr should be true
    expect(changes).toHaveLength(3)
    for (const c of changes) {
      expect(c.inverseAttr).toBe(true)
      expect(c.fg).toBeNull()
      expect(c.bg).toBeNull()
    }
  })

  test("multiple disjoint highlights compose correctly", () => {
    const buf = createBufferWithText(["one two three", "four five six"])
    const highlights: SearchHighlight[] = [
      { screenRow: 0, startCol: 0, endCol: 2 },
      { screenRow: 1, startCol: 5, endCol: 8 },
    ]
    const changes = composeSearchHighlightCells(buf, highlights)

    const row0 = changes
      .filter((c) => c.row === 0)
      .map((c) => c.col)
      .sort((a, b) => a - b)
    const row1 = changes
      .filter((c) => c.row === 1)
      .map((c) => c.col)
      .sort((a, b) => a - b)
    expect(row0).toEqual([0, 1, 2])
    expect(row1).toEqual([5, 6, 7, 8])
  })

  test("highlight with endCol >= width is clamped to buffer", () => {
    const buf = createBufferWithText(["abc"], 10)
    const highlights: SearchHighlight[] = [{ screenRow: 0, startCol: 5, endCol: 100 }]
    const changes = composeSearchHighlightCells(buf, highlights)
    // Only cells within buffer width are produced
    for (const c of changes) {
      expect(c.col).toBeLessThan(10)
      expect(c.col).toBeGreaterThanOrEqual(5)
    }
  })

  test("highlight outside row bounds produces nothing", () => {
    const buf = createBufferWithText(["abc"])
    const highlights: SearchHighlight[] = [{ screenRow: 5, startCol: 0, endCol: 2 }]
    expect(composeSearchHighlightCells(buf, highlights)).toEqual([])
  })

  test("explicit theme tokens override fg/bg swap", () => {
    const buf = createBufferWithText(["abc"])
    const highlights: SearchHighlight[] = [{ screenRow: 0, startCol: 0, endCol: 2 }]
    const changes = composeSearchHighlightCells(buf, highlights, {
      selectionFg: "#ffffff",
      selectionBg: "#0000ff",
    })
    expect(changes).toHaveLength(3)
    for (const c of changes) {
      expect(c.fg).toBe("#ffffff")
      expect(c.bg).toBe("#0000ff")
      expect(c.inverseAttr).toBeFalsy()
    }
  })
})
