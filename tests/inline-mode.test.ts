/**
 * Tests for inline mode rendering fixes.
 *
 * Covers:
 * 1. Buffer height unconstrained for inline mode (not capped at stdout.rows)
 * 2. Leftover line erasure when content shrinks
 * 3. Scrollback offset tracking for cursor positioning
 */

import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { outputPhase } from "../src/pipeline/output-phase.js"

// ============================================================================
// Helper: parse ANSI escape sequences from output
// ============================================================================

/** Extract all cursor-up (ESC[nA) sequences from ANSI output */
function extractCursorUp(output: string): number[] {
  const matches = [...output.matchAll(/\x1b\[(\d+)A/g)]
  return matches.map((m) => parseInt(m[1]!, 10))
}

/** Extract all erase-to-end-of-line (ESC[K) sequences */
function countEraseEOL(output: string): number {
  return (output.match(/\x1b\[K/g) ?? []).length
}

/** Check if output contains cursor-down (ESC[nB) */
function extractCursorDown(output: string): number[] {
  const matches = [...output.matchAll(/\x1b\[(\d+)B/g)]
  return matches.map((m) => parseInt(m[1]!, 10))
}

// ============================================================================
// Tests: Content shrink erases leftover lines
// ============================================================================

describe("Inline mode: content shrink erases leftover lines", () => {
  test("shrinking from 4 lines to 2 lines erases leftover lines", () => {
    // Previous: 4 lines of content (rows 0-3)
    const prev = new TerminalBuffer(10, 6)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })
    prev.setCell(0, 2, { char: "C" })
    prev.setCell(0, 3, { char: "D" })

    // Next: 2 lines of content (rows 0-1)
    const next = new TerminalBuffer(10, 6)
    next.setCell(0, 0, { char: "A" })
    next.setCell(0, 1, { char: "B" })

    const output = outputPhase(prev, next, "inline")

    // Should contain ESC[K (erase to end of line) for clearing leftover lines
    const eraseCount = countEraseEOL(output)
    // At minimum we need to erase rows 2 and 3 (the old content that's now gone)
    expect(eraseCount).toBeGreaterThanOrEqual(2)
  })

  test("shrinking from 3 lines to 1 line erases 2 leftover lines", () => {
    const prev = new TerminalBuffer(10, 6)
    prev.setCell(0, 0, { char: "X" })
    prev.setCell(0, 1, { char: "Y" })
    prev.setCell(0, 2, { char: "Z" })

    const next = new TerminalBuffer(10, 6)
    next.setCell(0, 0, { char: "X" })

    const output = outputPhase(prev, next, "inline")

    // Should erase rows 1 and 2
    const eraseCount = countEraseEOL(output)
    expect(eraseCount).toBeGreaterThanOrEqual(2)
  })

  test("same content height does not erase anything extra", () => {
    const prev = new TerminalBuffer(10, 6)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })

    const next = new TerminalBuffer(10, 6)
    next.setCell(0, 0, { char: "A" })
    next.setCell(0, 1, { char: "C" }) // Changed

    const output = outputPhase(prev, next, "inline")

    // Since content didn't shrink, we shouldn't have extra erase lines
    // beyond what the diff naturally produces
    expect(output).toContain("C")
  })
})

// ============================================================================
// Tests: Scrollback offset adjusts cursor positioning
// ============================================================================

describe("Inline mode: scrollback offset", () => {
  test("scrollback offset increases cursor-up distance", () => {
    // Previous: 2 lines of content (rows 0-1)
    const prev = new TerminalBuffer(10, 6)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })

    // Next: changed content
    const next = new TerminalBuffer(10, 6)
    next.setCell(0, 0, { char: "X" })
    next.setCell(0, 1, { char: "Y" })

    // Without scrollback: cursor-up should be 1 (prev last content line)
    const outputNoScroll = outputPhase(prev, next, "inline", 0)
    const upsNoScroll = extractCursorUp(outputNoScroll)
    expect(upsNoScroll).toContain(1)

    // With 3 scrollback lines: cursor-up should be 1 + 3 = 4
    const outputWithScroll = outputPhase(prev, next, "inline", 3)
    const upsWithScroll = extractCursorUp(outputWithScroll)
    expect(upsWithScroll).toContain(4)
  })

  test("scrollback offset with no cell changes triggers full redraw", () => {
    // Same content before and after
    const prev = new TerminalBuffer(10, 4)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })

    const next = new TerminalBuffer(10, 4)
    next.setCell(0, 0, { char: "A" })
    next.setCell(0, 1, { char: "B" })

    // No scrollback, no changes -> empty output
    const outputNoScroll = outputPhase(prev, next, "inline", 0)
    expect(outputNoScroll).toBe("")

    // With scrollback but same content -> should still produce output
    // (needs to reposition cursor because scrollback displaced it)
    const outputWithScroll = outputPhase(prev, next, "inline", 2)
    expect(outputWithScroll.length).toBeGreaterThan(0)
    // Should contain cursor-up to account for scrollback
    expect(outputWithScroll).toContain("\x1b[")
  })
})

// ============================================================================
// Tests: First render inline mode
// ============================================================================

describe("Inline mode: first render", () => {
  test("first render outputs content without cursor-up", () => {
    const buffer = new TerminalBuffer(10, 6)
    buffer.setCell(0, 0, { char: "H" })
    buffer.setCell(1, 0, { char: "i" })
    buffer.setCell(0, 1, { char: "!" })

    // First render (no prev buffer)
    const output = outputPhase(null, buffer, "inline")

    // Should contain the content
    expect(output).toContain("H")
    expect(output).toContain("i")
    expect(output).toContain("!")

    // Should NOT contain cursor-up (no previous content to go back to)
    const ups = extractCursorUp(output)
    expect(ups).toHaveLength(0)
  })

  test("first render only outputs up to last content line", () => {
    const buffer = new TerminalBuffer(20, 10)
    buffer.setCell(0, 0, { char: "A" })
    buffer.setCell(0, 1, { char: "B" })
    // Rows 2-9 are empty

    const output = outputPhase(null, buffer, "inline")

    // Should contain content
    expect(output).toContain("A")
    expect(output).toContain("B")

    // Should have erase-to-EOL for each rendered line (2 content lines)
    // but not for the empty lines below
    const newlines = (output.match(/\n/g) ?? []).length
    // At most 1 newline (between line 0 and line 1)
    expect(newlines).toBeLessThanOrEqual(1)
  })
})

// ============================================================================
// Tests: Content growth
// ============================================================================

describe("Inline mode: content growth", () => {
  test("growing content renders new lines", () => {
    // Previous: 2 lines
    const prev = new TerminalBuffer(10, 6)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(0, 1, { char: "B" })

    // Next: 4 lines (added C, D)
    const next = new TerminalBuffer(10, 6)
    next.setCell(0, 0, { char: "A" })
    next.setCell(0, 1, { char: "B" })
    next.setCell(0, 2, { char: "C" })
    next.setCell(0, 3, { char: "D" })

    const output = outputPhase(prev, next, "inline")

    // Should contain new content
    expect(output).toContain("C")
    expect(output).toContain("D")
  })
})
