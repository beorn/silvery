/**
 * useVirtualizer — mixed-item-size edge scroll is axis-agnostic.
 *
 * Bug 17065: with MIXED item sizes (collapsed/expanded board columns, or
 * variable-height cards), moving the cursor to an ALREADY-FULLY-VISIBLE
 * neighbour scrolled the rendered window. Root cause lived in
 * `useVirtualizer`'s edge-based scroll decision (the `scrollToChanged`
 * branch): it tested visibility and computed the reveal offset from the
 * avg-based `estimatedVisibleCount = ceil(viewport / avgSize)`. For a wide
 * cursor item flanked by narrow ones the average is too small, so the
 * avg-based back-count `clampedIndex - estimatedVisibleCount + 1`
 * UNDER-scrolls — it anchors one item earlier than the minimal offset that
 * reveals the target whole. A consumer that bottom/right-anchors the cursor
 * itself (HorizontalVirtualList's `displayScrollOffset` bump) papers over the
 * gap by adding +1, but ONLY on the frame whose cursor overflows. The next
 * move to an already-visible neighbour doesn't overflow → the consumer drops
 * the +1 → the rendered window start snaps back by one. That cursor-dependent
 * re-bump is the visible board-scroll.
 *
 * The fix walks ACTUAL item sizes (`getHeight` → measured cache → per-index
 * estimate). "height" is the main-axis size, so the same code is correct for
 * BOTH HorizontalVirtualList (width) and VirtualList/ListView (height). These
 * hook-level tests pin the axis-agnostic core; the HVL/vertical integration
 * tests below pin both concrete axes.
 *
 * Runs under SILVERY_STRICT=2 via the suite default.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { useVirtualizer } from "../../packages/ag-react/src/hooks/useVirtualizer"
import { useVirtualization } from "../../packages/ag-react/src/hooks/useVirtualization"
import { HorizontalVirtualList } from "../../packages/ag-react/src/ui/components/HorizontalVirtualList"

// Mixed sizes: every item is SMALL (3) except the one at `bigIndex`, which is
// LARGE (43). Models a board where only the cursor column is expanded, or a
// list where only the cursor card is expanded.
const SMALL = 3
const LARGE = 43

function makeEstimate(bigIndex: number): (index: number) => number {
  return (index: number) => (index === bigIndex ? LARGE : SMALL)
}

// ============================================================================
// Axis-agnostic hook-level tests (useVirtualizer directly)
// ============================================================================

interface HookProbe {
  startIndex: number
  endIndex: number
  scrollOffset: number
}

/**
 * Drive `useVirtualizer` through a sequence of `scrollTo` values (cursor
 * moves) and capture the hook result after each. A single component instance
 * is reused across rerenders so `scrollOffsetRef` is preserved exactly as in
 * the live app — that persistence is what makes the edge-based scroll path
 * observable.
 */
function driveVirtualizer(opts: {
  count: number
  viewport: number
  cursors: number[]
  // estimate is recomputed per cursor when the big item tracks the cursor.
  estimateFor: (cursor: number) => (index: number) => number
}): HookProbe[] {
  const probes: HookProbe[] = []
  function Harness({ cursor }: { cursor: number }) {
    const v = useVirtualizer({
      count: opts.count,
      estimateHeight: opts.estimateFor(cursor),
      viewportHeight: opts.viewport,
      scrollTo: cursor,
      overscan: 1,
      maxRendered: 20,
    })
    probes.push({
      startIndex: v.range.startIndex,
      endIndex: v.range.endIndex,
      scrollOffset: v.scrollOffset,
    })
    return <Text>off:{v.scrollOffset}</Text>
  }
  const render = createRenderer({ cols: 80, rows: 8 })
  const app = render(<Harness cursor={opts.cursors[0]!} />)
  for (let i = 1; i < opts.cursors.length; i++) {
    app.rerender(<Harness cursor={opts.cursors[i]!} />)
  }
  return probes
}

