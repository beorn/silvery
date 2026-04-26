/**
 * ListView scrollbar thumb size — regression test.
 *
 * Bug: when items are systematically taller than `estimateHeight`
 * (silvercode chat: estimate=1, actual ~10-50 rows per assistant block),
 * the thumb size formula `track² / (estimate × N)` underestimates total
 * content by 10-50× and the thumb ends up nearly the size of the track
 * even though the user only sees ~5% of content.
 *
 * Original strategy was estimate-only (TanStack convention) on the theory
 * that measurement-sum-based totals jitter as the user scrolls into
 * unmeasured items. That concern only applies when measurement reveals
 * items SHORTER than estimate — for chat-shaped lists with estimate=1,
 * measurement only reveals MORE content, never less. Growing the total
 * monotonically is non-jittery.
 *
 * Fix: use `max(stable, measured)` for thumb size — same shape as the
 * visibility gate.
 *
 * Bead: km-silvery.listview-thumb-too-big-when-items-tall.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, ListView, Text } from "@silvery/ag-react"

const THUMB_EIGHTHS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"])

function thumbCells(
  app: { cell: (col: number, row: number) => { char: string } },
  cols: number,
  rows: number,
): number[] {
  const col = cols - 1
  const rowsWithThumb: number[] = []
  for (let r = 0; r < rows; r++) {
    if (THUMB_EIGHTHS.has(app.cell(col, r).char)) rowsWithThumb.push(r)
  }
  return rowsWithThumb
}

describe("ListView scrollbar thumb size — accurate when items taller than estimate", () => {
  test("tall items produce a small thumb (proportional to actual content)", async () => {
    const COLS = 80
    const ROWS = 20
    // 20 items, each 10 lines tall = ~200 rows of total content.
    // Track is 20 rows. Expected thumb ≈ 20² / 200 = 2 rows.
    // Pre-fix: estimate=1 → totalStable = 20 → thumb ≈ 20² / 20 = 20 (full track).
    const TALL = "line\n".repeat(10).trimEnd()
    const items = Array.from({ length: 20 }, (_, i) => `${i}: ${TALL}`)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} nav renderItem={(item) => <Text>{item}</Text>} />
        </Box>
      </Box>,
    )

    // Wheel to flash scrollbar.
    await app.wheel(5, ROWS / 2, 1)
    const cells = thumbCells(app, COLS, ROWS)
    expect(cells.length, `expected thumb to render`).toBeGreaterThan(0)
    // Thumb must be clearly smaller than half the track. Pre-fix it was
    // the entire track height (20 rows); a properly-sized thumb for ~200
    // rows of content in a 20-row viewport is ~2-3 rows.
    expect(cells.length, `thumb covered ${cells.length}/${ROWS} rows — too large`).toBeLessThan(ROWS / 2)
  })

  test("estimate-correct lists keep the stable thumb size (no jitter)", async () => {
    // 200 items × 1 row each = 200 rows of content. Estimate = 1 (default).
    // Stable total = 200, measured total = 200 once items render. max() = 200.
    // Thumb = 20² / 200 = 2. Same as before the fix.
    const COLS = 80
    const ROWS = 20
    const items = Array.from({ length: 200 }, (_, i) => `item ${i}`)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} nav renderItem={(item) => <Text>{item}</Text>} />
        </Box>
      </Box>,
    )
    await app.wheel(5, ROWS / 2, 1)
    const cells = thumbCells(app, COLS, ROWS)
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.length).toBeLessThanOrEqual(3)
  })
})
