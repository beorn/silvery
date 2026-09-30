/**
 * @failure  A bordered scroll container with no background of its own draws
 *           its `▲N`/`▼N` on the border line, blanking the line between the
 *           corners first. When the indicator went away (scrolled to the end,
 *           or back to the top), the incremental frame kept that blanked line
 *           and the stale glyph while the fresh frame drew the border:
 *           incremental " " vs fresh "─" across all 28 cells of the line. The
 *           container re-rendered only for its children (subtree-dirty), so it
 *           skipped its own paint, and the indicator painter paints nothing
 *           once nothing is hidden. A container WITH a background repainted
 *           the border every such frame (its bg refill), which hid the gap.
 * @level    l2 (reconciler + flexily + render pipeline via createRenderer;
 *           painted border rows and an explicit incremental-vs-fresh compare)
 * @consumer every bordered scroll container without its own backgroundColor:
 *           km panes and lists, ListView inside a bordered frame
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { bufferToText, compareBuffers, createRenderer, formatMismatch } from "@silvery/test"
import { Box, Text } from "../../src/index.js"

const COLS = 40
const ROWS = 14
const WIDTH = 30
const HEIGHT = 12
const ITEMS = 60
/** Content rows inside the border. */
const VIEWPORT = HEIGHT - 2
const MAX_OFFSET = ITEMS - VIEWPORT
const INNER = WIDTH - 2

/**
 * Sixty one-row items in a round-bordered scroll container with no background
 * of its own. `cursor` highlights one item, as a list cursor does; a frame that
 * moves it changes descendants as well as the offset.
 */
function Scene({
  offset,
  cursor,
  ancestorBg,
}: Readonly<{ offset: number; cursor?: number; ancestorBg?: string }>) {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor={ancestorBg}>
      <Box
        flexDirection="column"
        width={WIDTH}
        height={HEIGHT}
        overflow="scroll"
        scrollOffset={offset}
        borderStyle="round"
      >
        {Array.from({ length: ITEMS }, (_, i) => (
          <Box key={i} flexDirection="row" height={1} flexShrink={0}>
            <Text backgroundColor={i === cursor ? "blue" : undefined}>{`item-${i}`}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

type App = ReturnType<ReturnType<typeof createRenderer>>

function borderRow(app: App, row: number): string {
  return (app.text.split("\n")[row] ?? "").slice(0, WIDTH)
}

function expectIncrementalMatchesFresh(app: App, key: string): void {
  const incremental = app.lastBuffer()
  if (!incremental) expect.unreachable(`${key}: no incremental buffer`)
  const fresh = app.freshRender()
  const mismatch = compareBuffers(incremental, fresh)
  if (mismatch) {
    expect.unreachable(
      formatMismatch(mismatch, {
        incrementalText: bufferToText(incremental),
        freshText: bufferToText(fresh),
        key,
      }),
    )
  }
}

const TOP_LINE = `╭${"─".repeat(INNER)}╮`
const BOTTOM_LINE = `╰${"─".repeat(INNER)}╯`

// Each step: the offset, plus what the top and bottom border lines must show.
const STEPS: ReadonlyArray<{ offset: number; top: RegExp | string; bottom: RegExp | string }> = [
  { offset: MAX_OFFSET - 2, top: /^╭\s+▲\d+\s+╮$/, bottom: /^╰\s+▼2\s+╯$/ },
  { offset: MAX_OFFSET - 1, top: /^╭\s+▲\d+\s+╮$/, bottom: /^╰\s+▼1\s+╯$/ },
  // Nothing hidden below any more: the bottom border line comes back.
  { offset: MAX_OFFSET, top: /^╭\s+▲\d+\s+╮$/, bottom: BOTTOM_LINE },
  { offset: MAX_OFFSET - 1, top: /^╭\s+▲\d+\s+╮$/, bottom: /^╰\s+▼1\s+╯$/ },
  { offset: 2, top: /^╭\s+▲2\s+╮$/, bottom: /^╰\s+▼\d+\s+╯$/ },
  { offset: 1, top: /^╭\s+▲1\s+╮$/, bottom: /^╰\s+▼\d+\s+╯$/ },
  // Nothing hidden above any more: the top border line comes back.
  { offset: 0, top: TOP_LINE, bottom: /^╰\s+▼\d+\s+╯$/ },
  { offset: 1, top: /^╭\s+▲1\s+╮$/, bottom: /^╰\s+▼\d+\s+╯$/ },
]

function expectLine(actual: string, expected: RegExp | string, key: string): void {
  if (typeof expected === "string") expect(actual, key).toBe(expected)
  else expect(actual, key).toMatch(expected)
}

describe("the border line returns when its overflow indicator goes", () => {
  test.each([
    // Only the offset changes: the Tier 1 buffer shift.
    { label: "pure scroll", withCursor: false, ancestorBg: undefined },
    // The cursor moves with the offset, so descendants change too: Tier 2.
    { label: "cursor-driven scroll", withCursor: true, ancestorBg: undefined },
    // The restored border carries the inherited background, as fresh paints it.
    {
      label: "cursor-driven scroll under an ancestor background",
      withCursor: true,
      ancestorBg: "#335577",
    },
  ])("$label", ({ withCursor, ancestorBg }) => {
    const scene = (offset: number) => (
      <Scene offset={offset} cursor={withCursor ? offset + 2 : undefined} ancestorBg={ancestorBg} />
    )
    const app = createRenderer({ cols: COLS, rows: ROWS })(scene(MAX_OFFSET - 3))

    let prev = MAX_OFFSET - 3
    for (const step of STEPS) {
      app.rerender(scene(step.offset))
      const key = `scrollOffset ${prev} -> ${step.offset}`
      expectLine(borderRow(app, 0), step.top, `${key}: top border line`)
      expectLine(borderRow(app, HEIGHT - 1), step.bottom, `${key}: bottom border line`)
      expectIncrementalMatchesFresh(app, key)
      prev = step.offset
    }
  })
})
