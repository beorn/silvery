/**
 * Tests for scrollback promotion using termless (xterm.js backend).
 *
 * These tests verify that the ANSI output from handleScrollbackPromotion
 * produces correct terminal state when fed to a real terminal emulator.
 * This catches bugs that ANSI-string-inspection tests miss (like the
 * "jump up" bug where leftover erasure coordinates were wrong).
 *
 * Uses termless with xterm.js backend to emulate a real terminal.
 */

import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { createOutputPhase } from "../src/pipeline/output-phase.js"
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

/** Create a termless terminal for inline mode testing. */
function createTestTerminal(cols: number, rows: number) {
  return createTerminal({
    backend: createXtermBackend({ cols, rows }),
    cols,
    rows,
    scrollbackLimit: 1000,
  })
}

// ============================================================================
// Basic inline rendering via termless
// ============================================================================

describe("inline output → termless verification", () => {
  test("basic inline render produces correct terminal text", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    const buf = makeBuffer(40, 10, ["Hello World", "Second line"])
    const ansi = outputPhase(null, buf, "inline", 0, 10)
    term.feed(ansi)

    expect(term).toContainText("Hello World")
    expect(term).toContainText("Second line")
    term.close()
  })

  test("incremental inline render updates changed content", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    const buf1 = makeBuffer(40, 10, ["Line A", "Line B"])
    const ansi1 = outputPhase(null, buf1, "inline", 0, 10)
    term.feed(ansi1)

    expect(term).toContainText("Line A")
    expect(term).toContainText("Line B")

    const buf2 = makeBuffer(40, 10, ["Line A", "Line C"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, 10)
    term.feed(ansi2)

    expect(term).toContainText("Line A")
    expect(term).toContainText("Line C")
    term.close()
  })
})

// ============================================================================
// Scrollback promotion
// ============================================================================

