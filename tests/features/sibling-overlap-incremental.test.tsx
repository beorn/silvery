/**
 * Regression: when two flex-column siblings have overlapping rects (e.g.
 * the first sibling overflows into the second sibling's row), the
 * incremental render must repaint the overlapped sibling whenever the
 * first sibling re-renders — otherwise the first sibling's painting at
 * the overlap row destroys the second sibling's pixels in the cloned
 * buffer, and the (clean, skipped) second sibling never restores them.
 *
 * Real-world repro: km-tui Board layout where the column container
 * (overflow="scroll" with bottom scroll indicator on its last row) ends
 * up 1 row taller than its allotted space due to a memory-mode banner
 * consuming row 0. The column's bottom scroll indicator lives on row 23,
 * which is also where the workspace bottom-bar lives. When the cursor
 * moves and only the column re-renders, the scroll indicator overwrites
 * the bottom-bar's "MEM 📋 NNN" text without the bottom-bar being
 * re-rendered to restore it.
 *
 * STRICT_OUTPUT mismatch dump excerpts (see bead description):
 *   MISMATCH at (68, 23) on render #4
 *     incremental: char=" " (col1 scroll indicator padding)
 *     fresh:       char="M" (storage-path "MEM" text from bottom-bar)
 *
 * Fix: in renderNormalChildren, after each first-pass child renders,
 * track its boxRect. For any LATER sibling whose rect intersects the
 * just-painted child's rect, force the later sibling to re-render
 * (childHasPrev=false, ancestorCleared=false) — this matches CSS paint
 * order: sibling N's pixels appear ON TOP of sibling N-1's pixels at
 * any overlap, but the cloned buffer only retains that ordering if both
 * siblings are repainted in order.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

describe("sibling overlap: incremental repaints overlapped later siblings", () => {
  test("scroll indicator on last row of column does not destroy bottom-bar text on cursor move", () => {
    // Layout mirroring km-tui Board layout:
    //   - terminal: 80 cols × 24 rows
    //   - column: overflow=scroll, height=21, starting at y=3 → rows 3..23
    //   - bottom-bar: height=1, starting at y=23 → row 23
    //   ⇒ column row 23 (its scroll indicator row) overlaps bottom-bar row 23
    //
    // Cursor moves trigger a subtree repaint inside the column. The column's
    // scroll indicator paints at row 23. Without the sibling-overlap fix,
    // the bottom-bar's pixels at row 23 stay clean and get skipped, leaving
    // the column's indicator pixels showing through.
    const render = createRenderer({ cols: 80, rows: 24 })

    function App({ cursor }: { cursor: number }) {
      // Build a column with 200 items so it definitely needs scroll
      // indicators (▲/▼). The layout is intentionally engineered so the
      // column's box rect overlaps the bottom-bar's row.
      const items = Array.from({ length: 200 }, (_, i) => i)
      return (
        <Box width={80} height={24} flexDirection="column">
          {/* "Pane" — column container, height=21 starting at row 0 (after no spacer for simplicity) */}
          <Box width={80} height={21} flexShrink={0} flexDirection="column">
            <Box flexShrink={0} flexDirection="column">
              <Text>top-bar</Text>
            </Box>
            <Box height={1} flexShrink={0} />
            <Box
              width={80}
              height={19}
              overflow="scroll"
              scrollTo={cursor}
              flexDirection="column"
            >
              {items.map((i) => (
                <Box key={i} height={1} flexShrink={0}>
                  <Text>{`item ${i}`}</Text>
                </Box>
              ))}
            </Box>
          </Box>
          {/* Spacer that intentionally overlaps with the column's bottom row */}
          <Box width={80} height={1} flexShrink={0} marginTop={-1}>
            <Box flexGrow={1} />
            <Text>STATUS</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App cursor={0} />)
    expect(app.text).toContain("STATUS")

    // Move cursor — triggers an incremental repaint of the scroll container
    // and its scroll indicator. The bottom-bar should remain intact under
    // STRICT (createRenderer enables STRICT_OUTPUT verification by default).
    app.rerender(<App cursor={5} />)

    // STRICT verification runs automatically inside rerender; if the bottom
    // bar text is destroyed by the column's scroll indicator paint, the
    // mismatch fails the test before this assertion. The text assertion is
    // a final defense.
    expect(app.text).toContain("STATUS")
  })

  test("descendant overflow into great-aunt's row forces great-aunt to repaint", () => {
    // The km-tui Board production case: a deeply-nested descendant (column
    // inside a board pane) overflows its ancestor's rect into the row
    // occupied by a great-aunt sibling (the workspace bottom-bar). The
    // sibling-overlap fix must look at the full subtree paint extent of
    // the rendering child, not just its boxRect — otherwise the overlap
    // is missed at the level where the great-aunt lives.
    //
    // Layout (mirroring km-tui Board):
    //   main (height=5)
    //   ├─ pane (height=3)
    //   │  └─ column (height=4, OVERFLOWS into row 4 — outside pane)
    //   │       └─ paint at row 3 (last row, simulates scroll indicator)
    //   └─ bottom-bar (height=1, at y=4)
    //
    // pane's boxRect (height=3) does NOT overlap bottom-bar (at y=4).
    // But column inside pane has height=4, overflowing into y=4.
    // Without subtree-extent tracking, the main-level sibling-overlap
    // check between pane and bottom-bar misses the overlap.
    const render = createRenderer({ cols: 20, rows: 5 })

    function App({ payload }: { payload: string }) {
      return (
        <Box width={20} height={5} flexDirection="column">
          <Box width={20} height={3} flexShrink={0} flexDirection="column">
            {/* Inner column with height=4 overflows the height=3 pane */}
            <Box width={20} height={4} flexShrink={0} flexDirection="column">
              <Text>top0</Text>
              <Text>top1</Text>
              <Text>top2</Text>
              {/* This row falls at parent y=3 (last of column) which is
                  OUTSIDE the pane's rect (rows 0..2) but WITHIN main's
                  rect (rows 0..4) — exactly where bottom-bar lives. */}
              <Text>{payload}</Text>
            </Box>
          </Box>
          <Box width={20} height={1} flexShrink={0}>
            <Text>BOTTOMBAR</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App payload="overflow-init" />)
    expect(app.text).toContain("BOTTOMBAR")

    // Trigger inner column's payload to change → pane subtree re-renders →
    // column's last row paints at the row also occupied by bottom-bar.
    // bottom-bar is a clean sibling at the main level; with the fix it
    // gets force-repainted because the pane's subtree extent (which
    // includes the overflowing column) overlaps bottom-bar's rect.
    app.rerender(<App payload="overflow-NEW" />)
    expect(app.text).toContain("BOTTOMBAR")
  })

  test("simple two-sibling overlap: clean later sibling repaints when earlier sibling re-renders", () => {
    // Minimal repro: two flex children where child A's box overflows
    // its parent and overlaps child B's row. Child A re-renders on prop
    // change; child B is otherwise clean. Fresh render: B paints over A.
    // Incremental: A paints at the overlap row; B must also repaint.
    const render = createRenderer({ cols: 20, rows: 5 })

    function App({ paintedByA }: { paintedByA: string }) {
      return (
        <Box width={20} height={5} flexDirection="column">
          {/* Child A: height=3, but inside it we paint at the THIRD row
              (which physically falls at parent y=2) using marginTop on
              a child to position content on the bottom row. */}
          <Box width={20} height={3} flexShrink={0} flexDirection="column">
            <Text>A row 0</Text>
            <Text>A row 1</Text>
            <Text>{paintedByA}</Text>
          </Box>
          {/* Child B intentionally overlaps A's last row via negative margin —
              simulates the layout overflow that surfaces this in the wild. */}
          <Box width={20} height={1} flexShrink={0} marginTop={-1}>
            <Text>BOTTOM_BAR_TEXT</Text>
          </Box>
          <Box width={20} height={1} flexShrink={0}>
            <Text>row 4</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App paintedByA="A row 2 init" />)
    // Sanity: BOTTOM_BAR_TEXT wins at the overlap row (rendered after A)
    expect(app.text).toContain("BOTTOM_BAR_TEXT")

    // Trigger A's content to change → A re-renders → it paints at the
    // overlap row → bottom-bar must also repaint to keep its text.
    app.rerender(<App paintedByA="A row 2 NEW" />)
    expect(app.text).toContain("BOTTOM_BAR_TEXT")
  })
})
