/**
 * @failure Silvery exposes only a low-level PaneDivider, so every two-pane
 *   consumer reimplements ratio math, cell minimums, orientation, collapse,
 *   and natural-size fallback policy. The copies already diverge between Yrd,
 *   AsideLayout, and Hab's pane tree.
 * @level l3
 * @consumer @si/ui/21119-split-pane, @yrd/core/21096-cli-ux/21106-queue-timeline
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless, waitFor } from "@silvery/test"
import "@termless/test/matchers"
import {
  Box,
  SplitPane,
  Text,
  clampSplitPaneRatio,
  resolveSplitPaneLayout,
  type SplitPaneDirection,
  useInput,
} from "../../src/index.js"
import { SPLIT_PANE_STORIES } from "../../examples/apps/storybook/stories/SplitPane.story.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const PRIMARY = "PRIMARY"
const SECONDARY = "SECONDARY"

function frame({
  direction = "row",
  secondaryCollapsed = false,
  secondary = <Text>{SECONDARY}</Text>,
}: {
  direction?: SplitPaneDirection
  secondaryCollapsed?: boolean
  secondary?: React.ReactNode
} = {}): React.ReactElement {
  return (
    <Box width={40} height={8}>
      <SplitPane
        direction={direction}
        ratio={0.5}
        minPrimarySize={8}
        minSecondarySize={8}
        secondaryCollapsed={secondaryCollapsed}
        primary={<Text>{PRIMARY}</Text>}
        secondary={secondary}
      />
    </Box>
  )
}

function findGlyphColumn(term: ReturnType<typeof createTermless>, glyph: string, row = 1): number {
  const columns = term.cols
  if (columns === undefined)
    throw new Error("findGlyphColumn requires a terminal with a known column count")
  for (let column = 0; column < columns; column += 1) {
    if (term.cell(row, column).char === glyph) return column
  }
  return -1
}

describe("SplitPane", () => {
  test("renders both children around the direction-appropriate divider and restores collapse", async () => {
    let secondaryInstances = 0

    function StatefulSecondary(): React.ReactElement {
      const [instance] = useState(() => {
        secondaryInstances += 1
        return secondaryInstances
      })
      return <Text>{`${SECONDARY}-${instance}`}</Text>
    }

    function Harness(): React.ReactElement {
      const [direction, setDirection] = useState<SplitPaneDirection>("row")
      const [secondaryCollapsed, setSecondaryCollapsed] = useState(false)
      useInput((input) => {
        if (input === "o") setDirection((current) => (current === "row" ? "column" : "row"))
        if (input === "c") setSecondaryCollapsed((current) => !current)
      })
      return frame({
        direction,
        secondaryCollapsed,
        secondary: <StatefulSecondary />,
      })
    }

    using term = createTermless({ cols: 40, rows: 8 })
    const handle = await run(<Harness />, term, { mouse: true, selection: false })
    try {
      await waitFor(() => term.screen.getText().includes(SECONDARY))
      expect(term.screen).toContainText(PRIMARY)
      expect(findGlyphColumn(term, "│")).toBeGreaterThan(0)

      await handle.press("o")
      await waitFor(() => term.screen.getText().includes("─"))
      expect(term.screen).toContainText(PRIMARY)
      expect(term.screen).toContainText(SECONDARY)
      expect(term.screen.getText()).not.toContain("│")

      await handle.press("c")
      await waitFor(() => !term.screen.getText().includes(SECONDARY))
      expect(term.screen).toContainText(PRIMARY)
      expect(term.screen.getText()).not.toContain("│")
      expect(term.screen.getText()).not.toContain("─")

      await handle.press("c")
      await waitFor(() => term.screen.getText().includes(SECONDARY))
      await handle.press("o")
      await waitFor(() => findGlyphColumn(term, "│") >= 0)
      expect(findGlyphColumn(term, "│")).toBeGreaterThan(0)
      expect(term.screen).toContainText(`${SECONDARY}-1`)
      expect(secondaryInstances).toBe(1)
    } finally {
      handle.unmount()
    }
  })

  test("drags the divider within cell minimums and commits the controlled ratio", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const changes: number[] = []
    const commits: number[] = []

    function Harness(): React.ReactElement {
      const [ratio, setRatio] = useState(0.5)
      return (
        <SplitPane
          direction="row"
          ratio={ratio}
          minPrimarySize={8}
          minSecondarySize={8}
          onRatioChange={(next) => {
            changes.push(next)
            setRatio(next)
          }}
          onRatioCommit={(next) => commits.push(next)}
          primary={<Text>{PRIMARY}</Text>}
          secondary={<Text>{SECONDARY}</Text>}
        />
      )
    }

    const handle = await run(<Harness />, term, { mouse: true, selection: false })
    try {
      await waitFor(() => findGlyphColumn(term, "│") >= 0)
      const initialDivider = findGlyphColumn(term, "│")

      await term.mouse.down(initialDivider, 1)
      await term.mouse.move(39, 1)
      await waitFor(() => findGlyphColumn(term, "│") === 31)
      await term.mouse.up(39, 1)
      await waitFor(() => commits.length === 1)

      expect(changes.at(-1)).toBeCloseTo(31 / 39)
      expect(commits.at(-1)).toBeCloseTo(31 / 39)

      await term.mouse.down(31, 1)
      await term.mouse.move(0, 1)
      await waitFor(() => findGlyphColumn(term, "│") === 8)
      await term.mouse.up(0, 1)
      await waitFor(() => commits.length === 2)

      expect(changes.at(-1)).toBeCloseTo(8 / 39)
      expect(commits.at(-1)).toBeCloseTo(8 / 39)
    } finally {
      handle.unmount()
    }
  })

  test("resolves caller-supplied natural sizes in preferred, fallback, then single order", () => {
    const naturalSizes = {
      primary: { width: 80, height: 12 },
      secondary: { width: 72, height: 12 },
      dividerSize: 1,
    } as const

    expect(
      resolveSplitPaneLayout({
        ...naturalSizes,
        availableWidth: 153,
        availableHeight: 24,
        preferredDirection: "row",
      }),
    ).toBe("row")
    expect(
      resolveSplitPaneLayout({
        ...naturalSizes,
        availableWidth: 100,
        availableHeight: 25,
        preferredDirection: "row",
      }),
    ).toBe("column")
    expect(
      resolveSplitPaneLayout({
        ...naturalSizes,
        availableWidth: 80,
        availableHeight: 24,
        preferredDirection: "row",
      }),
    ).toBe("single")
    expect(
      resolveSplitPaneLayout({
        ...naturalSizes,
        availableWidth: 153,
        availableHeight: 25,
        preferredDirection: "column",
      }),
    ).toBe("column")
  })

  test("compresses impossible minimums proportionally without hiding either pane", () => {
    expect(
      clampSplitPaneRatio(0.9, {
        containerSize: 20,
        dividerSize: 1,
        minPrimarySize: 12,
        minSecondarySize: 12,
      }),
    ).toBe(0.5)
  })

  test("registers a renderable story for each public layout state", () => {
    expect(SPLIT_PANE_STORIES.map((story) => story.variant)).toEqual([
      "row-resizable",
      "column-resizable",
      "min-clamped",
      "collapsed",
      "restored",
      "natural-fit-ladder",
    ])

    const render = createRenderer({ cols: 80, rows: 24 })
    for (const story of SPLIT_PANE_STORIES) {
      const frame = render(story.render({}))
      for (const token of story.expectedTokens ?? []) {
        expect(frame.text, `${story.id} should render ${token}`).toContain(token)
      }
    }
  })

  test("allows dividerSize of 0 and renders no divider sash in row and column directions", async () => {
    using termRow = createTermless({ cols: 40, rows: 8 })
    const handleRow = await run(
      <Box width={40} height={8}>
        <SplitPane
          direction="row"
          ratio={0.5}
          dividerSize={0}
          primary={<Text>{PRIMARY}</Text>}
          secondary={<Text>{SECONDARY}</Text>}
        />
      </Box>,
      termRow,
    )
    try {
      await waitFor(() => termRow.screen.getText().includes(SECONDARY))
      expect(termRow.screen).toContainText(PRIMARY)
      expect(termRow.screen).toContainText(SECONDARY)
      expect(termRow.screen.getText()).not.toContain("│")
      expect(termRow.screen.getText()).not.toContain("─")
    } finally {
      await handleRow.unmount()
    }

    using termCol = createTermless({ cols: 40, rows: 8 })
    const handleCol = await run(
      <Box width={40} height={8}>
        <SplitPane
          direction="column"
          ratio={0.5}
          dividerSize={0}
          primary={<Text>{PRIMARY}</Text>}
          secondary={<Text>{SECONDARY}</Text>}
        />
      </Box>,
      termCol,
    )
    try {
      await waitFor(() => termCol.screen.getText().includes(SECONDARY))
      expect(termCol.screen).toContainText(PRIMARY)
      expect(termCol.screen).toContainText(SECONDARY)
      expect(termCol.screen.getText()).not.toContain("│")
      expect(termCol.screen.getText()).not.toContain("─")
    } finally {
      await handleCol.unmount()
    }
  })
})
