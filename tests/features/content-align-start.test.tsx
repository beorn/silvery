/**
 * @failure Finite prose and DocumentView bodies centre despite align=start.
 * @level l2
 * @consumer Public Content.Layout/Row/Body and DocumentView render consumers.
 * @testonly none
 * Content.Layout align="start" — the prose lane sits flush at the left gutter
 * floor when the pane is wider than the prose column (#30395).
 *
 * ProseLane keeps a fixed-width prose column between two gutters inside a
 * width-100% row. When the pane is wider than prose + gutter floors, the slack
 * has to go somewhere: `center` splits it between both gutters; `start` must
 * leave it all in the right gutter so the lane is flush left. The outer row's
 * `justifyContent` cannot do that job because its only child is already full
 * width. Every existing suite renders prose="100%", which consumes the slack
 * and so never sees the difference.
 *
 * Assertions render the buffer and read the first painted text column (The
 * Silvery Way §10). Runs at SILVERY_STRICT=2 (default test setup).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Content, DocumentView, Text, type DocumentBlock } from "silvery"

type Align = "start" | "center" | "stretch"

const ROWS = 24
const MARKER = "alpha-0"

/** Column of the first cell of MARKER on the first row that paints it. */
function markerColumn(app: { text: string }): number {
  const row = app.text.split("\n").find((line) => line.includes(MARKER))
  expect(row, `no row paints ${MARKER}:\n${app.text}`).toBeDefined()
  return row!.indexOf(MARKER)
}

/** The public lane API: Content.Layout → Content.Row → Content.Body width="prose". */
function renderLane(align: Align, width: number, prose: number) {
  const r = createRenderer({ cols: width, rows: ROWS })
  return r(
    <Box width={width} height={ROWS}>
      <Content.Layout fill={false} prose={prose} align={align}>
        <Content.Row>
          <Content.Body width="prose">
            <Text>{MARKER} prose lane text</Text>
          </Content.Body>
        </Content.Row>
      </Content.Layout>
    </Box>,
  )
}

/** 60 paragraphs: the DocumentView path maddoc's body takes. */
const PARAGRAPHS: readonly DocumentBlock[] = Array.from({ length: 60 }, (_, index) => ({
  id: `p-${index}`,
  kind: "paragraph" as const,
  content: `alpha-${index} beta gamma delta epsilon zeta eta theta`,
}))

/**
 * DocumentView switches to compact (prose="100%") below the md breakpoint
 * (90 cols), so the document fixtures stay at 90 and above.
 */
function renderDocument(align: Align, width: number, prose: number) {
  const r = createRenderer({ cols: width, rows: ROWS })
  return r(
    <Box width={width} height={ROWS}>
      <Content.Layout fill={false} prose={prose} align={align}>
        <DocumentView blocks={PARAGRAPHS} />
      </Content.Layout>
    </Box>,
  )
}

describe("Content.Layout align — Content.Row / Content.Body (prose 40, gutter floor 1)", () => {
  // Pane 80: 80 − 40 prose − 2 gutter floors = 38 columns of slack.
  test("AC1 align=start: the lane is flush at column 1 and the slack sits in the right gutter", () => {
    const app = renderLane("start", 80, 40)
    expect(markerColumn(app)).toBe(1)
  })

  test("AC2 align=center: the slack splits, text starts at column 20 (control)", () => {
    const app = renderLane("center", 80, 40)
    expect(markerColumn(app)).toBe(20)
  })

  test("AC3 zero slack (pane 42): start and center both paint at column 1 (control)", () => {
    expect(markerColumn(renderLane("start", 42, 40))).toBe(1)
    expect(markerColumn(renderLane("center", 42, 40))).toBe(1)
  })

  test("AC4 align=stretch keeps today's geometry: text starts at column 20", () => {
    const app = renderLane("stretch", 80, 40)
    expect(markerColumn(app)).toBe(20)
  })
})

describe("Content.Layout align — DocumentView body (prose 87)", () => {
  // Pane 90 is the smallest non-compact width. DocumentView reserves 2 cells
  // on the left and 1 on the right for paragraphs, so 90 − 87 − 3 = 0 slack.
  test("zero slack (pane 90): start and center agree on the first text column (control)", () => {
    const startColumn = markerColumn(renderDocument("start", 90, 87))
    const centerColumn = markerColumn(renderDocument("center", 90, 87))
    expect(startColumn).toBe(centerColumn)
  })

  test("AC1 align=start at pane 120: the body paints at the same column as with zero slack", () => {
    const flush = markerColumn(renderDocument("start", 90, 87))
    const wide = markerColumn(renderDocument("start", 120, 87))
    expect(wide).toBe(flush)
  })

  test("AC2 align=center at pane 120: the body moves right by half the slack (control)", () => {
    const flush = markerColumn(renderDocument("center", 90, 87))
    const wide = markerColumn(renderDocument("center", 120, 87))
    // 120 − 87 − 3 = 30 columns of slack, 15 to each gutter.
    expect(wide).toBe(flush + 15)
  })
})
