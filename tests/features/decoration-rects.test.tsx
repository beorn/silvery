/**
 * BoxProps.decorations — overlay-anchor v1 contract tests.
 *
 * Phase 4c of `km-silvery.view-as-layout-output`. Pins the contract for the
 * decoration-as-layout-output path:
 *
 *  1. **Decoration entries produce a DecorationRect at expected coords** —
 *     popover/tooltip with a known anchor + placement + size emit one
 *     placed rect; highlight emits one rect translated from content-relative
 *     to absolute coords.
 *  2. **Anchor lookup failure → empty rect list** — popover with a missing
 *     anchorId still appears in the list (kind+id preserved) but with empty
 *     `rects`, so the renderer can skip it cleanly.
 *  3. **Anchor declared deeper than the popover** — the two-pass sync runs
 *     decorations after every anchorRect is populated, so a popover declared
 *     SHALLOW can still resolve to an anchor declared DEEPER.
 *  4. **Reactive — recompute on prop change** — toggling decorations or
 *     swapping placements updates the resolved rects in the same frame.
 *  5. **Cleanup on unmount + prop removal** — when decorations is removed,
 *     `decorationRects` clears to the empty sentinel.
 *  6. **findActiveDecorationRects** concatenates across multiple decorating
 *     Boxes in tree order.
 *
 * Tests run with `SILVERY_STRICT=1` (default) — every rerender is auto-
 * verified incremental ≡ fresh.
 *
 * Bead: km-silvery.overlay-anchor-impl-v1
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import {
  findActiveDecorationRects,
  getLayoutSignals,
} from "@silvery/ag/layout-signals"
import type { AgNode, BoxProps, Decoration } from "@silvery/ag/types"

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

function findFirstWithDecorations(node: AgNode): AgNode | null {
  const props = node.props as BoxProps | undefined
  if (props?.decorations && props.decorations.length > 0) return node
  for (const child of node.children) {
    const hit = findFirstWithDecorations(child)
    if (hit) return hit
  }
  return null
}

// ============================================================================
// Invariant 1: decorations produce DecorationRect at expected coords
// ============================================================================

describe("invariant 1: decoration entries produce expected rects", () => {
  test("popover with anchor + placement + size emits one placed rect", () => {
    const render = createRenderer({ cols: 60, rows: 20 })

    function App() {
      const decorations: Decoration[] = [
        {
          kind: "popover",
          id: "p1",
          anchorId: "trigger",
          placement: "bottom-start",
          size: { width: 8, height: 3 },
        },
      ]
      return (
        <Box flexDirection="column" padding={1}>
          {/* Anchor at content-rect (1,1), 10x2 */}
          <Box anchorRef="trigger" width={10} height={2}>
            <Text>trigger</Text>
          </Box>
          <Box decorations={decorations}>
            <Text>host</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const all = findActiveDecorationRects(getRoot(app))
    expect(all).toHaveLength(1)
    const entry = all[0]!
    expect(entry.kind).toBe("popover")
    expect(entry.id).toBe("p1")
    expect(entry.rects).toHaveLength(1)
    // Anchor at (1, 1) with size 10x2; placement=bottom-start →
    //   x = anchor.x = 1
    //   y = anchor.y + anchor.height = 1 + 2 = 3
    //   width = target.width = 8
    //   height = target.height = 3
    expect(entry.rects[0]).toEqual({ x: 1, y: 3, width: 8, height: 3 })
  })

  test("highlight rect is translated from content-relative to absolute", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App() {
      const decorations: Decoration[] = [
        {
          kind: "highlight",
          id: "h1",
          rect: { x: 2, y: 1, width: 3, height: 1 },
        },
      ]
      return (
        <Box padding={2}>
          <Box decorations={decorations} width={20} height={5}>
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const all = findActiveDecorationRects(getRoot(app))
    expect(all).toHaveLength(1)
    const entry = all[0]!
    expect(entry.kind).toBe("highlight")
    // Outer padding(2). Decoration host has no border/padding, so its
    // contentRect origin = (2, 2). Highlight rect (x=2, y=1) translates to
    // absolute (2+2, 2+1) = (4, 3). Width/height pass through.
    expect(entry.rects[0]).toEqual({ x: 4, y: 3, width: 3, height: 1 })
  })

  test("tooltip with placement=top-end emits placed rect", () => {
    const render = createRenderer({ cols: 60, rows: 20 })
    const decorations: Decoration[] = [
      {
        kind: "tooltip",
        id: "t1",
        anchorId: "btn",
        placement: "top-end",
        size: { width: 6, height: 2 },
      },
    ]
    const app = render(
      <Box padding={1}>
        <Box anchorRef="btn" width={10} height={3}>
          <Text>btn</Text>
        </Box>
        <Box decorations={decorations}>
          <Text>host</Text>
        </Box>
      </Box>,
    )
    const all = findActiveDecorationRects(getRoot(app))
    expect(all).toHaveLength(1)
    // Anchor (1, 1, 10, 3); top-end →
    //   x = anchor.x + anchor.width - target.width = 1 + 10 - 6 = 5
    //   y = anchor.y - target.height = 1 - 2 = -1
    expect(all[0]!.rects[0]).toEqual({ x: 5, y: -1, width: 6, height: 2 })
  })
})

