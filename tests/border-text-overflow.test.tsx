/**
 * Regression test: text content must not overflow into border rows.
 *
 * When a Box has borderStyle, text children should be constrained to the
 * content area (inside the border). The text measure function must respect
 * the height constraint from the layout engine to prevent text lines from
 * rendering into border rows.
 *
 * See: km-inkx.border-text-overflow
 */

import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

describe("border text overflow", () => {
  test("wrapped text does not bleed into bottom border row", () => {
    const render = createRenderer({ cols: 20, rows: 10 })

    // A 10-wide, 5-high bordered box. Content area = 8x3.
    // "Hello World This Is Long Text" wraps to 5+ lines at width 8,
    // but only 3 should render (the content area height).
    const app = render(
      <Box borderStyle="single" width={10} height={5}>
        <Text>Hello World This Is Long Text</Text>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Line 0: top border
    expect(lines[0]).toMatch(/^┌────────┐/)

    // Lines 1-3: content rows with intact side borders
    expect(lines[1]).toMatch(/^│.{8}│$/)
    expect(lines[2]).toMatch(/^│.{8}│$/)
    expect(lines[3]).toMatch(/^│.{8}│$/)

    // Line 4: bottom border should be intact (no text bleeding in)
    expect(lines[4]).toMatch(/^└────────┘/)
  })

  test("text node height is constrained to content area inside border", () => {
    const render = createRenderer({ cols: 20, rows: 10 })

    const app = render(
      <Box borderStyle="single" width={10} height={5} testID="box">
        <Text testID="text">Hello World This Is Long Text</Text>
      </Box>,
    )

    const textBox = app.getByTestId("text").boundingBox()!
    // Text should be at (1,1) with width=8 (or less) and height<=3
    // The content area is 8 wide and 3 tall (10-2 borders, 5-2 borders)
    expect(textBox.x).toBe(1)
    expect(textBox.y).toBe(1)
    expect(textBox.width).toBeLessThanOrEqual(8)
    expect(textBox.height).toBeLessThanOrEqual(3)
  })

  test("truncated text does not bleed into right border", () => {
    const render = createRenderer({ cols: 20, rows: 5 })

    // wrap=false (truncate mode) — text should truncate at content width
    const app = render(
      <Box borderStyle="single" width={10} height={3}>
        <Text wrap={false}>ABCDEFGHIJ</Text>
      </Box>,
    )

    const lines = app.text.split("\n")
    // Right border should be intact
    expect(lines[1]).toMatch(/│$/)
    // Full text should not appear
    expect(lines[1]).not.toContain("ABCDEFGHIJ")
  })

  test("round border text overflow", () => {
    const render = createRenderer({ cols: 20, rows: 10 })

    const app = render(
      <Box borderStyle="round" width={10} height={5}>
        <Text>Hello World This Is Long Text</Text>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Bottom border should be intact
    expect(lines[4]).toMatch(/^╰────────╯/)
  })
})
