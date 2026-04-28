/**
 * flexDirection prop change on rerender (km-silvery.flexdirection-reuse-bug).
 *
 * Reported: when an AgNode is reused across renders (same key/position) but its
 * `flexDirection` prop changes (e.g. "row" → "column"), the rendered terminal
 * output retains the OLD layout direction. The change is reflected in React's
 * tree state but allegedly not in silvery's layout output.
 *
 * Repro shape: a SplitRenderer-like tree where a parent Box flips
 * flexDirection on rerender while its two child Box wrappers remain in place.
 *
 * Expected: A and B are side-by-side in "row" mode, stacked vertically in
 * "column" mode. Verified incremental == fresh under SILVERY_STRICT.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("Box flexDirection prop change on rerender", () => {
  test("row → column transition updates layout direction", () => {
    const COLS = 40
    const ROWS = 6
    const r = createRenderer({ cols: COLS, rows: ROWS })

    const App = ({ direction }: { direction: "row" | "column" }) => (
      <Box width={COLS} height={ROWS} flexDirection={direction}>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <Text>A</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <Text>B</Text>
        </Box>
      </Box>
    )

    const app = r(<App direction="row" />)
    // Row layout: A on left, B on right, both row 0
    expect(stripAnsi(app.lines[0]!)).toMatch(/A.*B/)

    app.rerender(<App direction="column" />)
    // Column layout: A on row 0, B somewhere below row 0 (parent height 6, two equal children → row 3)
    expect(stripAnsi(app.lines[0]!)).toMatch(/^A/)
    // B must NOT be on row 0 anymore
    expect(stripAnsi(app.lines[0]!)).not.toMatch(/B/)
    // B should appear in a later row
    const bRow = app.lines.findIndex((l, i) => i > 0 && stripAnsi(l).startsWith("B"))
    expect(bRow).toBeGreaterThan(0)
  })

  test("column → row transition updates layout direction", () => {
    const COLS = 40
    const ROWS = 6
    const r = createRenderer({ cols: COLS, rows: ROWS })

    const App = ({ direction }: { direction: "row" | "column" }) => (
      <Box width={COLS} height={ROWS} flexDirection={direction}>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <Text>A</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <Text>B</Text>
        </Box>
      </Box>
    )

    const app = r(<App direction="column" />)
    expect(stripAnsi(app.lines[0]!)).toMatch(/^A/)
    expect(stripAnsi(app.lines[0]!)).not.toMatch(/B/)

    app.rerender(<App direction="row" />)
    // Row layout: A and B on the same row 0
    expect(stripAnsi(app.lines[0]!)).toMatch(/A.*B/)
  })

  test("split-renderer pattern (SplitRenderer-shaped wrapper) updates direction", () => {
    // Mimics silvercode SplitRenderer: outer Box with flexDirection, child Boxes
    // each containing "session content" (a single Text). The shape that triggered
    // the original investigation.
    const COLS = 60
    const ROWS = 10
    const r = createRenderer({ cols: COLS, rows: ROWS })

    const SplitRenderer = ({ direction }: { direction: "row" | "column" }) => (
      <Box width={COLS} height={ROWS} flexDirection={direction}>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <Box>
            <Text>session-A</Text>
          </Box>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <Box>
            <Text>session-B</Text>
          </Box>
        </Box>
      </Box>
    )

    const app = r(<SplitRenderer direction="row" />)
    expect(stripAnsi(app.lines[0]!)).toMatch(/session-A.*session-B/)

    app.rerender(<SplitRenderer direction="column" />)
    expect(stripAnsi(app.lines[0]!)).toMatch(/session-A/)
    expect(stripAnsi(app.lines[0]!)).not.toMatch(/session-B/)
    const bRow = app.lines.findIndex(
      (l, i) => i > 0 && stripAnsi(l).startsWith("session-B"),
    )
    expect(bRow).toBeGreaterThan(0)
  })

  test("leaf → row split → column split (silvercode race shape)", () => {
    // Mimics silvercode's reconcileTree path: a single leaf becomes a row split,
    // then on the next rerender the same split flips to column. The underlying
    // <Box> element with flexDirection={node.direction} is reused (same
    // structural position), only the prop changes.
    const COLS = 60
    const ROWS = 10
    const r = createRenderer({ cols: COLS, rows: ROWS })

    type Tree =
      | { kind: "leaf"; id: string }
      | { kind: "split"; direction: "row" | "column"; children: [Tree, Tree] }

    function NodeRenderer({ node }: { node: Tree }): React.ReactElement {
      if (node.kind === "leaf") {
        return (
          <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
            <Text>{node.id}</Text>
          </Box>
        )
      }
      return (
        <Box
          flexDirection={node.direction}
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          minHeight={0}
        >
          <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
            <NodeRenderer node={node.children[0]} />
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
            <NodeRenderer node={node.children[1]} />
          </Box>
        </Box>
      )
    }

    const App = ({ tree }: { tree: Tree }) => (
      <Box width={COLS} height={ROWS} flexDirection="row">
        <NodeRenderer node={tree} />
      </Box>
    )

    // Start with a single leaf "A"
    const treeLeaf: Tree = { kind: "leaf", id: "A" }
    const app = r(<App tree={treeLeaf} />)
    expect(stripAnsi(app.lines[0]!)).toMatch(/A/)

    // Split into row [A, B]
    const treeRow: Tree = {
      kind: "split",
      direction: "row",
      children: [
        { kind: "leaf", id: "A" },
        { kind: "leaf", id: "B" },
      ],
    }
    app.rerender(<App tree={treeRow} />)
    expect(stripAnsi(app.lines[0]!)).toMatch(/A.*B/)

    // Same split, but flip to column (the prop-change-on-reused-node sequence)
    const treeCol: Tree = {
      kind: "split",
      direction: "column",
      children: [
        { kind: "leaf", id: "A" },
        { kind: "leaf", id: "B" },
      ],
    }
    app.rerender(<App tree={treeCol} />)
    expect(stripAnsi(app.lines[0]!)).toMatch(/^A/)
    expect(stripAnsi(app.lines[0]!)).not.toMatch(/B/)
    const bRow = app.lines.findIndex(
      (l, i) => i > 0 && stripAnsi(l).startsWith("B"),
    )
    expect(bRow).toBeGreaterThan(0)
  })

  test("alternating row ↔ column repeatedly stays in sync", () => {
    const COLS = 40
    const ROWS = 6
    const r = createRenderer({ cols: COLS, rows: ROWS })

    const App = ({ direction }: { direction: "row" | "column" }) => (
      <Box width={COLS} height={ROWS} flexDirection={direction}>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <Text>A</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          <Text>B</Text>
        </Box>
      </Box>
    )

    const app = r(<App direction="row" />)
    expect(stripAnsi(app.lines[0]!)).toMatch(/A.*B/)

    for (let i = 0; i < 4; i++) {
      app.rerender(<App direction="column" />)
      expect(stripAnsi(app.lines[0]!)).toMatch(/^A/)
      expect(stripAnsi(app.lines[0]!)).not.toMatch(/B/)

      app.rerender(<App direction="row" />)
      expect(stripAnsi(app.lines[0]!)).toMatch(/A.*B/)
    }
  })
})
