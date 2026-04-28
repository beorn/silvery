/**
 * Regression: a horizontal divider built as a 1-row tall Box wrapping a long
 * `<Text wrap="wrap">{"─".repeat(N)}</Text>` must render as a single `─` row,
 * not get its glyphs replaced by an unrelated sibling's `│` glyphs.
 *
 * Production trigger: silvercode's `PaneGrid` renders splits as a tree of
 * row-splits and column-splits. A column-split (created by Ctrl+G s) drops a
 * `<PaneDivider direction="column">` between top and bottom panes:
 *
 *     <Box flexShrink={0} flexGrow={0} flexBasis={1} height={1} flexDirection="row">
 *       <Box flexGrow={1} flexShrink={1}>
 *         <Text color="$border" wrap="wrap">{"─".repeat(400)}</Text>
 *       </Box>
 *     </Box>
 *
 * Inside a row-split, a sibling `<PaneDivider direction="row">` renders the
 * vertical `│` divider via the same shape with a 1-COL tall Box. After silvery
 * merged feat/paint-clear-invariant (L4 ExcessClearGate, c7cf9390) and
 * feat/paint-clear-l5-step5-outline-snapshots (78c63075), the horizontal
 * divider's `─` glyphs were getting overwritten by `│` glyphs on incremental
 * renders that mounted/unmounted siblings.
 *
 * The repro mirrors the silvercode test sequence:
 *   1. start single pane (no dividers)
 *   2. Ctrl+G v -> row split  -> renders `│` divider for the first time
 *   3. Ctrl+G s on the right pane -> the right child becomes a column split,
 *      mounting an `─` divider AND a `│` sibling under the original `│`
 *
 * Bead: km-silvercode.pane-2d-horizontal-divider.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

const COLS = 80
const ROWS = 20

// PaneDivider pattern: fill cross-axis with repeated unbreakable chars under a
// pinned main-axis size. CSS §4.5 auto-min-size applies recursively to the
// inner Box (`flexGrow=1 flexShrink=1` defaults to `min-*: auto`) AND to the
// Text node — both of which would otherwise pin to the longest unbreakable
// token's width (200 cells). `minWidth={0}` / `minHeight={0}` is the canonical
// CSS escape hatch on both the inner Box and the Text, per silvery's
// "Containers narrower than the longest unbreakable word" rule. Without it,
// the divider's wrap-Text overflows past its parent's pinned size and bleeds
// glyphs into sibling regions on a CSS-correct fresh render.
function VDivider(): React.ReactElement {
  return (
    <Box flexShrink={0} flexGrow={0} flexBasis={1} width={1} flexDirection="column">
      <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
        <Text color="cyan" wrap="wrap" minWidth={0}>
          {"│".repeat(200)}
        </Text>
      </Box>
    </Box>
  )
}

function HDivider(): React.ReactElement {
  return (
    <Box flexShrink={0} flexGrow={0} flexBasis={1} height={1} flexDirection="row">
      <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
        <Text color="magenta" wrap="wrap" minHeight={0}>
          {"─".repeat(400)}
        </Text>
      </Box>
    </Box>
  )
}

function Pane({ label }: { label: string }): React.ReactElement {
  return (
    <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} flexDirection="column">
      <Text>{label}</Text>
    </Box>
  )
}

// "Tree" type: union of split kinds matching silvercode's pane layout.
// "single" = one pane, no dividers.
// "vsplit" = row-direction split (panes side-by-side, vertical `│` divider).
// "vsplit-then-hsplit-right" = vsplit, then the right pane became a column-split
//                              (top/bottom with horizontal `─` divider).
type Tree = "single" | "vsplit" | "vsplit-then-hsplit-right"

function App({ tree }: { tree: Tree }): React.ReactElement {
  if (tree === "single") {
    return (
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} flexDirection="row" minHeight={0} minWidth={0}>
          <Box
            flexGrow={1}
            flexShrink={1}
            minWidth={0}
            minHeight={0}
            flexDirection="column"
          >
            <Pane label="A" />
          </Box>
        </Box>
      </Box>
    )
  }
  if (tree === "vsplit") {
    return (
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} flexDirection="row" minHeight={0} minWidth={0}>
          <Box
            flexGrow={0}
            flexShrink={1}
            flexBasis="50%"
            minWidth={0}
            minHeight={0}
            flexDirection="column"
          >
            <Pane label="A" />
          </Box>
          <VDivider />
          <Box
            flexGrow={0}
            flexShrink={1}
            flexBasis="50%"
            minWidth={0}
            minHeight={0}
            flexDirection="column"
          >
            <Pane label="B" />
          </Box>
        </Box>
      </Box>
    )
  }
  // vsplit-then-hsplit-right: outer vsplit; right pane is now a column-split
  // (B-top / `─` / C-bot)
  return (
    <Box width={COLS} height={ROWS} flexDirection="column">
      <Box flexGrow={1} flexShrink={1} flexDirection="row" minHeight={0} minWidth={0}>
        <Box
          flexGrow={0}
          flexShrink={1}
          flexBasis="50%"
          minWidth={0}
          minHeight={0}
          flexDirection="column"
        >
          <Pane label="A" />
        </Box>
        <VDivider />
        <Box
          flexGrow={0}
          flexShrink={1}
          flexBasis="50%"
          minWidth={0}
          minHeight={0}
          flexDirection="column"
        >
          {/* inner column-split */}
          <Box flexGrow={1} flexShrink={1} flexDirection="column" minHeight={0} minWidth={0}>
            <Box
              flexGrow={0}
              flexShrink={1}
              flexBasis="50%"
              minWidth={0}
              minHeight={0}
              flexDirection="column"
            >
              <Pane label="B" />
            </Box>
            <HDivider />
            <Box
              flexGrow={0}
              flexShrink={1}
              flexBasis="50%"
              minWidth={0}
              minHeight={0}
              flexDirection="column"
            >
              <Pane label="C" />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

