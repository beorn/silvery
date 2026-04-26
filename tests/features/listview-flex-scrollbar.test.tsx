/**
 * Flex-mode (height-independent) ListView renders the scrollbar.
 *
 * When ListView is used without a `height` prop — i.e. the viewport size
 * comes from a parent flex container — the scrollbar previously was hard-
 * gated off (`!isHeightIndependent && …`). Apps like silvercode that wrap
 * ListView in `<Box flexGrow={1}>` got no scrollbar at all, even when the
 * content overflowed.
 *
 * Fix: read the inner Box's measured viewport height via `viewportSize.h`
 * (already tracked for measurement caching) and use it in place of the
 * height prop for scrollbar geometry.
 *
 * Companion bead: km-silvery.scrollbar-flex-mode.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, ListView, Text } from "@silvery/ag-react"

const THUMB_EIGHTHS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"])

function buildItems(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `item ${i}`)
}

function findThumbCell(
  app: { cell: (col: number, row: number) => { char: string } },
  cols: number,
  rows: number,
): { col: number; row: number } | null {
  // Thumb renders in the rightmost interior column (right=0 in the absolute
  // overlay); search the last column.
  const col = cols - 1
  for (let r = 0; r < rows; r++) {
    if (THUMB_EIGHTHS.has(app.cell(col, r).char)) return { col, row: r }
  }
  return null
}

describe("ListView flex-mode scrollbar", () => {
  test("renders scrollbar after wheel scroll when ListView is height-independent", async () => {
    const COLS = 60
    const ROWS = 20
    const N = 200
    const items = buildItems(N)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    // Pin root size; put ListView inside a flexGrow=1 column container with
    // no `height` prop — the silvercode shape.
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} nav renderItem={(item) => <Text>{item}</Text>} />
        </Box>
      </Box>,
    )

    // Pre-scroll: scrollbar should not appear (idle, isScrolling=false).
    expect(findThumbCell(app, COLS, ROWS)).toBeNull()

    // Wheel-scroll down once — flips isScrolling=true.
    await app.wheel(5, ROWS / 2, 1)
    const thumb = findThumbCell(app, COLS, ROWS)
    expect(thumb).not.toBeNull()
  })

  test("auto-flashes scrollbar when item count grows", async () => {
    const COLS = 60
    const ROWS = 20
    const initialItems = buildItems(50)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ items }: { items: string[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView items={items} nav renderItem={(item) => <Text>{item}</Text>} />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness items={initialItems} />)
    // Idle — no scrollbar yet.
    expect(findThumbCell(app, COLS, ROWS)).toBeNull()

    // Add more items — the auto-flash useEffect should fire setIsScrolling(true).
    app.rerender(<Harness items={buildItems(150)} />)
    const thumb = findThumbCell(app, COLS, ROWS)
    expect(thumb).not.toBeNull()
  })
})
