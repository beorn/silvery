/**
 * Tests for fullscreen diff output using termless (real terminal emulator).
 *
 * These tests verify that the ANSI output from the fullscreen output phase
 * produces correct terminal state when fed to a real terminal emulator (xterm.js).
 * This catches bugs that ANSI-string-inspection tests miss, such as incorrect
 * cursor positioning, missing style resets, or broken wide character handling.
 *
 * Uses termless with xterm.js backend to emulate a real terminal.
 */

import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { enterAlternateScreen } from "../src/output.js"
import { createTerminal } from "termless"
import { createXtermBackend } from "termless-xtermjs"
import "viterm/matchers"

// ============================================================================
// Helpers
// ============================================================================

/** Create a TerminalBuffer with text on specified rows. */
function makeBuffer(width: number, height: number, lines: string[]): TerminalBuffer {
  const buf = new TerminalBuffer(width, height)
  for (let y = 0; y < lines.length; y++) {
    const line = lines[y]!
    for (let x = 0; x < line.length && x < width; x++) {
      buf.setCell(x, y, { char: line[x]! })
    }
  }
  return buf
}

/** Create a termless terminal and enter alternate screen for fullscreen testing. */
function createTestTerminal(cols: number, rows: number) {
  const term = createTerminal({
    backend: createXtermBackend({ cols, rows }),
    cols,
    rows,
    scrollbackLimit: 0,
  })
  // Enter alternate screen to match fullscreen mode behavior
  term.feed(enterAlternateScreen())
  return term
}

// ============================================================================
// Single cell change produces correct output
// ============================================================================

describe("single cell change produces correct output", () => {
  test("initial full render shows correct text", () => {
    const term = createTestTerminal(40, 10)
    const buf = makeBuffer(40, 10, ["Hello World"])
    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term).toContainText("Hello World")
    term.close()
  })

  test("diff render updates changed content", () => {
    const term = createTestTerminal(40, 10)

    // Initial render
    const buf1 = makeBuffer(40, 10, ["Hello World"])
    const ansi1 = outputPhase(null, buf1)
    term.feed(ansi1)
    expect(term).toContainText("Hello World")

    // Diff render: "World" -> "Earth"
    const buf2 = makeBuffer(40, 10, ["Hello Earth"])
    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    expect(term).toContainText("Hello Earth")
    // "World" should no longer appear
    const text = term.getText()
    expect(text).not.toContain("World")
    term.close()
  })
})

// ============================================================================
// Style changes render correctly
// ============================================================================

describe("style changes render correctly", () => {
  test("bold text renders with bold attribute", () => {
    const term = createTestTerminal(40, 10)
    const buf = new TerminalBuffer(40, 10)

    // Set "Bold" with bold attribute
    const text = "Bold"
    for (let x = 0; x < text.length; x++) {
      buf.setCell(x, 0, { char: text[x]!, attrs: { bold: true } })
    }

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term).toContainText("Bold")
    expect(term).toBeBoldAt(0, 0)
    expect(term).toBeBoldAt(0, 1)
    expect(term).toBeBoldAt(0, 2)
    expect(term).toBeBoldAt(0, 3)
    term.close()
  })

  test("colored text renders with correct foreground color", () => {
    const term = createTestTerminal(40, 10)
    const buf = new TerminalBuffer(40, 10)

    // Set "Red" with red foreground
    const text = "Red"
    for (let x = 0; x < text.length; x++) {
      buf.setCell(x, 0, { char: text[x]!, fg: { r: 255, g: 0, b: 0 } })
    }

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term).toContainText("Red")
    expect(term).toHaveFgColor(0, 0, { r: 255, g: 0, b: 0 })
    expect(term).toHaveFgColor(0, 1, { r: 255, g: 0, b: 0 })
    expect(term).toHaveFgColor(0, 2, { r: 255, g: 0, b: 0 })
    term.close()
  })
})

// ============================================================================
// Multi-row diff correctness
// ============================================================================

describe("multi-row diff correctness", () => {
  test("changing one row preserves all other rows", () => {
    const term = createTestTerminal(40, 10)

    // Render 5 lines
    const lines = ["Line 0", "Line 1", "Line 2", "Line 3", "Line 4"]
    const buf1 = makeBuffer(40, 10, lines)
    const ansi1 = outputPhase(null, buf1)
    term.feed(ansi1)

    for (const line of lines) {
      expect(term).toContainText(line)
    }

    // Change only line 3
    const updatedLines = ["Line 0", "Line 1", "Line 2", "CHANGED", "Line 4"]
    const buf2 = makeBuffer(40, 10, updatedLines)
    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    // Verify all 5 lines are correct
    expect(term).toContainText("Line 0")
    expect(term).toContainText("Line 1")
    expect(term).toContainText("Line 2")
    expect(term).toContainText("CHANGED")
    expect(term).toContainText("Line 4")
    // Old line 3 should be gone
    const text = term.getText()
    expect(text).not.toContain("Line 3")
    term.close()
  })
})

// ============================================================================
// Wide characters
// ============================================================================

describe("wide characters", () => {
  test("CJK character renders as wide", () => {
    const term = createTestTerminal(40, 10)
    const buf = new TerminalBuffer(40, 10)

    // Set a CJK wide character at position (0, 0)
    buf.setCell(0, 0, { char: "\u4e2d", wide: true })
    buf.setCell(1, 0, { char: "", continuation: true })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term).toBeWideAt(0, 0)
    expect(term).toContainText("\u4e2d")
    term.close()
  })
})

// ============================================================================
// True-color values survive round-trip
// ============================================================================

describe("true-color values survive round-trip", () => {
  test("specific RGB foreground and background survive ANSI round-trip", () => {
    const term = createTestTerminal(40, 10)
    const buf = new TerminalBuffer(40, 10)

    const fgColor = { r: 123, g: 45, b: 67 }
    const bgColor = { r: 200, g: 100, b: 50 }

    buf.setCell(0, 0, { char: "X", fg: fgColor, bg: bgColor })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term).toContainText("X")
    expect(term).toHaveFgColor(0, 0, fgColor)
    expect(term).toHaveBgColor(0, 0, bgColor)
    term.close()
  })

  test("multiple cells with different true colors", () => {
    const term = createTestTerminal(40, 10)
    const buf = new TerminalBuffer(40, 10)

    buf.setCell(0, 0, { char: "A", fg: { r: 255, g: 0, b: 0 } })
    buf.setCell(1, 0, { char: "B", fg: { r: 0, g: 255, b: 0 } })
    buf.setCell(2, 0, { char: "C", fg: { r: 0, g: 0, b: 255 } })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term).toHaveFgColor(0, 0, { r: 255, g: 0, b: 0 })
    expect(term).toHaveFgColor(0, 1, { r: 0, g: 255, b: 0 })
    expect(term).toHaveFgColor(0, 2, { r: 0, g: 0, b: 255 })
    term.close()
  })
})
