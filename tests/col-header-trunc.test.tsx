/**
 * Test: PUA (Private Use Area) character width in column headers
 *
 * Verifies that PUA characters (Nerd Font icons like U+F114) are treated
 * as 2-cell width, matching how modern terminals render them.
 *
 * Regression test for km-tui.col-header-trunc: headers with nerdfont icons
 * were missing the last character because inkx thought the icon was 1 cell
 * but the terminal rendered it as 2 cells.
 */
import { describe, expect, test } from "vitest"
import { Box, Text, displayWidth, graphemeWidth } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("PUA character width", () => {
  test("PUA characters (Nerd Font icons) are 2-cell width", () => {
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

  test("displayWidth accounts for PUA icon width", () => {
    const folderIcon = "\uF114"
    // icon(2) + space(1) + "FAMILY SCHEDULE"(15) = 18
    expect(displayWidth(`${folderIcon} FAMILY SCHEDULE`)).toBe(18)
    // Without icon: 1 + 1 + 15 = 17 (bullet is not PUA)
    expect(displayWidth("\u2022 FAMILY SCHEDULE")).toBe(17)
  })

  test("text with PUA icon truncates correctly in column header layout", () => {
    const render = createRenderer({ cols: 40, rows: 3 })
    const folderIcon = "\uF114"
    const name = "FAMILY SCHEDULE"

    // Box width 25, icon(2) + space(1) + name(15) = 18 -> fits
    const app = render(
      <Box width={25}>
        <Text wrap="truncate">
          <Text>{folderIcon}</Text>{" "}
          <Text>{name}</Text>
        </Text>
      </Box>,
    )
    expect(app.text).toContain("FAMILY SCHEDULE")
  })

  test("text with PUA icon truncates when too long", () => {
    const render = createRenderer({ cols: 40, rows: 3 })
    const folderIcon = "\uF114"
    // Box width 15, icon(2) + space(1) + name(15) = 18 -> truncated
    const app = render(
      <Box width={15}>
        <Text wrap="truncate">
          <Text>{folderIcon}</Text>{" "}
          <Text>FAMILY SCHEDULE</Text>
        </Text>
      </Box>,
    )
    expect(app.text).toContain("\u2026") // Should have ellipsis
  })

  test("flex layout with PUA icon — text box width accounts for wide icon", () => {
    const render = createRenderer({ cols: 80, rows: 3 })
    const folderIcon = "\uF114"

    const app = render(
      <Box flexDirection="row" width={30}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden" testID="text-box">
          <Text wrap="truncate" testID="text">
            <Text>{folderIcon}</Text>{" "}
            <Text>FAMILY SCHEDULE</Text>
          </Text>
        </Box>
        <Box flexShrink={0} testID="count">
          <Text>{" 1"}</Text>
        </Box>
      </Box>,
    )

    // Text should be visible (28 - 2 = 26 for text, icon(2)+space(1)+15 = 18 fits)
    expect(app.text).toContain("FAMILY SCHEDULE")

    const textBox = app.getByTestId("text-box")
    const countBox = app.getByTestId("count")
    // Layout should add up to container width
    expect(textBox.boundingBox()!.width + countBox.boundingBox()!.width).toBe(30)
  })
})
