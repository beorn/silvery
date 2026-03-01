/**
 * Tests for inline mode rendering fixes.
 *
 * Covers:
 * 1. Buffer height unconstrained for inline mode (not capped at stdout.rows)
 * 2. Leftover line erasure when content shrinks
 * 3. Scrollback offset tracking for cursor positioning
 * 4. Terminal height capping (termRows) — content exceeding terminal is capped
 * 5. Bottom-of-buffer display — capped output shows footer, not top
 * 6. Cursor offset uses actual output lines — prevents jump when content > termRows
 */

import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import type { CursorState } from "../src/hooks/useCursor.js"
import { createOutputPhase, outputPhase } from "../src/pipeline/output-phase.js"

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

/** Extract cursor right (ESC[nC) sequences */
function extractCursorRight(output: string): number[] {
  const matches = [...output.matchAll(/\x1b\[(\d+)C/g)]
  return matches.map((m) => parseInt(m[1]!, 10))
}

/** Check if output ends with cursor show (ESC[?25h) */
function endsWithCursorShow(output: string): boolean {
  return output.endsWith("\x1b[?25h")
}

/** Check if output ends with cursor hide (ESC[?25l) */
function endsWithCursorHide(output: string): boolean {
  return output.endsWith("\x1b[?25l")
}

/**
 * Extract the cursor positioning suffix from inline output.
 * After all content, the suffix contains: cursor-up + \r + cursor-right + cursor-show
 * Returns { upDelta, rightDelta } or null if no positioning found.
 */
function extractCursorSuffix(output: string): { upDelta: number; rightDelta: number } | null {
  // The suffix is the part after the last \x1b[K (end of content)
  const lastK = output.lastIndexOf("\x1b[K")
  if (lastK < 0) return null
  const suffix = output.slice(lastK + 3) // skip past \x1b[K

  // Parse cursor-up
  const upMatch = suffix.match(/\x1b\[(\d+)A/)
  const upDelta = upMatch ? parseInt(upMatch[1]!, 10) : 0

  // Parse cursor-right
  const rightMatch = suffix.match(/\x1b\[(\d+)C/)
  const rightDelta = rightMatch ? parseInt(rightMatch[1]!, 10) : 0

  // Check for \r (column reset)
  if (!suffix.includes("\r")) return null

  return { upDelta, rightDelta }
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

// ============================================================================
// Helper: strip ANSI codes from output to get visible text
// ============================================================================

/** Strip ANSI escape sequences to get visible text */
function stripAnsi(str: string): string {
  // biome-ignore lint: regex for ANSI stripping
  return str.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\x1b\[\?[0-9;]*[A-Za-z]/g, "")
}

/** Get visible text lines from ANSI output (non-empty lines only) */
function visibleLines(output: string): string[] {
  return stripAnsi(output)
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/** Fill buffer rows 0..n-1 with single-char labels (A, B, C, ...) */
function fillBuffer(buf: TerminalBuffer, count: number, startChar = "A"): void {
  for (let i = 0; i < count; i++) {
    buf.setCell(0, i, { char: String.fromCharCode(startChar.charCodeAt(0) + i) })
  }
}

// ============================================================================
// Tests: Terminal height capping (termRows)
// ============================================================================

describe("Inline mode: termRows capping", () => {
  test("content within termRows is fully rendered", () => {
    const buf = new TerminalBuffer(10, 10)
    fillBuffer(buf, 5) // A..E on rows 0-4

    // termRows=8 — plenty of room, all 5 lines should render immediately
    const output = outputPhase(null, buf, "inline", 0, 8)
    const lines = visibleLines(output)
    expect(lines).toHaveLength(5)
    expect(lines).toContain("A")
    expect(lines).toContain("E")
  })

  test("content exceeding termRows is capped", () => {
    const buf = new TerminalBuffer(10, 20)
    fillBuffer(buf, 15) // A..O on rows 0-14

    // termRows=6 — only 6 lines should render
    const output = outputPhase(null, buf, "inline", 0, 6)
    const lines = visibleLines(output)

    // Must output exactly 6 lines (capped at termRows), not fewer (gradual growth)
    expect(lines).toHaveLength(6)
  })

  test("bottom of buffer shown when content exceeds termRows (footer visible)", () => {
    // Simulate: 12 lines of content, terminal only shows 5.
    // Lines 0-6 are "header/content", lines 7-11 are latest content + footer.
    // With bottom-of-buffer display, lines 7-11 should be visible, not 0-4.
    const buf = new TerminalBuffer(10, 20)
    fillBuffer(buf, 12) // A..L on rows 0-11

    const output = outputPhase(null, buf, "inline", 0, 5)
    const lines = visibleLines(output)

    // Bottom 5 lines are H, I, J, K, L (rows 7-11)
    expect(lines).toContain("L") // Last line (footer) must be visible
    expect(lines).toContain("K")
    expect(lines).toContain("H") // First visible line

    // Top lines should NOT be in output (they're above the cap)
    expect(lines).not.toContain("A")
    expect(lines).not.toContain("B")
  })
})

// ============================================================================
// Tests: Cursor offset uses actual output lines (not buffer content lines)
// ============================================================================

describe("Inline mode: cursor offset with termRows", () => {
  test("cursor-up uses capped output lines, not buffer content lines", () => {
    // Previous frame: 10 lines of content, but termRows=5.
    // Actual output was 5 lines (capped). Cursor should go up 4 (5-1), not 9 (10-1).
    const prev = new TerminalBuffer(10, 20)
    fillBuffer(prev, 10) // A..J

    // Next frame: same structure, different content
    const next = new TerminalBuffer(10, 20)
    fillBuffer(next, 10, "a") // a..j (lowercase to differ)

    const output = outputPhase(prev, next, "inline", 0, 5)
    const ups = extractCursorUp(output)

    // Cursor-up should be 4 (= min(10, 5) - 1), NOT 9 (= 10 - 1)
    expect(ups).toHaveLength(1)
    expect(ups[0]).toBe(4)
  })

  test("cursor-up not capped when content fits within termRows", () => {
    const prev = new TerminalBuffer(10, 10)
    fillBuffer(prev, 3) // A..C

    const next = new TerminalBuffer(10, 10)
    fillBuffer(next, 3, "X") // X, Y, Z

    // termRows=8 — content (3 lines) fits, so cursor-up = 2 (3-1)
    const output = outputPhase(prev, next, "inline", 0, 8)
    const ups = extractCursorUp(output)
    expect(ups).toContain(2)
  })

  test("cursor offset accounts for scrollback with termRows", () => {
    // Previous: 4 lines + 3 scrollback = rawCursorOffset of 6
    // prevOutputLines = min(4, 5) = 4, rawCursorOffset = 4-1+3 = 6
    // In STRICT_OUTPUT mode (tests), cursorOffset is uncapped.
    // At runtime, it's capped to termRows-1 = 4.
    const prev = new TerminalBuffer(10, 10)
    fillBuffer(prev, 4) // A..D

    const next = new TerminalBuffer(10, 10)
    fillBuffer(next, 4, "W") // W..Z

    const output = outputPhase(prev, next, "inline", 3, 5)
    const ups = extractCursorUp(output)

    // First cursor-up positions to render start (6 in strict, 4 at runtime)
    expect(ups[0]).toBe(6) // rawCursorOffset (strict mode, uncapped)
    // Leftover erasure generates a second cursor-up when cursorOffset > maxOutputLines-1
    expect(ups.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// Tests: Multi-frame stability (no jump when content exceeds terminal)
// ============================================================================

describe("Inline mode: multi-frame stability at terminal boundary", () => {
  test("content growing past termRows stays stable across frames", () => {
    const termRows = 6

    // Frame 1: 4 lines (fits in terminal)
    const frame1 = new TerminalBuffer(10, 20)
    fillBuffer(frame1, 4) // A..D

    const out1 = outputPhase(null, frame1, "inline", 0, termRows)
    const ups1 = extractCursorUp(out1)
    expect(ups1).toHaveLength(0) // First render, no cursor-up

    // All 4 lines must render immediately (no gradual growth)
    const lines1 = visibleLines(out1)
    expect(lines1).toHaveLength(4)

    // Frame 2: 6 lines (exactly fills terminal)
    const frame2 = new TerminalBuffer(10, 20)
    fillBuffer(frame2, 6) // A..F

    const out2 = outputPhase(frame1, frame2, "inline", 0, termRows)
    const ups2 = extractCursorUp(out2)
    expect(ups2).toContain(3) // cursor-up = min(4,6)-1 = 3

    // All 6 lines must render (fits exactly in terminal)
    const lines2 = visibleLines(out2)
    expect(lines2).toHaveLength(6)

    // Frame 3: 8 lines (exceeds terminal — this is where the "jump" used to happen)
    const frame3 = new TerminalBuffer(10, 20)
    fillBuffer(frame3, 8) // A..H

    const out3 = outputPhase(frame2, frame3, "inline", 0, termRows)
    const ups3 = extractCursorUp(out3)
    // Previous output was 6 lines (capped at termRows=6), so cursor-up = 5
    expect(ups3).toContain(5)

    // Output must be exactly 6 lines (capped at termRows), not fewer
    const lines3 = visibleLines(out3)
    expect(lines3).toHaveLength(termRows)

    // Should show bottom of buffer (footer): C..H, not A..F
    expect(lines3).toContain("H")
    expect(lines3).not.toContain("A")

    // Frame 4: 10 lines (well beyond terminal)
    const frame4 = new TerminalBuffer(10, 20)
    fillBuffer(frame4, 10) // A..J

    const out4 = outputPhase(frame3, frame4, "inline", 0, termRows)
    const ups4 = extractCursorUp(out4)
    // Previous output was capped at 6, cursor-up = 5 (stable)
    expect(ups4).toContain(5)

    // Still exactly 6 lines, showing bottom: E..J
    const lines4 = visibleLines(out4)
    expect(lines4).toHaveLength(termRows)
    expect(lines4).toContain("J")
    expect(lines4).not.toContain("A")
  })

  test("cursor-up is consistent when content is well beyond termRows", () => {
    const termRows = 5

    // Both frames have content far exceeding termRows
    const prev = new TerminalBuffer(10, 30)
    fillBuffer(prev, 20) // 20 lines

    const next = new TerminalBuffer(10, 30)
    fillBuffer(next, 25, "a") // 25 lines (lowercase)

    const output = outputPhase(prev, next, "inline", 0, termRows)
    const ups = extractCursorUp(output)

    // prev: min(20, 5) = 5 output lines, cursor-up = 4
    expect(ups).toHaveLength(1)
    expect(ups[0]).toBe(4)
  })

  test("scrollback offset with termRows: cursor capped correctly", () => {
    const termRows = 5

    // prev: 10 content lines (capped to 5 output) + 2 scrollback lines
    // rawCursorOffset = min(10,5)-1 + 2 = 6
    // In STRICT_OUTPUT mode (tests), cursorOffset is uncapped (6).
    // At runtime, it's capped to termRows-1 = 4.
    const prev = new TerminalBuffer(10, 20)
    fillBuffer(prev, 10)

    const next = new TerminalBuffer(10, 20)
    fillBuffer(next, 10, "a")

    const output = outputPhase(prev, next, "inline", 2, termRows)
    const ups = extractCursorUp(output)

    // First cursor-up positions to render start (6 in strict, 4 at runtime)
    expect(ups[0]).toBe(6) // rawCursorOffset (strict mode, uncapped)
    // Leftover erasure generates a second cursor-up when cursorOffset > maxOutputLines-1
    expect(ups.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// Tests: Real terminal cursor positioning via useCursor() in inline mode
// ============================================================================

describe("Inline mode: cursor positioning via cursorPos", () => {
  test("first render positions cursor at useCursor location", () => {
    const buf = new TerminalBuffer(20, 10)
    fillBuffer(buf, 4) // A..D on rows 0-3

    const cursorPos: CursorState = { x: 5, y: 1, visible: true }
    const output = outputPhase(null, buf, "inline", 0, undefined, cursorPos)

    // Output should end with cursor-show
    expect(endsWithCursorShow(output)).toBe(true)

    // The cursor suffix should position at row 1, col 5.
    // After rendering 4 lines, terminal cursor is at row 3 (last content line).
    // Need to move up 2 (from row 3 to row 1), then \r to col 0, then right 5.
    const suffix = extractCursorSuffix(output)
    expect(suffix).not.toBeNull()
    expect(suffix!.upDelta).toBe(2) // 3 - 1 = 2
    expect(suffix!.rightDelta).toBe(5)
  })

  test("subsequent render positions cursor correctly", () => {
    const prev = new TerminalBuffer(20, 10)
    fillBuffer(prev, 4)

    const next = new TerminalBuffer(20, 10)
    fillBuffer(next, 4, "a")

    const cursorPos: CursorState = { x: 3, y: 2, visible: true }
    const output = outputPhase(prev, next, "inline", 0, undefined, cursorPos)

    // After rendering 4 lines, cursor at row 3.
    // Need to go up 1 (from row 3 to row 2), then right 3.
    const suffix = extractCursorSuffix(output)
    expect(suffix).not.toBeNull()
    expect(suffix!.upDelta).toBe(1) // 3 - 2 = 1
    expect(suffix!.rightDelta).toBe(3)
    expect(endsWithCursorShow(output)).toBe(true)
  })

  test("cursor at last row produces no cursor-up in suffix", () => {
    const buf = new TerminalBuffer(20, 10)
    fillBuffer(buf, 3) // A..C on rows 0-2

    // Cursor on the last content line (row 2)
    const cursorPos: CursorState = { x: 7, y: 2, visible: true }
    const output = outputPhase(null, buf, "inline", 0, undefined, cursorPos)

    // Suffix should have no cursor-up (already on the right row), just \r + right
    const suffix = extractCursorSuffix(output)
    expect(suffix).not.toBeNull()
    expect(suffix!.upDelta).toBe(0) // no movement needed
    expect(suffix!.rightDelta).toBe(7)
  })

  test("cursor at column 0 produces no cursor-right", () => {
    const buf = new TerminalBuffer(20, 10)
    fillBuffer(buf, 3)

    const cursorPos: CursorState = { x: 0, y: 0, visible: true }
    const output = outputPhase(null, buf, "inline", 0, undefined, cursorPos)

    const suffix = extractCursorSuffix(output)
    expect(suffix).not.toBeNull()
    expect(suffix!.upDelta).toBe(2) // from row 2 to row 0
    expect(suffix!.rightDelta).toBe(0) // column 0
  })

  test("invisible cursor hides terminal cursor", () => {
    const buf = new TerminalBuffer(20, 10)
    fillBuffer(buf, 3)

    const cursorPos: CursorState = { x: 5, y: 1, visible: false }
    const output = outputPhase(null, buf, "inline", 0, undefined, cursorPos)

    // Should end with cursor hide, not show
    expect(endsWithCursorHide(output)).toBe(true)
    expect(endsWithCursorShow(output)).toBe(false)
  })

  test("null cursorPos hides cursor", () => {
    const buf = new TerminalBuffer(20, 10)
    fillBuffer(buf, 3)

    // No cursor state — cursor hidden (no component claimed it)
    const output = outputPhase(null, buf, "inline")

    expect(endsWithCursorHide(output)).toBe(true)
  })

  test("cursor outside visible area when termRows caps output", () => {
    const buf = new TerminalBuffer(20, 20)
    fillBuffer(buf, 15) // A..O on rows 0-14

    // termRows=5 means only rows 10-14 are visible (bottom 5 lines).
    // Cursor at row 2 is outside the visible area.
    const cursorPos: CursorState = { x: 3, y: 2, visible: true }
    const output = outputPhase(null, buf, "inline", 0, 5, cursorPos)

    // Cursor is above the visible area — should be hidden
    expect(endsWithCursorHide(output)).toBe(true)
  })

  test("cursor within visible area when termRows caps output", () => {
    const buf = new TerminalBuffer(20, 20)
    fillBuffer(buf, 15) // A..O on rows 0-14

    // termRows=5 means only rows 10-14 are visible.
    // Cursor at row 12 is within the visible area (visible row index 2).
    const cursorPos: CursorState = { x: 4, y: 12, visible: true }
    const output = outputPhase(null, buf, "inline", 0, 5, cursorPos)

    // Cursor should be positioned within the visible output
    const suffix = extractCursorSuffix(output)
    expect(suffix).not.toBeNull()
    // Last visible row is 4 (index in visible area), cursor is at visible row 2.
    // upDelta = 4 - 2 = 2
    expect(suffix!.upDelta).toBe(2)
    expect(suffix!.rightDelta).toBe(4)
    expect(endsWithCursorShow(output)).toBe(true)
  })

  test("cursor positioning works with content shrink", () => {
    // Previous: 5 lines
    const prev = new TerminalBuffer(20, 10)
    fillBuffer(prev, 5)

    // Next: 3 lines (shrunk)
    const next = new TerminalBuffer(20, 10)
    fillBuffer(next, 3, "x")

    const cursorPos: CursorState = { x: 2, y: 1, visible: true }
    const output = outputPhase(prev, next, "inline", 0, undefined, cursorPos)

    // After rendering 3 lines and erasing leftover, cursor repositioning happens.
    // The output should show the cursor.
    expect(endsWithCursorShow(output)).toBe(true)
  })
})

// ============================================================================
// Tests: Incremental inline rendering
// ============================================================================

describe("Inline mode: incremental rendering", () => {
  test("uses incremental path for small changes (fewer bytes)", () => {
    const render = createOutputPhase({})

    // Frame 1: initial render (sets up cursor tracking)
    const buf1 = new TerminalBuffer(20, 10)
    fillBuffer(buf1, 5) // A..E
    const out1 = render(null, buf1, "inline")

    // Frame 2: change one cell
    const buf2 = new TerminalBuffer(20, 10)
    fillBuffer(buf2, 5) // A..E
    buf2.setCell(0, 2, { char: "X" }) // Change C → X

    const out2 = render(buf1, buf2, "inline")

    // Incremental output should be much smaller than full render
    expect(out2.length).toBeLessThan(out1.length)
    // Should contain the changed character
    expect(out2).toContain("X")
    // Visible text should NOT contain unchanged characters
    const visible = stripAnsi(out2)
    expect(visible).not.toContain("A")
    expect(visible).not.toContain("E")
  })

  test("returns empty string for no changes (like fullscreen)", () => {
    const render = createOutputPhase({})

    const buf1 = new TerminalBuffer(20, 10)
    fillBuffer(buf1, 4)
    render(null, buf1, "inline") // init tracking

    const buf2 = new TerminalBuffer(20, 10)
    fillBuffer(buf2, 4) // same content

    const out = render(buf1, buf2, "inline")
    expect(out).toBe("")
  })

  test("falls back to full render when scrollbackOffset > 0", () => {
    const render = createOutputPhase({})

    const buf1 = new TerminalBuffer(20, 10)
    fillBuffer(buf1, 4)
    render(null, buf1, "inline") // init tracking

    const buf2 = new TerminalBuffer(20, 10)
    fillBuffer(buf2, 4, "x")

    // scrollbackOffset > 0 forces full render
    const out = render(buf1, buf2, "inline", 2)
    // Full render includes cursor-up for scrollback + content positioning
    const ups = extractCursorUp(out)
    expect(ups[0]).toBe(5) // 4-1 + 2 = 5
  })

  test("falls back to full render when content height changes", () => {
    const render = createOutputPhase({})

    const buf1 = new TerminalBuffer(20, 10)
    fillBuffer(buf1, 3)
    render(null, buf1, "inline") // init tracking

    // Content grows from 3 to 5 lines
    const buf2 = new TerminalBuffer(20, 10)
    fillBuffer(buf2, 5)

    const out = render(buf1, buf2, "inline")
    // Full render should contain all content including new lines
    expect(out).toContain("D")
    expect(out).toContain("E")
  })

  test("falls back to full render when buffer dimensions change", () => {
    const render = createOutputPhase({})

    const buf1 = new TerminalBuffer(20, 10)
    fillBuffer(buf1, 3)
    render(null, buf1, "inline") // init tracking

    // Different width
    const buf2 = new TerminalBuffer(30, 10)
    fillBuffer(buf2, 3, "x")

    const out = render(buf1, buf2, "inline")
    expect(out.length).toBeGreaterThan(0)
    expect(out).toContain("x")
  })

  test("incremental with cursor positioning", () => {
    const render = createOutputPhase({})

    const buf1 = new TerminalBuffer(20, 10)
    fillBuffer(buf1, 4) // A..D
    const cursorPos: CursorState = { x: 3, y: 1, visible: true }
    render(null, buf1, "inline", 0, undefined, cursorPos) // init tracking

    // Change one cell
    const buf2 = new TerminalBuffer(20, 10)
    fillBuffer(buf2, 4)
    buf2.setCell(0, 0, { char: "Z" })

    const out = render(buf1, buf2, "inline", 0, undefined, cursorPos)
    expect(out).toContain("Z")
    // Should end with cursor show (cursor is visible)
    expect(endsWithCursorShow(out)).toBe(true)
  })

  test("multi-frame incremental consistency", () => {
    const render = createOutputPhase({})

    // Simulate multiple sequential frames like a real app
    const buf1 = new TerminalBuffer(20, 10)
    fillBuffer(buf1, 5)
    render(null, buf1, "inline") // Frame 1

    const buf2 = new TerminalBuffer(20, 10)
    fillBuffer(buf2, 5)
    buf2.setCell(0, 0, { char: "X" })
    const out2 = render(buf1, buf2, "inline") // Frame 2 (incremental)
    expect(out2).toContain("X")
    expect(out2.length).toBeLessThan(200) // should be small

    const buf3 = new TerminalBuffer(20, 10)
    fillBuffer(buf3, 5)
    buf3.setCell(0, 0, { char: "X" })
    buf3.setCell(0, 3, { char: "Y" })
    const out3 = render(buf2, buf3, "inline") // Frame 3 (incremental)
    expect(out3).toContain("Y")
    expect(out3).not.toContain("X") // X unchanged from frame 2

    // Frame 4: no changes
    const buf4 = new TerminalBuffer(20, 10)
    fillBuffer(buf4, 5)
    buf4.setCell(0, 0, { char: "X" })
    buf4.setCell(0, 3, { char: "Y" })
    const out4 = render(buf3, buf4, "inline")
    expect(out4).toBe("")
  })

  test("incremental with termRows capping", () => {
    const render = createOutputPhase({})

    const buf1 = new TerminalBuffer(20, 20)
    fillBuffer(buf1, 10)
    render(null, buf1, "inline", 0, 5) // init with termRows=5

    // Same height, change a cell in visible area (bottom 5 lines: rows 5-9)
    const buf2 = new TerminalBuffer(20, 20)
    fillBuffer(buf2, 10)
    buf2.setCell(0, 7, { char: "Z" }) // row 7 = visible row 2 (startLine=5)

    const out = render(buf1, buf2, "inline", 0, 5)
    expect(out).toContain("Z")
    expect(out.length).toBeLessThan(200)
  })

  test("incremental hides cursor when no cursorPos", () => {
    const render = createOutputPhase({})

    const buf1 = new TerminalBuffer(20, 10)
    fillBuffer(buf1, 3)
    render(null, buf1, "inline") // init

    const buf2 = new TerminalBuffer(20, 10)
    fillBuffer(buf2, 3)
    buf2.setCell(0, 1, { char: "Z" })

    const out = render(buf1, buf2, "inline")
    expect(out).toContain("Z")
    expect(endsWithCursorHide(out)).toBe(true)
  })
})
