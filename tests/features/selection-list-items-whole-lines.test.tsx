/**
 * @failure A drag from one list item to another highlights and copies a column
 *   block: every row between the endpoints is clipped to the anchor text's
 *   columns instead of being selected whole.
 * @level l4
 * @consumer @si/app/22571-maddoc-doc-viewer-umbrella/25962-selection-between-list-items-clips-to-a-column-block
 * @testonly none
 *
 * A drag from one list item to another highlights and copies every line
 * between them whole — the same as a drag between paragraphs.
 *
 * Bead: @si/app/22571-maddoc-doc-viewer-umbrella/25962 (maddoc, pm-status.md
 * "Goals & Metrics" list). The operator saw a COLUMN BLOCK: every row between
 * the endpoints clipped to the columns of the anchor, and the clipboard held
 * the block ("Measured 14:1", "KPI Wa - 70%") instead of the lines.
 *
 * Mechanism (diagnosed, not yet fixed): the drag's head and its scope are
 * resolved by two different functions.
 *   - The head goes through `resolveSelectionAnchorFromPoint`, which snaps a
 *     pointer over text-free space to the nearest selectable cell.
 *   - The scope goes through `selectionScopeForFocus` (create-app.tsx), which
 *     calls a bare `selectionHitTest` and, when that finds nothing, falls back
 *     to `anchorBoundaries[0].scope` — the anchor TEXT node's own rect.
 * `refreshContentSelectionProjection` then replaces the range with the
 * unclamped semantic projection but keeps that narrow scope, and both
 * `composeSelectionCells` (highlight) and `extractText` (copy) clip EVERY row
 * to `[scope.left, scope.right]`. A wrapped paragraph's rect spans the lane,
 * so the clip is invisible there; a list item's or heading's rect is only as
 * wide as its own text, so the clip shows as a column block.
 *
 * This row releases the drag on the fifth item's row, past the end of its
 * text, at a real pointer position (mid-cell, SGR-Pixels units — what a
 * pixel-reporting terminal sends). `pointHitsRenderedTextRow` indexes
 * `lines[y - rect.y]` with that fractional row, so the hit test finds nothing
 * there and the fallback fires. In cell units the same fallback fires on any
 * text-free row, e.g. the blank row under the list.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run, type RunOptions } from "../../packages/ag-term/src/runtime/run"
import { DocumentView, type DocumentBlock } from "../../src/index.js"

const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))

const COLS = 100
const ROWS = 30

// The operator's list, verbatim in shape: item 2 (the anchor) is SHORTER than
// items 3 and 4, so a clip at the anchor's right edge truncates them.
const ITEMS = [
  "Measured 14:19 PDT to 14:47 PDT; changes over 12 h.",
  "KPI Wa - 70% 135/192 WIP done (+11% · target 100%)",
  "KPI Wb - 48d oldest WIP (State model, unparked today · target 3d)",
  "KPI Fa - 59% 67/113 field model done (+8% · target 100%)",
  "Queues 42% 13/31 · G14 0% 0/2 (no KPI blocks yet)",
  "KPI G1a - 53% 69/129 done (+10% · target 100%)",
] as const

const BLOCKS: DocumentBlock[] = [
  {
    id: "intro",
    kind: "paragraph",
    content:
      "Intro paragraph with enough words to run well beyond the endpoint columns of the drag.",
  },
  { id: "goals", kind: "heading", level: 2, content: "Goals & Metrics" },
  ...ITEMS.map(
    (content, index): DocumentBlock => ({
      id: `goal-${index + 1}`,
      kind: "list-item",
      list: { groupId: "goals", depth: 0, ordered: false },
      content,
    }),
  ),
  { id: "changed", kind: "heading", level: 2, content: "Changed since the last page" },
  {
    id: "closing",
    kind: "paragraph",
    content:
      "Closing paragraph with enough words to run well beyond the endpoint columns of the drag.",
  },
]

type Term = ReturnType<typeof createTermless>

function backgrounds(term: Term): string[][] {
  const grid: string[][] = []
  for (let row = 0; row < ROWS; row++) {
    const line: string[] = []
    for (let col = 0; col < COLS; col++) line.push(JSON.stringify(term.cell(row, col).bg))
    grid.push(line)
  }
  return grid
}

/** Columns on `row` whose background the selection changed. */
function highlightedColumns(term: Term, before: string[][], row: number): number[] {
  const columns: number[] = []
  for (let col = 0; col < COLS; col++) {
    const cell = term.cell(row, col) as { bg: unknown; inverse?: boolean }
    if (cell.inverse || JSON.stringify(cell.bg) !== before[row]![col]) columns.push(col)
  }
  return columns
}

describe("selection across list items", () => {
  test("a drag from the second list item to the fifth highlights and copies every line between them whole", async () => {
    using term = createTermless({ cols: COLS, rows: ROWS })
    const handle = await run(<DocumentView blocks={BLOCKS} />, term, {
      mouse: true,
      selection: true,
      copyOnSelect: true,
    } as Partial<RunOptions>)
    await settle()

    // Precondition: the runtime negotiated SGR-Pixels, so a fractional cell
    // below reaches the hit test as a real mid-cell pointer position.
    expect(term.out.containsOutput("\x1b[?1016h"), "runtime enabled SGR-Pixels (1016)").toBe(true)

    const lines = term.screen.getLines()
    const at = (text: string) => {
      const row = lines.findIndex((line: string) => line.includes(text))
      expect(row, `row showing "${text}"`).toBeGreaterThanOrEqual(0)
      return { row, col: lines[row]!.indexOf(text) }
    }
    const second = at(ITEMS[1])
    const third = at(ITEMS[2])
    const fourth = at(ITEMS[3])
    const fifth = at(ITEMS[4])
    const bulletCol = lines[third.row]!.indexOf("•")
    expect(bulletCol, "the third item renders its bullet").toBeGreaterThanOrEqual(0)

    const before = backgrounds(term)
    term.clipboard.clear()

    // Press inside the second item's text; release on the fifth item's row,
    // ten cells past the end of its text. Both mid-cell, like a real pointer.
    await term.mouse.drag({
      from: [second.col + 6.5, second.row + 0.5],
      to: [fifth.col + ITEMS[4].length + 10.5, fifth.row + 0.5],
    })
    await settle()

    const copied = term.clipboard.last ?? ""
    expect(copied, "the drag copied a selection").not.toBe("")
    // Every line strictly between the endpoints is copied whole, and the
    // release point lies past the fifth item's text, so it is whole too.
    expect(copied, "third item copied whole").toContain(ITEMS[2])
    expect(copied, "fourth item copied whole").toContain(ITEMS[3])
    expect(copied, "fifth item copied whole").toContain(ITEMS[4])

    // The highlight matches the copy: each interior row is lit from its bullet
    // to the last glyph of its text, not clipped to the anchor's columns.
    for (const [name, item, text] of [
      ["third", third, ITEMS[2]],
      ["fourth", fourth, ITEMS[3]],
    ] as const) {
      const lit = highlightedColumns(term, before, item.row)
      expect(lit, `${name} item's bullet is highlighted`).toContain(bulletCol)
      expect(lit, `${name} item's last glyph is highlighted`).toContain(item.col + text.length - 1)
    }

    handle.unmount()
  })
})
