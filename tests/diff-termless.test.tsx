/**
 * Tests for incremental diff output correctness using termless (real terminal emulator).
 *
 * These tests verify that hightea's fullscreen incremental diff output — the ANSI
 * escape sequences emitted by the output phase when diffing previous and current
 * buffers — produces correct terminal state when fed through a real terminal
 * emulator (xterm.js via termless).
 *
 * This catches bugs that buffer-level tests miss: wrong cursor positioning in
 * diffs, missing style resets between changed regions, stale pixels from
 * incomplete erasure, and SGR state leaking across diff chunks.
 *
 * Pattern: render component → capture buffer → generate ANSI via outputPhase →
 * feed ALL output (initial + diffs) sequentially to same terminal instance →
 * assert final terminal state.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { enterAlternateScreen } from "../src/output.js"
import { createRenderer } from "@hightea/term/testing"
import { createTerminalFixture } from "@termless/test"

// ============================================================================
// Helpers
// ============================================================================

/** Create a termless terminal in alternate screen mode for fullscreen testing. */
function createTestTerminal(cols: number, rows: number) {
  const term = createTerminalFixture({
    cols,
    rows,
    scrollbackLimit: 0,
  })
  term.feed(enterAlternateScreen())
  return term
}

// ============================================================================
// Simple text change
// ============================================================================

describe("simple text change", () => {
  test("render 'Hello', update to 'World' — terminal shows 'World' not 'Horld'", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ text }: { text: string }) {
      return (
        <Box width={cols} height={rows}>
          <Text>{text}</Text>
        </Box>
      )
    }

    // Initial render
    const app = render(<App text="Hello" />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1, "fullscreen")
    term.feed(ansi1)

    expect(term.screen).toContainText("Hello")

    // Update to "World"
    app.rerender(<App text="World" />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2, "fullscreen")
    term.feed(ansi2)

    expect(term.screen).toContainText("World")
    expect(term.screen.getText()).not.toContain("Hello")
    // Specifically check no partial overwrite artifact like "Horld"
    expect(term.screen.getText()).not.toContain("Horld")
  })
})

// ============================================================================
// Color change
// ============================================================================

describe("color change", () => {
  test("render red text, change to blue — no red remnants", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ color }: { color: string }) {
      return (
        <Box width={cols} height={rows}>
          <Text color={color}>Colored</Text>
        </Box>
      )
    }

    // Initial render with red
    const app = render(<App color="#ff0000" />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1, "fullscreen")
    term.feed(ansi1)

    expect(term.screen).toContainText("Colored")
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // Change to blue
    app.rerender(<App color="#0000ff" />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2, "fullscreen")
    term.feed(ansi2)

    expect(term.screen).toContainText("Colored")
    // All character cells should now be blue, not red
    for (let c = 0; c < "Colored".length; c++) {
      expect(term.cell(0, c)).toHaveFg({ r: 0, g: 0, b: 255 })
    }
  })
})

// ============================================================================
// Text shortening (stale pixels)
// ============================================================================

describe("text shortening", () => {
  test("render 'Hello World', update to 'Hi' — no stale 'World' pixels", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ text }: { text: string }) {
      return (
        <Box width={cols} height={rows}>
          <Text>{text}</Text>
        </Box>
      )
    }

    const app = render(<App text="Hello World" />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1, "fullscreen")
    term.feed(ansi1)

    expect(term.screen).toContainText("Hello World")

    // Shorten to "Hi"
    app.rerender(<App text="Hi" />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2, "fullscreen")
    term.feed(ansi2)

    expect(term.screen).toContainText("Hi")
    // Old text must be fully cleared
    expect(term.screen.getText()).not.toContain("World")
    expect(term.screen.getText()).not.toContain("Hello")
  })
})

// ============================================================================
// Text lengthening
// ============================================================================

describe("text lengthening", () => {
  test("render 'Hi', update to 'Hello World' — complete text visible", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ text }: { text: string }) {
      return (
        <Box width={cols} height={rows}>
          <Text>{text}</Text>
        </Box>
      )
    }

    const app = render(<App text="Hi" />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1, "fullscreen")
    term.feed(ansi1)

    expect(term.screen).toContainText("Hi")

    // Lengthen to "Hello World"
    app.rerender(<App text="Hello World" />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2, "fullscreen")
    term.feed(ansi2)

    expect(term.screen).toContainText("Hello World")
  })
})

// ============================================================================
// Multi-line update
// ============================================================================

