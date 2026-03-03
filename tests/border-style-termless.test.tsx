/**
 * Tests for border rendering and style transitions using termless (real terminal emulator).
 *
 * These tests verify that the ANSI output from inkx components with borders and
 * styles produces correct terminal state when fed to a real terminal emulator
 * (xterm.js). This catches output-phase bugs that virtual buffer tests miss:
 * - Style leaks across frames (SGR not properly reset between rows)
 * - Incorrect SGR reset sequences after borders
 * - Border color bleeding into content area
 * - Background color bleeding outside box boundaries
 * - Incremental render (diff) correctness for style changes
 *
 * Uses termless with xterm.js backend to emulate a real terminal.
 *
 * IMPORTANT: termless cell() uses (row, col) order, NOT (col, row).
 * Named colors (e.g., "red") map to 256-color palette indices in inkx,
 * not true-color RGB. Use hex colors (#ff0000) for exact RGB matching.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { enterAlternateScreen } from "../src/output.js"
import { createTerminal } from "termless"
import { createXtermBackend } from "termless-xtermjs"
import "viterm/matchers"

// ============================================================================
// Helpers
// ============================================================================

/** Create a termless terminal in fullscreen (alternate screen) mode. */
function createTestTerminal(cols: number, rows: number) {
  const term = createTerminal({
    backend: createXtermBackend({ cols, rows }),
    cols,
    rows,
    scrollbackLimit: 0,
  })
  term.feed(enterAlternateScreen())
  return term
}

/**
 * Render a React component, convert its buffer to ANSI via outputPhase,
 * and feed the result through a real terminal emulator.
 * Returns the termless Terminal for assertions.
 */
function renderToTerminal(element: React.ReactElement, cols: number, rows: number) {
  const render = createRenderer({ cols, rows })
  const app = render(element)
  const buffer = app.lastBuffer()!
  const ansi = outputPhase(null, buffer)
  const term = createTestTerminal(cols, rows)
  term.feed(ansi)
  return { term, app, buffer }
}

// ============================================================================
// Border characters render correctly
// ============================================================================

describe("border characters render correctly through terminal", () => {
  test("single border renders with correct box-drawing characters", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" width={10} height={3}>
        <Text>Hi</Text>
      </Box>,
      20,
      5,
    )

    // Top-left corner
    expect(term.screen).toContainText("\u250c") // ┌
    // Top-right corner
    expect(term.screen).toContainText("\u2510") // ┐
    // Bottom-left corner
    expect(term.screen).toContainText("\u2514") // └
    // Bottom-right corner
    expect(term.screen).toContainText("\u2518") // ┘
    // Horizontal line
    expect(term.screen).toContainText("\u2500") // ─
    // Vertical line
    expect(term.screen).toContainText("\u2502") // │
    // Content
    expect(term.screen).toContainText("Hi")

    term.close()
  })

  test("round border renders with correct box-drawing characters", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="round" width={10} height={3}>
        <Text>Hi</Text>
      </Box>,
      20,
      5,
    )

    expect(term.screen).toContainText("\u256d") // ╭
    expect(term.screen).toContainText("\u256e") // ╮
    expect(term.screen).toContainText("\u2570") // ╰
    expect(term.screen).toContainText("\u256f") // ╯
    expect(term.screen).toContainText("Hi")

    term.close()
  })

  test("double border renders with correct box-drawing characters", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="double" width={10} height={3}>
        <Text>Hi</Text>
      </Box>,
      20,
      5,
    )

    expect(term.screen).toContainText("\u2554") // ╔
    expect(term.screen).toContainText("\u2557") // ╗
    expect(term.screen).toContainText("\u255a") // ╚
    expect(term.screen).toContainText("\u255d") // ╝
    expect(term.screen).toContainText("Hi")

    term.close()
  })

  test("bold border renders with correct box-drawing characters", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="bold" width={10} height={3}>
        <Text>Hi</Text>
      </Box>,
      20,
      5,
    )

    expect(term.screen).toContainText("\u250f") // ┏
    expect(term.screen).toContainText("\u2513") // ┓
    expect(term.screen).toContainText("\u2517") // ┗
    expect(term.screen).toContainText("\u251b") // ┛
    expect(term.screen).toContainText("Hi")

    term.close()
  })
})

// ============================================================================
// Border with dim color — dimColor on Text applies faint SGR
// ============================================================================

