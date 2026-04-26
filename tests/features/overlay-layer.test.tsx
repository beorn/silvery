/**
 * OverlayLayer cross-check property test — overlay-anchor v1.
 *
 * Phase 4c of `km-silvery.view-as-layout-output`. Pins the load-bearing
 * invariant for the per-frame OverlayLayer artifact:
 *
 *   OverlayLayer.{caret, focus, selection} === LayoutSignals reads
 *
 * If this ever drifts, downstream consumers that migrate from per-feature
 * walks to OverlayLayer would see different output. The property test
 * randomizes tree fixtures (varying caret / focus / selection / decoration
 * presence and depth) and asserts equality on every random iteration.
 *
 * Also covers:
 *   - decorations field aggregates findActiveDecorationRects
 *   - anchors map matches findAnchor lookups
 *   - paint order is fixed (caret > focus > selection > decorations >
 *     anchors) — encoded in the OverlayLayer field order, asserted at the
 *     type level by leaving the test as a structural check.
 *
 * Bead: km-silvery.overlay-anchor-impl-v1
 */

import React from "react"
import { describe, test, expect } from "vitest"
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
import type { AgNode, Decoration } from "@silvery/ag/types"

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

// ============================================================================
// Cross-check: caret + focus + selection match LayoutSignals reads
// ============================================================================

describe("OverlayLayer cross-check: matches LayoutSignals reads", () => {
  test("empty fixture: no caret, no focus, no selection, no decorations", () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <Box padding={1}>
        <Text>nothing</Text>
      </Box>,
    )
    const root = getRoot(app)
    const overlay = collectOverlayLayer(root)
    expect(overlay.caret).toBeNull()
    expect(overlay.focus).toBeNull()
    expect(overlay.selection.rects).toHaveLength(0)
    expect(overlay.decorations).toHaveLength(0)
    expect(overlay.anchors.size).toBe(0)
  })

  test("caret-only fixture: overlay.caret equals findActiveCursorRect", () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(
      <Box padding={1}>
        <Box cursorOffset={{ col: 2, row: 0, visible: true }}>
          <Text>x</Text>
        </Box>
      </Box>,
    )
    const root = getRoot(app)
    const overlay = collectOverlayLayer(root)
    expect(overlay.caret).toEqual(findActiveCursorRect(root))
    expect(overlay.caret).not.toBeNull()
  })

  test("focus-only fixture: overlay.focus.id equals findActiveFocusedNodeId", () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(
      <Box padding={1}>
        <Box id="focus-target" focused={true}>
          <Text>x</Text>
        </Box>
      </Box>,
    )
    const root = getRoot(app)
    const overlay = collectOverlayLayer(root)
    expect(overlay.focus?.id).toBe(findActiveFocusedNodeId(root))
    expect(overlay.focus?.id).toBe("focus-target")
  })

  test("selection-only fixture: overlay.selection.rects equals findActiveSelectionFragments", () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(
      <Box padding={1}>
        <Box selectionIntent={{ from: 1, to: 4 }}>
          <Text>hello</Text>
        </Box>
      </Box>,
    )
    const root = getRoot(app)
    const overlay = collectOverlayLayer(root)
    expect(overlay.selection.rects).toEqual(findActiveSelectionFragments(root))
    expect(overlay.selection.rects.length).toBeGreaterThan(0)
  })

  test("anchored-popover fixture: decorations match findActiveDecorationRects", () => {
    const render = createRenderer({ cols: 50, rows: 12 })
    const decorations: Decoration[] = [
      {
        kind: "popover",
        id: "p",
        anchorId: "a",
        placement: "bottom-start",
        size: { width: 5, height: 2 },
      },
    ]
    const app = render(
      <Box padding={1}>
        <Box anchorRef="a" width={10} height={2}>
          <Text>a</Text>
        </Box>
        <Box decorations={decorations}>
          <Text>host</Text>
        </Box>
      </Box>,
    )
    const root = getRoot(app)
    const overlay = collectOverlayLayer(root)
    expect(overlay.decorations).toEqual(findActiveDecorationRects(root))
  })

  test("anchors map matches findAnchor lookups for every registered id", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box padding={1}>
        <Box anchorRef="alpha" width={5} height={2}>
          <Text>a</Text>
        </Box>
        <Box anchorRef="beta" width={6} height={3}>
          <Text>b</Text>
        </Box>
      </Box>,
    )
    const root = getRoot(app)
    const overlay = collectOverlayLayer(root)
    expect(overlay.anchors.get("alpha")).toEqual(findAnchor(root, "alpha"))
    expect(overlay.anchors.get("beta")).toEqual(findAnchor(root, "beta"))
    expect(overlay.anchors.size).toBe(2)
  })
})