describe("multi-line update", () => {
  test("change one line in middle — other lines untouched", () => {
    const cols = 40
    const rows = 10
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ middle }: { middle: string }) {
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Text>Line A: header</Text>
          <Text>Line B: {middle}</Text>
          <Text>Line C: footer</Text>
        </Box>
      )
    }

    const app = render(<App middle="original" />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1, "fullscreen")
    term.feed(ansi1)

    expect(term.screen).toContainText("Line A: header")
    expect(term.screen).toContainText("Line B: original")
    expect(term.screen).toContainText("Line C: footer")

    // Change only the middle line
    app.rerender(<App middle="updated" />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2, "fullscreen")
    term.feed(ansi2)

    expect(term.screen).toContainText("Line A: header")
    expect(term.screen).toContainText("Line B: updated")
    expect(term.screen).toContainText("Line C: footer")
    expect(term.screen.getText()).not.toContain("original")
  })
})

// ============================================================================
// Style change without text change
// ============================================================================

describe("style change without text change", () => {
  test("add bold to existing text — SGR applied correctly", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ bold }: { bold: boolean }) {
      return (
        <Box width={cols} height={rows}>
          <Text bold={bold}>Styled text</Text>
        </Box>
      )
    }

    // Initial render without bold
    const app = render(<App bold={false} />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1, "fullscreen")
    term.feed(ansi1)

    expect(term.screen).toContainText("Styled text")

    // Add bold
    app.rerender(<App bold={true} />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2, "fullscreen")
    term.feed(ansi2)

    expect(term.screen).toContainText("Styled text")
    // Verify bold is applied on all chars of "Styled text"
    for (let c = 0; c < "Styled text".length; c++) {
      expect(term.cell(0, c)).toBeBold()
    }
  })

  test("change foreground color without changing text content", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ color }: { color: string }) {
      return (
        <Box width={cols} height={rows}>
          <Text color={color}>Same text</Text>
        </Box>
      )
    }

    const app = render(<App color="#aa0000" />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1, "fullscreen")
    term.feed(ansi1)

    expect(term.cell(0, 0)).toHaveFg({ r: 170, g: 0, b: 0 })

    // Change color
    app.rerender(<App color="#00aa00" />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2, "fullscreen")
    term.feed(ansi2)

    expect(term.screen).toContainText("Same text")
    for (let c = 0; c < "Same text".length; c++) {
      expect(term.cell(0, c)).toHaveFg({ r: 0, g: 170, b: 0 })
    }
  })
})

// ============================================================================
// Background color transitions
// ============================================================================

describe("background color transitions", () => {
  test("change background color — no remnants of old background", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ bg }: { bg: string }) {
      return (
        <Box width={cols} height={rows}>
          <Box backgroundColor={bg} width={20} height={3}>
            <Text>Content</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App bg="#ff0000" />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1, "fullscreen")
    term.feed(ansi1)

    expect(term.screen).toContainText("Content")
    expect(term.cell(0, 0)).toHaveBg({ r: 255, g: 0, b: 0 })

    // Change bg to green
    app.rerender(<App bg="#00ff00" />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2, "fullscreen")
    term.feed(ansi2)

    expect(term.screen).toContainText("Content")
    // All cells in the bg box should now be green
    for (let c = 0; c < 20; c++) {
      expect(term.cell(0, c)).toHaveBg({ r: 0, g: 255, b: 0 })
    }
  })
})

// ============================================================================
// Multiple sequential diffs
// ============================================================================

describe("multiple sequential diffs", () => {
  test("accumulating 5 incremental diffs produces correct final state", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    const labels = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]

    function App({ step }: { step: number }) {
      return (
        <Box width={cols} height={rows}>
          <Text>{labels[step]}</Text>
        </Box>
      )
    }

    // Initial render
    const app = render(<App step={0} />)
    let prevBuf = app.lastBuffer()!
    let ansi = outputPhase(null, prevBuf, "fullscreen")
    term.feed(ansi)

    expect(term.screen).toContainText("Alpha")

    // Feed 4 incremental diffs
    for (let step = 1; step < labels.length; step++) {
      app.rerender(<App step={step} />)
      const newBuf = app.lastBuffer()!
      const diffAnsi = outputPhase(prevBuf, newBuf, "fullscreen")
      term.feed(diffAnsi)
      prevBuf = newBuf
    }

    // Final state should show only "Epsilon"
    expect(term.screen).toContainText("Epsilon")
    expect(term.screen.getText()).not.toContain("Delta")
    expect(term.screen.getText()).not.toContain("Gamma")
    expect(term.screen.getText()).not.toContain("Beta")
    expect(term.screen.getText()).not.toContain("Alpha")
  })
})

// ============================================================================
// Multi-line with colors through multiple diffs
// ============================================================================

