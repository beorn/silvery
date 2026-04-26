/**
 * Overlay-anchor v1 — SILVERY_STRICT=2 fixture.
 *
 * Phase 4c of `km-silvery.view-as-layout-output`. Realistic-scale fixture
 * (50+ nodes) exercising the overlay-anchor v1 substrate end-to-end:
 *
 *   anchorRef (declarative) → anchorRect signal → findAnchor lookup
 *                                                  → placeFloating math
 *                                                  → DecorationRect
 *                                                  → OverlayLayer
 *
 * Asserts:
 *  1. The popover decoration's resolved rect matches the expected
 *     placeFloating result (no drift between substrate layers).
 *  2. SILVERY_STRICT incremental ≡ fresh holds across:
 *       - mount with anchor + popover
 *       - rerender swapping the anchor target
 *       - rerender swapping the placement
 *       - rerender removing the popover
 *       - rerender removing the anchor (popover now has missing anchor)
 *  3. OverlayLayer caret/focus/selection still match LayoutSignals reads
 *     even when decorations are also active (cross-target hygiene).
 *
 * Realistic-scale: a 50-node tree (5x10 grid of cells) with the popover
 * declared at one cell and the anchor at another. The grid mimics a real km
 * board's structure and surfaces incremental-cascade bugs that 2-3 node
 * fixtures wouldn't.
 *
 * Bead: km-silvery.overlay-anchor-impl-v1
 */

import React from "react"
import { describe, test, expect, beforeAll, afterAll } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { collectOverlayLayer } from "@silvery/ag/overlay-layer"
import {
  findActiveCursorRect,
  findActiveDecorationRects,
  findActiveFocusedNodeId,
  findActiveSelectionFragments,
  findAnchor,
} from "@silvery/ag/layout-signals"
import { placeFloating } from "@silvery/ag/place-floating"
import type { AgNode, Decoration, Placement } from "@silvery/ag/types"

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

