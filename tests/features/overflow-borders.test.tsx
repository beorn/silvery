/**
 * Overflow + Border Edge Case Tests
 *
 * Tests for:
 * - Multiple text nodes with border and word breaks
 * - Box intersecting left edge with border
 * - Out-of-bounds writes with border rendering
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/react"

describe("overflow border edge cases", () => {
  test("multiple text nodes with border: word breaks correctly", () => {
    const r = createRenderer({ cols: 20, rows: 10 })
    const app = r(
      <Box borderStyle="single" width={12}>
        <Text>Hello </Text>
        <Text>World</Text>
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Hello")
    expect(text).toContain("World")
    // Border should be intact
    const lines = text.split("\n")
    expect(lines[0]).toContain("┌")
    expect(lines[0]).toContain("┐")
  })

  test("box at x=0 with left border clips correctly", () => {
    // A box positioned at x=0 should render its left border at column 0
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box borderStyle="single" width={10}>
        <Text>Test</Text>
      </Box>,
    )
    const buffer = app.term.buffer
    // Left border at x=0
    const topLeft = buffer.getCell(0, 0)
    expect(topLeft.char).toBe("┌")

    // Content should be inside the border
    const text = stripAnsi(app.text)
    expect(text).toContain("Test")
  })

  test("border rendering respects buffer boundaries", () => {
    // Border box near the edge of the terminal
    const r = createRenderer({ cols: 10, rows: 5 })
    const app = r(
      <Box borderStyle="single" width={10}>
        <Text>Content</Text>
      </Box>,
    )
    const buffer = app.term.buffer
    // Right border at the last column
    const topRight = buffer.getCell(9, 0)
    expect(topRight.char).toBe("┐")

    // Bottom right border
    const bottomRight = buffer.getCell(9, 2)
    expect(bottomRight.char).toBe("┘")
  })

  test("out-of-bounds border rendering does not crash", () => {
    // Box wider than terminal
    const r = createRenderer({ cols: 5, rows: 5 })
    // This should not throw even though the border extends past buffer width
    const app = r(
      <Box borderStyle="single" width={20}>
        <Text>Test</Text>
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Test")
  })

  test("hidden border with content does not corrupt layout", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box borderStyle="single" borderLeft={false} borderRight={false} width={10}>
        <Text>Content</Text>
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Content")
    const lines = text.split("\n")
    // Top border should have horizontal lines but no corners
    expect(lines[0]).toContain("─")
    expect(lines[0]).not.toContain("┌")
    expect(lines[0]).not.toContain("┐")
  })
})