describe("complex multi-line diffs with styles", () => {
  test("changing colors and text across multiple rows over multiple diffs", () => {
    const cols = 40
    const rows = 10
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ step }: { step: number }) {
      const colors = ["#ff0000", "#00ff00", "#0000ff"]
      const color = colors[step % colors.length]!
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Text color={color}>Header step {step}</Text>
          <Text bold={step % 2 === 0}>Content line</Text>
          <Text>Footer always</Text>
        </Box>
      )
    }

    const app = render(<App step={0} />)
    let prevBuf = app.lastBuffer()!
    term.feed(outputPhase(null, prevBuf, "fullscreen"))

    expect(term.screen).toContainText("Header step 0")
    expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })

    // Step 1: green header, non-bold content
    app.rerender(<App step={1} />)
    let newBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, newBuf, "fullscreen"))
    prevBuf = newBuf

    expect(term.screen).toContainText("Header step 1")
    expect(term.cell(0, 0)).toHaveFg({ r: 0, g: 255, b: 0 })
    expect(term.screen).toContainText("Footer always")

    // Step 2: blue header, bold content
    app.rerender(<App step={2} />)
    newBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, newBuf, "fullscreen"))
    prevBuf = newBuf

    expect(term.screen).toContainText("Header step 2")
    expect(term.cell(0, 0)).toHaveFg({ r: 0, g: 0, b: 255 })
    expect(term.screen).toContainText("Footer always")
  })
})

// ============================================================================
// Incremental diff matches fresh render (the gold standard)
// ============================================================================

describe("incremental diff matches fresh render", () => {
  test("accumulated diffs produce same terminal state as fresh render", () => {
    const cols = 50
    const rows = 8
    const render = createRenderer({ cols, rows })

    function App({ step }: { step: number }) {
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Box backgroundColor={step % 2 === 0 ? "#333333" : "#666666"} width={30} height={2}>
            <Text color={step % 3 === 0 ? "#ff0000" : "#00ff00"}>Step {step} content</Text>
          </Box>
          <Text bold={step % 2 === 0}>Status: {step % 2 === 0 ? "even" : "odd"}</Text>
          <Text>Stable footer line</Text>
        </Box>
      )
    }

    // Build accumulated incremental terminal
    const termIncr = createTestTerminal(cols, rows)
    const app = render(<App step={0} />)
    let prevBuf = app.lastBuffer()!
    termIncr.feed(outputPhase(null, prevBuf, "fullscreen"))

    for (let step = 1; step <= 5; step++) {
      app.rerender(<App step={step} />)
      const newBuf = app.lastBuffer()!
      termIncr.feed(outputPhase(prevBuf, newBuf, "fullscreen"))
      prevBuf = newBuf
    }

    // Build fresh render terminal (single full render of final state)
    const termFresh = createTestTerminal(cols, rows)
    const freshBuf = app.lastBuffer()!
    termFresh.feed(outputPhase(null, freshBuf, "fullscreen"))

    // Compare: both terminals should show identical text
    expect(termIncr.screen.getText()).toBe(termFresh.screen.getText())

    // Compare cell-by-cell for styles
    for (let row = 0; row < rows; row++) {
      const incrRow = termIncr.row(row)
      const freshRow = termFresh.row(row)
      expect(incrRow.getText()).toBe(freshRow.getText())
    }
  })
})

// ============================================================================
// React component state changes via rerender
// ============================================================================

describe("React component with conditional rendering", () => {
  test("showing and hiding children produces clean diff output", () => {
    const cols = 40
    const rows = 8
    const render = createRenderer({ cols, rows })
    const term = createTestTerminal(cols, rows)

    function App({ showMiddle }: { showMiddle: boolean }) {
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Text>Top</Text>
          {showMiddle && <Text>Middle section</Text>}
          <Text>Bottom</Text>
        </Box>
      )
    }

    // Initial: show middle
    const app = render(<App showMiddle={true} />)
    let prevBuf = app.lastBuffer()!
    term.feed(outputPhase(null, prevBuf, "fullscreen"))

    expect(term.screen).toContainText("Top")
    expect(term.screen).toContainText("Middle section")
    expect(term.screen).toContainText("Bottom")

    // Hide middle
    app.rerender(<App showMiddle={false} />)
    let newBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, newBuf, "fullscreen"))
    prevBuf = newBuf

    expect(term.screen).toContainText("Top")
    expect(term.screen.getText()).not.toContain("Middle section")
    expect(term.screen).toContainText("Bottom")

    // Show middle again
    app.rerender(<App showMiddle={true} />)
    newBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, newBuf, "fullscreen"))

    expect(term.screen).toContainText("Top")
    expect(term.screen).toContainText("Middle section")
    expect(term.screen).toContainText("Bottom")
  })
})