describe("dimColor on Text applies faint SGR through terminal", () => {
  test("dimColor Text characters are faint in terminal", () => {
    const { term } = renderToTerminal(
      <Box width={20} height={3}>
        <Text dimColor>Dimmed text</Text>
      </Box>,
      20,
      3,
    )

    expect(term.screen).toContainText("Dimmed text")

    // "D" of "Dimmed text" at row=0, col=0 should be faint
    expect(term.cell(0, 0)).toBeFaint()

    term.close()
  })

  test("dim border box: border is NOT faint, child text is NOT faint", () => {
    // The dim prop on Box does not make border characters faint in inkx.
    // Border rendering (renderBorder) does not read the dim prop.
    // This verifies the Ink bug fix — dim on Box doesn't leak to children.
    const { term } = renderToTerminal(
      <Box borderStyle="single" dim width={20} height={3}>
        <Text>Normal text</Text>
      </Box>,
      30,
      5,
    )

    expect(term.screen).toContainText("Normal text")

    // Border character at row=0, col=0 is NOT faint (border ignores dim prop)
    expect(term.cell(0, 0)).not.toBeFaint()

    // Text at row=1, col=1 is NOT faint (dim on Box doesn't leak to children)
    expect(term.cell(1, 1)).not.toBeFaint()

    term.close()
  })
})

// ============================================================================
// Text inside bordered box has correct position
// ============================================================================

describe("text inside bordered box has correct position", () => {
  test("text is offset by border (row=1, col=1) inside single-border box", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" width={20} height={5}>
        <Text>Inside</Text>
      </Box>,
      30,
      8,
    )

    // Row 0: top border (┌────...────┐)
    // Row 1: │Inside              │  — text starts at col 1
    // Row 4: bottom border (└────...────┘)

    expect(term.screen).toContainText("Inside")

    // Top border row should contain ┌
    expect(term.row(0)).toContainText("\u250c") // ┌

    // "I" of "Inside" should be at row=1, col=1 (offset by border)
    const textCell = term.cell(1, 1)
    expect(textCell).not.toBeFaint()

    // Left border at row=1, col=0 should be │
    expect(term.row(1)).toContainText("\u2502") // │

    term.close()
  })
})

// ============================================================================
// Background color doesn't bleed outside box boundaries
// ============================================================================

describe("background color does not bleed outside box", () => {
  test("background stays within box bounds (true-color)", () => {
    const { term } = renderToTerminal(
      <Box width={30} height={5}>
        <Box backgroundColor="#ff0000" width={10} height={3}>
          <Text>Red bg</Text>
        </Box>
      </Box>,
      30,
      5,
    )

    expect(term.screen).toContainText("Red bg")

    // Cell inside the box: row=0, col=0 should have red bg
    expect(term.cell(0, 0)).toHaveBg({ r: 255, g: 0, b: 0 })

    // Cell outside the box: row=0, col=10 should NOT have red bg
    expect(term.cell(0, 10)).not.toHaveBg({ r: 255, g: 0, b: 0 })

    term.close()
  })

  test("bordered box with background: bg does not extend past border", () => {
    const { term } = renderToTerminal(
      <Box width={30} height={6}>
        <Box borderStyle="single" backgroundColor="#0000ff" width={12} height={4}>
          <Text>Test</Text>
        </Box>
      </Box>,
      30,
      6,
    )

    expect(term.screen).toContainText("Test")

    // Cell inside content area: row=1, col=1 should have blue bg
    expect(term.cell(1, 1)).toHaveBg({ r: 0, g: 0, b: 255 })

    // Cell outside the box: row=0, col=12 should NOT have blue bg
    expect(term.cell(0, 12)).not.toHaveBg({ r: 0, g: 0, b: 255 })

    term.close()
  })
})

// ============================================================================
// Bold text inside box renders with correct SGR
// ============================================================================

describe("bold text inside bordered box renders with correct SGR", () => {
  test("bold text inside border has bold attribute", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" width={20} height={3}>
        <Text bold>Bold text</Text>
      </Box>,
      30,
      5,
    )

    expect(term.screen).toContainText("Bold text")

    // "B" of "Bold text" at row=1, col=1 should be bold
    expect(term.cell(1, 1)).toBeBold()

    // Border character at row=0, col=0 should NOT be bold
    expect(term.cell(0, 0)).not.toBeBold()

    term.close()
  })

  test("italic text inside border has italic attribute", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" width={20} height={3}>
        <Text italic>Italic text</Text>
      </Box>,
      30,
      5,
    )

    expect(term.screen).toContainText("Italic text")

    // "I" at row=1, col=1 should be italic
    expect(term.cell(1, 1)).toBeItalic()

    term.close()
  })
})

// ============================================================================
// Style reset after box — text after box is unstyled
// ============================================================================

