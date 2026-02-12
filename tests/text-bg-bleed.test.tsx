/**
 * Tests for Text backgroundColor handling across wrapped lines.
 *
 * Bug: km-inkx.bg-bleed
 *
 * Background color from nested Text elements was embedded as ANSI codes
 * in collectTextContent(). When the text was word-wrapped by wrapText()
 * (which doesn't understand ANSI), the bg ANSI codes were broken across
 * line boundaries, causing bg to be lost on continuation lines.
 *
 * Fix: backgroundColor is now tracked as BgSegments (character offset ranges)
 * instead of being embedded as ANSI codes. After wrapping, the segments are
 * mapped to screen positions and applied at the buffer level.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "../src/testing/index.tsx"

describe("Text backgroundColor with wrapping (km-inkx.bg-bleed)", () => {
  const render = createRenderer({ cols: 30, rows: 10 })

  test("top-level Text bg covers text cells on wrapped lines", () => {
    // "Hello World Foo" wraps at width=10 to:
    //   Line 0: "Hello"
    //   Line 1: "World Foo"
    const app = render(
      <Box width={10} height={3}>
        <Text backgroundColor="blue">Hello World Foo</Text>
      </Box>,
    )

    const blue = 4 // blue palette index

    // Line 0: "Hello" (5 chars) should have blue bg
    for (let x = 0; x < 5; x++) {
      expect(app.term.cell(x, 0).bg).toBe(blue)
    }

    // Line 1: "World Foo" (9 chars) should have blue bg
    for (let x = 0; x < 9; x++) {
      expect(app.term.cell(x, 1).bg).toBe(blue)
    }
  })

  test("top-level Text bg does not bleed to trailing cells", () => {
    const app = render(
      <Box width={10} height={3}>
        <Text backgroundColor="blue">Hello World Foo</Text>
      </Box>,
    )

    const blue = 4

    // Trailing cells on line 0 after "Hello" should NOT have blue bg
    for (let x = 5; x < 10; x++) {
      expect(app.term.cell(x, 0).bg).not.toBe(blue)
    }
  })

  test("nested Text bg is preserved across wrapped lines", () => {
    // This is the core regression test for km-inkx.bg-bleed.
    // "Normal colored text here end" wraps at width=15 to:
    //   Line 0: "Normal colored"  (7 normal, 7 red)
    //   Line 1: "text here end"   (9 red, 1 space, 3 normal)
    //
    // Before the fix, "text here" on line 1 lost its red bg because
    // the ANSI code was broken by wrapText().
    const app = render(
      <Box width={15} height={3}>
        <Text>
          Normal <Text backgroundColor="red">colored text here</Text> end
        </Text>
      </Box>,
    )

    const red = 1 // red palette index

    // Line 0: "Normal " (7 chars, no bg) then "colored" (7 chars, red bg)
    // Verify "colored" has red bg
    for (let x = 7; x < 14; x++) {
      const cell = app.term.cell(x, 0)
      expect(cell.bg).toBe(red)
    }

    // Line 1: "text here" should have red bg (was broken before fix)
    const textCell = app.term.cell(0, 1)
    expect(textCell.char).toBe("t")
    expect(textCell.bg).toBe(red)

    // Check "text here" (9 chars) all have red bg
    for (let x = 0; x < 9; x++) {
      expect(app.term.cell(x, 1).bg).toBe(red)
    }

    // " end" should NOT have red bg
    const endCell = app.term.cell(10, 1)
    expect(endCell.bg).not.toBe(red)
  })

  test("short Text bg does not fill beyond text content", () => {
    // Text backgroundColor should only appear on text character cells,
    // not fill the entire layout width
    const app = render(
      <Box width={20} height={2}>
        <Text backgroundColor="green">Short</Text>
      </Box>,
    )

    const green = 2

    // "Short" (5 chars) should have green bg
    for (let x = 0; x < 5; x++) {
      expect(app.term.cell(x, 0).bg).toBe(green)
    }

    // Cells after "Short" should NOT have green bg
    for (let x = 5; x < 20; x++) {
      expect(app.term.cell(x, 0).bg).not.toBe(green)
    }
  })

  test("multiple nested bg segments work independently", () => {
    const app = render(
      <Box width={30} height={2}>
        <Text>
          <Text backgroundColor="red">Red</Text> gap <Text backgroundColor="blue">Blue</Text>
        </Text>
      </Box>,
    )

    const red = 1
    const blue = 4

    // "Red" (0-2) should be red
    for (let x = 0; x < 3; x++) {
      expect(app.term.cell(x, 0).bg).toBe(red)
    }

    // " gap " (3-7) should have no bg
    expect(app.term.cell(3, 0).bg).not.toBe(red)
    expect(app.term.cell(3, 0).bg).not.toBe(blue)

    // "Blue" should be blue
    const blueStart = app.text.indexOf("Blue")
    // The text starts at x=0, so find the column offset
    for (let x = blueStart; x < blueStart + 4; x++) {
      expect(app.term.cell(x, 0).bg).toBe(blue)
    }
  })

  test("bg segments map correctly when wrapped lines have repeated content", () => {
    // Regression test for km-inkx.findlinestart.
    // "aa bb aa cc" wraps at width=5 to:
    //   Line 0: "aa bb"
    //   Line 1: "aa cc"
    // The "aa" on line 1 must not get mapped to the "aa" on line 0.
    // The bg segment covers "bb aa" (chars 3-8), so:
    //   Line 0: cols 3-4 ("bb") should have red bg
    //   Line 1: cols 0-1 ("aa") should have red bg
    const app = render(
      <Box width={5} height={3}>
        <Text>
          aa <Text backgroundColor="red">bb aa</Text> cc
        </Text>
      </Box>,
    )

    const red = 1

    // Line 0: "aa bb" — "bb" at cols 3-4 should be red
    expect(app.term.cell(3, 0).bg).toBe(red)
    expect(app.term.cell(4, 0).bg).toBe(red)
    // "aa " at cols 0-2 should NOT be red
    expect(app.term.cell(0, 0).bg).not.toBe(red)

    // Line 1: "aa cc" — "aa" at cols 0-1 should be red
    expect(app.term.cell(0, 1).bg).toBe(red)
    expect(app.term.cell(1, 1).bg).toBe(red)
    // " cc" at cols 2-4 should NOT be red
    expect(app.term.cell(3, 1).bg).not.toBe(red)
  })

  test("bg segments work with truncated lines", () => {
    // Truncated text: "Hello World" at width=8 → "Hello W…"
    // The bg covers "World" (chars 6-10), only "W" is visible after truncation.
    const app = render(
      <Box width={8} height={2}>
        <Text wrap={false}>
          Hello <Text backgroundColor="red">World</Text>
        </Text>
      </Box>,
    )

    const red = 1

    // "W" at col 6 should have red bg (it's within the bg segment)
    expect(app.term.cell(6, 0).bg).toBe(red)
    // "Hello " at cols 0-5 should NOT be red
    expect(app.term.cell(0, 0).bg).not.toBe(red)
    expect(app.term.cell(5, 0).bg).not.toBe(red)
  })
})
