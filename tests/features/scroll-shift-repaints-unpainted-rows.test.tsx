/**
 * @failure  A pure scroll (Tier 1 buffer shift) kept pixels for rows the
 *           children never painted in the previous frame:
 *           1. Under a borderless `overflowIndicator`, the row under last
 *              frame's `▼N` (or `▲N`) moved into the content area with the
 *              shift, and the item now on that row was never painted.
 *              Incremental showed a blank row and a stale glyph where fresh
 *              showed the item: `(19,14)` held `▼` and `(4..10,14)` were blank
 *              on a 30 -> 31 scroll. The check for "fully visible last frame"
 *              used the raw viewport, not the rows the children were allowed
 *              to paint, so that child was skipped. And the "clear the old
 *              indicator rows before the shift" cleanup landed AFTER the shift
 *              under the sectioned render plan (transfer -> cleanup -> paint),
 *              so it cleared the wrong rows.
 *           2. Under an ancestor `overflow="hidden"` that hides some viewport
 *              rows, a child scrolled out from under the clip counted as
 *              painted, so its row showed the shift's blank fill.
 * @level    l2 (reconciler + flexily + render pipeline via createRenderer;
 *           painted rows and an explicit incremental-vs-fresh buffer compare)
 * @consumer every scroll container that scrolls without its rows changing:
 *           km board columns (borderless indicators, clipped by the workspace
 *           at short terminal heights), ListView
 * @testonly none
 */

import React from "react"
import { afterEach, describe, expect, test } from "vitest"
import { bufferToText, compareBuffers, createRenderer, formatMismatch } from "@silvery/test"
import { Box, Text } from "../../src/index.js"

const ITEMS = 60
const GUTTER = 4
const WIDTH = 30
const VIEWPORT = 12

function items() {
  return Array.from({ length: ITEMS }, (_, i) => (
    <Box key={i} flexDirection="row" height={1} flexShrink={0}>
      <Text>{`item-${i}`}</Text>
    </Box>
  ))
}

/**
 * Sixty static one-row items in a borderless scroll container with overflow
 * indicators, beside a gutter so the container does not start at column 0.
 * Only `scrollOffset` changes between frames, which is the Tier 1 (buffer
 * shift) precondition: no child, layout, or style change in the same frame.
 */
function IndicatorScene({ offset, bg }: Readonly<{ offset: number; bg?: string }>) {
  return (
    <Box width={50} height={16} flexDirection="row">
      <Box width={GUTTER} flexDirection="column" backgroundColor="#440000">
        <Text>L</Text>
      </Box>
      <Box
        flexDirection="column"
        width={WIDTH}
        height={VIEWPORT}
        overflow="scroll"
        overflowIndicator
        scrollOffset={offset}
        backgroundColor={bg}
      >
        {items()}
      </Box>
    </Box>
  )
}

const CLIP_TOP = 1
const CLIP_ROWS = 8

/**
 * The same static items, no indicators, in a 12-row scroll container inside an
 * 8-row `overflow="hidden"` box. `cut` pulls the container up under the clip's
 * top edge, so the clip hides `cut` viewport rows above and the rest below.
 */
function ClippedScene({ offset, cut }: Readonly<{ offset: number; cut: number }>) {
  return (
    <Box width={50} height={16} flexDirection="column">
      <Box height={CLIP_TOP}>
        <Text>header</Text>
      </Box>
      <Box width={40} height={CLIP_ROWS} overflow="hidden" flexShrink={0} flexDirection="column">
        <Box marginTop={-cut} flexShrink={0} flexDirection="column">
          <Box
            flexDirection="column"
            width={WIDTH}
            height={VIEWPORT}
            flexShrink={0}
            overflow="scroll"
            scrollOffset={offset}
          >
            {items()}
          </Box>
        </Box>
      </Box>
      <Box height={2}>
        <Text>footer below the clip</Text>
      </Box>
    </Box>
  )
}

type App = ReturnType<ReturnType<typeof createRenderer>>