describe("style reset after box", () => {
  test("text after colored border box has no border color", () => {
    const { term } = renderToTerminal(
      <Box flexDirection="column" width={30} height={6}>
        <Box borderStyle="single" borderColor="#ff0000" width={20} height={3}>
          <Text>Inside</Text>
        </Box>
        <Text>After box</Text>
      </Box>,
      30,
      6,
    )

    expect(term.screen).toContainText("Inside")
    expect(term.screen).toContainText("After box")

    // Border at row=0, col=0 should be red
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // "After box" is on row 3 (after the 3-row bordered box)
    // "A" of "After box" at row=3, col=0 should NOT have red foreground
    expect(term.cell(3, 0)).not.toHaveFg({ r: 255, g: 0, b: 0 })

    term.close()
  })

  test("text after bold box content is not bold", () => {
    const { term } = renderToTerminal(
      <Box flexDirection="column" width={30} height={5}>
        <Text bold>Bold line</Text>
        <Text>Normal line</Text>
      </Box>,
      30,
      5,
    )

    expect(term.screen).toContainText("Bold line")
    expect(term.screen).toContainText("Normal line")

    // "B" of "Bold line" at row=0, col=0 should be bold
    expect(term.cell(0, 0)).toBeBold()

    // "N" of "Normal line" at row=1, col=0 should NOT be bold
    expect(term.cell(1, 0)).not.toBeBold()

    term.close()
  })

  test("dim text followed by normal text: dim does not leak", () => {
    const { term } = renderToTerminal(
      <Box flexDirection="column" width={30} height={5}>
        <Text dimColor>Dim line</Text>
        <Text>Bright line</Text>
      </Box>,
      30,
      5,
    )

    expect(term.screen).toContainText("Dim line")
    expect(term.screen).toContainText("Bright line")

    // "D" of "Dim line" at row=0, col=0 should be faint
    expect(term.cell(0, 0)).toBeFaint()

    // "B" of "Bright line" at row=1, col=0 should NOT be faint
    expect(term.cell(1, 0)).not.toBeFaint()

    term.close()
  })
})

// ============================================================================
// Nested boxes render correctly
// ============================================================================

describe("nested boxes render correctly through terminal", () => {
  test("nested borders both render with correct characters", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" width={20} height={5}>
        <Box borderStyle="round" width={16} height={3}>
          <Text>Nested</Text>
        </Box>
      </Box>,
      25,
      7,
    )

    expect(term.screen).toContainText("Nested")

    // Outer border: single style at row=0
    expect(term.screen).toContainText("\u250c") // ┌ (single)
    // Inner border: round style at row=1
    expect(term.screen).toContainText("\u256d") // ╭ (round)

    term.close()
  })

  test("nested boxes with different true-color border colors are isolated", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" borderColor="#ff0000" width={24} height={5}>
        <Box borderStyle="single" borderColor="#0000ff" width={20} height={3}>
          <Text color="#00ff00">Content</Text>
        </Box>
      </Box>,
      30,
      7,
    )

    expect(term.screen).toContainText("Content")

    // Outer border at row=0, col=0 should be red
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // Inner border at row=1, col=1 should be blue
    expect(term.cell(1, 1)).toHaveFg({ r: 0, g: 0, b: 255 })

    // Content "C" at row=2, col=2 should be green
    expect(term.cell(2, 2)).toHaveFg({ r: 0, g: 255, b: 0 })

    term.close()
  })
})

// ============================================================================
// Border with foreground color
// ============================================================================

describe("border with foreground color", () => {
  test("true-color borderColor applies to all border characters", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" borderColor="#ff0000" width={10} height={3}>
        <Text>Hi</Text>
      </Box>,
      20,
      5,
    )

    expect(term.screen).toContainText("Hi")

    // Top-left corner at row=0, col=0 should have red fg
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // Top-right corner at row=0, col=9 should have red fg
    expect(term.cell(0, 9)).toHaveFg({ r: 255, g: 0, b: 0 })

    // Left border at row=1, col=0 should have red fg
    expect(term.cell(1, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // Bottom-left corner at row=2, col=0 should have red fg
    expect(term.cell(2, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    term.close()
  })

  test("borderColor does not affect content text color", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" borderColor="#ff0000" width={20} height={3}>
        <Text color="#00ff00">Green text</Text>
      </Box>,
      25,
      5,
    )

    expect(term.screen).toContainText("Green text")

    // Border at row=0, col=0 should be red
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // "G" of "Green text" at row=1, col=1 should be green, not red
    expect(term.cell(1, 1)).toHaveFg({ r: 0, g: 255, b: 0 })

    term.close()
  })
})

