/**
 * `tableHeightAt` must agree with what `Content.Table` actually renders.
 *
 * The function exists so a lane policy can compare candidate widths by rows
 * cost rather than by intrinsic width. That is only useful if the number is
 * the REAL number, so every case below renders the same table at the same
 * width and compares — an oracle that drifts from the renderer is worse than
 * none, because a policy would silently choose against reality.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Content, tableHeightAt, type Column } from "../../packages/ag-react/src/index"

type Row = readonly string[]

const HEADERS = [
  "bucket",
  "contents, and where it is today",
  "size",
  "creation",
  "editing",
  "deletion",
]
const ROWS: Row[] = [
  [
    "wt/",
    "worktrees, bays and every registered checkout on this host",
    "175G",
    "/worktree, yrd env open --bay, seat launch",
    "no doc",
    "/worktree Chief-owned cleanup, proof obligations, no runner",
  ],
  [
    "tmp/",
    "scratch, any owner, 25h and anything at all",
    "81G",
    "none, by design",
    "no doc",
    "none",
  ],
  ["cache/", "build caches", "47G", "bun, nix", "n/a", "no doc"],
]

/** The same columns `Content.Table` builds for a document table. */
function columnsFor(headers: readonly string[]): Column<Row>[] {
  return headers.map((header, index) => ({
    header,
    render: (row: Row) => row[index] ?? "",
    minWidth: 3,
    shrink: true,
  }))
}

/** Rows the rendered table actually occupies, header rule through last body row. */
function renderedHeight(headers: readonly string[], rows: readonly Row[], width: number): number {
  const render = createRenderer({ cols: width + 4, rows: 200 })
  const app = render(
    <Box width={width}>
      <Content.Layout fill={false} prose={width} wide={width}>
        <Content.Row>
          <Content.Body width="prose">
            <Content.Table headers={[...headers]} rows={rows.map((row) => [...row])} />
          </Content.Body>
        </Content.Row>
      </Content.Layout>
    </Box>,
  )
  const used = app.lines
    .map((line, index) => (line.trim().length > 0 ? index : -1))
    .filter((index) => index >= 0)
  const first = used[0]
  const last = used.at(-1)
  return first === undefined || last === undefined ? 0 : last - first + 1
}

describe("tableHeightAt", () => {
  // A grid this dense is the whole point: at 60 columns every cell wraps
  // several times, at 200 almost none do, and the predicted delta between
  // those is exactly the number a lane policy would weigh.
  test.each([60, 80, 100, 140, 200])("predicts the rendered height at %i columns", (width) => {
    expect(tableHeightAt(columnsFor(HEADERS), ROWS, width)).toBe(
      renderedHeight(HEADERS, ROWS, width),
    )
  })

  test("a narrow table is unaffected by width — and the oracle says so too", () => {
    const headers = ["k", "v"]
    const rows: Row[] = [
      ["a", "one"],
      ["b", "two"],
    ]
    const columns = columnsFor(headers)
    expect(tableHeightAt(columns, rows, 80)).toBe(renderedHeight(headers, rows, 80))
    expect(tableHeightAt(columns, rows, 200)).toBe(tableHeightAt(columns, rows, 80))
  })

  test("height falls as width grows, and never rises", () => {
    const columns = columnsFor(HEADERS)
    const heights = [60, 80, 100, 140, 200].map((width) => tableHeightAt(columns, ROWS, width))
    for (let index = 1; index < heights.length; index++) {
      expect(heights[index]!).toBeLessThanOrEqual(heights[index - 1]!)
    }
    // Anti-vacuous: a constant series would satisfy monotonicity and measure
    // nothing, so the wide end must actually be shorter than the narrow end.
    expect(heights.at(-1)!).toBeLessThan(heights[0]!)
  })

  test("degenerate inputs answer zero rather than guessing", () => {
    expect(tableHeightAt([], ROWS, 80)).toBe(0)
    expect(tableHeightAt(columnsFor(HEADERS), ROWS, 0)).toBe(0)
  })
})