describe("useVirtualizer — mixed-size edge scroll (axis-agnostic)", () => {
  test("retreat to an already-visible neighbour does NOT change the scroll offset (fixed mix)", () => {
    // 10 items, fixed mix (only index 8 is large). Viewport 49 so the offset
    // genuinely advances (avg≈7 ⇒ minWindow does not swallow the list). Walking
    // to the last item drives the offset to 7; retreating one must NOT scroll —
    // the neighbour was already fully visible. The avg-based back-count would
    // anchor at 6 instead of 7, then snap on the retreat; the actual-size walk
    // lands on 7 and stays.
    const estimate = makeEstimate(8)
    const cursors = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8]
    const probes = driveVirtualizer({
      count: 10,
      viewport: 49,
      cursors,
      estimateFor: () => estimate,
    })
    const atRight = probes[probes.length - 2]! // cursor 9 (rightmost)
    const afterLeft = probes[probes.length - 1]! // cursor 8 (retreat)
    // Sanity: the offset actually moved off 0 walking right (else the test is
    // degenerate — the whole list fit the render window and nothing scrolled).
    expect(
      atRight.scrollOffset,
      "offset never advanced — test fixture too small to scroll",
    ).toBeGreaterThan(0)
    expect(
      afterLeft.scrollOffset,
      `scroll offset jumped on retreat to a visible neighbour: ${atRight.scrollOffset} -> ${afterLeft.scrollOffset}`,
    ).toBe(atRight.scrollOffset)
    expect(afterLeft.startIndex, "window start moved on a no-op cursor retreat").toBe(
      atRight.startIndex,
    )
  })

  test("retreat does NOT scroll when the WIDE item TRACKS the cursor (km board shape)", () => {
    // The cursor column is the expanded one: widths reflow so the current
    // cursor is LARGE, all others SMALL. From the rightmost, retreating left
    // makes the new cursor LARGE and the old cursor SMALL — but the new cursor
    // was already on-screen, so the offset and window start must stay put.
    const cursors = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8]
    const probes = driveVirtualizer({
      count: 10,
      viewport: 49,
      cursors,
      estimateFor: (cursor) => makeEstimate(cursor),
    })
    const atRight = probes[probes.length - 2]!
    const afterLeft = probes[probes.length - 1]!
    expect(
      atRight.scrollOffset,
      "offset never advanced — test fixture too small to scroll",
    ).toBeGreaterThan(0)
    expect(
      afterLeft.scrollOffset,
      `scroll offset jumped on cursor retreat to a visible neighbour: ${atRight.scrollOffset} -> ${afterLeft.scrollOffset}`,
    ).toBe(atRight.scrollOffset)
    expect(
      afterLeft.startIndex,
      `window start moved on cursor retreat to a visible neighbour (offset ${atRight.scrollOffset}->${afterLeft.scrollOffset}, start ${atRight.startIndex}->${afterLeft.startIndex})`,
    ).toBe(atRight.startIndex)
  })

  test("advance to a GENUINELY off-screen target still scrolls (no edge-reveal regression)", () => {
    // Jump the cursor from the leading run straight to the last item. With the
    // big item at index 8 and viewport 49, only ~2 small items fit; the last
    // item is far off-screen and the offset MUST advance to reveal it.
    const estimate = makeEstimate(8)
    const probes = driveVirtualizer({
      count: 20,
      viewport: 49,
      cursors: [0, 19],
      estimateFor: () => estimate,
    })
    const first = probes[0]!
    const last = probes[probes.length - 1]!
    expect(
      last.scrollOffset,
      "offset must advance to reveal a far off-screen target",
    ).toBeGreaterThan(first.scrollOffset)
    expect(last.endIndex, "off-screen target not in window after jump").toBeGreaterThan(19)
    expect(last.startIndex, "off-screen target not in window after jump").toBeLessThanOrEqual(19)
  })

  test("off-screen reveal offset is computed from ACTUAL sizes (wide target + narrow trailers)", () => {
    // Wide target at index 10, everything else small. Viewport 49 fits the
    // wide item plus a couple small ones. Jumping to index 10 must anchor it so
    // it is FULLY visible: [9..10] = SMALL+LARGE = 46 ≤ 49 and [8..10] = 49
    // fits exactly, but [7..10] = 52 does not — so the minimal revealing offset
    // is 8. The avg-based back-count (10 - ceil(49/avg) + 1) would overshoot
    // and clip the wide item.
    const estimate = makeEstimate(10)
    const probes = driveVirtualizer({
      count: 30,
      viewport: 49,
      cursors: [0, 10],
      estimateFor: () => estimate,
    })
    const last = probes[probes.length - 1]!
    expect(last.scrollOffset, "reveal offset overshot — would clip the wide target").toBe(8)
    expect(last.startIndex).toBeLessThanOrEqual(10)
    expect(last.endIndex).toBeGreaterThan(10)
  })
})

// ============================================================================
// Vertical axis (useVirtualization with a numeric viewport = height)
// ============================================================================
//
// VirtualList/ListView's offset anchor flows through the same `useVirtualizer`
// `scrollToChanged` branch (bootstrap mode, no containerNode). Drive it via
// `useVirtualization` with an items array and per-item HEIGHT so the test is
// expressed in the vertical idiom — same engine, height as the main axis.

interface RowItem {
  id: string
}

