/**
 * Tests for the Fill component.
 *
 * Fill repeats its children's text content to fill available width.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "inkx/testing"
import { Box, Text, Fill } from "inkx"

const render = createRenderer({ cols: 40, rows: 10 })

describe("Fill component", () => {
  test("repeats single character to fill parent width", () => {
    const app = render(
      <Box width={20}>
        <Box flexGrow={1}>
          <Fill>
            <Text>.</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain(".".repeat(20))
  })

  test("repeats multi-character pattern", () => {
    const app = render(
      <Box width={10}>
        <Box flexGrow={1}>
          <Fill>
            <Text>-=</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain("-=-=-=-=-=")
  })

  test("fills remaining space in a row", () => {
    const app = render(
      <Box width={20}>
        <Text>abc</Text>
        <Box flexGrow={1}>
          <Fill>
            <Text>.</Text>
          </Fill>
        </Box>
        <Text>xyz</Text>
      </Box>,
    )
    // abc + 14 dots + xyz = 20
    expect(app.text).toContain("abc" + ".".repeat(14) + "xyz")
  })

  test("respects max prop", () => {
    const app = render(
      <Box width={20}>
        <Fill max={5}>
          <Text>*</Text>
        </Fill>
      </Box>,
    )
    expect(app.text).toContain("*****")
    expect(app.text).not.toContain("******")
  })

  test("handles zero available width", () => {
    const app = render(
      <Box width={5}>
        <Text>12345</Text>
        <Box flexGrow={1}>
          <Fill>
            <Text>.</Text>
          </Fill>
        </Box>
      </Box>,
    )
    // No space for dots, should not crash
    expect(app.text).toContain("12345")
  })

  test("handles pattern wider than available space", () => {
    const app = render(
      <Box width={3}>
        <Box flexGrow={1}>
          <Fill>
            <Text>abcde</Text>
          </Fill>
        </Box>
      </Box>,
    )
    // Pattern is 5 chars wide, only 3 available — partial fill: "abc"
    expect(app.text).toContain("abc")
  })

  test("preserves Text styling (dimColor)", () => {
    const app = render(
      <Box width={10}>
        <Box flexGrow={1}>
          <Fill>
            <Text dimColor>.</Text>
          </Fill>
        </Box>
      </Box>,
    )
    // The dots should be present and styled
    expect(app.text).toContain(".".repeat(10))
    // Check ANSI output contains dim escape codes
    expect(app.ansi).toContain("\x1b[2m")
  })

  test("works with plain string children", () => {
    const app = render(
      <Box width={10}>
        <Box flexGrow={1}>
          <Fill>-</Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain("-".repeat(10))
  })

  test("dot leader pattern: key...description", () => {
    const app = render(
      <Box width={30}>
        <Text color="yellow">hjkl</Text>
        <Text> </Text>
        <Box flexGrow={1}>
          <Fill>
            <Text dimColor>.</Text>
          </Fill>
        </Box>
        <Text> </Text>
        <Text>navigate</Text>
      </Box>,
    )
    // hjkl + space + dots + space + navigate = 30
    // 4 + 1 + dots + 1 + 8 = 30 → dots = 16
    expect(app.text).toContain("hjkl")
    expect(app.text).toContain("navigate")
    expect(app.text).toContain(".".repeat(16))
  })

  test("section header pattern: ── TITLE ────", () => {
    const app = render(
      <Box width={30}>
        <Text dimColor>── </Text>
        <Text bold>NAVIGATION</Text>
        <Box flexGrow={1}>
          <Fill>
            <Text dimColor> ─</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain("── ")
    expect(app.text).toContain("NAVIGATION")
    expect(app.text).toContain(" ─")
  })
})
