/**
 * Regression: Box overflow="scroll" viewport must stay pinned when a visible
 * child GROWS — scrollTo prop re-renders with the same value must not re-fire
 * ensure-visible. See bead `km-silvery.box-scroll-stable-on-height-change`.
 *
 * Scenario (from the bead):
 *   Click a collapsible row in ListView to expand it. Expected: rows above
 *   the clicked row stay pinned to their screen positions; rows below get
 *   pushed down as the clicked row grows. Actual (before fix): the whole
 *   viewport shifts — the clicked row moves on screen.
 *
 * Root cause: Box's `scrollTo` was applied as edge-based ensure-visible on
 * EVERY render. When a visible child grew (user expanded it), the Box re-
 * anchored to keep the grown child fully visible, shifting the viewport.
 *
 * Fix: the layout phase (calculateScrollState) now memoizes the last-
 * processed `scrollTo` value. Ensure-visible fires only when `scrollTo`
 * CHANGED since the previous frame (or on first render).
 *
 * Prior art: this "fire on change, not on re-render" semantic matches
 * @tanstack/virtual's `scrollToIndex`, react-window's `scrollTo` method,
 * and iOS UIScrollView's `setContentOffset:animated:`. Mature scroll APIs
 * consistently separate imperative intent (scroll now) from declarative
 * anchor state (where we are).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "silvery"

// Find the y-coordinate (row index) of the first cell containing a needle.
function findRowOf(app: { text: string }, needle: string): number {
  const text = stripAnsi(app.text)
  const lines = text.split("\n")
  return lines.findIndex((l) => l.includes(needle))
}

describe("Box overflow=scroll: viewport stays pinned on visible-child growth", () => {
  test("growing the scrollTo target does NOT shift the viewport (cursor item perspective)", () => {
    // 20 items inside a height=10 scroll container. scrollTo=5 (inside
    // visible range on mount). Growing item 5 from 1 → 3 rows must keep
    // items 0..4 at their original on-screen Y positions.
    const render = createRenderer({ cols: 20, rows: 15 })

    function App({ heights }: { heights: number[] }) {
      return (
        <Box overflow="scroll" height={10} scrollTo={5} flexDirection="column">
          {heights.map((h, i) => (
            <Box key={i} height={h} flexShrink={0}>
              <Text>Row {i}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    // Frame 1: each row 1 row tall. 20 rows total, viewport shows top 10.
    const initial = Array.from({ length: 20 }, () => 1)
    const app = render(<App heights={initial} />)

    // Find where row 0..5 render on screen.
    const row0Y1 = findRowOf(app, "Row 0")
    const row1Y1 = findRowOf(app, "Row 1")
    const row2Y1 = findRowOf(app, "Row 2")
    const row5Y1 = findRowOf(app, "Row 5")
    expect(row0Y1, "Row 0 must be visible initially").toBeGreaterThanOrEqual(0)
    expect(row5Y1, "Row 5 (scrollTo target) must be visible initially").toBeGreaterThan(row0Y1)

    // Frame 2: grow row 5 from 1 → 3 rows (user clicks to expand). Before
    // the fix, Box re-anchored scroll to keep row 5 fully visible, shifting
    // the viewport down and pushing rows 0-4 up on screen.
    const expanded = [...initial]
    expanded[5] = 3
    app.rerender(<App heights={expanded} />)

    const row0Y2 = findRowOf(app, "Row 0")
    const row1Y2 = findRowOf(app, "Row 1")
    const row2Y2 = findRowOf(app, "Row 2")
    const row5Y2 = findRowOf(app, "Row 5")

    expect(row0Y2, "Row 0 must stay at original Y after growth").toBe(row0Y1)
    expect(row1Y2, "Row 1 must stay at original Y after growth").toBe(row1Y1)
    expect(row2Y2, "Row 2 must stay at original Y after growth").toBe(row2Y1)
    expect(row5Y2, "Row 5 top edge must stay at original Y after growth").toBe(row5Y1)
  })

  test("scrollTo CHANGE still fires ensure-visible", () => {
    // Positive test: changing scrollTo from an in-view value to an off-screen
    // value must still scroll (this is the declarative API's whole point).
    const render = createRenderer({ cols: 20, rows: 10 })

    function App({ scrollTo }: { scrollTo: number }) {
      return (
        <Box overflow="scroll" height={4} scrollTo={scrollTo} flexDirection="column">
          {Array.from({ length: 20 }, (_, i) => (
            <Box key={i} height={1} flexShrink={0}>
              <Text>Row {i}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App scrollTo={0} />)
    expect(stripAnsi((app as any).text)).toContain("Row 0")

    // Jump to row 15 — well outside the initial 4-row viewport. Must scroll.
    app.rerender(<App scrollTo={15} />)
    expect(stripAnsi((app as any).text)).toContain("Row 15")
  })

  test("mount with scrollTo to an off-screen index scrolls to it", () => {
    // Edge case: initial render with scrollTo pointing off-screen. First
    // render has prevScrollTo=undefined, so the guard treats it as "new
    // intent" and fires ensure-visible — preserving the documented
    // "on mount" semantic (also exercises the 3 pre-existing ListView
    // tests that broke in the earlier ListView-level memoization attempt).
    const render = createRenderer({ cols: 20, rows: 10 })

    const app = render(
      <Box overflow="scroll" height={4} scrollTo={18} flexDirection="column">
        {Array.from({ length: 20 }, (_, i) => (
          <Box key={i} height={1} flexShrink={0}>
            <Text>Row {i}</Text>
          </Box>
        ))}
      </Box>,
    )

    expect(stripAnsi((app as any).text)).toContain("Row 18")
  })

  test("re-renders with same scrollTo on a DIFFERENT unrelated state do not shift viewport", () => {
    // State change that does NOT affect scroll container content — the
    // viewport must not move. This catches the bug even without growth.
    const render = createRenderer({ cols: 20, rows: 10 })

    function App({ prefix }: { prefix: string }) {
      return (
        <Box overflow="scroll" height={6} scrollTo={2} flexDirection="column">
          {Array.from({ length: 20 }, (_, i) => (
            <Box key={i} height={1} flexShrink={0}>
              <Text>
                {prefix}
                {i}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App prefix="A" />)
    const rowAY1 = findRowOf(app, "A0")

    app.rerender(<App prefix="B" />)
    const rowBY1 = findRowOf(app, "B0")

    expect(rowBY1, "Row 0 on-screen Y must be unchanged after text-only update").toBe(rowAY1)
  })

  test("scrollTo changing back to the previous-but-one value fires ensure-visible", () => {
    // 0 → 15 → 0: the third render should STILL scroll (scrollTo changed
    // from 15 → 0). Guards against a bug where "current === previous" is
    // checked too liberally.
    const render = createRenderer({ cols: 20, rows: 10 })

    function App({ scrollTo }: { scrollTo: number }) {
      return (
        <Box overflow="scroll" height={4} scrollTo={scrollTo} flexDirection="column">
          {Array.from({ length: 20 }, (_, i) => (
            <Box key={i} height={1} flexShrink={0}>
              <Text>Row {i}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App scrollTo={0} />)
    expect(stripAnsi((app as any).text)).toContain("Row 0")

    app.rerender(<App scrollTo={15} />)
    expect(stripAnsi((app as any).text)).toContain("Row 15")

    app.rerender(<App scrollTo={0} />)
    expect(stripAnsi((app as any).text)).toContain("Row 0")
  })

  test("same-intent recovery: target completely off-screen re-fires ensure-visible", () => {
    // Regression for `km-silvery.listview-resize-scroll-target` (and the
    // listview-scroll-properties.fuzz INV-2 violations). Mirrors the
    // multi-pass layout convergence pattern that the f7adc32b fix addresses:
    //
    //   1. Mount with a pinned scrollTo near the END of a long list.
    //      Cached offset places the target at the bottom of the viewport.
    //   2. Resize the container to a SMALLER height with scrollTo unchanged.
    //      contentHeight grows relative to viewport, the cached offset is
    //      now clamped far above the target — target is COMPLETELY off-
    //      screen even though scrollTo didn't change.
    //
    // Before the recovery fix, `scrollToChanged===false` blocked ensure-
    // visible from firing, leaving the target invisible and tripping the
    // STRICT invariant `scrollTo target index=N does not intersect viewport`.
    //
    // The conservative recovery fires only when intersection is zero —
    // partial visibility (the click-to-expand case) still leaves the
    // viewport pinned.
    const render = createRenderer({ cols: 30, rows: 30 })

    const ITEMS = 50
    function App({ height }: { height: number }) {
      return (
        <Box overflow="scroll" height={height} scrollTo={ITEMS - 1} flexDirection="column">
          {Array.from({ length: ITEMS }, (_, i) => (
            <Box key={i} height={1} flexShrink={0}>
              <Text>Row {i}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    // Mount with viewport height=20. scrollTo=49 (last item) — fires
    // ensure-visible on mount (prevScrollTo=undefined → scrollToChanged=true).
    const app = render(<App height={20} />)
    expect(stripAnsi((app as any).text)).toContain("Row 49")

    // Shrink viewport to 5. scrollTo unchanged at 49. Without the recovery
    // branch, the cached offset is preserved — but with viewport=5 the
    // visible window stops well short of row 49, leaving it off-screen.
    // The recovery must re-fire ensure-visible so row 49 is visible.
    app.rerender(<App height={5} />)
    expect(stripAnsi((app as any).text)).toContain("Row 49")
  })
})
