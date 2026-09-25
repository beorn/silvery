/**
 * @failure The incremental frame kept a cell the fresh frame had cleared: last frame's outline restores replayed after
 *          the frame's clears (or onto a fresh buffer), so a new row under a moved outline showed old text.
 * @level l2
 * @consumer @km/tui/25798 (km's list view: the row Enter makes shows the old row's text)
 * @testonly none
 *
 * Regression — restoring the cells under last frame's outline must never
 * resurrect stale content.
 *
 * Found by km's list view (@km/tui/25798): the editing row carries a focus
 * outline (`outlineStyle`, drawn by the decoration phase over its neighbours
 * without shifting layout). Enter splits the row and moves the outline onto a
 * new, EMPTY row inserted exactly where the old outline's bottom edge sat.
 *
 * At the start of every incremental render `clearPreviousOutlines` restores
 * the cells the previous frame's outline covered, from snapshots. Two ways
 * that restore brought back text a fresh render does not have:
 *
 * 1. Plan order. With the sectioned render plan (the default commit path) the
 *    restores were emitted as PAINT ops, and the commit order is transfer →
 *    cleanup → paint — so they replayed AFTER the clears meant to erase them.
 *    km showed `·  eta` (the tail of "beta") on the new empty row, where a
 *    fresh render shows `·`. Restores are now transfer ops.
 * 2. Fresh buffer. When the frame size changes the render starts from a blank
 *    buffer instead of the previous frame's clone — but the restore still ran,
 *    writing last frame's under-cells onto a buffer that never had the outline.
 *
 * Every test asserts the visible row text directly, so it fails with or
 * without SILVERY_STRICT; under SILVERY_STRICT=1 the incremental≡fresh check
 * also throws on the same frame.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

interface Row {
  readonly id: string
  readonly text: string
}

const COLS = 60
const ROWS_ON_SCREEN = 30

const ROWS: readonly Row[] = Array.from({ length: 20 }, (_, i) => ({
  id: `row-${i}`,
  text: `item ${String(i).padStart(2, "0")} with some trailing words`,
}))

/**
 * A km-list-view-shaped list: 20 rows × (Box + 2 Text + 2 text leaves) plus
 * the column and header, well past the 50-node realistic-scale threshold.
 * The editing row is wrapped in an outlined Box — the outline overlaps the
 * rows above and below instead of shifting layout. `pinned` fixes the frame
 * at the terminal size (as `<Screen>` does); unpinned, the frame is as tall as
 * the content, so adding a row changes the frame size.
 */
function List({
  rows,
  editingId,
  pinned = true,
}: {
  rows: readonly Row[]
  editingId: string | null
  pinned?: boolean
}) {
  return (
    <Box flexDirection="column" width={COLS} height={pinned ? ROWS_ON_SCREEN : undefined}>
      <Box height={1}>
        <Text>Header</Text>
      </Box>
      {rows.map((row) => {
        const content = (
          <Box key={row.id} id={row.id} flexDirection="row">
            <Text>· </Text>
            <Text bold>{row.text}</Text>
          </Box>
        )
        return row.id === editingId ? (
          <Box key={row.id} outlineStyle="round">
            {content}
          </Box>
        ) : (
          content
        )
      })}
    </Box>
  )
}

/** A new empty row after row-5, where row-6's screen row was. */
const WITH_NEW_ROW = [...ROWS.slice(0, 6), { id: "new", text: "" }, ...ROWS.slice(6)]

describe("restoring cells under last frame's outline", () => {
  test("outline moves onto a new empty row inserted under its old bottom edge", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS_ON_SCREEN })

    // Frame 1: row-5 (screen row 6) is being edited; its outline's bottom
    // edge covers row-6 (screen row 7).
    const app = render(<List rows={ROWS} editingId="row-5" />)
    expect(app.lines[7]).toContain("───")

    // Frame 2: the new empty row lands on screen row 7 and takes the outline.
    // The restored under-cells there are row-6's old text; the list clears the
    // row and the new row paints only its bullet, so the text must be gone.
    app.rerender(<List rows={WITH_NEW_ROW} editingId="new" />)

    expect(app.lines[7]!.trimEnd()).toBe("·")
    expect(app.lines[8]).toContain("───")
    expect(app.lines[9]).toContain("item 07")
  })

  test("outline removed while the row it covered shrinks", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS_ON_SCREEN })

    // Frame 1: row-5's outline bottom edge covers row-6 (screen row 7).
    const app = render(<List rows={ROWS} editingId="row-5" />)
    expect(app.lines[7]).toContain("───")

    // Frame 2: editing ends (outline gone) and row-6's text shrinks. The
    // restore brings back row-6's long text, the shrink clears it, and only
    // the short text is repainted.
    const shrunk = ROWS.map((row) => (row.id === "row-6" ? { ...row, text: "x" } : row))
    app.rerender(<List rows={shrunk} editingId={null} />)

    expect(app.lines[7]!.trimEnd()).toBe("· x")
    expect(app.lines[6]).toContain("item 05")
  })

  test("frame grows while the outline moves: nothing is restored onto the fresh buffer", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS_ON_SCREEN })

    // Unpinned: the frame is 21 rows tall, then 22 once the new row lands, so
    // the second render cannot reuse the previous frame and starts blank.
    const app = render(<List rows={ROWS} editingId="row-5" pinned={false} />)
    expect(app.lines[7]).toContain("───")

    app.rerender(<List rows={WITH_NEW_ROW} editingId="new" pinned={false} />)

    expect(app.lines[7]!.trimEnd()).toBe("·")
    expect(app.lines[8]).toContain("───")
    expect(app.lines[9]).toContain("item 07")
  })
})
