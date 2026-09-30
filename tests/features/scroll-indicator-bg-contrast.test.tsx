/**
 * @failure  When a scroll container has no background (or a light one), the
 *           overflow indicator renders `fg 15` (bright white) on a null or
 *           matching bg — invisible on light terminal themes. Three cases:
 *           1. No-bg container inside a dark root: fg 15 on null bg (indicator
 *              should inherit the root's dark bg but doesn't before the fix)
 *           2. Light-bg container (#ffffff): fg 15 on bg #ffffff (white on white)
 *           3. Parent-bg-only: parent has backgroundColor, scroll box has none —
 *              fg 15 on null bg (parent's bg not inherited before the fix).
 *           Fix: resolveAncestorBg walks the node's parent chain for the first
 *           non-undefined bg, and isLightColor picks fg 0 (black) on light bgs.
 * @level    l1 (createRenderer, no async; paint pipeline via renderScrollIndicators)
 * @consumer every scroll container with overflowIndicator on any terminal theme
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../../src/index.js"

const COLS = 20
const ROWS = 5

/**
 * A scroll scene that always produces `hiddenBelow > 0` items:
 * 20 items × height 1 = 20 rows of content inside a 5-row viewport.
 */
function ScrollScene({
  scrollBg,
  rootBg,
}: Readonly<{ scrollBg?: string; rootBg?: string }>): React.ReactElement {
  const items = Array.from({ length: 20 }, (_, i) => (
    <Box key={i} height={1} flexShrink={0}>
      <Text>item-{i}</Text>
    </Box>
  ))
  return (
    <Box width={COLS} height={ROWS} backgroundColor={rootBg}>
      <Box
        width={COLS}
        height={ROWS}
        flexDirection="column"
        overflow="scroll"
        overflowIndicator
        backgroundColor={scrollBg}
      >
        {items}
      </Box>
    </Box>
  )
}

/**
 * Find the column of the first ▼ or ▲ glyph on a given row.
 * Returns -1 if not found.
 */
function findIndicatorCol(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  row: number,
): number {
  for (let x = 0; x < COLS; x++) {
    const ch = app.cell(x, row).char
    if (ch === "▼" || ch === "▲") return x
  }
  return -1
}

describe("scroll indicator bg contrast (#26737)", () => {
  test("no-bg scroll container inside dark root: indicator inherits root bg (not null)", () => {
    // Simulate a dark terminal bg (#1a1a1a) as the root. The scroll box has
    // no explicit backgroundColor. Before the fix, the indicator renders
    // fg 15 on null bg. After the fix it resolves the root's dark bg.
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<ScrollScene rootBg="#1a1a1a" />)

    // The bottom overflow indicator (▼) must appear on the last row.
    const indicatorRow = ROWS - 1
    const col = findIndicatorCol(app, indicatorRow)
    expect(col, "expected a ▼ indicator on the last row").toBeGreaterThanOrEqual(0)

    // The indicator cell must have a non-null background resolved from the
    // root ancestor.
    const cell = app.cell(col, indicatorRow)
    expect(cell.bg, "indicator bg must resolve ancestor's backgroundColor").not.toBeNull()
  })

  test("light-bg scroll container (#ffffff): indicator fg must differ from bg (not white-on-white)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<ScrollScene scrollBg="#ffffff" />)

    const indicatorRow = ROWS - 1
    const col = findIndicatorCol(app, indicatorRow)
    expect(col, "expected a ▼ indicator on the last row").toBeGreaterThanOrEqual(0)

    const cell = app.cell(col, indicatorRow)
    // On a white background the fg must be dark (fg 0, black) — not white (fg 15).
    // A visible indicator requires fg !== bg. Check: fg should not be pure white
    // when bg IS white.
    expect(cell.fg, "indicator must have an explicit fg on a light bg").not.toBeNull()
    if (cell.fg && cell.bg) {
      const fgIsWhite = cell.fg.r === 255 && cell.fg.g === 255 && cell.fg.b === 255
      const bgIsWhite = cell.bg.r === 255 && cell.bg.g === 255 && cell.bg.b === 255
      expect(
        fgIsWhite && bgIsWhite,
        "indicator must not be white-on-white (fg and bg both white)",
      ).toBe(false)
    }
  })

  test("parent-bg-only: scroll box inherits parent's bg for indicator (not null)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<ScrollScene rootBg="#202020" />)

    const indicatorRow = ROWS - 1
    const col = findIndicatorCol(app, indicatorRow)
    expect(col, "expected a ▼ indicator on the last row").toBeGreaterThanOrEqual(0)

    const cell = app.cell(col, indicatorRow)
    // The scroll box has no backgroundColor but its parent does (#202020).
    // The indicator should resolve the parent's bg and paint it — not null.
    expect(cell.bg, "indicator bg must resolve parent's backgroundColor").not.toBeNull()
  })
})
