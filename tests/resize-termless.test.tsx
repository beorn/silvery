/**
 * Tests for terminal resize correctness using termless (real terminal emulator).
 *
 * Verifies that when the terminal dimensions change, inkx's fullscreen output
 * produces correct terminal state at the new size. This catches bugs in the
 * resize → relayout → full-redraw pipeline: stale content from the old size,
 * truncated or overflowing lines, incorrect cursor positioning, and style
 * artifacts from the dimension change.
 *
 * Pattern: render at initial size → resize → capture new buffer → generate
 * ANSI via outputPhase → feed to termless terminal at new size → assert.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { enterAlternateScreen } from "../src/output.js"
import { createRenderer } from "inkx/testing"
import { createTerminalFixture } from "@termless/test"

// ============================================================================
// Helpers
// ============================================================================

function createTestTerminal(cols: number, rows: number) {
  const term = createTerminalFixture({
    cols,
    rows,
    scrollbackLimit: 0,
  })
  term.feed(enterAlternateScreen())
  return term
}

/** Render at initial size, resize, then verify via termless at new size. */
function renderResizeAndVerify(opts: {
  initialCols: number
  initialRows: number
  newCols: number
  newRows: number
  component: (props: { cols: number; rows: number }) => React.ReactElement
  verify: (term: ReturnType<typeof createTerminalFixture>) => void
}) {
  const { initialCols, initialRows, newCols, newRows, component: Component, verify } = opts
  const render = createRenderer({ cols: initialCols, rows: initialRows })

  // Initial render
  const app = render(<Component cols={initialCols} rows={initialRows} />)
  const buf1 = app.lastBuffer()!

  // Resize the renderer (triggers relayout + full redraw)
  app.resize(newCols, newRows)
  // Re-render with new dimension props (matches real app: resize event → state update → rerender)
  app.rerender(<Component cols={newCols} rows={newRows} />)
  const buf2 = app.lastBuffer()!

  // Feed full-render ANSI at new size to a fresh terminal (resize clears prevBuffer)
  const term = createTestTerminal(newCols, newRows)
  const ansi = outputPhase(null, buf2, "fullscreen")
  term.feed(ansi)

  verify(term)
}

// ============================================================================
// Width expansion
// ============================================================================

describe("resize: width expansion", () => {
  test("text fills wider terminal after resize", () => {
    renderResizeAndVerify({
      initialCols: 40,
      initialRows: 10,
      newCols: 80,
      newRows: 10,
      component: ({ cols, rows }) => (
        <Box width={cols} height={rows}>
          <Text>Hello World</Text>
        </Box>
      ),
      verify: (term) => {
        expect(term.screen).toContainText("Hello World")
      },
    })
  })

  test("flex-grow box expands to new width", () => {
    renderResizeAndVerify({
      initialCols: 40,
      initialRows: 5,
      newCols: 80,
      newRows: 5,
      component: ({ cols, rows }) => (
        <Box width={cols} height={rows} flexDirection="row">
          <Box flexGrow={1} borderStyle="single">
            <Text>Left</Text>
          </Box>
          <Box flexGrow={1} borderStyle="single">
            <Text>Right</Text>
          </Box>
        </Box>
      ),
      verify: (term) => {
        expect(term.screen).toContainText("Left")
        expect(term.screen).toContainText("Right")
        // Both boxes should have content visible at the wider size
        // The screen text should have both labels with some separation
        const screenText = term.screen.getText()
        expect(screenText).toContain("Left")
        expect(screenText).toContain("Right")
      },
    })
  })
})

// ============================================================================
// Width contraction
// ============================================================================

