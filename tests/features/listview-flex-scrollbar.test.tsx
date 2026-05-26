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
import { afterEach, describe, expect, test, vi } from "vitest"
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
  test("renders scrollbar on first paint when ListView is height-independent and content overflows", async () => {
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

    // First-paint flash: 200 items overflow 20 rows → scrollbar visible
    // immediately. Bead: @km/code/trackpad-scrolling-no-scrollbar.
    expect(findThumbCell(app, COLS, ROWS)).not.toBeNull()

    // Wheel-scroll down once — flash re-fires; scrollbar remains visible.
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
    // First-paint flash: 50 items overflow 20 rows → scrollbar visible
    // immediately (auto-flash on the 0→50 transition).
    expect(findThumbCell(app, COLS, ROWS)).not.toBeNull()

    // Add more items — the auto-flash useEffect re-fires.
    app.rerender(<Harness items={buildItems(150)} />)
    const thumb = findThumbCell(app, COLS, ROWS)
    expect(thumb).not.toBeNull()
  })

  test('bead 15565: follow="end" streaming-grow does NOT flash the scrollbar', async () => {
    // User-reported 2026-05-21 (screenshot
    // 260521-silvercode-permission-dialog-massive.png context): when new
    // content arrives in a follow=\"end\" ListView (chat transcript), the
    // viewport auto-scrolls to keep the newest content visible. Pre-fix,
    // the item-count-grow effect also flashed the scrollbar — even
    // though the user did NOT initiate the scroll. The scrollbar
    // visibility should reflect SCROLL PROVENANCE: user-initiated → show,
    // auto-follow streaming → stay hidden.
    //
    // The 0→N transition (initial content appearance) still flashes —
    // that's the user's first sight of the content. STREAMING growth
    // (N→N+M while already-pinned at end) is what the user sees as
    // "auto-follow disturbance" and that's what this test guards.
    vi.useFakeTimers()
    try {
      const COLS = 60
      const ROWS = 20
      const render = createRenderer({ cols: COLS, rows: ROWS })

      function Harness({ items }: { items: string[] }): React.ReactElement {
        return (
          <Box width={COLS} height={ROWS} flexDirection="column">
            <Box flexGrow={1} flexShrink={1} minHeight={0}>
              <ListView items={items} follow="end" renderItem={(item) => <Text>{item}</Text>} />
            </Box>
          </Box>
        )
      }

      // Mount with content that overflows — establishes follow-end pin.
      // The 0→30 transition flashes (initial appearance — user's first sight).
      const app = render(<Harness items={buildItems(30)} />)
      expect(
        findThumbCell(app, COLS, ROWS),
        "0→N initial transition: scrollbar visible (user's first sight of overflow)",
      ).not.toBeNull()

      // Advance past the scrollbar fade timer (800ms) so any leftover
      // flash from the mount has cleared.
      vi.advanceTimersByTime(900)
      app.rerender(<Harness items={buildItems(30)} />)
      expect(
        findThumbCell(app, COLS, ROWS),
        "post-fade: scrollbar should be hidden before the streaming grow",
      ).toBeNull()

      // STREAMING GROWTH while pinned at end — bead 15565 trigger. The
      // viewport auto-scrolls to keep the new content visible; the
      // scrollbar should NOT flash because the user did not initiate
      // this scroll.
      app.rerender(<Harness items={buildItems(60)} />)
      expect(
        findThumbCell(app, COLS, ROWS),
        "streaming grow while pinned at end: scrollbar must stay hidden (15565)",
      ).toBeNull()

      // Another streaming grow — same.
      app.rerender(<Harness items={buildItems(90)} />)
      expect(
        findThumbCell(app, COLS, ROWS),
        "second streaming grow while pinned: scrollbar must stay hidden",
      ).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})
