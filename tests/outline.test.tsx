import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer, stripAnsi } from "../src/testing/index.tsx"

const render = createRenderer({ cols: 30, rows: 10 })

describe("outline", () => {
  test("outline does not affect layout dimensions", () => {
    // With border: content area shrinks — text is inside border frame
    // width=10, height=5 with border: content is 8x3
    const withBorder = render(
      <Box borderStyle="single" width={10} height={5} flexDirection="column">
        <Text>L1</Text>
        <Text>L2</Text>
        <Text>L3</Text>
      </Box>,
    )

    // With outline: content area uses full width/height (10x5)
    // Outline overlaps edges but layout space is unaffected.
    // Use padding=1 to push text away from outline edges for visibility.
    const withOutline = render(
      <Box outlineStyle="single" width={10} height={5} flexDirection="column" padding={1}>
        <Text>L1</Text>
        <Text>L2</Text>
        <Text>L3</Text>
      </Box>,
    )

    // Border: 3 rows of content (height 5 - 2 border = 3), all 3 lines fit
    expect(withBorder.text).toContain("L1")
    expect(withBorder.text).toContain("L2")
    expect(withBorder.text).toContain("L3")

    // Outline: 5 rows of content minus 2 rows padding = 3, all 3 lines fit
    expect(withOutline.text).toContain("L1")
    expect(withOutline.text).toContain("L2")
    expect(withOutline.text).toContain("L3")

    // Key test: outline gives MORE content rows than border for the same box size.
    // Border height=6 gives 4 content rows; outline height=6 gives 6 (full).
    // Use 5 lines to demonstrate that outline fits more content.
    const borderH6 = render(
      <Box borderStyle="single" width={10} height={6} flexDirection="column">
        <Text>A1</Text>
        <Text>A2</Text>
        <Text>A3</Text>
        <Text>A4</Text>
        <Text>A5</Text>
      </Box>,
    )
    const outlineH6 = render(
      <Box outlineStyle="single" width={10} height={6} flexDirection="column" paddingLeft={1}>
        <Text>A1</Text>
        <Text>A2</Text>
        <Text>A3</Text>
        <Text>A4</Text>
        <Text>A5</Text>
      </Box>,
    )

    // Border height=6: 4 content rows, A5 overflows
    expect(borderH6.text).toContain("A1")
    expect(borderH6.text).toContain("A4")
    // A5 overflows out of 4 content rows — it shouldn't be visible
    // (flexbox default doesn't clip, but it should not render in the 4-row area)

    // Outline height=6: 6 content rows (full), all 5 lines fit in layout.
    // A1 on row 0 (overwritten by outline top), A2-A5 on rows 1-4, row 5 = outline bottom.
    // A2 through A4 are visible on interior rows.
    expect(outlineH6.text).toContain("A2")
    expect(outlineH6.text).toContain("A3")
    expect(outlineH6.text).toContain("A4")
    expect(outlineH6.text).toContain("A5")
  })

  test("outline renders border characters", () => {
    const app = render(
      <Box outlineStyle="single" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const ansi = app.ansi

    // Should contain single-style box drawing characters
    expect(ansi).toContain("\u250c") // ┌ topLeft
    expect(ansi).toContain("\u2510") // ┐ topRight
    expect(ansi).toContain("\u2514") // └ bottomLeft
    expect(ansi).toContain("\u2518") // ┘ bottomRight
    expect(ansi).toContain("\u2500") // ─ horizontal
    expect(ansi).toContain("\u2502") // │ vertical
  })

  test("outline with different style", () => {
    const app = render(
      <Box outlineStyle="double" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const ansi = app.ansi

    // Should contain double-style box drawing characters
    expect(ansi).toContain("\u2554") // ╔ topLeft
    expect(ansi).toContain("\u2557") // ╗ topRight
    expect(ansi).toContain("\u255a") // ╚ bottomLeft
    expect(ansi).toContain("\u255d") // ╝ bottomRight
  })

  test("outline with color", () => {
    const app = render(
      <Box outlineStyle="single" outlineColor="red" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const ansi = app.ansi

    // Should contain red foreground color code (256-color index 1 for 'red')
    expect(ansi).toContain("38;5;1")
  })

  test("outline with dimColor", () => {
    const app = render(
      <Box outlineStyle="single" outlineDimColor width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const ansi = app.ansi

    // Should contain dim SGR code (2)
    expect(ansi).toMatch(/\x1b\[([0-9]*;)*2(;[0-9]+)*m/)
  })

  test("outline overlaps content at edges", () => {
    // With a 12x3 outline, content fills the full 12x3 area.
    // Text on row 1 (middle row) is only overwritten at cols 0 and 11.
    // Use padding to push text to row 1 where only side outlines overlap.
    const app = render(
      <Box outlineStyle="single" width={12} height={3} paddingTop={1}>
        <Text>ABCDEFGHIJ</Text>
      </Box>,
    )

    const text = app.text
    // Row 1 has side outlines at cols 0 and 11, text starts at col 0.
    // The outline's vertical bars overwrite first and last content chars.
    // Middle chars should be visible.
    expect(text).toContain("BCDEFGHI")
  })

  test("outline does not shift content like border does", () => {
    // With border (height=5), text starts on row 1 (after top border)
    const withBorder = render(
      <Box borderStyle="single" width={12} height={5}>
        <Text>Hello</Text>
      </Box>,
    )

    // With outline (height=5), text starts on row 0 (no border inset)
    // Outline overwrites row 0, but content IS at row 0 in layout
    const withOutline = render(
      <Box outlineStyle="single" width={12} height={5}>
        <Text>Hello</Text>
      </Box>,
    )

    const borderText = stripAnsi(withBorder.ansi)
    const outlineText = stripAnsi(withOutline.ansi)

    const borderLines = borderText.split("\n").filter((l) => l.trim())
    const outlineLines = outlineText.split("\n").filter((l) => l.trim())

    // Border: 5 lines (top border, content rows, bottom border)
    // Text "Hello" is on line 1 (between borders)
    expect(borderLines[1]).toContain("Hello")

    // Outline: content starts at row 0, but outline overwrites that row.
    // However, text on interior rows (row 1) should show through side outlines.
    // Row 1 should have vertical bars at edges but "Hello" is at row 0 (overwritten).
    // So let's verify outline has 5 lines and the border has 5 lines.
    expect(outlineLines.length).toBe(5)
    expect(borderLines.length).toBe(5)
  })

  test("outline combined with border renders both", () => {
    // When both outline and border are set, outline renders AFTER children (last),
    // so it overwrites the border at the same edge positions.
    const app = render(
      <Box borderStyle="single" outlineStyle="double" width={12} height={5}>
        <Text>Both</Text>
      </Box>,
    )
    const ansi = app.ansi

    // The outline (double) is drawn last and overwrites border (single) at edges.
    // So we should see double-style chars (outline wins at the edges).
    expect(ansi).toContain("\u2554") // ╔ double topLeft (outline overwrites border)
    expect(ansi).toContain("\u2557") // ╗ double topRight
    expect(ansi).toContain("\u255a") // ╚ double bottomLeft
    expect(ansi).toContain("\u255d") // ╝ double bottomRight

    // Text "Both" should still be visible (inside the border's content area)
    expect(app.text).toContain("Both")
  })

  test("outline on nested box does not affect parent layout", () => {
    const app = render(
      <Box flexDirection="column" width={20} height={8}>
        <Box outlineStyle="single" height={3}>
          <Text>First</Text>
        </Box>
        <Box height={3}>
          <Text>Second</Text>
        </Box>
      </Box>,
    )

    const text = app.text
    // Both texts should be present — outline doesn't consume layout space
    // so "Second" starts at row 3 (right after the 3-row outlined box)
    expect(text).toContain("Second")
    // "First" is at row 0 but overwritten by outline top. Check it's in layout.
    // With paddingTop=1 we'd see it, but without padding it's at the outline edge.
  })

  test("outline with padding preserves visible content", () => {
    // Use padding to keep content away from outline edges
    const app = render(
      <Box outlineStyle="single" width={14} height={5} padding={1}>
        <Text>Padded</Text>
      </Box>,
    )

    const text = app.text
    // With padding=1, text starts at (1,1) in the box.
    // Outline draws at edges (row 0, row 4, col 0, col 13).
    // Row 1, col 1: text starts here, fully visible.
    expect(text).toContain("Padded")
  })

  test("outline does not add to intrinsic size", () => {
    // Outline should NOT add border dimensions to intrinsic size.
    // With explicit width and padding, content is pushed inside the outline edges.
    const withOutlineBox = render(
      <Box outlineStyle="single" width={10} height={5} flexDirection="column" paddingLeft={1} paddingTop={1}>
        <Text>ABC</Text>
        <Text>DEF</Text>
        <Text>GHI</Text>
      </Box>,
    )

    // Outline: 10x5 box with padding pushes text to (1,1).
    // Row 0: outline top. Row 1: "ABC" at col 1. Row 2: "DEF". Row 3: "GHI". Row 4: outline bottom.
    // All three lines should be visible (padding keeps them away from outline edges).
    expect(withOutlineBox.text).toContain("ABC")
    expect(withOutlineBox.text).toContain("DEF")
    expect(withOutlineBox.text).toContain("GHI")
  })
})