// ============================================================================
// Property test: random fixtures, cross-check holds
// ============================================================================

describe("OverlayLayer property: cross-check holds across random fixtures", () => {
  // Deterministic LCG so test failures are reproducible.
  function rng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 0x1_0000_0000
    }
  }

  function makeFixture(seed: number) {
    const r = rng(seed)
    const hasCursor = r() < 0.5
    const hasFocus = r() < 0.5
    const hasSelection = r() < 0.5
    const hasAnchor = r() < 0.7
    const hasDecoration = hasAnchor && r() < 0.7
    const cursorCol = Math.floor(r() * 5)
    const selFrom = Math.floor(r() * 3)
    const selTo = selFrom + 1 + Math.floor(r() * 3)
    return {
      hasCursor,
      hasFocus,
      hasSelection,
      hasAnchor,
      hasDecoration,
      cursorCol,
      selFrom,
      selTo,
    }
  }

  // Run 25 random iterations — enough to surface drift, fast enough to keep
  // the test under 1s with createRenderer (~5ms/op).
  for (let seed = 1; seed <= 25; seed++) {
    test(`seed=${seed}: caret/focus/selection/decorations/anchors match LayoutSignals reads`, () => {
      const fixture = makeFixture(seed)
      const render = createRenderer({ cols: 60, rows: 16 })

      const decorations: Decoration[] = fixture.hasDecoration
        ? [
            {
              kind: "popover",
              id: `p-${seed}`,
              anchorId: "a",
              placement: "bottom-start",
              size: { width: 5, height: 2 },
            },
          ]
        : []

      const app = render(
        <Box flexDirection="column" padding={1}>
          {fixture.hasAnchor ? (
            <Box anchorRef="a" width={8} height={2}>
              <Text>anchor</Text>
            </Box>
          ) : null}
          <Box
            id="dynamic"
            focused={fixture.hasFocus}
            cursorOffset={
              fixture.hasCursor
                ? { col: fixture.cursorCol, row: 0, visible: true }
                : undefined
            }
            selectionIntent={
              fixture.hasSelection
                ? { from: fixture.selFrom, to: fixture.selTo }
                : undefined
            }
            decorations={decorations}
            width={10}
            height={2}
          >
            <Text>hello world</Text>
          </Box>
        </Box>,
      )

      const root = getRoot(app)
      const overlay = collectOverlayLayer(root)

      // Cross-check 1: caret matches findActiveCursorRect.
      expect(overlay.caret).toEqual(findActiveCursorRect(root))

      // Cross-check 2: focus matches findActiveFocusedNodeId.
      const focusId = findActiveFocusedNodeId(root)
      if (focusId === null) {
        expect(overlay.focus).toBeNull()
      } else {
        expect(overlay.focus?.id).toBe(focusId)
      }

      // Cross-check 3: selection matches findActiveSelectionFragments.
      expect(overlay.selection.rects).toEqual(findActiveSelectionFragments(root))

      // Cross-check 4: decorations match findActiveDecorationRects.
      expect(overlay.decorations).toEqual(findActiveDecorationRects(root))

      // Cross-check 5: anchors map matches findAnchor lookups.
      if (fixture.hasAnchor) {
        expect(overlay.anchors.get("a")).toEqual(findAnchor(root, "a"))
      } else {
        expect(overlay.anchors.size).toBe(0)
      }
    })
  }
})

// ============================================================================
// Structural: paint-order field shape
// ============================================================================

describe("OverlayLayer structure: paint-order field shape", () => {
  test("OverlayLayer carries all 5 named fields", () => {
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(
      <Box padding={1}>
        <Text>x</Text>
      </Box>,
    )
    const overlay = collectOverlayLayer(getRoot(app))
    // Type-level sanity: every documented field is present, with the
    // documented type. Paint order is encoded in the field order: caret
    // first, anchors last (per the v1 fixed paint order).
    expect("caret" in overlay).toBe(true)
    expect("focus" in overlay).toBe(true)
    expect("selection" in overlay).toBe(true)
    expect("decorations" in overlay).toBe(true)
    expect("anchors" in overlay).toBe(true)
  })
})