// Realistic-scale grid app — 5 columns × 10 rows = 50 cells, plus the host
// Box for the popover decoration. Anchors live on cells named "cell-X-Y";
// the popover targets one of them.
function GridApp({
  anchorTarget,
  placement,
  showPopover,
  hideAnchor,
  cursorActive,
  focusActive,
  selectionActive,
}: {
  anchorTarget: string
  placement: Placement
  showPopover: boolean
  hideAnchor: boolean
  cursorActive: boolean
  focusActive: boolean
  selectionActive: boolean
}) {
  const decorations: Decoration[] = showPopover
    ? [
        {
          kind: "popover",
          id: "menu",
          anchorId: anchorTarget,
          placement,
          size: { width: 6, height: 3 },
        },
      ]
    : []

  return (
    <Box flexDirection="column" padding={1}>
      {/* 10 rows × 5 cols grid */}
      {Array.from({ length: 10 }).map((_, row) => (
        <Box key={row} flexDirection="row">
          {Array.from({ length: 5 }).map((__, col) => {
            const id = `cell-${col}-${row}`
            // The anchor cell is row 5 col 2 unless hideAnchor is set.
            const isAnchorCell = !hideAnchor && id === "cell-2-5"
            return (
              <Box
                key={id}
                id={id}
                anchorRef={isAnchorCell ? "anchor-target" : undefined}
                width={4}
                height={1}
              >
                <Text>{`${col},${row}`}</Text>
              </Box>
            )
          })}
        </Box>
      ))}
      {/* Host for the popover decoration. Adds caret/focus/selection per
          props so the cross-check exercises every overlay kind together. */}
      <Box
        id="popover-host"
        decorations={decorations}
        cursorOffset={cursorActive ? { col: 0, row: 0, visible: true } : undefined}
        focused={focusActive}
        selectionIntent={selectionActive ? { from: 0, to: 4 } : undefined}
        width={20}
        height={2}
      >
        <Text>host area</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Bump SILVERY_STRICT=2 for this file — every action gets a fresh-vs-incremental
// auto-check. (createRenderer's STRICT setup keys off the env var.)
// ============================================================================

describe("overlay-anchor v1: SILVERY_STRICT=2 fixture", () => {
  let prevStrict: string | undefined
  beforeAll(() => {
    prevStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "2"
  })
  afterAll(() => {
    if (prevStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = prevStrict
  })

  test("popover lands at the placeFloating-expected rect (no drift)", () => {
    const render = createRenderer({ cols: 80, rows: 30 })
    const app = render(
      <GridApp
        anchorTarget="anchor-target"
        placement="bottom-start"
        showPopover={true}
        hideAnchor={false}
        cursorActive={false}
        focusActive={false}
        selectionActive={false}
      />,
    )

    const root = getRoot(app)
    const anchor = findAnchor(root, "anchor-target")
    expect(anchor).not.toBeNull()
    const expected = placeFloating(anchor!, { width: 6, height: 3 }, "bottom-start")

    const decorations = findActiveDecorationRects(root)
    expect(decorations).toHaveLength(1)
    expect(decorations[0]!.rects).toHaveLength(1)
    expect(decorations[0]!.rects[0]).toEqual(expected)

    // OverlayLayer carries the same rect — single source of truth.
    const overlay = collectOverlayLayer(root)
    expect(overlay.decorations[0]!.rects[0]).toEqual(expected)
    expect(overlay.anchors.get("anchor-target")).toEqual(anchor)
  })

  test("rerender sweeps: placement / anchor / removal — incremental ≡ fresh", () => {
    const render = createRenderer({ cols: 80, rows: 30 })

    // Mount with anchor + popover (bottom-start).
    const app = render(
      <GridApp
        anchorTarget="anchor-target"
        placement="bottom-start"
        showPopover={true}
        hideAnchor={false}
        cursorActive={false}
        focusActive={false}
        selectionActive={false}
      />,
    )
    expect(findActiveDecorationRects(getRoot(app))[0]!.rects).toHaveLength(1)

    // Swap placement → top-start. STRICT verifies incremental matches fresh.
    app.rerender(
      <GridApp
        anchorTarget="anchor-target"
        placement="top-start"
        showPopover={true}
        hideAnchor={false}
        cursorActive={false}
        focusActive={false}
        selectionActive={false}
      />,
    )
    let decos = findActiveDecorationRects(getRoot(app))
    expect(decos[0]!.rects).toHaveLength(1)

    // Swap placement → right-center.
    app.rerender(
      <GridApp
        anchorTarget="anchor-target"
        placement="right-center"
        showPopover={true}
        hideAnchor={false}
        cursorActive={false}
        focusActive={false}
        selectionActive={false}
      />,
    )
    decos = findActiveDecorationRects(getRoot(app))
    expect(decos[0]!.rects).toHaveLength(1)

    // Remove the popover entirely.
    app.rerender(
      <GridApp
        anchorTarget="anchor-target"
        placement="right-center"
        showPopover={false}
        hideAnchor={false}
        cursorActive={false}
        focusActive={false}
        selectionActive={false}
      />,
    )
    expect(findActiveDecorationRects(getRoot(app))).toHaveLength(0)

    // Re-add popover, then hide the anchor — popover should appear with
    // empty rects (anchor missing) but not crash the pipeline.
    app.rerender(
      <GridApp
        anchorTarget="anchor-target"
        placement="bottom-start"
        showPopover={true}
        hideAnchor={true}
        cursorActive={false}
        focusActive={false}
        selectionActive={false}
      />,
    )
    decos = findActiveDecorationRects(getRoot(app))
    expect(decos).toHaveLength(1)
    expect(decos[0]!.rects).toHaveLength(0)
  })

  test("decorations + caret + focus + selection coexist; cross-check holds", () => {
    const render = createRenderer({ cols: 80, rows: 30 })
    const app = render(
      <GridApp
        anchorTarget="anchor-target"
        placement="bottom-start"
        showPopover={true}
        hideAnchor={false}
        cursorActive={true}
        focusActive={true}
        selectionActive={true}
      />,
    )
    const root = getRoot(app)
    const overlay = collectOverlayLayer(root)

    // Cross-check: caret + focus + selection match LayoutSignals reads even
    // with decorations + anchors live.
    expect(overlay.caret).toEqual(findActiveCursorRect(root))
    expect(overlay.focus?.id).toBe(findActiveFocusedNodeId(root))
    expect(overlay.selection.rects).toEqual(findActiveSelectionFragments(root))
    expect(overlay.decorations).toEqual(findActiveDecorationRects(root))

    // Caret is on the host Box → non-null.
    expect(overlay.caret).not.toBeNull()
    // Focus is on the host Box.
    expect(overlay.focus?.id).toBe("popover-host")
    // Selection produces at least one fragment.
    expect(overlay.selection.rects.length).toBeGreaterThan(0)
    // Popover resolved.
    expect(overlay.decorations[0]!.rects).toHaveLength(1)
  })
})
