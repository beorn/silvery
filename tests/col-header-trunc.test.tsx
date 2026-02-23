/**
 * Test: PUA (Private Use Area) character width in column headers
 *
 * Modern terminals (Ghostty, Kitty, iTerm2, WezTerm) render Nerd Font icons
 * from the PUA as 2-cell width. inkx's graphemeWidth returns 2 for PUA
 * characters to match terminal rendering and prevent last-character truncation
 * in column headers.
 *
 * Bead: km-tui.col-header-trunc, km-tui.col-trunc2
 */
import { describe, expect, test } from "vitest"
import { Box, Text, displayWidth, graphemeWidth } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("PUA character width", () => {
  test("PUA characters are width 2 matching terminal rendering", () => {
    // Nerd Font folder icon
    expect(graphemeWidth("\uF114")).toBe(2)
    // Nerd Font file icon
    expect(graphemeWidth("\uF0F6")).toBe(2)
    // Start of BMP PUA
    expect(graphemeWidth("\uE000")).toBe(2)
    // End of BMP PUA
    expect(graphemeWidth("\uF8FF")).toBe(2)
  })

  test("non-PUA characters are unaffected", () => {
    // Section sign - not PUA
    expect(graphemeWidth("\u00A7")).toBe(1)
    // Bullet - not PUA
    expect(graphemeWidth("\u2022")).toBe(1)
    // Regular ASCII
    expect(graphemeWidth("A")).toBe(1)
  })

  test("displayWidth with PUA icon — width 2 matching terminal rendering", () => {
    const folderIcon = "\uF114"
    // icon(2) + space(1) + "FAMILY SCHEDULE"(15) = 18
    expect(displayWidth(`${folderIcon} FAMILY SCHEDULE`)).toBe(18)
    // bullet(1) + space(1) + 15 = 17 (bullet is not PUA)
    expect(displayWidth("\u2022 FAMILY SCHEDULE")).toBe(17)
  })

  test("text with PUA icon in Box renders without crash", () => {
    const render = createRenderer({ cols: 40, rows: 3 })
    const folderIcon = "\uF114"
    const name = "FAMILY SCHEDULE"

    const app = render(
      <Box width={25}>
        <Text wrap="truncate">
          <Text>{folderIcon}</Text> <Text>{name}</Text>
        </Text>
      </Box>,
    )
    // PUA icon is 2-wide + space(1) + "FAMILY SCHEDULE"(15) = 18 cells.
    // Box is 25 wide, so full text should fit.
    expect(app.text).toContain("FAMILY SCHEDULE")
  })

  test("flex layout with PUA icon", () => {
    const render = createRenderer({ cols: 80, rows: 3 })
    const folderIcon = "\uF114"

    const app = render(
      <Box flexDirection="row" width={30}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden" testID="text-box">
          <Text wrap="truncate" testID="text">
            <Text>{folderIcon}</Text> <Text>FAMILY SCHEDULE</Text>
          </Text>
        </Box>
        <Box flexShrink={0} testID="count">
          <Text>{" 1"}</Text>
        </Box>
      </Box>,
    )

    // PUA icon(2) + space(1) + "FAMILY SCHEDULE"(15) = 18 cells.
    // textBox gets 30 - 2 (count) = 28. 18 < 28, so text fits.
    expect(app.text).toContain("FAMILY SCHEDULE")

    const textBox = app.getByTestId("text-box")
    const countBox = app.getByTestId("count")
    expect(textBox.boundingBox()!.width + countBox.boundingBox()!.width).toBe(30)
  })
})