// ============================================================================
// Style transitions across frames (incremental rendering)
// ============================================================================

describe("style transitions across frames", () => {
  test("border color change between renders produces correct terminal state", () => {
    const cols = 20
    const rows = 5
    const render = createRenderer({ cols, rows })

    function App({ color }: { color: string }) {
      return (
        <Box borderStyle="single" borderColor={color} width={15} height={3}>
          <Text>Content</Text>
        </Box>
      )
    }

    // First render: red border
    const app = render(<App color="#ff0000" />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1)
    const term = createTestTerminal(cols, rows)
    term.feed(ansi1)

    expect(term.screen).toContainText("Content")
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // Second render: blue border (incremental diff)
    app.rerender(<App color="#0000ff" />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    expect(term.screen).toContainText("Content")
    // Border should now be blue, not red
    expect(term.cell(0, 0)).toHaveFg({ r: 0, g: 0, b: 255 })

    term.close()
  })

  test("adding bold to text in incremental render applies correctly", () => {
    const cols = 30
    const rows = 5
    const render = createRenderer({ cols, rows })

    function App({ bold }: { bold: boolean }) {
      return (
        <Box borderStyle="single" width={20} height={3}>
          <Text bold={bold}>Dynamic</Text>
        </Box>
      )
    }

    // First render: not bold
    const app = render(<App bold={false} />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1)
    const term = createTestTerminal(cols, rows)
    term.feed(ansi1)

    expect(term.screen).toContainText("Dynamic")
    // "D" at row=1, col=1 should NOT be bold
    expect(term.cell(1, 1)).not.toBeBold()

    // Second render: bold
    app.rerender(<App bold={true} />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    expect(term.screen).toContainText("Dynamic")
    // "D" at row=1, col=1 should now be bold
    expect(term.cell(1, 1)).toBeBold()

    term.close()
  })

  test("removing background color in incremental render clears it", () => {
    const cols = 30
    const rows = 5
    const render = createRenderer({ cols, rows })

    function App({ showBg }: { showBg: boolean }) {
      return (
        <Box width={20} height={3}>
          <Text backgroundColor={showBg ? "#ff0000" : undefined}>Text</Text>
        </Box>
      )
    }

    // First render: with red bg
    const app = render(<App showBg={true} />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1)
    const term = createTestTerminal(cols, rows)
    term.feed(ansi1)

    expect(term.screen).toContainText("Text")
    // "T" at row=0, col=0 should have red bg
    expect(term.cell(0, 0)).toHaveBg({ r: 255, g: 0, b: 0 })

    // Second render: no bg
    app.rerender(<App showBg={false} />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    expect(term.screen).toContainText("Text")
    // Red bg should be cleared
    expect(term.cell(0, 0)).not.toHaveBg({ r: 255, g: 0, b: 0 })

    term.close()
  })
})

// ============================================================================
// Color transition correctness through terminal emulator
// ============================================================================

describe("color transitions through terminal emulator", () => {
  test("adjacent red and blue text have distinct foreground colors", () => {
    const { term } = renderToTerminal(
      <Text>
        <Text color="#ff0000">R</Text>
        <Text color="#0000ff">B</Text>
      </Text>,
      20,
      3,
    )

    expect(term.screen).toContainText("R")
    expect(term.screen).toContainText("B")

    // "R" at row=0, col=0 should be red
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // "B" at row=0, col=1 should be blue
    expect(term.cell(0, 1)).toHaveFg({ r: 0, g: 0, b: 255 })

    term.close()
  })

  test("fg color followed by bg color: both survive through terminal", () => {
    const { term } = renderToTerminal(
      <Text>
        <Text color="#ff0000">A</Text>
        <Text backgroundColor="#0000ff">B</Text>
      </Text>,
      20,
      3,
    )

    expect(term.screen).toContainText("A")
    expect(term.screen).toContainText("B")

    // "A" at row=0, col=0 should have red fg
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // "B" at row=0, col=1 should have blue bg
    expect(term.cell(0, 1)).toHaveBg({ r: 0, g: 0, b: 255 })

    term.close()
  })

  test("true-color border survives ANSI round-trip", () => {
    const borderColor = "#8B5CF6" // purple
    const { term } = renderToTerminal(
      <Box borderStyle="single" borderColor={borderColor} width={10} height={3}>
        <Text>Hi</Text>
      </Box>,
      20,
      5,
    )

    expect(term.screen).toContainText("Hi")

    // Border at row=0, col=0 should have the true-color purple fg
    expect(term.cell(0, 0)).toHaveFg({ r: 0x8b, g: 0x5c, b: 0xf6 })

    term.close()
  })
})
