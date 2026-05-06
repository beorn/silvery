/**
 * ListView "Scroll to Latest" floating button + scrollbar click-to-position.
 *
 * Two independent affordances added together (chat-style scroll UX):
 *
 *   1. Floating "↓ Latest" button surfaces when `follow="end"` AND the
 *      user has scrolled more than one viewport-height above the tail.
 *      Click → snap to end + re-arm follow="end".
 *   2. Scrollbar track is interactive — clicking on the track at row Y
 *      maps to a fractional position (centered on click) and snaps the
 *      viewport accordingly.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box, ListView, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 50): Promise<void> => new Promise((r) => setTimeout(r, ms))

const makeItems = (n: number): string[] => Array.from({ length: n }, (_, i) => `Item ${i + 1}`)

describe("ListView: scroll-to-latest floating button", () => {
  test("button is hidden initially when at end (follow=end auto-snap)", async () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(
      <Box flexDirection="column" height={8} width={30}>
        <ListView
          items={makeItems(40)}
          height={8}
          follow="end"
          renderItem={(label) => <Text>{label}</Text>}
        />
      </Box>,
    )
    await settle()

    expect(app.text).not.toContain("↓ Latest")
    // We're at the tail — the last item is in view.
    expect(app.text).toContain("Item 40")
  })

  test("button surfaces after scrolling >1 viewport-height away from end", async () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(
      <Box flexDirection="column" height={8} width={30}>
        <ListView
          items={makeItems(40)}
          height={8}
          follow="end"
          renderItem={(label) => <Text>{label}</Text>}
        />
      </Box>,
    )
    await settle()

    // Wheel up enough to be > 1 viewport (8 rows) above the end.
    // 12 wheel events × 1 row each = 12 rows scrolled — comfortably > 8.
    for (let i = 0; i < 12; i++) {
      await app.wheel(5, 3, -1)
    }
    await settle(150)

    expect(app.text).toContain("↓ Latest")
  })

  test("button is suppressed for plain nav lists (follow !== end)", async () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const app = render(
      <Box flexDirection="column" height={8} width={30}>
        <ListView items={makeItems(40)} height={8} renderItem={(label) => <Text>{label}</Text>} />
      </Box>,
    )
    await settle()

    for (let i = 0; i < 12; i++) {
      await app.wheel(5, 3, 1)
    }
    await settle(150)

    expect(app.text).not.toContain("↓ Latest")
  })

  test("scrollbar thumb can be click-dragged in a ListView with default selection enabled", async () => {
    using term = createTermless({ cols: 30, rows: 8 })
    const handle = await run(
      <Box flexDirection="column" height={8} width={30}>
        <ListView items={makeItems(80)} height={8} renderItem={(label) => <Text>{label}</Text>} />
      </Box>,
      term,
      { mouse: true },
    )
    await settle()

    expect(term.screen.getText()).toContain("Item 1")

    await term.mouse.down(29, 0)
    await settle()
    await term.mouse.move(29, 6)
    await settle()
    await term.mouse.up(29, 6)
    await settle()

    expect(term.screen.getText()).not.toContain("Item 1")
    handle.unmount()
  })
})
