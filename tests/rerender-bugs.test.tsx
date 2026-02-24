/**
 * Re-render Bug Reproduction Tests
 *
 * Tests for bugs observed in inkx examples:
 * 1. Colors lost after scrolling/state changes
 * 2. Style bleeding across re-renders
 * 3. Diff output not properly resetting styles
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { TerminalBuffer, cellEquals, styleEquals } from "../src/buffer.js"
import { Box, Text } from "../src/index.js"
import { outputPhase } from "../src/pipeline.js"
import { createRenderer, stripAnsi } from "inkx/testing"

const render = createRenderer()

describe("Bug: Colors lost after re-render", () => {
  test("colored text should retain color after rerender", () => {
    // Use simple stateless components to avoid hook issues
    function ColoredText({ count }: { count: number }) {
      return (
        <Box flexDirection="column">
          <Text color="red">Red text: {count}</Text>
          <Text color="green">Green text: {count}</Text>
          <Text color="blue">Blue text: {count}</Text>
        </Box>
      )
    }

    const app = render(<ColoredText count={0} />)

    // Initial render should have content
    const frame1 = app.ansi
    expect(stripAnsi(frame1)).toContain("Red text: 0")
    expect(stripAnsi(frame1)).toContain("Green text: 0")
    expect(stripAnsi(frame1)).toContain("Blue text: 0")

    // Check that ANSI color codes are present
    expect(frame1).toMatch(/\x1b\[/)

    // Rerender with updated count
    app.rerender(<ColoredText count={1} />)

    const frame2 = app.ansi
    expect(stripAnsi(frame2)).toContain("Red text: 1")
    // Colors should still be present
    expect(frame2).toMatch(/\x1b\[/)
  })

  test("selection highlight should persist after navigation", () => {
    function SelectableList({ selected }: { selected: number }) {
      const items = ["Item 1", "Item 2", "Item 3"]

      return (
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text
              key={i}
              backgroundColor={i === selected ? "cyan" : undefined}
              color={i === selected ? "black" : undefined}
            >
              {item}
            </Text>
          ))}
        </Box>
      )
    }

    const app = render(<SelectableList selected={0} />)

    // Initial render should show first item selected
    const frame1 = app.ansi
    expect(stripAnsi(frame1)).toContain("Item 1")

    // Move selection to second item
    app.rerender(<SelectableList selected={1} />)

    const frame2 = app.ansi
    expect(stripAnsi(frame2)).toContain("Item 1")
    expect(stripAnsi(frame2)).toContain("Item 2")
    expect(stripAnsi(frame2)).toContain("Item 3")
    // Should have ANSI codes for the new selection
    expect(frame2).toMatch(/\x1b\[/)
  })
})

describe("Bug: Style bleeding in diff output", () => {
  test("style reset should happen before each cell change", () => {
    // Create two buffers with different styles in same positions
    const prev = new TerminalBuffer(10, 2)
    prev.setCell(0, 0, { char: "A", fg: 1, bg: null, attrs: { bold: true } }) // Red bold
    prev.setCell(1, 0, { char: "B", fg: 2, bg: null, attrs: {} }) // Green

    const next = new TerminalBuffer(10, 2)
    next.setCell(0, 0, { char: "A", fg: null, bg: null, attrs: {} }) // No style
    next.setCell(1, 0, { char: "C", fg: 3, bg: null, attrs: {} }) // Yellow

    const output = outputPhase(prev, next)

    // The output should contain style resets
    // Each changed cell should have its own style applied correctly
    expect(output).toContain("\x1b[") // Contains escape sequences

    // Should not be empty since styles changed
    expect(output.length).toBeGreaterThan(0)
  })

  test("clearing a styled cell should reset to default style", () => {
    const prev = new TerminalBuffer(5, 1)
    prev.setCell(0, 0, { char: "X", fg: 1, bg: 6, attrs: { bold: true } }) // Red on cyan, bold

    const next = new TerminalBuffer(5, 1)
    next.setCell(0, 0, { char: " ", fg: null, bg: null, attrs: {} }) // Empty, no style

    const output = outputPhase(prev, next)

    // Should output the change with reset style
    expect(output.length).toBeGreaterThan(0)
  })

  test("buffer diff detects style-only changes", () => {
    const prev = new TerminalBuffer(5, 1)
    prev.setCell(0, 0, { char: "A", fg: 1, bg: null, attrs: {} }) // Red

    const next = new TerminalBuffer(5, 1)
    next.setCell(0, 0, { char: "A", fg: 2, bg: null, attrs: {} }) // Green (same char, different color)

    // Cells should not be equal
    const prevCell = prev.getCell(0, 0)
    const nextCell = next.getCell(0, 0)
    expect(cellEquals(prevCell, nextCell)).toBe(false)

    // Output should have the change
    const output = outputPhase(prev, next)
    expect(output.length).toBeGreaterThan(0)
  })
})

describe("Bug: Text content overwriting", () => {
  test("shorter text should clear previous longer text", () => {
    function DynamicText({ text }: { text: string }) {
      return <Text>{text}</Text>
    }

    const app = render(<DynamicText text="Hello World" />)

    const frame1 = app.ansi
    expect(stripAnsi(frame1)).toContain("Hello World")

    app.rerender(<DynamicText text="Hi" />)

    const frame2 = app.ansi
    // "Hi" should be there
    expect(stripAnsi(frame2)).toContain("Hi")
    // "World" from previous frame should NOT be there
    expect(stripAnsi(frame2)).not.toContain("World")
  })

  test("multi-line content should clear properly on resize", () => {
    function MultiLine({ lines }: { lines: string[] }) {
      return (
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<MultiLine lines={["Line 1", "Line 2", "Line 3"]} />)

    const frame1 = app.ansi
    expect(stripAnsi(frame1)).toContain("Line 1")
    expect(stripAnsi(frame1)).toContain("Line 2")
    expect(stripAnsi(frame1)).toContain("Line 3")

    // Reduce to fewer lines
    app.rerender(<MultiLine lines={["New Line"]} />)

    const frame2 = app.ansi
    expect(stripAnsi(frame2)).toContain("New Line")
    // Old lines should be gone
    expect(stripAnsi(frame2)).not.toContain("Line 2")
    expect(stripAnsi(frame2)).not.toContain("Line 3")
  })
})

describe("Bug: Buffer dimension changes", () => {
  test("buffer resize should clear old content", () => {
    const prev = new TerminalBuffer(20, 5)
    prev.setCell(15, 0, { char: "X" }) // Far right
    prev.setCell(0, 4, { char: "Y" }) // Bottom left

    // Smaller buffer
    const next = new TerminalBuffer(10, 3)
    next.setCell(0, 0, { char: "A" })

    // This is a fresh render scenario - prev is null conceptually
    // But if we're comparing, we need to handle size mismatch
    const output = outputPhase(null, next)

    // Should render the new content
    expect(output).toContain("A")
  })
})

describe("Bug: Scroll container style preservation", () => {
  test("scrolling should preserve child styles", () => {
    function ScrollableList({ scrollOffset }: { scrollOffset: number }) {
      const items = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`)

      return (
        <Box flexDirection="column" height={5} overflow="hidden">
          {items.slice(scrollOffset, scrollOffset + 5).map((item, i) => (
            <Text key={i} color={i === 0 ? "cyan" : undefined}>
              {item}
            </Text>
          ))}
        </Box>
      )
    }

    const app = render(<ScrollableList scrollOffset={0} />)

    const frame1 = app.ansi
    expect(stripAnsi(frame1)).toContain("Item 1")

    // After scroll, colors should still work
    app.rerender(<ScrollableList scrollOffset={2} />)

    const frame2 = app.ansi
    expect(stripAnsi(frame2)).toContain("Item 3") // First visible after scroll
    // Should still have ANSI codes for cyan
    expect(frame2).toMatch(/\x1b\[/)
  })
})

describe("Bug: scrollOffset prop on overflow=scroll container", () => {
  test("scrollOffset change should update visible content", () => {
    function ScrollView({ offset }: { offset: number }) {
      return (
        <Box flexDirection="column" height={5} overflow="scroll" scrollOffset={offset}>
          {Array.from({ length: 20 }, (_, i) => (
            <Text key={i}>Line {i + 1}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<ScrollView offset={0} />)
    expect(app.text).toContain("Line 1")
    expect(app.text).toContain("Line 5")
    expect(app.text).not.toContain("Line 6")

    // After changing scrollOffset, content should shift
    app.rerender(<ScrollView offset={3} />)
    expect(app.text).not.toContain("Line 1")
    expect(app.text).toContain("Line 4")
    expect(app.text).toContain("Line 8")
  })

  test("incremental scrollOffset update produces same result as fresh render", () => {
    // Simulates storybook All Views: scroll container with multiple Text children
    function ScrollView({ offset }: { offset: number }) {
      return (
        <Box flexDirection="column" height={8} overflow="scroll" scrollOffset={offset}>
          {Array.from({ length: 20 }, (_, i) => (
            <Text key={i}>Line {i + 1}</Text>
          ))}
        </Box>
      )
    }

    // Render at offset 0, then scroll to offset 5
    const app = render(<ScrollView offset={0} />)
    const text0 = app.text
    expect(text0).toContain("Line 1")

    // Incremental re-render at offset 5
    app.rerender(<ScrollView offset={5} />)
    const textIncremental = app.text

    // Fresh render at offset 5 (no previous buffer)
    const fresh = render(<ScrollView offset={5} />)
    const textFresh = fresh.text

    // Incremental and fresh should produce identical output
    expect(textIncremental).toBe(textFresh)
    // And the content should have scrolled (Line 6 visible, Line 1/2/3/4/5 not)
    expect(textIncremental).toContain("Line 6")
    // Lines 1-5 should not be visible — check with word boundary to avoid
    // "Line 1" matching "Line 10/11/12/13"
    expect(textIncremental).not.toMatch(/\bLine 1\b/)
    expect(textIncremental).not.toMatch(/\bLine 5\b/)
  })
})

describe("Bug: scrollOffset with nested fixed-height Box children", () => {
  test("scroll container with nested Box height children scrolls correctly", () => {
    // Replicates storybook AllViews layout: scroll container with nested
    // Box elements that have explicit height props
    function ScrollableContent({ offset }: { offset: number }) {
      return (
        <Box flexDirection="column" height={10} overflow="scroll" scrollOffset={offset}>
          <Box flexDirection="column" height={5} borderStyle="single">
            <Text>Section A line 1</Text>
            <Text>Section A line 2</Text>
            <Text>Section A line 3</Text>
          </Box>
          <Box flexDirection="column" height={5} borderStyle="single">
            <Text>Section B line 1</Text>
            <Text>Section B line 2</Text>
            <Text>Section B line 3</Text>
          </Box>
          <Box flexDirection="column" height={5} borderStyle="single">
            <Text>Section C line 1</Text>
            <Text>Section C line 2</Text>
            <Text>Section C line 3</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<ScrollableContent offset={0} />)
    expect(app.text).toContain("Section A line 1")
    expect(app.text).not.toContain("Section C line 1")

    // Scroll down 5 rows - should show Section B and start of Section C
    app.rerender(<ScrollableContent offset={5} />)
    expect(app.text).toContain("Section B line 1")
    expect(app.text).not.toContain("Section A line 1")
  })

  test("scroll container within row layout (sidebar + content)", () => {
    // Replicates storybook InteractiveStorybook layout:
    // Row with sidebar + scrollable content area
    function Layout({ offset }: { offset: number }) {
      return (
        <Box flexDirection="column" width={60} height={15}>
          <Text>Header</Text>
          <Box flexDirection="row" flexGrow={1}>
            <Box flexDirection="column" width={15}>
              <Text>Sidebar</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} height={12} overflow="scroll" scrollOffset={offset}>
              {Array.from({ length: 30 }, (_, i) => (
                <Text key={i}>Content line {i + 1}</Text>
              ))}
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<Layout offset={0} />)
    expect(app.text).toContain("Content line 1")
    expect(app.text).toContain("Header")
    expect(app.text).toContain("Sidebar")

    // Scroll the content area
    app.rerender(<Layout offset={5} />)
    expect(app.text).toContain("Content line 6")
    expect(app.text).not.toMatch(/\bContent line 1\b/)
    // Sidebar and header should remain
    expect(app.text).toContain("Header")
    expect(app.text).toContain("Sidebar")
  })

  test("exact storybook layout: bordered header + row(sidebar + scroll content) with flexGrow", () => {
    // Exact replica of InteractiveStorybook layout
    const termHeight = 40
    const contentHeight = termHeight - 3

    function Storybook({ offset }: { offset: number }) {
      return (
        <Box flexDirection="column" width={120} height={termHeight}>
          {/* Header with border = 3 rows */}
          <Box borderStyle="double" paddingX={1}>
            <Text bold>TUI Storybook</Text>
          </Box>

          {/* Main content area */}
          <Box flexDirection="row" flexGrow={1}>
            {/* Sidebar */}
            <Box flexDirection="column" width={28} borderStyle="single" paddingX={1}>
              <Text bold>Sections</Text>
              <Text>Item 1</Text>
              <Text>Item 2</Text>
            </Box>

            {/* Content area - scrollable */}
            <Box
              flexDirection="column"
              flexGrow={1}
              height={contentHeight}
              paddingX={1}
              overflow="scroll"
              scrollOffset={offset}
            >
              {/* Section content that exceeds viewport */}
              <Text>Section Header</Text>
              <Text dimColor>Description line</Text>
              {/* 4 "ViewBox" style elements, each ~24 rows */}
              {[1, 2, 3, 4].map((n) => (
                <Box key={n} flexDirection="column" height={24} borderStyle="double" paddingX={1} marginY={1}>
                  <Text bold>View {n} Title</Text>
                  <Box marginTop={1} flexDirection="column" flexGrow={1}>
                    {Array.from({ length: 18 }, (_, i) => (
                      <Text key={i}>
                        View {n} content row {i + 1}
                      </Text>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<Storybook offset={0} />)
    expect(app.text).toContain("TUI Storybook")
    expect(app.text).toContain("Sections")
    expect(app.text).toContain("Section Header")
    expect(app.text).toContain("View 1 Title")

    // Scroll down significantly - View 1 is 24+2 rows, so offset 30 should show View 2
    app.rerender(<Storybook offset={30} />)
    const scrolledText = app.text
    expect(scrolledText).toContain("TUI Storybook") // Header stays
    expect(scrolledText).toContain("Sections") // Sidebar stays
    expect(scrolledText).toContain("View 2 Title") // View 2 should be visible
    expect(scrolledText).not.toContain("Section Header") // Top content scrolled away
  })

  test("scroll container with deeply nested Box content renders correctly", () => {
    // Replicates the storybook bug: BoardCore inside ViewBox has deeply
    // nested Boxes (column > card > content), and scrolling causes the
    // nested content to disappear
    function DeepContent({ offset }: { offset: number }) {
      return (
        <Box flexDirection="column" height={15} overflow="scroll" scrollOffset={offset}>
          {/* Section 1: deeply nested content */}
          <Box flexDirection="column" height={20} borderStyle="double">
            <Text bold>Section 1 Title</Text>
            <Box flexDirection="row" flexGrow={1}>
              {/* Column A */}
              <Box flexDirection="column" width={20}>
                <Text>Col A Header</Text>
                <Box borderStyle="single" flexDirection="column">
                  <Text>Card A1 text</Text>
                  <Text>Card A1 detail</Text>
                </Box>
                <Box borderStyle="single" flexDirection="column">
                  <Text>Card A2 text</Text>
                </Box>
              </Box>
              {/* Column B */}
              <Box flexDirection="column" width={20}>
                <Text>Col B Header</Text>
                <Box borderStyle="single" flexDirection="column">
                  <Text>Card B1 text</Text>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Section 2: deeply nested content */}
          <Box flexDirection="column" height={20} borderStyle="double">
            <Text bold>Section 2 Title</Text>
            <Box flexDirection="row" flexGrow={1}>
              <Box flexDirection="column" width={20}>
                <Text>Col C Header</Text>
                <Box borderStyle="single" flexDirection="column">
                  <Text>Card C1 text</Text>
                  <Text>Card C1 detail</Text>
                </Box>
              </Box>
              <Box flexDirection="column" width={20}>
                <Text>Col D Header</Text>
                <Box borderStyle="single" flexDirection="column">
                  <Text>Card D1 text</Text>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<DeepContent offset={0} />)
    expect(app.text).toContain("Section 1 Title")
    expect(app.text).toContain("Card A1 text")
    expect(app.text).toContain("Card A1 detail")
    expect(app.text).toContain("Col B Header")
    expect(app.text).toContain("Card B1 text")

    // Scroll to show Section 2
    app.rerender(<DeepContent offset={18} />)
    const scrolled = app.text
    expect(scrolled).toContain("Section 2 Title")
    expect(scrolled).toContain("Col C Header")
    expect(scrolled).toContain("Card C1 text")
    expect(scrolled).toContain("Card C1 detail")
    expect(scrolled).toContain("Col D Header")
    expect(scrolled).toContain("Card D1 text")
    // Section 1 should be scrolled away
    expect(scrolled).not.toContain("Section 1 Title")
  })

  test("interactive scroll via useState + useInput + press()", async () => {
    // Simulates the actual storybook pattern: useInput sets scrollOffset state,
    // which is passed to overflow="scroll" scrollOffset prop
    const { createRenderer: createTestRenderer } = await import("../src/testing/index.js")
    const { useInput: useTestInput } = await import("../src/index.js")
    const testRender = createTestRenderer({ cols: 60, rows: 15 })

    function InteractiveScroll() {
      const [scrollOffset, setScrollOffset] = React.useState(0)

      useTestInput((_input: string, key: { downArrow: boolean; upArrow: boolean }) => {
        if (key.downArrow) {
          setScrollOffset((prev: number) => prev + 3)
        } else if (key.upArrow) {
          setScrollOffset((prev: number) => Math.max(0, prev - 3))
        }
      })

      return (
        <Box flexDirection="column" width={60} height={15}>
          <Text>Header - offset={scrollOffset}</Text>
          <Box flexDirection="column" flexGrow={1} height={12} overflow="scroll" scrollOffset={scrollOffset}>
            {Array.from({ length: 40 }, (_, i) => (
              <Text key={i}>Row {i + 1}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = testRender(<InteractiveScroll />)
    expect(app.text).toContain("Row 1")
    expect(app.text).toContain("offset=0")

    // Press ArrowDown to scroll
    await app.press("ArrowDown")
    expect(app.text).toContain("offset=3")
    expect(app.text).toContain("Row 4")
    expect(app.text).not.toMatch(/\bRow 1\b/)

    // Press ArrowDown again
    await app.press("ArrowDown")
    expect(app.text).toContain("offset=6")
    expect(app.text).toContain("Row 7")
    expect(app.text).not.toMatch(/\bRow 1\b/)
  })

  test("interactive scroll with deeply nested content (incremental render)", async () => {
    // Tests the incremental render path with deeply nested Boxes inside scroll
    // This is the actual bug: fresh render works, but incremental doesn't repaint nested content
    const { createRenderer: createTestRenderer } = await import("../src/testing/index.js")
    const { useInput: useTestInput } = await import("../src/index.js")
    const testRender = createTestRenderer({ cols: 50, rows: 15 })

    function NestedScrollView() {
      const [offset, setOffset] = React.useState(0)

      useTestInput((_input: string, key: { downArrow: boolean; upArrow: boolean }) => {
        if (key.downArrow) setOffset((p: number) => p + 5)
        if (key.upArrow) setOffset((p: number) => Math.max(0, p - 5))
      })

      return (
        <Box flexDirection="column" width={50} height={15}>
          <Text>offset={offset}</Text>
          <Box flexDirection="column" height={13} overflow="scroll" scrollOffset={offset}>
            {/* Section 1: nested boxes */}
            <Box flexDirection="column" height={12} borderStyle="double">
              <Text bold>Section 1</Text>
              <Box flexDirection="row">
                <Box flexDirection="column" width={20} borderStyle="single">
                  <Text>Card A1</Text>
                  <Text>Detail A1</Text>
                </Box>
                <Box flexDirection="column" width={20} borderStyle="single">
                  <Text>Card B1</Text>
                </Box>
              </Box>
            </Box>

            {/* Section 2: nested boxes */}
            <Box flexDirection="column" height={12} borderStyle="double">
              <Text bold>Section 2</Text>
              <Box flexDirection="row">
                <Box flexDirection="column" width={20} borderStyle="single">
                  <Text>Card C1</Text>
                  <Text>Detail C1</Text>
                </Box>
                <Box flexDirection="column" width={20} borderStyle="single">
                  <Text>Card D1</Text>
                </Box>
              </Box>
            </Box>

            {/* Section 3 */}
            <Box flexDirection="column" height={12} borderStyle="double">
              <Text bold>Section 3</Text>
              <Box flexDirection="row">
                <Box flexDirection="column" width={20} borderStyle="single">
                  <Text>Card E1</Text>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = testRender(<NestedScrollView />)
    expect(app.text).toContain("Section 1")
    expect(app.text).toContain("Card A1")
    expect(app.text).toContain("Detail A1")
    expect(app.text).toContain("Card B1")

    // Scroll down to Section 2 via press (incremental render path)
    await app.press("ArrowDown") // offset=5
    await app.press("ArrowDown") // offset=10
    const scrolled = app.text
    expect(scrolled).toContain("offset=10")
    expect(scrolled).toContain("Section 2")
    expect(scrolled).toContain("Card C1")
    expect(scrolled).toContain("Detail C1")
    expect(scrolled).toContain("Card D1")
    expect(scrolled).not.toContain("Section 1")

    // Scroll to Section 3
    await app.press("ArrowDown") // offset=15
    await app.press("ArrowDown") // offset=20
    const scrolled2 = app.text
    expect(scrolled2).toContain("Section 3")
    expect(scrolled2).toContain("Card E1")
  })
})

describe("Bug: styleEquals edge cases", () => {
  test("null style should not equal default style object", () => {
    const nullStyle = null
    const defaultStyle = { fg: null, bg: null, attrs: {} }

    // These should NOT be equal - null means "no style info"
    // while defaultStyle is explicit "default values"
    expect(styleEquals(nullStyle, defaultStyle)).toBe(false)
  })

  test("empty attrs should equal attrs with all false values", () => {
    const style1 = { fg: null, bg: null, attrs: {} }
    const style2 = {
      fg: null,
      bg: null,
      attrs: {
        bold: false,
        dim: false,
        italic: false,
        underline: false,
        inverse: false,
      },
    }

    // These SHOULD be functionally equal
    expect(styleEquals(style1, style2)).toBe(true)
  })
})

describe("ANSI diff output correctness", () => {
  test("selection highlight moving between items produces correct ANSI", () => {
    // Simulate a list where selection moves from item 0 to item 1
    const prev = new TerminalBuffer(10, 3)
    // Row 0: selected (cyan bg, black fg)
    for (let x = 0; x < 6; x++) {
      prev.setCell(x, 0, { char: "Item 1"[x], fg: 0, bg: 6, attrs: {} }) // black on cyan
    }
    // Row 1: unselected (default)
    for (let x = 0; x < 6; x++) {
      prev.setCell(x, 1, { char: "Item 2"[x], fg: null, bg: null, attrs: {} })
    }

    const next = new TerminalBuffer(10, 3)
    // Row 0: deselected (default)
    for (let x = 0; x < 6; x++) {
      next.setCell(x, 0, { char: "Item 1"[x], fg: null, bg: null, attrs: {} })
    }
    // Row 1: now selected (cyan bg, black fg)
    for (let x = 0; x < 6; x++) {
      next.setCell(x, 1, { char: "Item 2"[x], fg: 0, bg: 6, attrs: {} }) // black on cyan
    }

    const output = outputPhase(prev, next)

    // Should contain positioning and style changes
    expect(output.length).toBeGreaterThan(0)

    // Row 0 cells should be reset (no bg) — contains SGR 0 reset
    expect(output).toContain("\x1b[0m")

    // Row 1 cells should have cyan bg (48;5;6) applied
    expect(output).toContain("48;5;6")

    // Should contain the characters from both rows
    expect(output).toContain("I")
  })

  test("background removal emits proper reset codes", () => {
    const prev = new TerminalBuffer(5, 1)
    prev.setCell(0, 0, { char: "A", fg: 1, bg: 4, attrs: { bold: true } }) // red on blue, bold

    const next = new TerminalBuffer(5, 1)
    next.setCell(0, 0, { char: "A", fg: null, bg: null, attrs: {} }) // plain

    const output = outputPhase(prev, next)

    // Should contain a reset (SGR 0) — styleToAnsi always starts with reset
    expect(output).toContain("\x1b[0m")

    // Should NOT contain bg color codes (48;5;...)
    expect(output).not.toContain("48;5;")
  })

  test("\\r\\n optimization does not leak background color", () => {
    // Create buffers where changes span two consecutive rows starting at col 0
    // with the first row having a bg color
    const prev = new TerminalBuffer(10, 3)

    const next = new TerminalBuffer(10, 3)
    // Row 0, col 0: has cyan bg
    next.setCell(0, 0, { char: "A", fg: null, bg: 6, attrs: {} })
    // Row 1, col 0: no bg (this triggers \r\n optimization)
    next.setCell(0, 1, { char: "B", fg: null, bg: null, attrs: {} })

    const output = outputPhase(prev, next)

    // The \r\n should be preceded by a reset when bg is active
    // Find all occurrences of \r\n in the output
    const rn = "\r\n"
    const rnIdx = output.indexOf(rn)
    if (rnIdx >= 0) {
      // The reset (\x1b[0m) should appear before the \r\n
      const beforeRn = output.slice(0, rnIdx)
      // After writing 'A' with bg, reset must come before \r\n
      const lastReset = beforeRn.lastIndexOf("\x1b[0m")
      const lastBgSet = beforeRn.lastIndexOf("48;5;6")
      // Reset should appear after the bg was set (i.e., after writing the bg cell)
      expect(lastReset).toBeGreaterThan(lastBgSet)
    }
  })

  test("style-only cell changes produce correct diff output", () => {
    const prev = new TerminalBuffer(5, 1)
    prev.setCell(0, 0, { char: "X", fg: 1, bg: null, attrs: {} }) // red
    prev.setCell(1, 0, { char: "Y", fg: 2, bg: null, attrs: {} }) // green

    const next = new TerminalBuffer(5, 1)
    next.setCell(0, 0, { char: "X", fg: 3, bg: null, attrs: { bold: true } }) // yellow bold
    next.setCell(1, 0, { char: "Y", fg: 2, bg: null, attrs: {} }) // green (unchanged)

    const output = outputPhase(prev, next)

    // Should have changes for cell (0,0) only — cell (1,0) unchanged
    expect(output).toContain("X")
    expect(output).not.toContain("Y")

    // Should contain yellow fg (38;5;3) and bold (1)
    expect(output).toContain("38;5;3")
    expect(output).toMatch(/;1[;m]/) // bold SGR code
  })

  test("buffer shrink emits clearing changes for old area", () => {
    const prev = new TerminalBuffer(10, 3)
    // Fill some content in the area that will be outside the new buffer
    prev.setCell(8, 0, { char: "Z", fg: 1, bg: null, attrs: {} })
    prev.setCell(0, 2, { char: "W", fg: 2, bg: null, attrs: {} })

    // Smaller buffer
    const next = new TerminalBuffer(5, 2)
    next.setCell(0, 0, { char: "A", fg: null, bg: null, attrs: {} })

    const output = outputPhase(prev, next)

    // Should emit changes for the shrunk area
    expect(output.length).toBeGreaterThan(0)

    // The output should position cursor at cells beyond next.width (col 5-9)
    // Col 6 (1-indexed) on row 1: absolute \x1b[1;6H or relative CUF
    // After writing "A" at (0,0), cursor is at (1,0), so CUF 4 reaches (5,0)
    expect(output.includes("\x1b[1;6H") || output.includes("\x1b[4C")).toBeTruthy()
    // Row 2 col 6 clearing: absolute or relative positioning
    expect(output.includes("\x1b[2;6H") || output.includes("\x1b[2;1H")).toBeTruthy()

    // Row 3 clearing (height shrink) — may use \r\n or absolute positioning
    // Either way, spaces must be emitted for the old row 2 area
    // Count total spaces in output — should include clearing for cols 5-9 on rows 0-1
    // plus all 10 cols on row 2
    const spaceCount = (output.match(/ /g) || []).length
    // 5 cols × 2 rows (width shrink) + 10 cols × 1 row (height shrink) = 20
    expect(spaceCount).toBe(20)
  })

  test("buffer shrink width clears trailing columns", () => {
    const prev = new TerminalBuffer(8, 1)
    prev.setCell(0, 0, { char: "H", fg: null, bg: null, attrs: {} })
    prev.setCell(5, 0, { char: "X", fg: 1, bg: 2, attrs: { bold: true } })

    const next = new TerminalBuffer(4, 1)
    next.setCell(0, 0, { char: "H", fg: null, bg: null, attrs: {} })

    const output = outputPhase(prev, next)

    // Cells at x=4..7 should be cleared (spaces with no style)
    // The clearing cells are at positions 5-8 (1-indexed)
    expect(output).toContain("\x1b[1;5H") // cursor to col 5, row 1
  })
})

describe("Bug: Cell comparison edge cases", () => {
  test("cells with same char but different styles are not equal", () => {
    const cell1 = {
      char: "A",
      fg: 1 as const,
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    }
    const cell2 = {
      char: "A",
      fg: 2 as const,
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    }

    expect(cellEquals(cell1, cell2)).toBe(false)
  })

  test("cells with null fg should equal cells with 0 fg", () => {
    // This tests the edge case where null and 0 might be confused
    const cellNull = {
      char: "A",
      fg: null,
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    }
    const cellZero = {
      char: "A",
      fg: 0 as const, // Black color
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    }

    // These should NOT be equal - null means default, 0 means black
    expect(cellEquals(cellNull, cellZero)).toBe(false)
  })
})

describe("Bug: Keyed children reorder loses content", () => {
  test("reordering keyed children should render all content", () => {
    // Reproduce: keyed children reordered (e.g., horizontal scroll sliding window)
    // React reuses nodes via keys but calls insertBefore/appendChild to move them.
    // If the host config doesn't remove the child from its old position first,
    // the child ends up duplicated in the children array, causing rendering issues.
    function KeyedList({ order }: { order: string[] }) {
      return (
        <Box flexDirection="column">
          {order.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<KeyedList order={["A", "B", "C"]} />)

    const frame1 = app.ansi
    expect(stripAnsi(frame1)).toContain("A")
    expect(stripAnsi(frame1)).toContain("B")
    expect(stripAnsi(frame1)).toContain("C")

    // Reorder: move C to front
    app.rerender(<KeyedList order={["C", "A", "B"]} />)

    const frame2 = app.ansi
    expect(stripAnsi(frame2)).toContain("A")
    expect(stripAnsi(frame2)).toContain("B")
    expect(stripAnsi(frame2)).toContain("C")
  })

  test("sliding window reorder should show all visible items", () => {
    // Simulate a horizontal sliding window where items shift
    // Window shows 3 items at a time, sliding by 1
    function SlidingWindow({ offset }: { offset: number }) {
      const allItems = ["W", "X", "Y", "Z"]
      const visible = allItems.slice(offset, offset + 3)
      return (
        <Box flexDirection="row">
          {visible.map((item) => (
            <Text key={item}>{`[${item}]`}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<SlidingWindow offset={0} />)

    const frame1 = app.ansi
    expect(stripAnsi(frame1)).toContain("[W]")
    expect(stripAnsi(frame1)).toContain("[X]")
    expect(stripAnsi(frame1)).toContain("[Y]")

    // Slide window by 1: [X, Y, Z] - X and Y are reused (reordered), Z is new
    app.rerender(<SlidingWindow offset={1} />)

    const frame2 = app.ansi
    expect(stripAnsi(frame2)).toContain("[X]")
    expect(stripAnsi(frame2)).toContain("[Y]")
    expect(stripAnsi(frame2)).toContain("[Z]")
    // W should no longer be visible
    expect(stripAnsi(frame2)).not.toContain("[W]")
  })

  test("reverse order should render all children correctly", () => {
    function ReversibleList({ reversed }: { reversed: boolean }) {
      const items = ["First", "Second", "Third"]
      const ordered = reversed ? [...items].reverse() : items
      return (
        <Box flexDirection="column">
          {ordered.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<ReversibleList reversed={false} />)

    const frame1 = app.ansi
    const text1 = stripAnsi(frame1)
    expect(text1).toContain("First")
    expect(text1).toContain("Second")
    expect(text1).toContain("Third")

    // Reverse the order
    app.rerender(<ReversibleList reversed={true} />)

    const frame2 = app.ansi
    const text2 = stripAnsi(frame2)
    expect(text2).toContain("First")
    expect(text2).toContain("Second")
    expect(text2).toContain("Third")

    // Verify the order changed: Third should come before First
    const thirdIdx = text2.indexOf("Third")
    const firstIdx = text2.indexOf("First")
    expect(thirdIdx).toBeLessThan(firstIdx)
  })
})

describe("Bug: Inline mode cursor positioning drifts with growing content", () => {
  test("cursor-up distance uses previous content height, not maxY of changes", () => {
    // Simulate inline mode: content grows from 2 lines to 4 lines.
    // After the first render, cursor is at row 1 (the last content line).
    // The diff should move up by 1 (prevContentLine), not by 3 (maxY of changes).

    // Frame 1: 2 lines of content
    const prev = new TerminalBuffer(10, 6)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })

    // Frame 2: 4 lines of content (grew by 2)
    const next = new TerminalBuffer(10, 6)
    next.setCell(0, 0, { char: "A" })
    next.setCell(0, 1, { char: "B" })
    next.setCell(0, 2, { char: "C" })
    next.setCell(0, 3, { char: "D" })

    const output = outputPhase(prev, next, "inline")

    // The output should move cursor up by 1 (previous last content line),
    // NOT by 3 (maxY of changes). ESC[1A = move up 1 line.
    expect(output).toContain("\x1b[1A")
    // Should NOT contain ESC[3A (the old buggy behavior)
    expect(output).not.toContain("\x1b[3A")
  })

  test("cursor-up is omitted when previous content was single line", () => {
    // Frame 1: 1 line of content (cursor at row 0)
    const prev = new TerminalBuffer(10, 4)
    prev.setCell(0, 0, { char: "A" })

    // Frame 2: 3 lines
    const next = new TerminalBuffer(10, 4)
    next.setCell(0, 0, { char: "X" })
    next.setCell(0, 1, { char: "Y" })
    next.setCell(0, 2, { char: "Z" })

    const output = outputPhase(prev, next, "inline")

    // Previous content was 1 line (row 0), so cursor is at row 0.
    // No cursor-up needed. The output should NOT have any ESC[...A sequence.
    expect(output).not.toMatch(/\x1b\[\d+A/)
  })

  test("cursor repositions to new content bottom after rendering", () => {
    // After rendering changes, cursor should be at the new last content line
    // so the next diff knows where the cursor is.

    // Frame 1: 2 lines
    const prev = new TerminalBuffer(10, 6)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })

    // Frame 2: 4 lines
    const next = new TerminalBuffer(10, 6)
    next.setCell(0, 0, { char: "A" })
    next.setCell(0, 1, { char: "B" })
    next.setCell(0, 2, { char: "C" })
    next.setCell(0, 3, { char: "D" })

    const output = outputPhase(prev, next, "inline")

    // The output should contain the new content characters
    expect(output).toContain("C")
    expect(output).toContain("D")

    // Now simulate a third frame where content stays the same height.
    // If the cursor was correctly positioned at row 3 after the previous render,
    // then a diff from next -> next2 should move up by 3.
    const next2 = new TerminalBuffer(10, 6)
    next2.setCell(0, 0, { char: "A" })
    next2.setCell(0, 1, { char: "B" })
    next2.setCell(0, 2, { char: "C" })
    next2.setCell(0, 3, { char: "E" }) // Changed from D to E

    const output2 = outputPhase(next, next2, "inline")

    // Previous content last line is row 3, so cursor-up should be 3
    expect(output2).toContain("\x1b[3A")
    expect(output2).toContain("E")
  })

  test("content shrinking adjusts cursor-up correctly", () => {
    // Frame 1: 4 lines of content
    const prev = new TerminalBuffer(10, 6)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })
    prev.setCell(0, 2, { char: "C" })
    prev.setCell(0, 3, { char: "D" })

    // Frame 2: 2 lines (content shrank)
    const next = new TerminalBuffer(10, 6)
    next.setCell(0, 0, { char: "X" })
    next.setCell(0, 1, { char: "Y" })

    const output = outputPhase(prev, next, "inline")

    // Cursor was at row 3 (prev last content line), so move up by 3
    expect(output).toContain("\x1b[3A")
    expect(output).toContain("X")
    expect(output).toContain("Y")
  })

  test("stable content height produces consistent cursor movement", () => {
    // When content height doesn't change, cursor-up should equal maxY of changes.
    // This verifies we didn't break the common case.

    const prev = new TerminalBuffer(10, 4)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })
    prev.setCell(0, 2, { char: "C" })

    const next = new TerminalBuffer(10, 4)
    next.setCell(0, 0, { char: "X" })
    next.setCell(0, 1, { char: "Y" })
    next.setCell(0, 2, { char: "Z" })

    const output = outputPhase(prev, next, "inline")

    // Previous last content line is row 2, so cursor-up should be 2
    expect(output).toContain("\x1b[2A")
    expect(output).toContain("X")
    expect(output).toContain("Y")
    expect(output).toContain("Z")
  })
})
