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

describe("Tabs filled variant", () => {
  test("each tab has a background, and active tab is distinct from inactive tabs", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestFilledTabs defaultValue="one" />)

    const oneCol = app.text.indexOf("One")
    const twoCol = app.text.indexOf("Two")
    expect(oneCol).toBeGreaterThanOrEqual(0)
    expect(twoCol).toBeGreaterThanOrEqual(0)

    const activeCell = app.cell(oneCol, 0)
    const inactiveCell = app.cell(twoCol, 0)

    // Both active and inactive tabs must have a non-null background in filled variant
    expect(activeCell.bg).not.toBeNull()
    expect(inactiveCell.bg).not.toBeNull()

    // Active tab's background must be distinct from inactive tab's background
    expect(activeCell.bg).not.toStrictEqual(inactiveCell.bg)

    // Active tab's foreground must be distinct from inactive tab's foreground
    expect(activeCell.fg).not.toStrictEqual(inactiveCell.fg)
  })

  test("tabs have 1 blank column gap between them and 1-cell padding on edges", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestFilledTabs defaultValue="one" />)

    // "One" has 3 chars + 1 col padding on left + 1 col padding on right = 5 cols wide (cols 0..4)
    // Then 1 blank col gap (col 5)
    // Then "Two" (cols 6..10)
    // Check that col 0 has background (padding cell before 'O')
    expect(app.cell(0, 0).bg).not.toBeNull()

    // Find position of 'O' in "One"
    const oneCol = app.text.indexOf("One")
    expect(oneCol).toBe(1) // 1 column of padding before 'O'

    // Col 4 is padding after 'e' in "One"
    expect(app.cell(4, 0).bg).not.toBeNull()

    // Col 5 is the gap between tabs: no background fill
    expect(app.cell(5, 0).bg).toBeNull()

    // Col 6 is padding before 'T' in "Two"
    expect(app.cell(6, 0).bg).not.toBeNull()
  })

  test("clicking an inactive tab in filled variant activates it", async () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestFilledTabs defaultValue="one" onChange={onChange} />)

    expect(app.text).toContain("Panel One")

    const twoCol = app.text.indexOf("Two")
    await app.click(twoCol, 0)

    expect(app.text).toContain("Panel Two")
    expect(onChange).toHaveBeenCalledWith("two")

    // Now tab "two" is active
    const newActiveCell = app.cell(twoCol, 0)
    const newInactiveCell = app.cell(app.text.indexOf("One"), 0)
    expect(newActiveCell.bg).not.toStrictEqual(newInactiveCell.bg)
  })

  test("hovering an inactive tab lifts its background", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestFilledTabs defaultValue="one" />)

    const twoCol = app.text.indexOf("Two")
    const bgBefore = app.cell(twoCol, 0).bg

    await app.hover(twoCol, 0)
    const bgAfter = app.cell(twoCol, 0).bg

    expect(bgAfter).not.toBeNull()
    expect(bgAfter).not.toStrictEqual(bgBefore)
  })

  test("TabList variant='filled' prop applies filled variant to children", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
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

    const firstCol = app.text.indexOf("First")
    const secondCol = app.text.indexOf("Second")
    expect(app.cell(firstCol, 0).bg).not.toBeNull()
    expect(app.cell(secondCol, 0).bg).not.toBeNull()
    expect(app.cell(firstCol, 0).bg).not.toStrictEqual(app.cell(secondCol, 0).bg)
  })

  test("multi-line tab children have padding and background across both lines", () => {
    const render = createRenderer({ cols: 40, rows: 6 })
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

    // Check line 0 and line 1 for tab "one"
    const line0Col = app.text.indexOf("Line1")
    expect(app.cell(line0Col, 0).bg).not.toBeNull()
    expect(app.cell(0, 0).bg).not.toBeNull() // padding on line 0
    expect(app.cell(0, 1).bg).not.toBeNull() // padding on line 1
  })
})