describe("scrollback promotion → termless verification", () => {
  test("promoted frozen content appears above live content", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    // Frame 1: render 3 lines of live content
    const buf1 = makeBuffer(40, 10, ["Item 1", "Item 2", "Status bar"])
    const ansi1 = outputPhase(null, buf1, "inline", 0, 10)
    term.feed(ansi1)
    expect(term).toContainText("Item 1")
    expect(term).toContainText("Item 2")
    expect(term).toContainText("Status bar")

    // Frame 2: promote Item 1 to scrollback, live content = Item 2 + Status bar
    const frozenContent = "Item 1\x1b[K\r\n"
    outputPhase.promoteScrollback!(frozenContent, 1)

    const buf2 = makeBuffer(40, 10, ["Item 2", "Status bar"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, 10)
    term.feed(ansi2)

    // Both should be visible — frozen in scrollback or on screen, live on screen
    expect(term).toContainText("Item 2")
    expect(term).toContainText("Status bar")
    term.close()
  })

  test("no jump-up: cursor stays at correct position after promotion", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    // Frame 1: 5 lines of live content
    const lines1 = ["Task 1", "Task 2", "Task 3", "Task 4", "Footer"]
    const buf1 = makeBuffer(40, 10, lines1)
    const ansi1 = outputPhase(null, buf1, "inline", 0, 10)
    term.feed(ansi1)

    for (const line of lines1) {
      expect(term).toContainText(line)
    }

    // Frame 2: promote Task 1 + Task 2, live = Task 3, Task 4, Footer
    const frozenContent = "Task 1\x1b[K\r\nTask 2\x1b[K\r\n"
    outputPhase.promoteScrollback!(frozenContent, 2)

    const buf2 = makeBuffer(40, 10, ["Task 3", "Task 4", "Footer"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, 10)
    term.feed(ansi2)

    // Verify: live content is visible and correct
    expect(term).toContainText("Task 3")
    expect(term).toContainText("Task 4")
    expect(term).toContainText("Footer")

    // Cursor should NOT be at row 0 (that would mean it "jumped up")
    const cursor = term.getCursor()
    expect(cursor.y).toBeGreaterThan(0)

    term.close()
  })

  test("no blank lines after promotion (the jump-up bug)", () => {
    const term = createTestTerminal(60, 8)
    const outputPhase = createOutputPhase({})

    // Frame 1: fill 7 lines (close to terminal height)
    const lines = Array.from({ length: 7 }, (_, i) => `Row ${i}`)
    const buf1 = makeBuffer(60, 10, lines)
    const ansi1 = outputPhase(null, buf1, "inline", 0, 8)
    term.feed(ansi1)

    // Frame 2: freeze first 2 rows, live = remaining 5
    const frozenContent = "Row 0\x1b[K\r\nRow 1\x1b[K\r\n"
    outputPhase.promoteScrollback!(frozenContent, 2)

    const liveLines = lines.slice(2)
    const buf2 = makeBuffer(60, 10, liveLines)
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, 8)
    term.feed(ansi2)

    // The terminal text should NOT have large blank gaps
    // Get all visible lines and check for content
    const text = term.getText()
    const visibleLines = text.split("\n")

    // Count non-empty lines in the viewport
    const nonEmptyLines = visibleLines.filter((l) => l.trim().length > 0)

    // We should have at least the 5 live lines visible
    expect(nonEmptyLines.length).toBeGreaterThanOrEqual(5)

    // All live lines should be present
    for (const line of liveLines) {
      expect(term).toContainText(line)
    }

    term.close()
  })

  test("multiple sequential promotions work correctly", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    // Frame 1: 4 items
    const buf1 = makeBuffer(40, 10, ["A", "B", "C", "D"])
    term.feed(outputPhase(null, buf1, "inline", 0, 10))

    // Frame 2: freeze A
    outputPhase.promoteScrollback!("A\x1b[K\r\n", 1)
    const buf2 = makeBuffer(40, 10, ["B", "C", "D"])
    term.feed(outputPhase(buf1, buf2, "inline", 0, 10))
    expect(term).toContainText("B")
    expect(term).toContainText("C")
    expect(term).toContainText("D")

    // Frame 3: normal incremental (no promotion) — should still work
    const buf3 = makeBuffer(40, 10, ["B", "C", "D updated"])
    term.feed(outputPhase(buf2, buf3, "inline", 0, 10))
    expect(term).toContainText("D updated")

    // Frame 4: freeze B
    outputPhase.promoteScrollback!("B\x1b[K\r\n", 1)
    const buf4 = makeBuffer(40, 10, ["C", "D updated"])
    term.feed(outputPhase(buf3, buf4, "inline", 0, 10))
    expect(term).toContainText("C")
    expect(term).toContainText("D updated")

    term.close()
  })

  test("promotion near terminal bottom doesn't overflow", () => {
    const term = createTestTerminal(40, 6)
    const outputPhase = createOutputPhase({})

    // Frame 1: fill terminal almost completely (5 of 6 rows)
    const buf1 = makeBuffer(40, 10, ["L1", "L2", "L3", "L4", "L5"])
    term.feed(outputPhase(null, buf1, "inline", 0, 6))

    // Frame 2: freeze 3 lines, live = 2 lines. Total = 5, fits in 6 rows.
    const frozenContent = "L1\x1b[K\r\nL2\x1b[K\r\nL3\x1b[K\r\n"
    outputPhase.promoteScrollback!(frozenContent, 3)

    const buf2 = makeBuffer(40, 10, ["L4", "L5"])
    term.feed(outputPhase(buf1, buf2, "inline", 0, 6))

    // Should still show live content correctly
    expect(term).toContainText("L4")
    expect(term).toContainText("L5")

    // Scrollback should have grown (frozen content pushed into scrollback
    // if total exceeds terminal height)
    const sb = term.getScrollback()
    expect(sb.totalLines).toBeGreaterThanOrEqual(6)

    term.close()
  })
})

// ============================================================================
// Content shrink after promotion
// ============================================================================

describe("content changes after promotion → termless", () => {
  test("content shrink after promotion erases leftover lines", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    // Frame 1: 5 lines
    const buf1 = makeBuffer(40, 10, ["A", "B", "C", "D", "E"])
    term.feed(outputPhase(null, buf1, "inline", 0, 10))

    // Frame 2: freeze A, live = B C (content shrinks from 5 to 2 live lines)
    outputPhase.promoteScrollback!("A\x1b[K\r\n", 1)
    const buf2 = makeBuffer(40, 10, ["B", "C"])
    term.feed(outputPhase(buf1, buf2, "inline", 0, 10))

    expect(term).toContainText("B")
    expect(term).toContainText("C")

    // D and E should be erased — they shouldn't appear in the viewport
    const text = term.getText()
    // D and E were on rows 3-4 originally but should be cleared now
    // The visible content should be: frozen A (maybe in scrollback) + live B, C
    const visibleLines = text.split("\n").map((l) => l.trim())
    const hasStaleD = visibleLines.some((l) => l === "D")
    const hasStaleE = visibleLines.some((l) => l === "E")
    expect(hasStaleD).toBe(false)
    expect(hasStaleE).toBe(false)

    term.close()
  })
})

// ============================================================================
// Resize during promotion
// ============================================================================

