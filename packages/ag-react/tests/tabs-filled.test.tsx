/**
 * Tabs filled variant — each tab has its own background fill with 1-col gap.
 *
 * Verifies:
 * 1. Filled variant renders background on active and inactive tabs
 * 2. Active tab has distinct selected background and text color
 * 3. TabList has 1-column gap and no bottom border in filled variant
 * 4. Hovering an inactive tab lifts its background
 * 5. Clicking an inactive tab activates it
 * 6. Multi-line tab labels maintain padding and background
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../src/index.js"
import { Tabs, TabList, Tab, TabPanel } from "../src/ui/components/Tabs"

function TestFilledTabs({
  defaultValue = "one",
  onChange,
}: {
  defaultValue?: string
  onChange?: (v: string) => void
}) {
  return (
    <Box flexDirection="column" width={40}>
      <Tabs defaultValue={defaultValue} onChange={onChange} variant="filled">
        <TabList>
          <Tab value="one">One</Tab>
          <Tab value="two">Two</Tab>
          <Tab value="three">Three</Tab>
        </TabList>
        <TabPanel value="one">
          <Text>Panel One</Text>
        </TabPanel>
        <TabPanel value="two">
          <Text>Panel Two</Text>
        </TabPanel>
        <TabPanel value="three">
          <Text>Panel Three</Text>
        </TabPanel>
      </Tabs>
    </Box>
  )
}

function lineCol(appText: string, lineIdx: number, substr: string): number {
  const line = appText.split("\n")[lineIdx] ?? ""
  return line.indexOf(substr)
}

describe("Tabs filled variant", () => {
  test("each tab has a background, and active tab is distinct from inactive tabs", () => {
    const render = createRenderer({ cols: 40, rows: 7 })
    const app = render(<TestFilledTabs defaultValue="one" />)

    const oneCol = lineCol(app.text, 1, "One")
    const twoCol = lineCol(app.text, 1, "Two")
    expect(oneCol).toBe(2)
    expect(twoCol).toBe(10)

    // Text sits on row 1 (row 0 is top padding)
    const activeCell = app.cell(oneCol, 1)
    const inactiveCell = app.cell(twoCol, 1)

    // Both active and inactive tabs must have a non-null background in filled variant
    expect(activeCell.bg).not.toBeNull()
    expect(inactiveCell.bg).not.toBeNull()

    // Active tab's background must be distinct from inactive tab's background
    expect(activeCell.bg).not.toStrictEqual(inactiveCell.bg)

    // Active tab's foreground must be distinct from inactive tab's foreground
    expect(activeCell.fg).not.toStrictEqual(inactiveCell.fg)
  })

  test("tabs have standard inner padding (2 spaces horizontal, 1 line vertical) with 1 blank column gap", () => {
    const render = createRenderer({ cols: 40, rows: 7 })
    const app = render(<TestFilledTabs defaultValue="one" />)

    // Row 0 is top padding line (paddingY=1)
    expect(app.cell(0, 0).bg).not.toBeNull()
    expect(app.cell(6, 0).bg).not.toBeNull()
    expect(app.cell(7, 0).bg).toBeNull() // gap between tab one and two

    // Row 1 has 2 spaces padding before 'O' in "One"
    const oneCol = lineCol(app.text, 1, "One")
    expect(oneCol).toBe(2) // 2 columns of padding before 'O'
    expect(app.cell(0, 1).bg).not.toBeNull()
    expect(app.cell(1, 1).bg).not.toBeNull()
    expect(app.cell(5, 1).bg).not.toBeNull()
    expect(app.cell(6, 1).bg).not.toBeNull()

    // Col 7 is the gap between tabs: no background fill
    expect(app.cell(7, 1).bg).toBeNull()

    // Col 8, 9 is 2 columns of padding before 'T' in "Two" (col 10)
    expect(app.cell(8, 1).bg).not.toBeNull()
    expect(app.cell(9, 1).bg).not.toBeNull()

    // Row 2 is bottom padding line (paddingY=1)
    expect(app.cell(0, 2).bg).not.toBeNull()
    expect(app.cell(6, 2).bg).not.toBeNull()
    expect(app.cell(7, 2).bg).toBeNull() // gap

    // Row 3 is panel content
    expect(app.text).toContain("Panel One")
  })

  test("clicking an inactive tab in filled variant activates it", async () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 40, rows: 7 })
    const app = render(<TestFilledTabs defaultValue="one" onChange={onChange} />)

    expect(app.text).toContain("Panel One")

    const twoCol = lineCol(app.text, 1, "Two")
    await app.click(twoCol, 1)

    expect(app.text).toContain("Panel Two")
    expect(onChange).toHaveBeenCalledWith("two")

    // Now tab "two" is active
    const newActiveCell = app.cell(twoCol, 1)
    const newInactiveCell = app.cell(lineCol(app.text, 1, "One"), 1)
    expect(newActiveCell.bg).not.toStrictEqual(newInactiveCell.bg)
  })

  test("hovering an inactive tab lifts its background", async () => {
    const render = createRenderer({ cols: 40, rows: 7 })
    const app = render(<TestFilledTabs defaultValue="one" />)

    const twoCol = lineCol(app.text, 1, "Two")
    const bgBefore = app.cell(twoCol, 1).bg

    await app.hover(twoCol, 1)
    const bgAfter = app.cell(twoCol, 1).bg

    expect(bgAfter).not.toBeNull()
    expect(bgAfter).not.toStrictEqual(bgBefore)
  })

  test("TabList variant='filled' prop applies filled variant to children", () => {
    const render = createRenderer({ cols: 40, rows: 7 })
    const app = render(
      <Box flexDirection="column" width={40}>
        <Tabs defaultValue="one">
          <TabList variant="filled">
            <Tab value="one">First</Tab>
            <Tab value="two">Second</Tab>
          </TabList>
          <TabPanel value="one">
            <Text>Content</Text>
          </TabPanel>
        </Tabs>
      </Box>,
    )

    const firstCol = lineCol(app.text, 1, "First")
    const secondCol = lineCol(app.text, 1, "Second")
    expect(app.cell(firstCol, 1).bg).not.toBeNull()
    expect(app.cell(secondCol, 1).bg).not.toBeNull()
    expect(app.cell(firstCol, 1).bg).not.toStrictEqual(app.cell(secondCol, 1).bg)
  })

  test("multi-line tab children have standard inner padding and background across all lines", () => {
    const render = createRenderer({ cols: 40, rows: 8 })
    const app = render(
      <Box flexDirection="column" width={40}>
        <Tabs defaultValue="one" variant="filled">
          <TabList>
            <Tab value="one">
              Line1
              {"\n"}
              Line2
            </Tab>
            <Tab value="two">
              Other1
              {"\n"}
              Other2
            </Tab>
          </TabList>
          <TabPanel value="one">
            <Text>Content</Text>
          </TabPanel>
        </Tabs>
      </Box>,
    )

    // Row 0 is top padding for tab "one"
    expect(app.cell(0, 0).bg).not.toBeNull()

    // Row 1 is Line1
    const line1Col = lineCol(app.text, 1, "Line1")
    expect(line1Col).toBe(2)
    expect(app.cell(line1Col, 1).bg).not.toBeNull()
    expect(app.cell(0, 1).bg).not.toBeNull()

    // Row 2 is Line2
    const line2Col = lineCol(app.text, 2, "Line2")
    expect(line2Col).toBe(2)
    expect(app.cell(line2Col, 2).bg).not.toBeNull()
    expect(app.cell(0, 2).bg).not.toBeNull()

    // Row 3 is bottom padding
    expect(app.cell(0, 3).bg).not.toBeNull()
  })
})