describe("resize: width contraction", () => {
  test("no stale content beyond new width after shrink", () => {
    const render = createRenderer({ cols: 80, rows: 5 })
    const term = createTestTerminal(80, 5)

    function App({ cols, rows }: { cols: number; rows: number }) {
      return (
        <Box width={cols} height={rows}>
          <Text>{"A".repeat(cols)}</Text>
        </Box>
      )
    }

    // Render wide
    const app = render(<App cols={80} rows={5} />)
    const buf1 = app.lastBuffer()!
    term.feed(outputPhase(null, buf1, "fullscreen"))

    // Verify full width filled
    expect(term.row(0).getText().trim().length).toBe(80)

    // Now resize down
    app.resize(40, 5)
    app.rerender(<App cols={40} rows={5} />)
    const buf2 = app.lastBuffer()!

    // Feed to a NEW terminal at the new size (as a real terminal would be)
    const termSmall = createTestTerminal(40, 5)
    termSmall.feed(outputPhase(null, buf2, "fullscreen"))

    // At 40 cols, the text should be 40 A's
    const row0 = termSmall.row(0).getText().trim()
    expect(row0.length).toBeLessThanOrEqual(40)
    expect(row0).toContain("A")
  })
})

// ============================================================================
// Height change
// ============================================================================

describe("resize: height change", () => {
  test("additional rows visible after height increase", () => {
    renderResizeAndVerify({
      initialCols: 40,
      initialRows: 3,
      newCols: 40,
      newRows: 8,
      component: ({ cols, rows }) => (
        <Box width={cols} height={rows} flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
          <Text>Line 4</Text>
          <Text>Line 5</Text>
          <Text>Line 6</Text>
        </Box>
      ),
      verify: (term) => {
        // With 8 rows, all 6 lines should be visible
        expect(term.screen).toContainText("Line 1")
        expect(term.screen).toContainText("Line 6")
      },
    })
  })

  test("content not visible after height decrease", () => {
    renderResizeAndVerify({
      initialCols: 40,
      initialRows: 10,
      newCols: 40,
      newRows: 3,
      component: ({ cols, rows }) => (
        <Box width={cols} height={rows} flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
          <Text>Line 4</Text>
          <Text>Line 5</Text>
        </Box>
      ),
      verify: (term) => {
        // With only 3 rows, lines 4-5 should be clipped
        expect(term.screen).toContainText("Line 1")
        expect(term.screen).toContainText("Line 2")
        expect(term.screen).toContainText("Line 3")
        expect(term.screen.getText()).not.toContain("Line 4")
        expect(term.screen.getText()).not.toContain("Line 5")
      },
    })
  })
})

// ============================================================================
// Bordered layout resize
// ============================================================================

describe("resize: bordered boxes", () => {
  test("border fills new width after resize", () => {
    renderResizeAndVerify({
      initialCols: 40,
      initialRows: 5,
      newCols: 60,
      newRows: 5,
      component: ({ cols, rows }) => (
        <Box width={cols} height={rows} borderStyle="single">
          <Text>Content inside border</Text>
        </Box>
      ),
      verify: (term) => {
        expect(term.screen).toContainText("Content inside border")
        // Top border should span 60 cols
        const topRow = term.row(0).getText()
        // The border characters (─) should fill the width
        expect(topRow.length).toBeGreaterThanOrEqual(58) // 60 - possible trim
      },
    })
  })
})

// ============================================================================
// Multiple sequential resizes
// ============================================================================

describe("resize: multiple sequential resizes", () => {
  test("3 resizes produce correct final layout", () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    function App({ cols, rows }: { cols: number; rows: number }) {
      return (
        <Box width={cols} height={rows} borderStyle="single">
          <Text>
            Size: {cols}x{rows}
          </Text>
        </Box>
      )
    }

    const app = render(<App cols={40} rows={5} />)

    // Resize 1: wider
    app.resize(80, 5)
    app.rerender(<App cols={80} rows={5} />)
    // Resize 2: taller
    app.resize(80, 15)
    app.rerender(<App cols={80} rows={15} />)
    // Resize 3: smaller both
    app.resize(50, 8)
    app.rerender(<App cols={50} rows={8} />)

    const finalBuf = app.lastBuffer()!
    const term = createTestTerminal(50, 8)
    term.feed(outputPhase(null, finalBuf, "fullscreen"))

    expect(term.screen).toContainText("Size: 50x8")
  })
})

// ============================================================================
// Resize with incremental diff (the tricky case)
// ============================================================================

