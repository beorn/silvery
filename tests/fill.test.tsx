/**
 * Tests for the Fill component.
 *
 * Fill repeats its children's text content to fill available width.
 * Single-pass mode (no max): parent must use flexBasis={0} so the
 * long text doesn't inflate the flex item's basis.
 * Exact-fit mode (with max): uses useContentRect for precise count.
 *
 * Note: hightea defaults to flexDirection="column" (like Ink), so horizontal
 * layouts need explicit flexDirection="row".
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@hightea/term/testing"
import { Box, Text, Fill } from "@hightea/term"

const render = createRenderer({ cols: 40, rows: 10 })

describe("Fill component", () => {
  test("repeats single character to fill parent width", () => {
    const app = render(
      <Box width={20} flexDirection="row">
        <Box flexGrow={1} flexBasis={0}>
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
      <Box width={10} flexDirection="row">
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text>-=</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain("-=-=-=")
  })

  test("fills remaining space in a row", () => {
    const app = render(
      <Box width={20} flexDirection="row">
        <Text>abc</Text>
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text>.</Text>
          </Fill>
        </Box>
        <Text>xyz</Text>
      </Box>,
    )
    expect(app.text).toContain("abc")
    expect(app.text).toContain("xyz")
    expect(app.text).toContain(".".repeat(14))
  })

  test("handles zero available width", () => {
    const app = render(
      <Box width={5} flexDirection="row">
        <Text>12345</Text>
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text>.</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain("12345")
  })

  test("handles pattern wider than available space", () => {
    const app = render(
      <Box width={3} flexDirection="row">
        <Box flexGrow={1} flexBasis={0}>
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
      <Box width={10} flexDirection="row">
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text dimColor>.</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain(".".repeat(10))
    // hightea emits SGR with reset prefix: \x1b[0;2m
    expect(app.ansi).toMatch(/\x1b\[\d*;?2m/)
  })

  test("works with plain string children", () => {
    const app = render(
      <Box width={10} flexDirection="row">
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text>-</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain("-".repeat(10))
  })

  test("dot leader pattern: key...description", () => {
    const app = render(
      <Box width={30} flexDirection="row">
        <Text color="yellow">hjkl</Text>
        <Text> </Text>
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text dimColor>.</Text>
          </Fill>
        </Box>
        <Text> </Text>
        <Text>navigate</Text>
      </Box>,
    )
    expect(app.text).toContain("hjkl")
    expect(app.text).toContain("navigate")
    expect(app.text).toContain("................")
  })

  test("section header pattern: ── TITLE ────", () => {
    const app = render(
      <Box width={30} flexDirection="row">
        <Text dimColor>── </Text>
        <Text bold>NAVIGATION</Text>
        <Box flexGrow={1} flexBasis={0}>
          <Fill>
            <Text dimColor> ─</Text>
          </Fill>
        </Box>
      </Box>,
    )
    expect(app.text).toContain("──")
    expect(app.text).toContain("NAVIGATION")
    expect(app.text).toContain(" ─")
  })
})
