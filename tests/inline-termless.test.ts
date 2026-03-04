/**
 * Tests for inline incremental rendering using termless (xterm.js backend).
 *
 * These tests verify that inline mode ANSI output produces correct terminal
 * state when fed to a real terminal emulator. Unlike inline-mode.test.ts which
 * inspects ANSI escape sequences directly, these tests validate the end result
 * visible in the terminal — catching bugs that string inspection misses.
 *
 * Uses termless with xterm.js backend to emulate a real terminal.
 */

import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { createOutputPhase } from "../src/pipeline/output-phase.js"
import { createTerminalFixture } from "@termless/test"

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

/** Create a termless terminal for inline mode testing. */
function createTestTerminal(cols: number, rows: number) {
  return createTerminalFixture({
    cols,
    rows,
    scrollbackLimit: 1000,
  })
}

// ============================================================================
// Content shrink erases correctly
// ============================================================================

describe("content shrink erases correctly", () => {
  test("shrinking from 5 to 3 lines erases old lines from viewport", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    // Frame 1: render 5 lines
    const buf1 = makeBuffer(40, 10, ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"])
    const ansi1 = outputPhase(null, buf1, "inline", 0, 10)
    term.feed(ansi1)

    expect(term.screen).toContainText("Line 1")
    expect(term.screen).toContainText("Line 5")

    // Frame 2: render only 3 lines (content shrinks)
    const buf2 = makeBuffer(40, 10, ["Line 1", "Line 2", "Line 3"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, 10)
    term.feed(ansi2)

    // Lines 1-3 should be present
    expect(term.screen).toContainText("Line 1")
    expect(term.screen).toContainText("Line 2")
    expect(term.screen).toContainText("Line 3")

    // Lines 4-5 should be erased from the viewport
    const viewportText = term.screen.getText()
    const viewportLines = viewportText.split("\n").map((l) => l.trim())
    const hasLine4 = viewportLines.some((l) => l === "Line 4")
    const hasLine5 = viewportLines.some((l) => l === "Line 5")
    expect(hasLine4).toBe(false)
    expect(hasLine5).toBe(false)
  })
})

// ============================================================================
// Scrollback offset handling
// ============================================================================

describe("scrollback offset handling", () => {
  test("external writes between frames handled with scrollbackOffset", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    // Frame 1: render initial content
    const buf1 = makeBuffer(40, 10, ["Status: OK", "Items: 5"])
    const ansi1 = outputPhase(null, buf1, "inline", 0, 10)
    term.feed(ansi1)

    expect(term.screen).toContainText("Status: OK")
    expect(term.screen).toContainText("Items: 5")

    // Simulate external output between frames (e.g., console.log)
    // This pushes the cursor down by 2 lines
    term.feed("\r\n[external log 1]\r\n[external log 2]")

    // Frame 2: render updated content with scrollbackOffset=2
    // to account for the 2 external lines
    const buf2 = makeBuffer(40, 10, ["Status: OK", "Items: 10"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 2, 10)
    term.feed(ansi2)

    // Updated content should be visible
    expect(term.screen).toContainText("Items: 10")
  })
})

// ============================================================================
// Height capping (termRows)
// ============================================================================

describe("height capping (termRows)", () => {
  test("content exceeding termRows shows bottom of buffer", () => {
    const term = createTestTerminal(40, 4)
    const outputPhase = createOutputPhase({})

    // Create a buffer with 7 lines but terminal only has 4 rows
    const buf = makeBuffer(40, 7, ["Header row", "Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Footer bar"])
    const ansi = outputPhase(null, buf, "inline", 0, 4)
    term.feed(ansi)

    // With termRows=4, the output phase caps to the BOTTOM of the buffer.
    // Footer should be visible since it's the last line.
    expect(term.screen).toContainText("Footer bar")

    // Header should NOT be in the viewport (it's at the top, beyond the cap)
    const viewportText = term.screen.getText()
    const viewportLines = viewportText.split("\n").map((l) => l.trim())
    const hasHeader = viewportLines.some((l) => l === "Header row")
    expect(hasHeader).toBe(false)
  })
})

// ============================================================================
// Multi-frame incremental consistency
// ============================================================================

describe("multi-frame incremental consistency", () => {
  test("incremental updates accumulate correctly across 4 frames", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    // Frame 1: initial 3 lines
    const buf1 = makeBuffer(40, 10, ["Alpha", "Beta", "Gamma"])
    const ansi1 = outputPhase(null, buf1, "inline", 0, 10)
    term.feed(ansi1)

    expect(term.screen).toContainText("Alpha")
    expect(term.screen).toContainText("Beta")
    expect(term.screen).toContainText("Gamma")

    // Frame 2: change line 2
    const buf2 = makeBuffer(40, 10, ["Alpha", "Beta-v2", "Gamma"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, 10)
    term.feed(ansi2)

    expect(term.screen).toContainText("Alpha")
    expect(term.screen).toContainText("Beta-v2")
    expect(term.screen).toContainText("Gamma")
    // Old value should be gone
    const text2 = term.screen.getText()
    expect(text2).not.toContain("Beta\n") // "Beta" without suffix should not be a standalone line

    // Frame 3: change line 3
    const buf3 = makeBuffer(40, 10, ["Alpha", "Beta-v2", "Gamma-v2"])
    const ansi3 = outputPhase(buf2, buf3, "inline", 0, 10)
    term.feed(ansi3)

    expect(term.screen).toContainText("Alpha")
    expect(term.screen).toContainText("Beta-v2")
    expect(term.screen).toContainText("Gamma-v2")

    // Frame 4: change all lines
    const buf4 = makeBuffer(40, 10, ["Alpha-v2", "Beta-v3", "Gamma-v3"])
    const ansi4 = outputPhase(buf3, buf4, "inline", 0, 10)
    term.feed(ansi4)

    expect(term.screen).toContainText("Alpha-v2")
    expect(term.screen).toContainText("Beta-v3")
    expect(term.screen).toContainText("Gamma-v3")

    // Verify no stale content from previous frames in viewport
    const finalText = term.screen.getText()
    const lines = finalText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    // Only the 3 current lines should have content
    for (const line of lines) {
      const isCurrentContent = line.includes("Alpha-v2") || line.includes("Beta-v3") || line.includes("Gamma-v3")
      expect(isCurrentContent).toBe(true)
    }
  })
})