describe("resize: incremental diff after resize", () => {
  test("content update after resize renders correctly through diff", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })

    function App({ text, cols: c, rows: r }: { text: string; cols: number; rows: number }) {
      return (
        <Box width={c} height={r}>
          <Text>{text}</Text>
        </Box>
      )
    }

    // Initial render
    const app = render(<App text="Before resize" cols={cols} rows={rows} />)
    const buf1 = app.lastBuffer()!

    // Feed initial to terminal
    const term = createTestTerminal(cols, rows)
    term.feed(outputPhase(null, buf1, "fullscreen"))
    expect(term.screen).toContainText("Before resize")

    // Resize (clears prevBuffer, forces full redraw)
    app.resize(60, 8)
    app.rerender(<App text="Before resize" cols={60} rows={8} />)
    const buf2 = app.lastBuffer()!

    // New terminal at new size for the full redraw
    const term2 = createTestTerminal(60, 8)
    term2.feed(outputPhase(null, buf2, "fullscreen"))
    expect(term2.screen).toContainText("Before resize")

    // Now do an incremental update AFTER the resize
    app.rerender(<App text="After resize" cols={60} rows={8} />)
    const buf3 = app.lastBuffer()!

    // This is the critical test: incremental diff from buf2 → buf3 at new size
    const diffAnsi = outputPhase(buf2, buf3, "fullscreen")
    term2.feed(diffAnsi)

    expect(term2.screen).toContainText("After resize")
    expect(term2.screen.getText()).not.toContain("Before resize")
  })
})

// ============================================================================
// Resize with colored content
// ============================================================================

describe("resize: styles survive resize", () => {
  test("colored text retains color after resize", () => {
    renderResizeAndVerify({
      initialCols: 40,
      initialRows: 5,
      newCols: 60,
      newRows: 5,
      component: ({ cols, rows }) => (
        <Box width={cols} height={rows}>
          <Text color="#ff0000" bold>
            Red Bold Text
          </Text>
        </Box>
      ),
      verify: (term) => {
        expect(term.screen).toContainText("Red Bold Text")
        expect(term.cell(0, 0)).toHaveFg({ r: 255, g: 0, b: 0 })
        expect(term.cell(0, 0)).toBeBold()
      },
    })
  })

  test("background color fills to new width after resize", () => {
    renderResizeAndVerify({
      initialCols: 30,
      initialRows: 3,
      newCols: 50,
      newRows: 3,
      component: ({ cols, rows }) => (
        <Box width={cols} height={rows} backgroundColor="#003300">
          <Text>BG Test</Text>
        </Box>
      ),
      verify: (term) => {
        expect(term.screen).toContainText("BG Test")
        // Background should extend to new width
        expect(term.cell(0, 0)).toHaveBg({ r: 0, g: 51, b: 0 })
        // Check cell near new right edge has bg too
        expect(term.cell(0, 40)).toHaveBg({ r: 0, g: 51, b: 0 })
      },
    })
  })
})

// ============================================================================
// Column layout resize (board-like structure)
// ============================================================================

describe("resize: multi-column layout", () => {
  test("columns redistribute after width change", () => {
    renderResizeAndVerify({
      initialCols: 60,
      initialRows: 8,
      newCols: 100,
      newRows: 8,
      component: ({ cols, rows }) => (
        <Box width={cols} height={rows} flexDirection="row">
          <Box flexGrow={1} flexDirection="column" borderStyle="single">
            <Text bold>Todo</Text>
            <Text>Task A</Text>
            <Text>Task B</Text>
          </Box>
          <Box flexGrow={1} flexDirection="column" borderStyle="single">
            <Text bold>In Progress</Text>
            <Text>Task C</Text>
          </Box>
          <Box flexGrow={1} flexDirection="column" borderStyle="single">
            <Text bold>Done</Text>
            <Text>Task D</Text>
            <Text>Task E</Text>
          </Box>
        </Box>
      ),
      verify: (term) => {
        // All columns and their content should be visible at 100 cols
        expect(term.screen).toContainText("Todo")
        expect(term.screen).toContainText("In Progress")
        expect(term.screen).toContainText("Done")
        expect(term.screen).toContainText("Task A")
        expect(term.screen).toContainText("Task C")
        expect(term.screen).toContainText("Task E")
      },
    })
  })
})
