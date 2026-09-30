/**
 * @failure  A scroll container whose background is a `$token` painted that
 *           token's truecolor RGB into the rows it cleared while scrolling,
 *           even under the mono tier, where every `$token` resolves to no
 *           colour. The viewport clear (Tier 2) and the buffer-shift fill of
 *           newly exposed rows (Tier 1) both take the scroll background, and
 *           render-phase parsed it without the render's colour level (pipeline
 *           CLAUDE.md "The color level is per render"). Every mono scroll of
 *           such a container left incremental != fresh: incremental bg
 *           (50,56,68) vs fresh null, 288 cells in the review probe.
 * @level    l2 (reconciler + flexily + render pipeline via createRenderer at
 *           colorLevel "mono"; cell backgrounds and an explicit
 *           incremental-vs-fresh buffer compare)
 * @consumer every scroll container with a `$token` backgroundColor on a
 *           NO_COLOR / mono terminal
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { bufferToText, compareBuffers, createRenderer, formatMismatch } from "@silvery/test"
import { Box, Text } from "../../src/index.js"

const COLS = 40
const ROWS = 14
const WIDTH = 30
const VIEWPORT = 12
const ITEMS = 60
const TOKEN_BG = "$bg-surface-subtle"

/**
 * Sixty one-row items in a scroll container whose background is a theme
 * token. `cursor` marks one item with a text prefix (no colour of its own),
 * so a frame that moves it changes descendants as well as the offset.
 */
function Scene({ offset, cursor }: Readonly<{ offset: number; cursor?: number }>) {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column">
      <Box
        flexDirection="column"
        width={WIDTH}
        height={VIEWPORT}
        overflow="scroll"
        scrollOffset={offset}
        backgroundColor={TOKEN_BG}
      >
        {Array.from({ length: ITEMS }, (_, i) => (
          <Box key={i} flexDirection="row" height={1} flexShrink={0}>
            <Text>{`${i === cursor ? "▸ " : "  "}item-${i}`}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

type App = ReturnType<ReturnType<typeof createRenderer>>

/** Every cell of the scroll container whose background is not null. */
function coloredCells(app: App): string[] {
  const found: string[] = []
  for (let y = 0; y < VIEWPORT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const bg = app.cell(x, y).bg
      if (bg !== null) found.push(`(${x},${y}) bg=${JSON.stringify(bg)}`)
    }
  }
  return found
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

// Down by 1 and 3, up by 2, a long jump up.
const OFFSETS = [20, 21, 24, 22, 5]

describe("a scroll container's token background follows the render's colour level", () => {
  test("positive control: at truecolor the token resolves to a colour", () => {
    const app = createRenderer({ cols: COLS, rows: ROWS })(<Scene offset={OFFSETS[0]!} />)
    expect(coloredCells(app).length, `${TOKEN_BG} paints a background at truecolor`).toBe(
      WIDTH * VIEWPORT,
    )
  })

  test.each([
    // Only the offset changes: Tier 1 fills the newly exposed rows.
    { label: "pure scroll", withCursor: false },
    // The cursor moves with the offset, so descendants change: Tier 2 clears
    // the whole viewport.
    { label: "cursor-driven scroll", withCursor: true },
  ])("mono: $label paints no token colour", ({ withCursor }) => {
    const scene = (offset: number) => (
      <Scene offset={offset} cursor={withCursor ? offset + 1 : undefined} />
    )
    const app = createRenderer({ cols: COLS, rows: ROWS, colorLevel: "mono" })(scene(OFFSETS[0]!))
    expect(coloredCells(app), "first frame").toEqual([])

    for (let i = 1; i < OFFSETS.length; i++) {
      const key = `mono scrollOffset ${OFFSETS[i - 1]} -> ${OFFSETS[i]}`
      app.rerender(scene(OFFSETS[i]!))
      expect(coloredCells(app), key).toEqual([])
      expectIncrementalMatchesFresh(app, key)
    }
  })
})
