/**
 * @failure  A column hands its flexGrow child rows that belong to a sibling:
 *           an auto-height Box holding a row (a 2-cell gutter beside a
 *           flexGrow column) whose text wraps is pre-measured with the row's
 *           children unconstrained, so the text counts one line and the Box's
 *           flex base size is (wrapped lines - 1) rows short. The Box is later
 *           laid out at its true height, but the flexGrow list already took
 *           the missing rows: every box below lands that many rows too low and
 *           the last ones fall off the frame. The operator saw it 2026-09-05
 *           in yrd watch at 120x30 (STATS border on the footer row, pills row
 *           never on screen); flexily 0.7.3 under silvery 0.24.1.
 * @level    l2 (real render through the reconciler and flexily; rects read
 *           from the laid-out nodes, then the painted text)
 * @consumer every column with a bordered card, a marker gutter or a status
 *           box whose rows carry wrapped text: yrd watch RUNNER, its detail
 *           pane, km cards
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "../../packages/ag-react/src/components/Box"
import { Text } from "../../packages/ag-react/src/components/Text"

const RAIL =
  "paused by @ci since Sep 5, 2026, 8:51:32 AM PDT: CI garage: M8 git-process prerequisite merged as " +
  "4431d6d8ad163ef1d560963f3f70782f4ffca156; full round audit and remaining M8 reconciliation before another " +
  "admission; no service activation"

/** The yrd MarkerRow shape: a marker gutter beside a flexGrow column. */
function MarkerRow({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Box flexDirection="row" minWidth={0} width="100%">
      <Box width={2} flexShrink={0}>
        <Text>⚠</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexBasis={0} minWidth={0}>
        {children}
      </Box>
    </Box>
  )
}

/**
 * The frame: an auto-height head (flexShrink 0) around the rail, a header
 * line, a flexGrow list, a pills line, a fixed 9-row STATS box, a footer line.
 */
function Frame({ rail, cols }: Readonly<{ rail: React.ReactNode; cols: number }>) {
  return (
    <Box flexDirection="column" width={cols} height={30}>
      <Box id="head" flexDirection="column" flexShrink={0}>
        <Text>RUNNER-TOP</Text>
        {rail}
        <Text>RUNNER-BOTTOM</Text>
      </Box>
      <Text>HEADER</Text>
      <Box id="list" flexDirection="column" flexGrow={1} minHeight={0}>
        {Array.from({ length: 40 }, (_, i) => (
          <Text key={i} wrap="truncate">{`row-${i}`}</Text>
        ))}
      </Box>
      <Box id="pills">
        <Text>PILLS</Text>
      </Box>
      <Box id="stats" height={9} flexShrink={0} flexDirection="column">
        <Text>STATS</Text>
      </Box>
      <Box id="footer">
        <Text>FOOTER</Text>
      </Box>
    </Box>
  )
}

function rects(rail: React.ReactNode, cols: number) {
  const app = createRenderer({ cols, rows: 30 })(<Frame rail={rail} cols={cols} />)
  const rect = (id: string) => {
    const node = app.locator(`#${id}`).resolve()
    if (!node?.boxRect) throw new Error(`no #${id} box was laid out`)
    return node.boxRect
  }
  const lines = app.text.split("\n")
  const line = (label: string) => lines.findIndex((l) => l.startsWith(label))
  const out = {
    headHeight: rect("head").height,
    listHeight: rect("list").height,
    pillsY: rect("pills").y,
    statsY: rect("stats").y,
    footerY: rect("footer").y,
    paintedPills: line("PILLS"),
    paintedFooter: line("FOOTER"),
  }
  app.unmount()
  return out
}

describe("a column's flex base size for a child holding a row with wrapped text", () => {
  test("control: the rail directly in the head column fits the frame", () => {
    expect(rects(<Text wrap="wrap">{RAIL}</Text>, 120)).toEqual({
      headHeight: 5,
      listHeight: 13,
      pillsY: 19,
      statsY: 20,
      footerY: 29,
      paintedPills: 19,
      paintedFooter: 29,
    })
  })

  test("control: the rail pre-wrapped into truncate rows inside the marker row fits the frame", () => {
    const rows = [RAIL.slice(0, 110), RAIL.slice(110, 220), RAIL.slice(220)]
    const rail = (
      <MarkerRow>
        {rows.map((row) => (
          <Text key={row} wrap="truncate">
            {row}
          </Text>
        ))}
      </MarkerRow>
    )
    expect(rects(rail, 120)).toEqual({
      headHeight: 5,
      listHeight: 13,
      pillsY: 19,
      statsY: 20,
      footerY: 29,
      paintedPills: 19,
      paintedFooter: 29,
    })
  })

  test("the wrapped rail inside the marker row: the list gets no rows that belong to STATS and the footer", () => {
    const rail = (
      <MarkerRow>
        <Text wrap="wrap" minWidth={0}>
          {RAIL}
        </Text>
      </MarkerRow>
    )
    // Measured 2026-09-05 (flexily 0.7.3): listHeight 15, pillsY 21, statsY 22, footerY 31.
    expect(rects(rail, 120)).toEqual({
      headHeight: 5,
      listHeight: 13,
      pillsY: 19,
      statsY: 20,
      footerY: 29,
      paintedPills: 19,
      paintedFooter: 29,
    })
  })

  test("at 200 columns the rail wraps to two lines and the frame still fits", () => {
    const rail = (
      <MarkerRow>
        <Text wrap="wrap" minWidth={0}>
          {RAIL}
        </Text>
      </MarkerRow>
    )
    // Measured 2026-09-05 (flexily 0.7.3): headHeight 4 after layout but listHeight 15, pillsY 20, statsY 21, footerY 30.
    expect(rects(rail, 200)).toEqual({
      headHeight: 4,
      listHeight: 14,
      pillsY: 19,
      statsY: 20,
      footerY: 29,
      paintedPills: 19,
      paintedFooter: 29,
    })
  })
})
