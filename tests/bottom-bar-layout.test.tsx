/**
 * Test the bottom bar layout scenario that was causing VIEW truncation.
 *
 * Key findings:
 * - inkx handles nested Text correctly when parent Box has explicit width + flexGrow={0}
 * - The original bug was missing flexGrow={0} and using string.length instead of displayWidth
 * - Both nested Text and pre-built string approaches work when properly configured
 */
import { describe, expect, test } from "vitest"
import { Box, Text, displayWidth } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("Bottom bar layout", () => {
  const render = createRenderer({ cols: 80, rows: 5 })

  test("Nested Text with explicit width and flexGrow={0} works correctly", () => {
    // This is the IDIOMATIC inkx pattern for styled text portions
    const dbCount = 21
    const viewModeStr = "COLUMNS VIEW"
    const colIndex = 0
    const colCount = 3

    // Calculate right width using displayWidth for emoji support
    const rightContent = ` 📋${dbCount}   col ${colIndex + 1}/${colCount}   ${viewModeStr} `
    const rightWidth = displayWidth(rightContent)
    const termWidth = 80
    const leftWidth = Math.max(1, termWidth - rightWidth)

    // KEY: Use flexGrow={0} to prevent Box from expanding beyond specified width
    const app = render(
      <Box width={termWidth} flexDirection="row">
        <Box width={leftWidth} flexGrow={0} flexShrink={0} flexDirection="row" overflow="hidden">
          <Text dimColor>DISK 📁~/Code/pim/km</Text>
        </Box>
        <Box width={rightWidth} flexGrow={0} flexShrink={0}>
          <Text dimColor>
            {" "}
            <Text id="node-count">📋{dbCount}</Text>
            {"   "}
            <Text id="column-position">
              col {colIndex + 1}/{colCount}
            </Text>
            {"   "}
            <Text id="view-mode">{viewModeStr}</Text>{" "}
          </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    // Should contain full COLUMNS VIEW without truncation
    expect(text).toContain("COLUMNS VIEW")
    expect(text).not.toContain("…")
  })

  test('Pre-built string with wrap="truncate" also works', () => {
    const dbCount = 21
    const viewModeStr = "COLUMNS VIEW"
    const colIndex = 0
    const colCount = 3

    const rightParts = [`📋${dbCount}`, `col ${colIndex + 1}/${colCount}`, viewModeStr]
    const right = ` ${rightParts.join("   ")} `
    const rightWidth = displayWidth(right)
    const termWidth = 80
    const leftWidth = Math.max(1, termWidth - rightWidth)

    const app = render(
      <Box width={termWidth} flexDirection="row">
        <Box width={leftWidth} flexGrow={0} flexShrink={0} overflow="hidden">
          <Text dimColor>DISK 📁~/Code/pim/km</Text>
        </Box>
        <Box width={rightWidth} flexGrow={0} flexShrink={0}>
          <Text dimColor wrap="truncate">
            {right}
          </Text>
        </Box>
      </Box>,
    )

    const text = app.text

    expect(text).toContain("COLUMNS VIEW")
  })

  test("Without flexGrow={0}, Box may expand and cause layout issues", () => {
    // This demonstrates why flexGrow={0} is important for fixed-width layouts
    const rightWidth = 31
    const termWidth = 80

    // Missing flexGrow={0} - Box can expand
    const app = render(
      <Box width={termWidth} flexDirection="row">
        <Box width={termWidth - rightWidth} flexShrink={0}>
          <Text>Left</Text>
        </Box>
        <Box width={rightWidth} flexShrink={0}>
          <Text>Right content here that is fixed width</Text>
        </Box>
      </Box>,
    )

    // This should still work because total is exactly termWidth
    // but the pattern is fragile without flexGrow={0}
    expect(app.text).toContain("Right")
  })
})
