/**
 * ListView wheel behavior on TALL terminals — follow-mode startup regressions.
 *
 * km-logview ships on tall/wide terminals (e.g. 246×122) and seeds the cursor
 * to the LAST item at startup (`cursorKey={lastIndex}` — follow mode). The
 * user reports two symptoms at this initial state that do NOT reproduce on
 * short terminals:
 *
 *   1. First wheel-down does not fire the bottom overscroll indicator (▄),
 *      even though the viewport is already at the bottom. Wheel-up then
 *      wheel-down recovers.
 *   2. Scrollbar thumb stops a row or two short of the track bottom even
 *      though the viewport is showing the last item.
 *
 * Investigation uncovered a sharper, directly reproducible bug: when the
 * default `maxRendered=100` is combined with a tall viewport + cursor at
 * the last item, the virtualizer's bootstrap window fails to include the
 * cursor item. This produces a layout feedback loop that does not converge
 * in 5 iterations — surfaced as the STRICT warning
 *   "classic layout loop exhausted 5 iterations with pending React commit".
 *
 * Bootstrap math (before fix) with cols=246 rows=122, viewport=120,
 * N=1000, cursor=999, estimate=1, overscan=5, maxRendered=100:
 *   estimatedVisibleCount = 120 (viewport / avgHeight)
 *   minItems              = 120 + 2*5 = 130
 *   start (attempt 1)     = max(0, 999 - 5) = 994
 *   end (attempt 1)       = min(1000, 994 + 130) = 1000
 *   end === count → pull back:
 *   start (attempt 2)     = max(0, 1000 - 130) = 870
 *   SAFETY CAP:
 *   end (final)           = min(1000, 870 + maxRendered=100) = 970  ← clamp
 *
 * Result: the rendered window is 870..970 — cursor 999 is NOT inside it.
 * The Box's `scrollOffset` / ensure-visible cannot reach it; the virtualizer
 * keeps reacting to scroll state that never settles → layout loop spins.
 *
 * Fix: the maxRendered safety cap must never remove the cursor / anchor from
 * the window. When `scrollTo` (or effectiveScrollOffset) falls outside the
 * [start, end) range after the cap, extend `end` to include it — or pull
 * `start` forward if the anchor is below the window. The cap protects
 * against unbounded rendering for very large lists; it must not evict the
 * VERY item the caller asked to scroll to.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { ListView, Text } from "@silvery/ag-react"

const BOTTOM_INDICATOR = "▄"
const TOP_INDICATOR = "▀"
const THUMB_EIGHTHS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"])

function buildItems(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `item ${i}`)
}

function hasCharAnywhere(
  app: { cell: (col: number, row: number) => { char: string } },
  target: string,
  cols: number,
  rows: number,
): boolean {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (app.cell(c, r).char === target) return true
    }
  }
  return false
}

function findCharOnRow(
  app: { cell: (col: number, row: number) => { char: string } },
  target: string,
  row: number,
  cols: number,
): number {
  for (let c = 0; c < cols; c++) {
    if (app.cell(c, row).char === target) return c
  }
  return -1
}

/** Find last row containing any thumb-like glyph in the rightmost column. */
function findThumbBottomRow(
  app: { cell: (col: number, row: number) => { char: string } },
  cols: number,
  rows: number,
): number {
  const col = cols - 1
  let bottom = -1
  for (let r = 0; r < rows; r++) {
    const ch = app.cell(col, r).char
    if (THUMB_EIGHTHS.has(ch)) bottom = r
  }
  return bottom
}

describe("ListView tall terminal — cursor-at-last startup (follow mode)", () => {
  test("BASELINE short (cols=80, rows=24): wheel-down at cursor=last fires bottom indicator", async () => {
    const COLS = 80
    const ROWS = 24
    const VIEWPORT = ROWS - 2
    const N = 1000
    const items = buildItems(N)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <ListView
        items={items}
        height={VIEWPORT}
        nav
        cursorKey={N - 1}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )
    await app.wheel(5, VIEWPORT / 2, 1)
    expect(hasCharAnywhere(app, BOTTOM_INDICATOR, COLS, ROWS)).toBe(true)
  })

  test("TALL (cols=246, rows=122, default maxRendered): mount does not exhaust layout loop at cursor=last", async () => {
    // This is the SHARP regression — the layout-loop warning fires because
    // the virtualizer's bootstrap window clamp excludes the cursor on tall
    // viewports when the default maxRendered=100 is too small to span from
    // (scrollOffset - overscan) up through the cursor item.
    //
    // STRICT mode surfaces this as a console.warn, which the test setup
    // promotes to a failed assertion. If this test passes (no warn), the
    // bootstrap window includes the cursor and the layout converges.
    const COLS = 246
    const ROWS = 122
    const VIEWPORT = ROWS - 2
    const N = 1000
    const items = buildItems(N)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    render(
      <ListView
        items={items}
        height={VIEWPORT}
        nav
        cursorKey={N - 1}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )
    expect(true).toBe(true)
  })

  test("TALL (cols=246, rows=122): wheel-down at cursor=last fires bottom overscroll indicator", async () => {
    const COLS = 246
    const ROWS = 122
    const VIEWPORT = ROWS - 2
    const N = 1000
    const items = buildItems(N)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <ListView
        items={items}
        height={VIEWPORT}
        nav
        cursorKey={N - 1}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )
    await app.wheel(5, VIEWPORT / 2, 1)
    expect(hasCharAnywhere(app, BOTTOM_INDICATOR, COLS, ROWS)).toBe(true)
  })

  test("TALL (cols=246, rows=122): scrollbar thumb reaches the last viewport row at cursor=last", async () => {
    const COLS = 246
    const ROWS = 122
    const VIEWPORT = ROWS - 2
    const N = 1000
    const items = buildItems(N)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <ListView
        items={items}
        height={VIEWPORT}
        nav
        cursorKey={N - 1}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )
    await app.wheel(5, VIEWPORT / 2, 1)
    const thumbBottomRow = findThumbBottomRow(app, COLS, ROWS)
    // Thumb must reach the last viewport row (VIEWPORT - 1). One-row tolerance
    // is allowed for frac-quantization — missing by 2+ rows is the bug.
    expect(thumbBottomRow).toBeGreaterThanOrEqual(VIEWPORT - 2)
  })

  test("TALL: wheel-up at cursor=0 fires top indicator (symmetry)", async () => {
    const COLS = 246
    const ROWS = 122
    const VIEWPORT = ROWS - 2
    const N = 1000
    const items = buildItems(N)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <ListView
        items={items}
        height={VIEWPORT}
        nav
        cursorKey={0}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )
    await app.wheel(5, VIEWPORT / 2, -1)
    expect(findCharOnRow(app, TOP_INDICATOR, 0, COLS)).toBeGreaterThanOrEqual(0)
  })
})