function screenRow(app: App, row: number, from = 0): string {
  return (app.text.split("\n")[row] ?? "").slice(from, from + WIDTH).trimEnd()
}

/**
 * At a mid-list offset the first and last viewport rows carry `▲N` and `▼N`,
 * and every row between them shows its own item. At offset 0 there is no top
 * indicator, so the first row shows `item-0`.
 */
function expectIndicatorRows(app: App, offset: number): void {
  for (let row = 0; row < VIEWPORT; row++) {
    const text = screenRow(app, row, GUTTER)
    const indicatorRow = row === VIEWPORT - 1 || (row === 0 && offset > 0)
    if (indicatorRow) {
      expect(text, `offset ${offset}: row ${row} is an indicator row`).toMatch(/^\s*[▲▼]\d+$/)
    } else {
      expect(text, `offset ${offset}: row ${row} shows its item`).toBe(`item-${offset + row}`)
    }
  }
}

/** Every row inside the clip shows the item scrolled to it. */
function expectClippedRows(app: App, offset: number, cut: number): void {
  for (let i = 0; i < CLIP_ROWS; i++) {
    const row = CLIP_TOP + i
    expect(screenRow(app, row), `offset ${offset}: screen row ${row}`).toBe(
      `item-${offset + cut + i}`,
    )
  }
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

// Down by 1, 2; up by 1, 3, a long jump; then the top indicator retires (0)
// and returns (1).
const OFFSETS = [20, 21, 23, 22, 19, 5, 1, 0, 1]

const originalRenderPlan = process.env.SILVERY_RENDER_PLAN
afterEach(() => {
  if (originalRenderPlan === undefined) delete process.env.SILVERY_RENDER_PLAN
  else process.env.SILVERY_RENDER_PLAN = originalRenderPlan
})

describe("a pure scroll shift repaints the rows the children did not paint last frame", () => {
  // The sectioned render plan (the default) commits transfer -> cleanup ->
  // paint; SILVERY_RENDER_PLAN=0 applies ops in emission order. The shift must
  // agree in both, so the fix cannot lean on either ordering.
  describe.each([
    { plan: "sectioned plan (default)", env: undefined },
    { plan: "direct emission order", env: "0" },
  ])("$plan", ({ env }) => {
    test.each([
      { label: "no background", bg: undefined },
      { label: "own background", bg: "#123456" },
    ])("the rows last frame's borderless indicators held: $label", ({ bg }) => {
      if (env === undefined) delete process.env.SILVERY_RENDER_PLAN
      else process.env.SILVERY_RENDER_PLAN = env

      const app = createRenderer({ cols: 50, rows: 16 })(
        <IndicatorScene offset={OFFSETS[0]!} bg={bg} />,
      )
      expectIndicatorRows(app, OFFSETS[0]!)

      for (let i = 1; i < OFFSETS.length; i++) {
        const offset = OFFSETS[i]!
        app.rerender(<IndicatorScene offset={offset} bg={bg} />)
        expectIndicatorRows(app, offset)
        expectIncrementalMatchesFresh(app, `scrollOffset ${OFFSETS[i - 1]} -> ${offset}`)
      }
    })
  })

  test.each([
    { label: "an ancestor clip hides the bottom rows", cut: 0 },
    { label: "an ancestor clip hides rows above and below", cut: 3 },
  ])("the rows $label", ({ cut }) => {
    const app = createRenderer({ cols: 50, rows: 16 })(
      <ClippedScene offset={OFFSETS[0]!} cut={cut} />,
    )
    expectClippedRows(app, OFFSETS[0]!, cut)

    for (let i = 1; i < OFFSETS.length; i++) {
      const offset = OFFSETS[i]!
      app.rerender(<ClippedScene offset={offset} cut={cut} />)
      expectClippedRows(app, offset, cut)
      expectIncrementalMatchesFresh(app, `scrollOffset ${OFFSETS[i - 1]} -> ${offset}`)
    }
  })
})
