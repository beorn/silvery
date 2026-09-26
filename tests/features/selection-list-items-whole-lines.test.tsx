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
 * Cause: the drag's head and its scope were resolved by two different
 * functions. The head went through `resolveSelectionAnchorFromPoint`, which
 * snaps a pointer over text-free space to nearby text; the scope re-hit-tested
 * the pointer with a bare `selectionHitTest` and, finding nothing, fell back to
 * the anchor TEXT node's own rect. The range crossed rows while
 * `composeSelectionCells` (highlight) and `extractText` (copy) clipped every
 * row to that narrow scope. A wrapped paragraph's rect spans the lane, so the
 * clip was invisible there; a list item's or heading's rect is only as wide as
 * its own text. Fix: create-app resolves the pointer once per drag move and
 * takes both the head and the scope from that one result.
 *
 * Rows:
 *   - release past the fifth item's text, mid-cell in SGR-Pixels units, where
 *     the bare hit test misses (`pointHitsRenderedTextRow` indexes a
 *     fractional row);
 *   - the operator's screenshot-4 gesture in cell units: from the heading to
 *     the blank row above the next heading;
 *   - control: a release on a character still ends the selection there.
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
const SGR_PIXELS_ENABLE = "\x1b[?1016h"

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

async function mountDocument(term: Term, mouse: RunOptions["mouse"]) {
  const handle = await run(<DocumentView blocks={BLOCKS} />, term, {
    mouse,
    selection: true,
    copyOnSelect: true,
  } as Partial<RunOptions>)
  await settle()
  const lines = term.screen.getLines()
  const at = (text: string) => {
    const row = lines.findIndex((line: string) => line.includes(text))
    expect(row, `row showing "${text}"`).toBeGreaterThanOrEqual(0)
    return { row, col: lines[row]!.indexOf(text) }
  }
  const bulletCol = lines[at(ITEMS[2]).row]!.indexOf("•")
  expect(bulletCol, "list items render their bullet").toBeGreaterThanOrEqual(0)
  return { handle, at, bulletCol, before: backgrounds(term) }
}

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

/** An interior row is lit from its bullet to the last glyph of its text. */
function expectRowLitWhole(
  term: Term,
  before: string[][],
  item: { row: number; col: number },
  text: string,
  bulletCol: number,
): void {
  const lit = highlightedColumns(term, before, item.row)
  expect(lit, `"${text}": bullet highlighted`).toContain(bulletCol)
  expect(lit, `"${text}": last glyph highlighted`).toContain(item.col + text.length - 1)
}

describe("selection across list items", () => {
  test("a drag from the second list item to the fifth highlights and copies every line between them whole", async () => {
    using term = createTermless({ cols: COLS, rows: ROWS })
    const { handle, at, bulletCol, before } = await mountDocument(term, true)
    // The runtime negotiated SGR-Pixels, so a fractional cell below reaches the
    // hit test as a real mid-cell pointer position.
    expect(term.out.containsOutput(SGR_PIXELS_ENABLE), "SGR-Pixels (1016) enabled").toBe(true)
    const second = at(ITEMS[1])
    const fifth = at(ITEMS[4])
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
    // The highlight matches the copy: not clipped to the anchor's columns.
    expectRowLitWhole(term, before, at(ITEMS[2]), ITEMS[2], bulletCol)
    expectRowLitWhole(term, before, at(ITEMS[3]), ITEMS[3], bulletCol)

    handle.unmount()
  })

  test("a drag from a heading to the blank row above the next heading selects every line between whole (cell units)", async () => {
    using term = createTermless({ cols: COLS, rows: ROWS })
    const { handle, at, bulletCol, before } = await mountDocument(term, { coordinateMode: "cell" })
    expect(term.out.containsOutput(SGR_PIXELS_ENABLE), "cell units, not SGR-Pixels").toBe(false)
    const goals = at("Goals & Metrics")
    const changed = at("Changed since the last page")
    term.clipboard.clear()

    // The operator's screenshot-4 gesture: press on the heading's first glyph,
    // release on the text-free row above the next heading, 13 cells in.
    await term.mouse.drag({ from: [goals.col, goals.row], to: [changed.col + 13, changed.row - 1] })
    await settle()

    const copied = term.clipboard.last ?? ""
    expect(copied, "the drag copied a selection").not.toBe("")
    for (const item of ITEMS) expect(copied, "list item copied whole").toContain(item)
    expect(copied, "the head lands where released").toMatch(/Changed since $/u)
    for (const item of ITEMS) expectRowLitWhole(term, before, at(item), item, bulletCol)

    handle.unmount()
  })

  test("a release on a character still ends the selection at that character", async () => {
    using term = createTermless({ cols: COLS, rows: ROWS })
    const { handle, at, bulletCol, before } = await mountDocument(term, true)
    const second = at(ITEMS[1])
    const fifth = at(ITEMS[4])
    term.clipboard.clear()

    // Release on the "%" of "Queues 42%" (the tenth glyph), mid-cell.
    await term.mouse.drag({
      from: [second.col + 6.5, second.row + 0.5],
      to: [fifth.col + 9.5, fifth.row + 0.5],
    })
    await settle()

    const copied = term.clipboard.last ?? ""
    expect(copied, "third item copied whole").toContain(ITEMS[2])
    expect(copied, "fourth item copied whole").toContain(ITEMS[3])
    expect(copied, "the copy ends at the released glyph").toMatch(/Queues 42%$/u)
    expectRowLitWhole(term, before, at(ITEMS[2]), ITEMS[2], bulletCol)
    const lastRowLit = highlightedColumns(term, before, fifth.row)
    expect(Math.max(...lastRowLit), "the highlight ends at the released glyph").toBe(fifth.col + 9)

    handle.unmount()
  })
})