function driveVertical(opts: {
  count: number
  viewport: number
  cursors: number[]
  heightFor: (cursor: number, index: number) => number
}): HookProbe[] {
  const probes: HookProbe[] = []
  const items: RowItem[] = Array.from({ length: opts.count }, (_, i) => ({ id: `r${i}` }))
  function Harness({ cursor }: { cursor: number }) {
    const v = useVirtualization<RowItem>({
      items,
      viewportSize: opts.viewport,
      itemSize: (_item, index) => opts.heightFor(cursor, index),
      scrollTo: cursor,
      overscan: 1,
      maxRendered: 20,
    })
    probes.push({ startIndex: v.startIndex, endIndex: v.endIndex, scrollOffset: v.scrollOffset })
    return <Text>off:{v.scrollOffset}</Text>
  }
  const render = createRenderer({ cols: 40, rows: 8 })
  const app = render(<Harness cursor={opts.cursors[0]!} />)
  for (let i = 1; i < opts.cursors.length; i++) {
    app.rerender(<Harness cursor={opts.cursors[i]!} />)
  }
  return probes
}

describe("VirtualList (vertical) — mixed-height retreat does not scroll (17065)", () => {
  test("cursor at last row, move up one row that was already visible → window start fixed", () => {
    // Mixed heights: cursor row is tall (LARGE), others short (SMALL). Viewport
    // 49 rows. Walk down to the last row, then move up one — already visible,
    // must NOT scroll the window start. This is the vertical mirror of the
    // horizontal board bug; both axes share the `scrollToChanged` reveal math.
    const cursors = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8]
    const probes = driveVertical({
      count: 10,
      viewport: 49,
      cursors,
      heightFor: (cursor, index) => (index === cursor ? LARGE : SMALL),
    })
    const atBottom = probes[probes.length - 2]! // cursor 9
    const afterUp = probes[probes.length - 1]! // cursor 8
    expect(
      afterUp.scrollOffset,
      `vertical scroll offset jumped on up-move to a visible row: ${atBottom.scrollOffset} -> ${afterUp.scrollOffset}`,
    ).toBe(atBottom.scrollOffset)
    expect(afterUp.startIndex, "vertical window start moved on a no-op up-move").toBe(
      atBottom.startIndex,
    )
  })

  test("vertical advance to a far off-screen row still scrolls", () => {
    const probes = driveVertical({
      count: 20,
      viewport: 49,
      cursors: [0, 19],
      heightFor: (cursor, index) => (index === cursor ? LARGE : SMALL),
    })
    const first = probes[0]!
    const last = probes[probes.length - 1]!
    expect(last.scrollOffset, "vertical offset must advance to reveal a far row").toBeGreaterThan(
      first.scrollOffset,
    )
    expect(last.startIndex).toBeLessThanOrEqual(19)
    expect(last.endIndex).toBeGreaterThan(19)
  })
})

// ============================================================================
// Horizontal axis (HorizontalVirtualList) — the live km board shape
// ============================================================================

describe("HorizontalVirtualList — mixed-width retreat does not scroll (17065)", () => {
  const N = 10
  const COLLAPSED = new Set([1, 3, 5, 7])
  const EXPANDED_W = 43
  const COLLAPSED_W = 3
  const VIEWPORT = 100

  const widthFor = (i: number) => (COLLAPSED.has(i) ? COLLAPSED_W : EXPANDED_W)

  const App = ({ cursor }: { cursor: number }) => (
    <HorizontalVirtualList
      items={Array.from({ length: N }, (_, i) => ({ id: `c${i}` }))}
      width={VIEWPORT}
      height={3}
      itemWidth={(_c, i) => widthFor(i)}
      scrollTo={cursor}
      renderItem={(_c, i) => (
        <Box width={widthFor(i)} id={`hcol-${i}`}>
          <Text>{i}</Text>
        </Box>
      )}
      overflowIndicatorWidth={1}
      renderOverflowIndicator={(dir, n) => (
        <Box width={1} flexShrink={0}>
          <Text>{dir === "before" ? `<${n}` : `${n}>`}</Text>
        </Box>
      )}
      getKey={(c) => c.id}
    />
  )

  // boundingBox-based visibility (text-match is unreliable for 3-wide columns).
  const windowStart = (app: ReturnType<ReturnType<typeof createRenderer>>): number => {
    for (let i = 0; i < N; i++) {
      const q = app.locator(`#hcol-${i}`)
      if (q.count() > 0 && q.boundingBox()) return i
    }
    return -1
  }

  test("walk to rightmost, then move left: rendered window start does NOT shift left", () => {
    const r = createRenderer({ cols: VIEWPORT, rows: 8 })
    const app = r(<App cursor={0} />)
    for (let c = 0; c < N; c++) app.rerender(<App cursor={c} />)
    const startBefore = windowStart(app) // cursor at rightmost
    app.rerender(<App cursor={N - 2} />) // move left one (already visible)
    const startAfter = windowStart(app)
    expect(
      startAfter,
      `window start shifted left on retreat (= board scrolled): ${startBefore} -> ${startAfter}`,
    ).toBe(startBefore)
    // Cursor (N-2) must remain rendered.
    expect(app.locator(`#hcol-${N - 2}`).count()).toBeGreaterThan(0)
  })
})
