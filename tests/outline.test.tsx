import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer, stripAnsi } from "inkx/testing"

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

  test("round style outline", () => {
    const app = render(
      <Box outlineStyle="round" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const ansi = app.ansi

    // Round style uses curved corner characters
    expect(ansi).toContain("\u256d") // ╭ topLeft
    expect(ansi).toContain("\u256e") // ╮ topRight
    expect(ansi).toContain("\u2570") // ╰ bottomLeft
    expect(ansi).toContain("\u256f") // ╯ bottomRight
    expect(ansi).toContain("\u2500") // ─ horizontal
    expect(ansi).toContain("\u2502") // │ vertical
  })

  test("dynamic outline — add outline between renders", () => {
    // Initial render without outline
    const app = render(
      <Box width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const textBefore = stripAnsi(app.ansi)
    // Should NOT have box drawing characters
    expect(textBefore).not.toContain("\u250c")
    expect(textBefore).not.toContain("\u2510")

    // Re-render with outline added
    app.rerender(
      <Box outlineStyle="single" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const ansiAfter = app.ansi
    // Should now have single-style box drawing characters
    expect(ansiAfter).toContain("\u250c") // ┌
    expect(ansiAfter).toContain("\u2510") // ┐
    expect(ansiAfter).toContain("\u2514") // └
    expect(ansiAfter).toContain("\u2518") // ┘
  })

  test("dynamic outline — change style between renders", () => {
    // Initial render with single outline
    const app = render(
      <Box outlineStyle="single" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    expect(app.ansi).toContain("\u250c") // ┌ single topLeft

    // Re-render with double outline
    app.rerender(
      <Box outlineStyle="double" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    expect(app.ansi).toContain("\u2554") // ╔ double topLeft
    expect(app.ansi).not.toContain("\u250c") // ┌ single should be gone
  })

  test("outline color change between renders", () => {
    // Initial render with red outline
    const app = render(
      <Box outlineStyle="single" outlineColor="red" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    // Red = 256-color index 1
    expect(app.ansi).toContain("38;5;1")

    // Re-render with blue outline
    app.rerender(
      <Box outlineStyle="single" outlineColor="blue" width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    // Blue = 256-color index 4
    expect(app.ansi).toContain("38;5;4")
    // Red should no longer be present in outline cells
    // (text "Test" has no color, so 38;5;1 should be gone)
    expect(app.ansi).not.toContain("38;5;1")
  })

  test("outline with overflow='hidden'", () => {
    // Use padding to push text away from outline edges so it's visible
    const app = render(
      <Box outlineStyle="single" width={14} height={3} overflow="hidden" paddingTop={1} paddingLeft={1}>
        <Text>Test</Text>
      </Box>,
    )
    const ansi = app.ansi

    // Outline should still render with overflow hidden
    expect(ansi).toContain("\u250c") // ┌
    expect(ansi).toContain("\u2510") // ┐
    expect(ansi).toContain("\u2514") // └
    expect(ansi).toContain("\u2518") // ┘
    // Text is on interior row with padding, so it's visible
    expect(app.text).toContain("Test")
  })

  test("outline with backgroundColor inherits bg on outline cells", () => {
    const app = render(
      <Box outlineStyle="single" backgroundColor="blue" width={10} height={3} padding={1}>
        <Text>Hi</Text>
      </Box>,
    )

    // Access the buffer to verify outline cells have the box's bg color
    const buffer = app.term.buffer!
    // Top-left corner cell (0, 0) should have bg = blue (256-color index 4)
    const topLeft = buffer.getCell(0, 0)
    expect(topLeft.char).toBe("\u250c") // ┌
    expect(topLeft.bg).toBe(4) // blue = index 4

    // Top-right corner cell (9, 0)
    const topRight = buffer.getCell(9, 0)
    expect(topRight.char).toBe("\u2510") // ┐
    expect(topRight.bg).toBe(4)

    // Bottom-left corner cell (0, 2)
    const bottomLeft = buffer.getCell(0, 2)
    expect(bottomLeft.char).toBe("\u2514") // └
    expect(bottomLeft.bg).toBe(4)

    // Horizontal cell on top row (1, 0)
    const topHoriz = buffer.getCell(1, 0)
    expect(topHoriz.char).toBe("\u2500") // ─
    expect(topHoriz.bg).toBe(4)

    // Vertical cell on left side (0, 1)
    const leftVert = buffer.getCell(0, 1)
    expect(leftVert.char).toBe("\u2502") // │
    expect(leftVert.bg).toBe(4)
  })

  test("outline in scroll container", () => {
    // An outlined box inside a scrollable container
    const app = render(
      <Box overflow="scroll" height={5} width={20} flexDirection="column">
        <Box outlineStyle="single" height={3} width={18}>
          <Text>ScrollItem</Text>
        </Box>
        <Box height={3} width={18}>
          <Text>Below</Text>
        </Box>
      </Box>,
    )

    // The outlined box should render its outline characters
    const ansi = app.ansi
    expect(ansi).toContain("\u250c") // ┌
    expect(ansi).toContain("\u2510") // ┐
    // Content should be visible
    expect(app.text).toContain("Below")
  })

  test("all 7 outline styles render correct characters", () => {
    const styles = [
      {
        style: "single" as const,
        tl: "\u250c",
        tr: "\u2510",
        bl: "\u2514",
        br: "\u2518",
        h: "\u2500",
        v: "\u2502",
      },
      {
        style: "double" as const,
        tl: "\u2554",
        tr: "\u2557",
        bl: "\u255a",
        br: "\u255d",
        h: "\u2550",
        v: "\u2551",
      },
      {
        style: "round" as const,
        tl: "\u256d",
        tr: "\u256e",
        bl: "\u2570",
        br: "\u256f",
        h: "\u2500",
        v: "\u2502",
      },
      {
        style: "bold" as const,
        tl: "\u250f",
        tr: "\u2513",
        bl: "\u2517",
        br: "\u251b",
        h: "\u2501",
        v: "\u2503",
      },
      {
        style: "classic" as const,
        tl: "+",
        tr: "+",
        bl: "+",
        br: "+",
        h: "-",
        v: "|",
      },
      {
        style: "singleDouble" as const,
        tl: "\u2553",
        tr: "\u2556",
        bl: "\u2559",
        br: "\u255c",
        h: "\u2500",
        v: "\u2551",
      },
      {
        style: "doubleSingle" as const,
        tl: "\u2552",
        tr: "\u2555",
        bl: "\u2558",
        br: "\u255b",
        h: "\u2550",
        v: "\u2502",
      },
    ]

    for (const { style, tl, tr, bl, br, h, v } of styles) {
      const app = render(
        <Box outlineStyle={style} width={10} height={3}>
          <Text>X</Text>
        </Box>,
      )
      const buffer = app.term.buffer!

      // Check corners and edges via buffer cells
      expect(buffer.getCell(0, 0).char).toBe(tl) // top-left
      expect(buffer.getCell(9, 0).char).toBe(tr) // top-right
      expect(buffer.getCell(0, 2).char).toBe(bl) // bottom-left
      expect(buffer.getCell(9, 2).char).toBe(br) // bottom-right
      expect(buffer.getCell(1, 0).char).toBe(h) // horizontal top
      expect(buffer.getCell(0, 1).char).toBe(v) // vertical left
    }
  })

  test("partial outline — outlineTop={false}", () => {
    const app = render(
      <Box outlineStyle="single" outlineTop={false} width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const buffer = app.term.buffer!

    // Top row should NOT have outline characters
    expect(buffer.getCell(0, 0).char).not.toBe("\u250c")
    expect(buffer.getCell(1, 0).char).not.toBe("\u2500")
    expect(buffer.getCell(9, 0).char).not.toBe("\u2510")

    // Bottom row should still have outline
    expect(buffer.getCell(0, 2).char).toBe("\u2514") // └
    expect(buffer.getCell(9, 2).char).toBe("\u2518") // ┘
    expect(buffer.getCell(1, 2).char).toBe("\u2500") // ─

    // Side outlines should extend to row 0 (since top is hidden)
    expect(buffer.getCell(0, 0).char).toBe("\u2502") // │ on row 0
    expect(buffer.getCell(0, 1).char).toBe("\u2502") // │ on row 1
  })

  test("partial outline — outlineBottom={false}", () => {
    const app = render(
      <Box outlineStyle="single" outlineBottom={false} width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const buffer = app.term.buffer!

    // Top row should still have outline
    expect(buffer.getCell(0, 0).char).toBe("\u250c") // ┌
    expect(buffer.getCell(9, 0).char).toBe("\u2510") // ┐

    // Bottom row should NOT have outline characters
    expect(buffer.getCell(0, 2).char).not.toBe("\u2514")
    expect(buffer.getCell(9, 2).char).not.toBe("\u2518")
    expect(buffer.getCell(1, 2).char).not.toBe("\u2500")

    // Side outlines should extend to row 2 (since bottom is hidden)
    expect(buffer.getCell(0, 2).char).toBe("\u2502") // │ on row 2
  })

  test("partial outline — outlineLeft={false}", () => {
    const app = render(
      <Box outlineStyle="single" outlineLeft={false} width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const buffer = app.term.buffer!

    // Left column should NOT have outline characters
    expect(buffer.getCell(0, 0).char).not.toBe("\u250c")
    expect(buffer.getCell(0, 1).char).not.toBe("\u2502")
    expect(buffer.getCell(0, 2).char).not.toBe("\u2514")

    // Right column should still have outline
    expect(buffer.getCell(9, 0).char).toBe("\u2510") // ┐ (topRight still renders when showTop=true)
    expect(buffer.getCell(9, 1).char).toBe("\u2502") // │
    expect(buffer.getCell(9, 2).char).toBe("\u2518") // ┘

    // Top horizontal should still render (except at corners)
    expect(buffer.getCell(1, 0).char).toBe("\u2500") // ─
  })

  test("partial outline — outlineRight={false}", () => {
    const app = render(
      <Box outlineStyle="single" outlineRight={false} width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const buffer = app.term.buffer!

    // Right column should NOT have outline characters
    expect(buffer.getCell(9, 0).char).not.toBe("\u2510")
    expect(buffer.getCell(9, 1).char).not.toBe("\u2502")
    expect(buffer.getCell(9, 2).char).not.toBe("\u2518")

    // Left column should still have outline
    expect(buffer.getCell(0, 0).char).toBe("\u250c") // ┌
    expect(buffer.getCell(0, 1).char).toBe("\u2502") // │
    expect(buffer.getCell(0, 2).char).toBe("\u2514") // └
  })

  test("partial outline — only horizontal edges", () => {
    // Show top and bottom but no left/right
    const app = render(
      <Box outlineStyle="single" outlineLeft={false} outlineRight={false} width={10} height={3}>
        <Text>Test</Text>
      </Box>,
    )
    const buffer = app.term.buffer!

    // Top horizontal line should render (no corners since left/right are hidden)
    expect(buffer.getCell(1, 0).char).toBe("\u2500") // ─
    expect(buffer.getCell(5, 0).char).toBe("\u2500") // ─

    // Bottom horizontal line should render
    expect(buffer.getCell(1, 2).char).toBe("\u2500") // ─

    // No vertical edges
    expect(buffer.getCell(0, 1).char).not.toBe("\u2502")
    expect(buffer.getCell(9, 1).char).not.toBe("\u2502")

    // No corners (corners require both adjacent edges)
    expect(buffer.getCell(0, 0).char).not.toBe("\u250c")
    expect(buffer.getCell(9, 0).char).not.toBe("\u2510")
  })
})
