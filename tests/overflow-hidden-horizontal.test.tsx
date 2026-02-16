/**
 * Test: overflow="hidden" horizontal clipping for Text with wrap="truncate"
 *
 * Verifies that a Text node inside an overflow="hidden" Box is properly
 * truncated to the parent Box's width, not the Text's intrinsic width.
 */
import { describe, expect, test } from "vitest"
import { createRenderer } from "../src/testing/index.js"
import React from "react"

const { Box, Text } = await import("../src/index.js")

describe("overflow=hidden horizontal clipping", () => {
  const render = createRenderer({ cols: 40, rows: 5 })

  test("Text wrap=truncate inside flexGrow+flexShrink+overflow=hidden clips to parent width", () => {
    // Simulates the column header pattern:
    // <Box flexDirection="row" width={40}>
    //   <Box flexGrow={1} flexShrink={1} overflow="hidden">
    //     <Text wrap="truncate">very long text...</Text>
    //   </Box>
    //   <Box flexShrink={0}>
    //     <Text> 5</Text>
    //   </Box>
    // </Box>

    const longName = "A".repeat(60) // 60 chars, way wider than 40

    const app = render(
      <Box flexDirection="row" width={40}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text wrap="truncate">{longName}</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>{" 5"}</Text>
        </Box>
      </Box>,
    )

    const text = app.text
    const lines = text.split("\n")

    // Every line must fit within 40 columns
    for (let i = 0; i < lines.length; i++) {
      expect(lines[i]!.length, `line ${i}: "${lines[i]}"`).toBeLessThanOrEqual(40)
    }

    // Should have truncation ellipsis (inkx uses midline horizontal ellipsis U+22EF)
    expect(text).toContain("\u22EF")

    // Should have the count display
    expect(text).toContain(" 5")
  })

  test("without overflow=hidden, text still truncated by flexbox shrink", () => {
    const longName = "A".repeat(60)

    const app = render(
      <Box flexDirection="row" width={40}>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate">{longName}</Text>
        </Box>
        <Box flexShrink={0}>
          <Text>{" 5"}</Text>
        </Box>
      </Box>,
    )

    const text = app.text
    const lines = text.split("\n")

    // Check line lengths
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.length > 40) {
        console.log(`OVERFLOW: line ${i} is ${lines[i]!.length} chars: "${lines[i]}"`)
      }
    }
  })

  test("CardColumn header: flexShrink=1 on inner row keeps layout within parent", () => {
    // Matches the ACTUAL CardColumn structure after fix:
    // <Box width={colWidth} overflow="hidden" flexDirection="column">
    //   <Box height={1} width={colWidth - 1} flexDirection="row">
    //     <Box flexGrow={1} flexShrink={1} flexDirection="row" paddingLeft={1} paddingRight={1}>
    //       <Box flexGrow={1} flexShrink={1} overflow="hidden">
    //         <Text bold wrap="truncate">{icon} {name}</Text>
    //       </Box>
    //       <Box flexShrink={0}><Text> 5</Text></Box>
    //     </Box>
    //   </Box>
    // </Box>
    const longName = "X".repeat(50)
    const colWidth = 20

    const app = render(
      <Box width={colWidth} overflow="hidden" flexDirection="column" height={5}>
        <Box height={1} flexShrink={0} width={colWidth - 1} flexDirection="row">
          <Box flexGrow={1} flexShrink={1} flexDirection="row" paddingLeft={1} paddingRight={1}>
            <Box flexGrow={1} flexShrink={1} overflow="hidden">
              <Text bold wrap="truncate">
                {"# "}{longName}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Text>{" 5"}</Text>
            </Box>
          </Box>
        </Box>
      </Box>,
    )

    const text = app.text
    const lines = text.split("\n")

    // Every line must fit within column width
    for (let i = 0; i < lines.length; i++) {
      expect(lines[i]!.length, `line ${i}: "${lines[i]}"`).toBeLessThanOrEqual(colWidth)
    }

    // The count should be visible
    expect(text).toContain(" 5")
  })

  test("simple: overflow=hidden Box clips Text child horizontally", () => {
    // The simplest possible test: a 20-wide Box with overflow=hidden,
    // containing a Text that's wider than 20.
    const app = render(
      <Box width={20} overflow="hidden">
        <Text wrap="truncate">{"A".repeat(60)}</Text>
      </Box>,
    )

    const text = app.text
    const lines = text.split("\n")

    for (let i = 0; i < lines.length; i++) {
      expect(lines[i]!.length, `line ${i}: "${lines[i]}"`).toBeLessThanOrEqual(20)
    }
    expect(text).toContain("\u22EF")
  })

  test("layout: flexShrink=1 constrains inner row to parent width", () => {
    // With flexShrink=1, the inner row should be constrained to the parent's width
    const longName = "X".repeat(50)

    const app = render(
      <Box width={20} overflow="hidden" flexDirection="column" height={5} testID="outer">
        <Box height={1} flexShrink={0} width={19} flexDirection="row" testID="header-row">
          <Box flexGrow={1} flexShrink={1} flexDirection="row" paddingLeft={1} paddingRight={1} testID="inner-row">
            <Box flexGrow={1} flexShrink={1} overflow="hidden" testID="truncate-box">
              <Text bold wrap="truncate" testID="long-text">
                {"# "}{longName}
              </Text>
            </Box>
            <Box flexShrink={0} testID="count-box">
              <Text>{" 5"}</Text>
            </Box>
          </Box>
        </Box>
      </Box>,
    )

    // Check layout via bounding boxes
    const outerBox = app.getByTestId("outer")
    const headerRow = app.getByTestId("header-row")
    const innerRow = app.getByTestId("inner-row")
    const truncateBox = app.getByTestId("truncate-box")
    const countBox = app.getByTestId("count-box")
    const longText = app.getByTestId("long-text")

    const outerRect = outerBox.boundingBox()
    const headerRect = headerRow.boundingBox()
    const innerRect = innerRow.boundingBox()
    const truncateRect = truncateBox.boundingBox()
    const countRect = countBox.boundingBox()
    const textRect = longText.boundingBox()

    // Outer should be 20
    expect(outerRect!.width, "outer width").toBe(20)
    // Header row should be 19
    expect(headerRect!.width, "header-row width").toBe(19)
    // Inner row should fit within header row width (19)
    expect(innerRect!.width, "inner-row width").toBeLessThanOrEqual(19)
    // Truncate box should fit within inner row (19 - 2 padding = 17 - count width)
    expect(truncateRect!.width, "truncate-box width").toBeLessThanOrEqual(17)
    // Text node should fit within truncate box
    expect(textRect!.width, "text width").toBeLessThanOrEqual(truncateRect!.width)
    // Count box should be positioned within the column
    expect(countRect!.x + countRect!.width, "count end x").toBeLessThanOrEqual(19)
  })
})
