/**
 * @failure  A scroll container's `▼N` overflow indicator painted outside the
 *           clip it renders under. The container sat in a box one row taller
 *           than its `overflow="hidden"` parent, so its last content row, where
 *           the borderless indicator goes, lay outside the parent and on top of
 *           the status row below it. Every other paint of the container stayed
 *           clipped. The indicator row was blanked across the container's full
 *           width, and the fresh render hid that because the status row painted
 *           after it. An incremental frame that re-rendered the column (cursor
 *           move) and part of the status row (a badge unmounted) kept the
 *           status row's clean `📋 34` subtree on the fast path, so the blanked
 *           cells stayed: incremental " " vs fresh "📋" at (34, 9). Seen in km's
 *           render fuzz (scrolling-tiny / columns, seed 1337, 40x10) once
 *           flexily 883b7bf made the board one row taller than its frame.
 * @level    l2 (reconciler + flexily + render pipeline via createRenderer;
 *           painted rows and an explicit incremental-vs-fresh buffer compare)
 * @consumer every scroll container with `overflowIndicator` or a bordered edge
 *           whose rect reaches past an `overflow="hidden"` ancestor: km board
 *           columns above the status bar at short terminal heights, ListView
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { bufferToText, compareBuffers, createRenderer, formatMismatch } from "@silvery/test"
import { Box, Text } from "../../src/index.js"

const COLS = 40
const ROWS = 10
const LABELS = Array.from({ length: 30 }, (_, i) => `item-${i}`)

/**
 * The km board shape at 40x10: a 9-row clipping workspace whose 10-row board
 * pushes the column's viewport (rows 5-9) one row past the clip, above a
 * 1-row status bar on row 9. 30 items x (row + marker + label) plus chrome
 * keep the fixture at realistic scale.
 */
function Scene({ cursor, shift }: Readonly<{ cursor: number; shift: boolean }>) {
  return (
    <Box flexDirection="column" width={COLS} height={ROWS}>
      <Box id="workspace" flexDirection="column" height={ROWS - 1} flexShrink={0} overflow="hidden">
        <Box id="board" flexDirection="column" height={ROWS} flexShrink={0}>
          <Text>BOARD TITLE</Text>
          <Text> </Text>
          <Text> </Text>
          <Text> col1</Text>
          <Text>{"─".repeat(COLS)}</Text>
          <Box
            id="column"
            flexDirection="column"
            height={5}
            flexShrink={0}
            overflow="scroll"
            overflowIndicator
            scrollTo={cursor}
          >
            {LABELS.map((label, i) => (
              <Box key={label} flexDirection="row" height={1} flexShrink={0}>
                <Text>{i === cursor ? "▸ " : "  "}</Text>
                <Text backgroundColor={i === cursor ? "blue" : undefined}>{label}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Box id="status" flexDirection="row" height={1} flexShrink={0}>
        <Box flexDirection="row" flexGrow={1} gap={1}>
          {shift && <Text id="modifier">⇧</Text>}
          <Text id="path">MEM /fake/repo</Text>
        </Box>
        <Box flexShrink={0}>
          <Text id="count">📋 34</Text>
        </Box>
      </Box>
    </Box>
  )
}

function rowText(app: { text: string }, row: number): string {
  return app.text.split("\n")[row] ?? ""
}

describe("scroll indicator under a clipping ancestor", () => {
  test("the bottom indicator row outside the clip paints nothing over the status row", () => {
    const app = createRenderer({ cols: COLS, rows: ROWS })(<Scene cursor={12} shift />)

    // Positive control: the top indicator row is inside the clip and still paints.
    expect(rowText(app, 5)).toMatch(/▲\d+/)
    // The status row owns row 9. The column's `▼N` row is past the workspace clip.
    const status = rowText(app, 9)
    expect(status).toContain("⇧ MEM /fake/repo")
    expect(status).toContain("📋 34")
    expect(status).not.toMatch(/▼/)
  })

  test("a cursor move plus a partial status-row change keeps incremental equal to fresh", () => {
    const app = createRenderer({ cols: COLS, rows: ROWS })(<Scene cursor={12} shift />)

    // One frame re-renders the column (cursor move) AND part of the status row
    // (the badge unmounts) while the status row's right-hand counter stays clean.
    app.rerender(<Scene cursor={11} shift={false} />)

    const status = rowText(app, 9)
    expect(status).toContain("MEM /fake/repo")
    expect(status).not.toContain("⇧")
    expect(status, "the clean counter survives the column's re-render").toContain("📋 34")
    expect(status).not.toMatch(/▼/)

    const incremental = app.lastBuffer()
    expect(incremental).toBeDefined()
    const fresh = app.freshRender()
    const mismatch = compareBuffers(incremental!, fresh)
    if (mismatch) {
      expect.unreachable(
        formatMismatch(mismatch, {
          incrementalText: bufferToText(incremental!),
          freshText: bufferToText(fresh),
          key: "cursor 12 -> 11, badge unmounted",
        }),
      )
    }
  })
})
