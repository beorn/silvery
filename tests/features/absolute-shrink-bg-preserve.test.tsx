/**
 * Regression: when an absolute-positioned child SHRINKS in place (same x,y,
 * smaller height), its `clearExcessArea` must NOT overwrite cells in the
 * vacated area that have just been re-painted by normal-flow siblings.
 *
 * Bug: km-silvery.ai-chat-incremental-mismatch
 *
 * Repro shape (scaled down from the AI chat demo's ListView):
 *
 *   Frame N  (prev): scrollbar absolute child = (col 4, row 0, w=1, h=5)
 *                    The track covers rows 0..4 entirely with "█" (bg=$muted).
 *
 *   Frame N+1     : scrollbar shrinks to (col 4, row 0, w=1, h=2)
 *                    Normal-flow row at (row 4) gains backgroundColor and
 *                    re-renders, painting (cols 0..4, row 4) with bg=red.
 *
 * Fresh render result at (col 4, row 4) = bg=red (from the normal-flow row;
 * the absolute scrollbar no longer reaches that cell).
 *
 * BEFORE the fix: the absolute scrollbar's `clearExcessArea` ran AFTER
 * normal-flow re-rendered, filling the prev-overlay area (col 4, rows 2..4)
 * with the absolute child's inherited bg (null in this fixture). That
 * stomped the normal-flow row's bg=red at (col 4, row 4) → SILVERY_STRICT
 * mismatch (incremental bg=null vs fresh bg=red).
 *
 * AFTER the fix: clearExcessArea is gated on `hasPrevBuffer === true`. The
 * absolute child's second-pass renderNodeToBuffer call passes
 * hasPrevBuffer=false, so excess clearing is skipped — the parent's
 * `absoluteChildMutated` cascade has already cleared the parent's region and
 * re-rendered all normal-flow children, so there are no stale pixels to
 * clear. Excess clearing here would (and did) corrupt fresh sibling pixels.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("absolute-positioned child shrink does not stomp sibling bg", () => {
  test("scrollbar shrink preserves normal-flow row bg at vacated cell", () => {
    // 5×5 fixture mirroring the AI-chat layout signature:
    //   - outer Box (parent of normal-flow + absolute scrollbar)
    //   - 5 normal-flow rows
    //   - last row has explicit backgroundColor (= the user-input row that
    //     just got submitted in the AI-chat repro)
    //   - absolute "scrollbar" child at col 4, height varies
    function Harness({
      thumbHeight,
      lastRowHasBg,
    }: {
      thumbHeight: number
      lastRowHasBg: boolean
    }) {
      return (
        <Box position="relative" width={5} height={5} flexDirection="column">
          <Text>row0.</Text>
          <Text>row1.</Text>
          <Text>row2.</Text>
          <Text>row3.</Text>
          {lastRowHasBg ? (
            <Box width={5} backgroundColor="red">
              <Text>row4!</Text>
            </Box>
          ) : (
            <Text>row4.</Text>
          )}
          {/* Absolute "scrollbar" — covers col 4 from top, height variable */}
          <Box
            position="absolute"
            top={0}
            right={0}
            width={1}
            height={thumbHeight}
            flexDirection="column"
            backgroundColor="cyan"
          />
        </Box>
      )
    }

    // Frame N: scrollbar covers all 5 rows, last row has no bg
    const render = createRenderer({ cols: 5, rows: 5 })
    const app = render(<Harness thumbHeight={5} lastRowHasBg={false} />)
    // Sanity: scrollbar is at (4, 0..4)
    expect(app.cell(4, 0).bg).toEqual({ r: 0, g: 128, b: 128 })
    expect(app.cell(4, 4).bg).toEqual({ r: 0, g: 128, b: 128 })

    // Frame N+1: scrollbar shrinks to height 2 AND last row gains red bg.
    // SILVERY_STRICT auto-checks incremental == fresh — without the fix,
    // this rerender throws IncrementalRenderMismatchError at (4, 4).
    app.rerender(<Harness thumbHeight={2} lastRowHasBg={true} />)

    // Sanity: cell (4, 4) — col 4 of last row — should have bg=red, NOT
    // the absolute child's inherited bg (null) and NOT cyan (the absolute
    // child no longer covers row 4).
    expect(app.cell(4, 4).bg).toEqual({ r: 128, g: 0, b: 0 })
    // The absolute child still covers (4, 0) and (4, 1) with cyan
    expect(app.cell(4, 0).bg).toEqual({ r: 0, g: 128, b: 128 })
    expect(app.cell(4, 1).bg).toEqual({ r: 0, g: 128, b: 128 })
    // The absolute child no longer covers (4, 2) — should be inherited
    // (the bg of whatever normal-flow content is at row 2, here null)
    expect(app.cell(4, 2).bg).toBeNull()
  })

  test("absolute child shrink + first-pass sibling repaint at vacated row", () => {
    // Variant: a normal-flow sibling at the vacated row already had a bg in
    // the previous frame and changes its content (forces re-render). This
    // exercises the case where the parent's absoluteChildMutated cascade
    // re-renders normal-flow siblings, and the absolute child's stale
    // excess-clear would corrupt the fresh sibling paint.
    function Harness({ thumbHeight, label }: { thumbHeight: number; label: string }) {
      return (
        <Box position="relative" width={10} height={3} flexDirection="column">
          <Text>aaaaaaaaaa</Text>
          <Text>bbbbbbbbbb</Text>
          <Box width={10} backgroundColor="green">
            <Text>{label}</Text>
          </Box>
          <Box
            position="absolute"
            top={0}
            right={0}
            width={1}
            height={thumbHeight}
            backgroundColor="magenta"
          />
        </Box>
      )
    }

    const render = createRenderer({ cols: 10, rows: 3 })
    const app = render(<Harness thumbHeight={3} label="hello" />)
    // Initial: scrollbar covers col 9 of all 3 rows
    expect(app.cell(9, 0).bg).toEqual({ r: 128, g: 0, b: 128 })
    expect(app.cell(9, 2).bg).toEqual({ r: 128, g: 0, b: 128 })

    // Shrink scrollbar to height 1, change green-bg row's label
    app.rerender(<Harness thumbHeight={1} label="world" />)

    // (9, 0) still magenta (covered by scrollbar)
    expect(app.cell(9, 0).bg).toEqual({ r: 128, g: 0, b: 128 })
    // (9, 2) — vacated by scrollbar — should be GREEN (the row's bg),
    // NOT magenta (stale) and NOT null (excess-clear corruption).
    expect(app.cell(9, 2).bg).toEqual({ r: 0, g: 128, b: 0 })
  })
})
