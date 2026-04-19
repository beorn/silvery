/**
 * Tabs hover state — inactive tabs get subtle $bg-muted background on mouse-enter.
 *
 * Verifies:
 * 1. Hovering a non-active tab gives it hover bg ($bg-muted)
 * 2. Clicking a tab activates it (existing behavior still works)
 * 3. Active tab's hover styling is distinct from non-active hover (no double-styling)
 * 4. Mouse leave removes hover bg
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../src/index.js"
import { Tabs, TabList, Tab, TabPanel } from "../src/ui/components/Tabs"

// ============================================================================
// Test fixtures
// ============================================================================

function TestTabs({
  defaultValue = "one",
  onChange,
}: {
  defaultValue?: string
  onChange?: (v: string) => void
}) {
  return (
    <Box flexDirection="column" width={40}>
      <Tabs defaultValue={defaultValue} onChange={onChange}>
        <TabList>
          <Tab value="one">Tab One</Tab>
          <Tab value="two">Tab Two</Tab>
          <Tab value="three">Tab Three</Tab>
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

// ============================================================================
// 1. Hovering a non-active tab gives it hover bg
// ============================================================================

describe("Tabs hover state: non-active tab gets hover bg", () => {
  test("hovering inactive tab adds bg color to that tab", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" />)

    // "Tab Two" is inactive — find its column position
    const col = app.text.indexOf("Tab Two")
    expect(col).toBeGreaterThanOrEqual(0)

    // Before hover: no bg
    const cellBefore = app.cell(col, 0)
    const bgBefore = cellBefore.bg

    // Hover over "Tab Two"
    await app.hover(col, 0)

    // After hover: bg should be set (mutedbg token)
    const cellAfter = app.cell(col, 0)
    expect(cellAfter.bg).not.toBeNull()
    // And it should differ from the pre-hover bg (or was null before)
    if (bgBefore === null) {
      expect(cellAfter.bg).not.toBeNull()
    }
  })

  test("mouse leave removes hover bg from inactive tab", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column" width={40}>
        <Tabs defaultValue="one">
          <TabList>
            <Tab value="one">One</Tab>
            <Tab value="two">Two</Tab>
          </TabList>
          <TabPanel value="one">
            <Text>Panel content</Text>
          </TabPanel>
          <TabPanel value="two">
            <Text>Other panel</Text>
          </TabPanel>
        </Tabs>
      </Box>,
    )

    const twoCol = app.text.indexOf("Two")
    // Hover over "Two" (inactive tab)
    await app.hover(twoCol, 0)
    const bgHovered = app.cell(twoCol, 0).bg
    expect(bgHovered).not.toBeNull()

    // Move to panel area (row 1) to trigger leave
    await app.hover(0, 1)
    const bgAfterLeave = app.cell(twoCol, 0).bg
    // bg should be cleared (back to null/transparent)
    expect(bgAfterLeave).toBeNull()
  })
})

// ============================================================================
// 2. Clicking a tab activates it (existing behavior)
// ============================================================================

describe("Tabs hover state: click still activates tab", () => {
  test("clicking inactive tab activates it", async () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" onChange={onChange} />)

    // Initially "Panel One" visible
    expect(app.text).toContain("Panel One")

    // Click on "Tab Two"
    const col = app.text.indexOf("Tab Two")
    await app.click(col, 0)

    // "Panel Two" should now be visible
    expect(app.text).toContain("Panel Two")
    expect(onChange).toHaveBeenCalledWith("two")
  })

  test("clicking already-active tab does not error", async () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" onChange={onChange} />)

    const col = app.text.indexOf("Tab One")
    await app.click(col, 0)

    // Still showing Panel One
    expect(app.text).toContain("Panel One")
  })
})

// ============================================================================
// 3. Active tab hover is distinct — no double bg styling
// ============================================================================

describe("Tabs hover state: active tab has no hover bg override", () => {
  test("hovering the active tab does not change its bg (active styling takes precedence)", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" />)

    // "Tab One" is already active — get its bg before hover
    const col = app.text.indexOf("Tab One")
    const bgBefore = app.cell(col, 0).bg

    // Hover over it
    await app.hover(col, 0)
    const bgAfter = app.cell(col, 0).bg

    // Active tab should not gain hover bg (hoverBg condition: !isActive && isHovered)
    expect(bgAfter).toEqual(bgBefore)
  })

  test("active tab has different visual state from hovered inactive tab", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" />)

    // Get active tab ("Tab One") cell fg — should have $primary color
    const activeCol = app.text.indexOf("Tab One")
    const activeCell = app.cell(activeCol, 0)

    // Get inactive tab ("Tab Two") — should have $muted color normally
    const inactiveCol = app.text.indexOf("Tab Two")
    const inactiveCell = app.cell(inactiveCol, 0)

    // Active tab fg ($primary) should differ from inactive tab fg ($muted)
    // (unless theme has identical primary/muted which is unusual)
    // At minimum they should render differently
    expect(activeCell.bold).toBe(true) // active tab is bold
    expect(inactiveCell.bold).toBeFalsy() // inactive tab is not bold
  })
})
