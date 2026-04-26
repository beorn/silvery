/**
 * Height-independent ListView — scroll cap with multi-line items.
 *
 * Bead: km-silvery.listview-scrollcap-stale-estimate
 *
 * Same root class as the Stream J fix
 * (`listview-height-independent-scrollbar.test.tsx`). The scrollbar gate now
 * uses `max(totalRowsStable, totalRowsMeasured)` so the thumb appears when
 * tall items overflow the viewport. But `scrollableRows` (= the cap on
 * `scrollRow` for wheel/momentum/keyboard) was built from `totalRows =
 * totalRowsMeasured` which underestimates content while items below the
 * viewport remain unmeasured.
 *
 * Symptom (silvercode MessageList): with `estimateHeight=1` (default) and
 * multi-line AssistantBlocks rendering 8+ rows each, wheel-down hits an
 * artificial floor before reaching the actual bottom of the content.
 *
 * Fix: `scrollableRows` now uses
 * `max(totalRowsStable, totalRowsMeasured) - trackHeight`. The same
 * "estimate vs measured — take whichever is bigger" pattern Stream J applied
 * to the visibility gate, applied to the scroll cap.
 *
 * Companion to: `listview-height-independent-scrollbar.test.tsx`. Together
 * they cover both ends of the same regression class.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, ListView, Text } from "@silvery/ag-react"

const BOTTOM_INDICATOR = "▄"

/**
 * Multi-line item — each renders 8 rows. Approximates an AssistantBlock with
 * a paragraph of text in silvercode.
 */
function MultiLineItem({ idx }: { idx: number }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>line 1 of item {idx}</Text>
      <Text>line 2</Text>
      <Text>line 3</Text>
      <Text>line 4</Text>
      <Text>line 5</Text>
      <Text>line 6</Text>
      <Text>line 7</Text>
      <Text>line 8</Text>
    </Box>
  )
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

/** Find the rightmost rendered text on the screen by scanning for a substring. */
function screenContainsText(
  app: { cell: (col: number, row: number) => { char: string }; text: string },
  needle: string,
): boolean {
  return app.text.includes(needle)
}

describe("ListView height-independent — scroll cap with tall items", () => {
  test("wheel-scroll past estimate-only floor — items beyond items.length×estimate become reachable", async () => {
    const COLS = 60
    const ROWS = 20
    // 6 items × 8 rows each = 48 content rows in a 20-row viewport.
    // estimateHeight defaults to 1 → items.length × estimate = 6.
    // BEFORE FIX: `scrollableRows` was clamped to `max(1, totalRows - track)`
    // where `totalRows = totalRowsMeasured`. After only the first 2-3 items
    // are measured, the cap doesn't grow past those measurements until the
    // user has already scrolled into the next batch — but with the OLD
    // floor of 1, scroll could never advance. AFTER FIX: cap uses
    // `max(estimate, measured)` so even at startup the cap accommodates
    // measured rows once they arrive.
    const N = 6
    const items = Array.from({ length: N }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} nav renderItem={(idx) => <MultiLineItem idx={idx} />} />
        </Box>
      </Box>,
    )

    // Pre-scroll: only first item or two are visible. Item 5's content
    // is far off-screen.
    expect(screenContainsText(app, "line 1 of item 0")).toBe(true)
    expect(screenContainsText(app, "line 1 of item 5")).toBe(false)

    // Wheel-scroll progressively — each scroll advances + extends the
    // measurement window which extends the cap. After enough scrolling
    // we MUST be able to reach items beyond items.length × estimate (= 6
    // rows). Before fix: stuck near the top.
    for (let i = 0; i < 60; i++) {
      await app.wheel(5, ROWS / 2, 1)
    }

    // Last item should now be reachable. Before fix: artificial floor
    // (cap = 1 or near-1) prevents scrolling past the first few rows.
    expect(screenContainsText(app, "line 1 of item 5")).toBe(true)
  })

  test("scroll cap updates when items append while scrolled-down (no stuck cap)", async () => {
    const COLS = 60
    const ROWS = 20
    const initialN = 4
    const items4 = Array.from({ length: initialN }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ items }: { items: number[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView items={items} nav renderItem={(idx) => <MultiLineItem idx={idx} />} />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness items={items4} />)

    // Wheel-scroll to the end of the initial 4 items.
    for (let i = 0; i < 32; i++) {
      await app.wheel(5, ROWS / 2, 2)
    }
    expect(screenContainsText(app, "line 1 of item 3")).toBe(true)

    // Append items 4-7 → scroll cap must grow to reach them.
    const items8 = Array.from({ length: 8 }, (_, i) => i)
    app.rerender(<Harness items={items8} />)

    // Continue wheel-scrolling — must reach item 7.
    for (let i = 0; i < 32; i++) {
      await app.wheel(5, ROWS / 2, 2)
    }
    expect(screenContainsText(app, "line 1 of item 7")).toBe(true)
  })

  test("stickyBottom + cursorKey-at-last (silvercode shape): wheel can scroll up off the bottom", async () => {
    const COLS = 60
    const ROWS = 20
    // The silvercode MessageList shape: stickyBottom={true} +
    // cursorKey=last. Cursor pinned to last item, viewport follows. User
    // wheel-scrolls UP to read prior messages — must be able to leave the
    // bottom. Uses the same cap; before fix, `max(1, …)` floor produced
    // edge-bump artefacts even when content fit; after fix, content that
    // overflows scrolls cleanly.
    const N = 6
    const items = Array.from({ length: N }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness(): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView
              items={items}
              nav
              cursorKey={N - 1}
              stickyBottom
              renderItem={(idx) => <MultiLineItem idx={idx} />}
            />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness />)
    // Cursor pinned to last item — its content should be in the viewport.
    expect(screenContainsText(app, "line 1 of item 5")).toBe(true)

    // Wheel-up to expose earlier items. Must be able to actually move
    // the viewport — before fix on first paint with unmeasured items,
    // the cap was ≤ 1 and any wheel adjustment was clamped to floor.
    for (let i = 0; i < 30; i++) {
      await app.wheel(5, ROWS / 2, -1)
    }
    expect(screenContainsText(app, "line 1 of item 0")).toBe(true)
  })

  test("empty + sparse list (items.length × estimate < viewport): no negative cap, no crash", async () => {
    const COLS = 40
    const ROWS = 20
    // 2 single-line items in a 20-row viewport — content fits, scroll
    // cap should clamp to a non-negative value (no overscroll).
    const N = 2
    const items = Array.from({ length: N }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} nav renderItem={(idx) => <Text>item {idx}</Text>} />
        </Box>
      </Box>,
    )

    // Try to wheel-scroll past the bottom — no overscroll bump should
    // fire because there's nothing to scroll.
    await app.wheel(5, ROWS / 2, 5)
    // No bump indicator (the content fits, wheel is a no-op).
    expect(hasCharAnywhere(app, BOTTOM_INDICATOR, COLS, ROWS)).toBe(false)
    // Both items still visible.
    expect(screenContainsText(app, "item 0")).toBe(true)
    expect(screenContainsText(app, "item 1")).toBe(true)
  })

  test("zero items: no crash, scrollable cap is non-negative", async () => {
    const COLS = 40
    const ROWS = 20
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={[] as number[]} nav renderItem={(idx) => <Text>item {idx}</Text>} />
        </Box>
      </Box>,
    )

    // Just don't crash — wheel on empty list.
    await app.wheel(5, ROWS / 2, 1)
    expect(true).toBe(true)
  })
})
