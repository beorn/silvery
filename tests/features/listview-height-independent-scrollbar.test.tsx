/**
 * Height-independent ListView — scrollbar + bump indicator with multi-line items.
 *
 * Bead: km-silvery.listview-scrollbar-height-independent
 *
 * Two regressions in the silvercode shape:
 *
 * 1. **Scrollbar invisible** when items render multi-line content. The
 *    visibility gate uses `totalRowsStable = items.length × estimateHeight`
 *    (estimate-only, default 1) — so a list of 10 items each rendering 8
 *    rows shows `totalRowsStable = 10` against a `trackHeight = 30`,
 *    `thumbHeight` collapses to 0, and the scrollbar never renders even
 *    when content overflows by 50+ rows. Fix: use the maximum of
 *    estimate-based and measured-based totals for the overflow gate.
 *
 * 2. **Bump indicator flickers** during streaming append. When the user
 *    pressed `j` at the bottom (setting `bumpedEdge = "bottom"`) and then
 *    items continue streaming in, the bump's at-edge gate
 *    (`effectiveRowsAbove >= scrollableRows`) toggles between true/false
 *    each render as `scrollableRows` grows ahead of `rowsAboveViewport`'s
 *    layout-derived catch-up. Fix: clear `bumpedEdge` on append so the
 *    stale "you hit the end" cue doesn't outlive the moment that produced
 *    it.
 *
 * Companion to: `listview-flex-scrollbar.test.tsx` (estimate=1, single-line
 * items — passes already because `items.length × 1 > trackHeight` with 200
 * items). This file uses 12 items × 8 rows each — the silvercode shape.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, ListView, Text } from "@silvery/ag-react"

const THUMB_EIGHTHS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"])
const BUMP_GLYPHS = new Set(["▀", "▄"])

/**
 * Multi-line item — each renders 8 rows. Approximates an AssistantBlock
 * with a paragraph of text in silvercode.
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

function findThumbCell(
  app: { cell: (col: number, row: number) => { char: string } },
  cols: number,
  rows: number,
): { col: number; row: number } | null {
  const col = cols - 1
  for (let r = 0; r < rows; r++) {
    if (THUMB_EIGHTHS.has(app.cell(col, r).char)) return { col, row: r }
  }
  return null
}

function hasBump(
  app: { cell: (col: number, row: number) => { char: string } },
  cols: number,
  rows: number,
): boolean {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (BUMP_GLYPHS.has(app.cell(c, r).char)) return true
    }
  }
  return false
}

describe("ListView height-independent — scrollbar with multi-line items", () => {
  test("renders scrollbar after wheel-scroll when content overflows via tall items", async () => {
    const COLS = 60
    const ROWS = 20
    // 12 items × 8 rows each = 96 content rows in a 20-row viewport.
    // estimateHeight defaults to 1 → totalRowsStable = 24 (still > trackHeight
    // because 12 items × (1 + gap=1) = 24, just barely > 20). The bug shows
    // up most clearly when items.length × (estimate + gap) ≤ trackHeight.
    // 6 items × 8 lines each = 48 content rows; estimate = 6 × 2 = 12 < 20.
    const N = 6
    const items = Array.from({ length: N }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView
            items={items}
            nav
            renderItem={(idx) => <MultiLineItem idx={idx} />}
          />
        </Box>
      </Box>,
    )

    // Pre-scroll: idle, no scrollbar.
    expect(findThumbCell(app, COLS, ROWS)).toBeNull()

    // Wheel-scroll once — content overflows (48 rows in 20-row viewport),
    // scrollbar SHOULD render. Before fix: didn't because totalRowsStable
    // (= 6 items × 2 = 12) ≤ trackHeight (20) → thumbHeight = 0.
    await app.wheel(5, ROWS / 2, 1)
    const thumb = findThumbCell(app, COLS, ROWS)
    expect(thumb).not.toBeNull()
  })
})

describe("ListView height-independent — bump indicator stability on streaming append", () => {
  test("bumpedEdge clears when items append (no flicker)", async () => {
    const COLS = 40
    const ROWS = 12
    // Start with 4 items × 8 rows = 32 content rows in 12-row viewport.
    const initialN = 4
    const items4 = Array.from({ length: initialN }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ items }: { items: number[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView
              items={items}
              nav
              cursorKey={Math.max(0, items.length - 1)}
              renderItem={(idx) => <MultiLineItem idx={idx} />}
            />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness items={items4} />)

    // Move cursor to last item, then press j to overscroll → sets
    // bumpedEdge="bottom".
    for (let i = 0; i < initialN; i++) await app.press("j")
    expect(hasBump(app, COLS, ROWS)).toBe(true)

    // Streaming-append simulation: items grow. Before fix, the bump
    // indicator's at-edge render gate flips false→true→false during the
    // re-render (rowsAboveViewport lags, scrollableRows leaps). We assert
    // the stale bump is cleared on append — no flicker.
    const items5 = [...items4, 4]
    app.rerender(<Harness items={items5} />)
    expect(hasBump(app, COLS, ROWS)).toBe(false)

    const items6 = [...items5, 5]
    app.rerender(<Harness items={items6} />)
    expect(hasBump(app, COLS, ROWS)).toBe(false)
  })
})