describe("resize during promotion → termless", () => {
  test("content remains correct after resize mid-promotion", () => {
    const term = createTestTerminal(40, 10)
    const outputPhase = createOutputPhase({})

    // Frame 1: render 4 lines of content
    const buf1 = makeBuffer(40, 10, ["Alpha", "Beta", "Gamma", "Delta"])
    term.feed(outputPhase(null, buf1, "inline", 0, 10))
    expect(term).toContainText("Alpha")
    expect(term).toContainText("Delta")

    // Frame 2: promote Alpha to scrollback
    outputPhase.promoteScrollback!("Alpha\x1b[K\r\n", 1)
    const buf2 = makeBuffer(40, 10, ["Beta", "Gamma", "Delta"])
    term.feed(outputPhase(buf1, buf2, "inline", 0, 10))

    // Resize terminal mid-way (wider and shorter)
    term.resize(60, 8)

    // Frame 3: render new content after resize with a fresh output phase
    // (resize invalidates inline cursor state, so we use null prev)
    const buf3 = makeBuffer(60, 8, ["Beta", "Gamma", "Delta", "Epsilon"])
    const outputPhase2 = createOutputPhase({})
    term.feed(outputPhase2(null, buf3, "inline", 0, 8))

    // Verify new content is visible after resize
    expect(term).toContainText("Beta")
    expect(term).toContainText("Gamma")
    expect(term).toContainText("Epsilon")

    term.close()
  })
})

// ============================================================================
// Content height exceeding terminal rows
// ============================================================================

describe("content height exceeding terminal rows → termless", () => {
  test("viewport shows bottom lines when content exceeds terminal height", () => {
    const term = createTestTerminal(40, 4)

    // Feed 7 lines directly into a 4-row terminal via newline-delimited output.
    // The terminal should naturally scroll, pushing top lines into scrollback.
    const lines = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6", "Line 7"]
    for (const line of lines) {
      term.feed(line + "\r\n")
    }

    // The viewport (4 rows) should show the bottom lines
    const viewportText = term.getViewportText()
    expect(viewportText).toContain("Line 7")

    // Top lines should have been pushed into scrollback
    const scrollback = term.getScrollback()
    expect(scrollback.totalLines).toBeGreaterThan(4)

    // Early lines should be in scrollback above the viewport
    expect(term).toHaveTextInScrollback("Line 1")
    expect(term).toHaveTextInScrollback("Line 2")

    term.close()
  })
})

// ============================================================================
// Cursor visibility after promotion
// ============================================================================

describe("cursor position after promotion → termless", () => {
  test("cursor stays within viewport range after promoting lines", () => {
    const ROWS = 8
    const term = createTestTerminal(40, ROWS)
    const outputPhase = createOutputPhase({})

    // Frame 1: render 6 lines
    const buf1 = makeBuffer(40, 10, ["H1", "H2", "H3", "Live A", "Live B", "Live C"])
    term.feed(outputPhase(null, buf1, "inline", 0, ROWS))

    // Frame 2: promote 3 lines to scrollback, live = 3 lines
    const frozen = "H1\x1b[K\r\nH2\x1b[K\r\nH3\x1b[K\r\n"
    outputPhase.promoteScrollback!(frozen, 3)

    const buf2 = makeBuffer(40, 10, ["Live A", "Live B", "Live C"])
    term.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    // Cursor y-position should be within the viewport (0..ROWS-1)
    const cursor = term.getCursor()
    expect(cursor.y).toBeGreaterThanOrEqual(0)
    expect(cursor.y).toBeLessThan(ROWS)

    term.close()
  })
})

// ============================================================================
// Styled content preservation in scrollback
// ============================================================================

describe("styled content in scrollback → termless", () => {
  test("ANSI-styled text is preserved after scrolling into scrollback", () => {
    const term = createTestTerminal(40, 4)
    const outputPhase = createOutputPhase({})

    // Feed ANSI-styled content: bold "IMPORTANT" and colored "status ok"
    // ESC[1m = bold, ESC[32m = green, ESC[0m = reset
    const styledLines = [
      "\x1b[1mIMPORTANT\x1b[0m heading",
      "\x1b[32mstatus ok\x1b[0m",
      "plain line 3",
      "plain line 4",
      "plain line 5",
      "plain line 6",
      "plain line 7",
    ]

    // Feed raw styled content directly — this simulates an app writing
    // more lines than the terminal can hold, pushing styled lines into scrollback
    for (const line of styledLines) {
      term.feed(line + "\r\n")
    }

    // The styled text should still be present in scrollback (text content preserved)
    expect(term).toHaveTextInScrollback("IMPORTANT")
    expect(term).toHaveTextInScrollback("status ok")

    // The viewport should show the most recent lines
    const viewportText = term.getViewportText()
    expect(viewportText).toContain("plain line 7")

    term.close()
  })
})
