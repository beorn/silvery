/**
 * @failure  A tab bar that wraps onto two lines is laid out one line tall, so
 *           the panel under it paints over the second line of tabs. The bar is
 *           a flex-wrapped ROW inside the auto-height Tabs column, which sits
 *           in a column that distributes (flexGrow). The row's base size is
 *           pre-measured with its children unconstrained (one line); the
 *           re-derivation that follows the "approximate" flag must reach that
 *           row through the auto-height column between it and the distributing
 *           column, and it must keep the row's true two-line height once the
 *           column is laid out at its final size. Seen 2026-09-05 in yrd watch
 *           at 220x40 on flexily 3f9c818 (the check tab bar wraps; the check
 *           command overpainted the second tab line); flexily 807ff18 laid it
 *           out right.
 * @level    l2 (real render through the reconciler and flexily; rects read
 *           from the laid-out nodes, then the painted text)
 * @consumer every Tabs whose TabList wraps: the yrd detail pane's check tabs,
 *           any settings dialog with more tabs than the width holds
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "../../packages/ag-react/src/components/Box"
import { Text } from "../../packages/ag-react/src/components/Text"
import { Tab, TabList, TabPanel, Tabs } from "../../packages/ag-react/src/ui/components/Tabs"

const TABS = [
  "Changes",
  "✓ setup (submit)",
  "✓ typecheck",
  "✓ manifest-co-change",
  "✓ substrate-pair",
  "✓ setup (merge)",
  "✓ affected-tests",
]

/** The yrd detail pane's shape: a fixed head, then Tabs filling the rest of a definite column. */
function Frame({
  cols,
  rows,
  wrap,
  panelLines,
}: Readonly<{ cols: number; rows: number; wrap: boolean; panelLines: number }>) {
  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box id="head" flexDirection="column" flexShrink={0}>
        <Text>HEAD-1</Text>
        <Text>HEAD-2</Text>
      </Box>
      <Tabs defaultValue="6">
        <TabList flexWrap={wrap ? "wrap" : "nowrap"}>
          {TABS.map((label, at) => (
            <Tab key={label} value={String(at)}>
              {label}
            </Tab>
          ))}
        </TabList>
        <TabPanel value="6">
          <Box id="panel" flexDirection="column">
            {Array.from({ length: panelLines }, (_, i) => (
              <Text key={i}>{`PANEL-${i + 1}`}</Text>
            ))}
          </Box>
        </TabPanel>
      </Tabs>
      <Box id="footer">
        <Text>FOOTER</Text>
      </Box>
    </Box>
  )
}

function read(cols: number, rows: number, wrap: boolean, panelLines = 3) {
  const app = createRenderer({ cols, rows })(
    <Frame cols={cols} rows={rows} wrap={wrap} panelLines={panelLines} />,
  )
  const rect = (id: string) => {
    const node = app.locator(`#${id}`).resolve()
    if (!node?.boxRect) throw new Error(`no #${id} box was laid out`)
    return node.boxRect
  }
  const lines = app.text.split("\n")
  const line = (label: string) => lines.findIndex((l) => l.includes(label))
  const out = {
    panelY: rect("panel").y,
    footerY: rect("footer").y,
    paintedFirstTab: line("Changes"),
    paintedLastTab: line("affected-tests"),
    paintedPanel: line("PANEL-1"),
    paintedFooter: line("FOOTER"),
  }
  app.unmount()
  return out
}

describe("a flex-wrapped tab bar inside the Tabs column keeps its wrapped height", () => {
  test("control: a bar that fits on one line puts the panel right under it", () => {
    // 160 columns hold every tab on one line (the bar is about 116 cells wide); the frame stays
    // under the tier-2 canary's 4000-cell floor, which a sparse 200x20 control would trip.
    const s = read(160, 20, true)
    expect(s.paintedFirstTab).toBe(2)
    expect(s.paintedLastTab).toBe(2)
    expect(s.panelY).toBe(3)
    expect(s.paintedPanel).toBe(3)
    expect(s.footerY).toBe(19)
    expect(s.paintedFooter).toBe(19)
  })

  test("the bar wraps onto two lines at 76 columns: the panel starts under the second line, not over it", () => {
    const s = read(76, 20, true)
    expect(s.paintedFirstTab).toBe(2)
    expect(s.paintedLastTab).toBe(3)
    expect(s.panelY).toBe(4)
    expect(s.paintedPanel).toBe(4)
    expect(s.footerY).toBe(19)
    expect(s.paintedFooter).toBe(19)
  })

  test("the wrapped bar over a panel longer than the space: the bar keeps both lines while the panel shrinks", () => {
    // Measured 2026-09-05 on flexily 3f9c818: the bar laid out one line tall (its base size exact,
    // its auto minimum still the one-line estimate, so the shrink pass clamped it and Phase 8 overrode
    // it), the panel's first line painted on row 3 over the second tab line; 807ff18 painted it on row 4.
    const s = read(76, 20, true, 40)
    expect(s.paintedFirstTab).toBe(2)
    expect(s.paintedLastTab).toBe(3)
    expect(s.panelY).toBe(4)
    expect(s.paintedPanel).toBe(4)
    expect(s.footerY).toBe(19)
    expect(s.paintedFooter).toBe(19)
  })
})