describe("regression: horizontal divider in mixed split tree (km-silvercode.pane-2d-horizontal-divider)", () => {
  test("Ctrl+G s — single -> column-split renders horizontal `─` divider", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    // single pane first (establishes prev buffer)
    const app = render(<App tree="single" />)
    expect(app.text).not.toContain("─")
    // Now mount a horizontal-divider-only split. Use a tiny variant: vsplit
    // first then we'll go to the mixed tree — but the simplest variant is to
    // just go single -> column-split. We don't have a direct column-split
    // case in App; replicate it inline:
    function HSplitOnly(): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} flexDirection="column" minHeight={0} minWidth={0}>
            <Box
              flexGrow={0}
              flexShrink={1}
              flexBasis="50%"
              minWidth={0}
              minHeight={0}
              flexDirection="column"
            >
              <Pane label="A" />
            </Box>
            <HDivider />
            <Box
              flexGrow={0}
              flexShrink={1}
              flexBasis="50%"
              minWidth={0}
              minHeight={0}
              flexDirection="column"
            >
              <Pane label="B" />
            </Box>
          </Box>
        </Box>
      )
    }
    app.rerender(<HSplitOnly />)
    expect(app.text, "after column split, expected `─`:\n" + app.text).toContain("─")
  })

  test("vsplit -> mixed split: `─` divider appears alongside `│` divider", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    // single pane first
    const app = render(<App tree="single" />)
    // vsplit
    app.rerender(<App tree="vsplit" />)
    expect(app.text).toContain("│")
    expect(app.text).not.toContain("─")
    // mixed (vsplit + inner hsplit on right)
    app.rerender(<App tree="vsplit-then-hsplit-right" />)
    const text = app.text
    expect(text, "after mixed split, expected `│` AND `─`:\n" + text).toContain("│")
    expect(text, "after mixed split, expected `─`:\n" + text).toContain("─")
  })

  test("horizontal divider row contains only `─` glyphs (no `│` clobber)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<App tree="single" />)
    app.rerender(<App tree="vsplit" />)
    app.rerender(<App tree="vsplit-then-hsplit-right" />)

    // Find the row that should be the horizontal divider — the row whose
    // first non-blank cell is `─`. That row should contain ONLY `─` and
    // spaces (and possibly the active-bar `▎` or whatever pane chrome
    // exists). It must NOT contain `│` outside the leftmost column where
    // the outer vsplit divider is.
    const lines = app.text.split("\n")
    // The horizontal divider should sit inside the right half (cols 41..79
    // in our 80-col viewport). The vertical divider sits at col 40.
    // Find a row that contains `─` somewhere on the right half.
    const dashRow = lines.find((line) => {
      const right = line.slice(41)
      return right.includes("─")
    })
    expect(
      dashRow,
      "no horizontal-divider row found in right half:\n" + app.text,
    ).toBeTruthy()
    // The `─` segment in the right half should be uninterrupted by `│`.
    const right = dashRow!.slice(41)
    expect(
      right.includes("│"),
      "horizontal divider row was clobbered by `│`:\n" + dashRow,
    ).toBe(false)
  })

  test("fresh render and incremental render agree on divider glyphs (paint-clear invariant)", () => {
    // Two renderers — one always fresh, one incremental — must produce
    // identical output. SILVERY_STRICT does this internally; this test
    // is a coarse top-level guard that survives even when STRICT is off.
    const r1 = createRenderer({ cols: COLS, rows: ROWS })
    const r2 = createRenderer({ cols: COLS, rows: ROWS })

    const incremental = r1(<App tree="single" />)
    incremental.rerender(<App tree="vsplit" />)
    incremental.rerender(<App tree="vsplit-then-hsplit-right" />)

    const fresh = r2(<App tree="vsplit-then-hsplit-right" />)

    expect(incremental.text).toBe(fresh.text)
  })
})