// ============================================================================
// Invariant 2: missing anchor → empty rect list (entry preserved)
// ============================================================================

describe("invariant 2: missing-anchor handling", () => {
  test("popover with unresolved anchorId emits an entry with empty rects", () => {
    const render = createRenderer({ cols: 40, rows: 8 })
    const decorations: Decoration[] = [
      {
        kind: "popover",
        id: "ghost",
        anchorId: "nope",
        placement: "bottom-start",
        size: { width: 5, height: 2 },
      },
    ]
    const app = render(
      <Box padding={1}>
        <Box decorations={decorations}>
          <Text>host</Text>
        </Box>
      </Box>,
    )
    const all = findActiveDecorationRects(getRoot(app))
    expect(all).toHaveLength(1)
    expect(all[0]!.kind).toBe("popover")
    expect(all[0]!.id).toBe("ghost")
    expect(all[0]!.rects).toHaveLength(0)
  })

  test("popover missing required fields (no placement) emits empty rects", () => {
    const render = createRenderer({ cols: 40, rows: 8 })
    const decorations: Decoration[] = [
      {
        kind: "popover",
        id: "incomplete",
        anchorId: "anchor",
        // No placement, no size.
      },
    ]
    const app = render(
      <Box padding={1}>
        <Box anchorRef="anchor" width={5} height={2}>
          <Text>x</Text>
        </Box>
        <Box decorations={decorations}>
          <Text>host</Text>
        </Box>
      </Box>,
    )
    const all = findActiveDecorationRects(getRoot(app))
    expect(all[0]!.rects).toHaveLength(0)
  })
})

// ============================================================================
// Invariant 3: anchor declared deeper than the decorating Box
// ============================================================================

describe("invariant 3: cross-tree anchor resolution", () => {
  test("popover declared shallower can resolve to a deeper anchor", () => {
    const render = createRenderer({ cols: 60, rows: 20 })

    const decorations: Decoration[] = [
      {
        kind: "popover",
        id: "cross",
        anchorId: "deep",
        placement: "bottom-start",
        size: { width: 5, height: 2 },
      },
    ]

    const app = render(
      <Box flexDirection="column" padding={1}>
        {/* Decorating Box ABOVE the anchor declarer (paint order) */}
        <Box decorations={decorations}>
          <Text>host</Text>
        </Box>
        {/* Anchor declared deeper / later in the tree */}
        <Box flexDirection="column">
          <Box anchorRef="deep" width={10} height={3}>
            <Text>anchor</Text>
          </Box>
        </Box>
      </Box>,
    )
    const all = findActiveDecorationRects(getRoot(app))
    expect(all).toHaveLength(1)
    expect(all[0]!.rects).toHaveLength(1)
    // Anchor's contentRect must have been registered before decoration
    // resolution runs — that's the two-pass sync invariant.
    expect(all[0]!.rects[0]!.width).toBe(5)
    expect(all[0]!.rects[0]!.height).toBe(2)
  })
})

// ============================================================================
// Invariant 4: prop-change recompute
// ============================================================================

