/**
 * Test that Text with wrap="truncate" uses parent Box width for truncation.
 * Also tests nested Text structure (Text inside Text for styling).
 */
import { describe, expect, test } from "vitest"
import { Box, Text, displayWidth } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("Text truncation with explicit parent width", () => {
  const render = createRenderer({ cols: 80, rows: 5 })

  test("Text truncates to parent Box width", () => {
    const app = render(
      <Box width={20}>
        <Text wrap="truncate">ABCDEFGHIJKLMNOPQRSTUVWXYZ</Text>
      </Box>,
    )

    const text = app.text.trim()

    // Text should be truncated to ~20 chars (19 + ellipsis)
    expect(text.length).toBeLessThanOrEqual(20)
    expect(text).toContain("…") // Should have ellipsis
  })

  test("Text in row layout with explicit width (simulating bottom bar)", () => {
    const rightContent = " 📋21   col 1/3   COLUMNS VIEW "
    const rightWidth = displayWidth(rightContent) // 31, accounting for emoji

    const app = render(
      <Box width={80} flexDirection="row">
        <Box width={80 - rightWidth} flexGrow={0} flexShrink={0}>
          <Text>Left</Text>
        </Box>
        <Box width={rightWidth} flexGrow={0} flexShrink={0}>
          <Text wrap="truncate">{rightContent}</Text>
        </Box>
      </Box>,
    )

    const text = app.text

    // Should contain full "COLUMNS VIEW" without truncation
    expect(text).toContain("COLUMNS VIEW")
  })

  test("Nested Text structure (Text inside Text for styling)", () => {
    // This is the idiomatic Ink/inkx pattern for styled text portions
    const app = render(
      <Box width={40}>
        <Text dimColor>
          <Text color="red">Error:</Text>{" "}
          <Text>Something went wrong with the operation</Text>
        </Text>
      </Box>,
    )

    const text = app.text.trim()

    // Should contain both parts
    expect(text).toContain("Error:")
    expect(text).toContain("Something went wrong")
  })

  test('Nested Text with wrap="truncate" on parent', () => {
    // Parent Text with wrap="truncate" should truncate ALL children combined
    const app = render(
      <Box width={30}>
        <Text wrap="truncate" dimColor>
          <Text color="red">Prefix</Text>
          {" - "}
          <Text>This is a very long message that should be truncated</Text>
        </Text>
      </Box>,
    )

    const text = app.text.trim()

    // Text should be truncated to 30 chars
    expect(text.length).toBeLessThanOrEqual(30)
    expect(text).toContain("…") // Should have ellipsis
    expect(text).toContain("Prefix") // First part should survive
  })

  test("displayWidth correctly handles emoji", () => {
    // Verify displayWidth calculation
    const str = " 📋21   col 1/3   COLUMNS VIEW "
    const width = displayWidth(str)

    // 📋 is 2 display columns, rest is 1:1
    // " " + "📋" + "21   col 1/3   COLUMNS VIEW " = 1 + 2 + 28 = 31
    expect(width).toBe(31)
  })
})