describe("invariant 4: decoration recompute on prop change", () => {
  test("swapping placements re-runs placement math in the same frame", () => {
    const render = createRenderer({ cols: 60, rows: 20 })

    function App({ placement }: { placement: "bottom-start" | "top-start" }) {
      const decorations: Decoration[] = [
        {
          kind: "popover",
          id: "p",
          anchorId: "a",
          placement,
          size: { width: 5, height: 2 },
        },
      ]
      return (
        <Box padding={1}>
          <Box anchorRef="a" width={10} height={3}>
            <Text>a</Text>
          </Box>
          <Box decorations={decorations}>
            <Text>host</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App placement="bottom-start" />)
    const r1 = findActiveDecorationRects(getRoot(app))[0]!.rects[0]!
    expect(r1.y).toBe(4) // anchor.y + anchor.height = 1 + 3

    app.rerender(<App placement="top-start" />)
    const r2 = findActiveDecorationRects(getRoot(app))[0]!.rects[0]!
    expect(r2.y).toBe(-1) // anchor.y - target.height = 1 - 2
  })

  test("removing decorations clears the signal to the empty sentinel", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ on }: { on: boolean }) {
      const decorations: Decoration[] = on
        ? [{ kind: "highlight", id: "h", rect: { x: 0, y: 0, width: 1, height: 1 } }]
        : []
      return (
        <Box padding={1}>
          <Box decorations={decorations} width={5} height={3}>
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App on={true} />)
    const node = findFirstWithDecorations(getRoot(app))
    if (!node) throw new Error("test fixture: no decorations node")
    const sig = getLayoutSignals(node)
    expect(sig.decorationRects().length).toBe(1)

    app.rerender(<App on={false} />)
    expect(sig.decorationRects().length).toBe(0)
  })
})

// ============================================================================
// Invariant 5: cleanup on unmount
// ============================================================================

describe("invariant 5: stale-cleanup on unmount", () => {
  test("conditional mount/unmount cycle leaves no ghost decoration", () => {
    const render = createRenderer({ cols: 50, rows: 12 })

    function App({ on }: { on: boolean }) {
      const decorations: Decoration[] = [
        {
          kind: "popover",
          id: "g",
          anchorId: "a",
          placement: "bottom-start",
          size: { width: 5, height: 2 },
        },
      ]
      return (
        <Box flexDirection="column" padding={1}>
          <Box anchorRef="a" width={10} height={2}>
            <Text>a</Text>
          </Box>
          {on ? (
            <Box decorations={decorations}>
              <Text>host</Text>
            </Box>
          ) : null}
        </Box>
      )
    }

    const app = render(<App on={false} />)
    expect(findActiveDecorationRects(getRoot(app))).toHaveLength(0)

    app.rerender(<App on={true} />)
    expect(findActiveDecorationRects(getRoot(app))).toHaveLength(1)

    app.rerender(<App on={false} />)
    expect(findActiveDecorationRects(getRoot(app))).toHaveLength(0)
  })
})

// ============================================================================
// Invariant 6: multi-Box decoration concatenation
// ============================================================================

describe("invariant 6: findActiveDecorationRects concatenates across nodes", () => {
  test("two Boxes both declaring decorations produce a concatenated list", () => {
    const render = createRenderer({ cols: 60, rows: 16 })

    const a: Decoration[] = [
      {
        kind: "highlight",
        id: "ha",
        rect: { x: 0, y: 0, width: 1, height: 1 },
      },
    ]
    const b: Decoration[] = [
      {
        kind: "highlight",
        id: "hb",
        rect: { x: 0, y: 0, width: 2, height: 1 },
      },
    ]

    const app = render(
      <Box flexDirection="column" padding={1}>
        <Box decorations={a} width={5} height={2}>
          <Text>a</Text>
        </Box>
        <Box decorations={b} width={5} height={2}>
          <Text>b</Text>
        </Box>
      </Box>,
    )
    const all = findActiveDecorationRects(getRoot(app))
    expect(all).toHaveLength(2)
    const ids = all.map((d) => d.id)
    expect(ids).toContain("ha")
    expect(ids).toContain("hb")
  })
})
