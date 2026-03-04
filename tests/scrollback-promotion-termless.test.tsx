/**
 * Tests for the handleScrollbackPromotion code path in the output phase.
 *
 * Unlike scrollback-list-termless.test.tsx (which tests renderStringSync via
 * mock stdout), these tests exercise the REAL inline output phase path:
 *   createOutputPhase → promoteScrollback → handleScrollbackPromotion
 *
 * This is the code path used by `run()` in inline mode — the exact path
 * where border cropping and "jump up" bugs appear in the real showcase.
 *
 * Strategy:
 *   1. Render bordered items via renderStringSync to get frozen ANSI strings
 *   2. Prepare them the way useScrollback does (add \n, replace with \x1b[K\r\n)
 *   3. Queue via promoteScrollback()
 *   4. Call the output phase in inline mode with a live buffer
 *   5. Feed the resulting ANSI to a termless terminal
 *   6. Verify borders, content, and layout in the terminal
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, renderString } from "../src/index.js"
import { TerminalBuffer } from "../src/buffer.js"
import { createOutputPhase } from "../src/pipeline/output-phase.js"
import { createTerminalFixture } from "@termless/test"

// ============================================================================
// Helpers
// ============================================================================

const COLS = 100
const ROWS = 24

/** Create a bordered agent card (matches the showcase's ExchangeItem structure). */
function AgentCard({ id, text }: { id: number; text: string }) {
  return (
    <Box borderStyle="round" borderColor="green" flexDirection="column" paddingX={1}>
      <Text bold>Agent {id}</Text>
      <Text> </Text>
      <Text>{text}</Text>
      <Text> </Text>
    </Box>
  )
}

/** Render a component to frozen ANSI string, matching useScrollback's preparation. */
async function renderFrozen(element: React.ReactElement, width: number): Promise<{ ansi: string; lineCount: number }> {
  const raw = await renderString(element, { width, plain: false })
  const text = raw + "\n"
  const ansi = text.replace(/\n/g, "\x1b[K\r\n")
  const lineCount = (text.match(/\n/g) || []).length
  return { ansi, lineCount }
}

/** Create a simple live buffer (footer bar). */
function makeLiveBuffer(width: number, height: number, lines: string[]): TerminalBuffer {
  const buf = new TerminalBuffer(width, height)
  for (let y = 0; y < lines.length && y < height; y++) {
    const line = lines[y]!
    for (let x = 0; x < line.length && x < width; x++) {
      buf.setCell(x, y, { char: line[x]! })
    }
  }
  return buf
}

function createTestTerminal(cols: number, rows: number) {
  return createTerminalFixture({
    cols,
    rows,
    scrollbackLimit: 1000,
  })
}

/** Count occurrences of a character in a string. */
function countChar(s: string, ch: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ch) n++
  }
  return n
}

// ============================================================================
// Scrollback promotion: border integrity
// ============================================================================

describe("scrollback promotion → border integrity", () => {
  test("single frozen item preserves all borders through promotion path", async () => {
    const term = createTestTerminal(COLS, ROWS)
    const outputPhase = createOutputPhase({})

    // Initial render: show a live footer
    const liveBuf = makeLiveBuffer(COLS, ROWS, ["Footer: status ok"])
    const ansi1 = outputPhase(null, liveBuf, "inline", 0, ROWS)
    term.feed(ansi1)
    expect(term.screen).toContainText("Footer: status ok")

    // Freeze one item: render it, queue via promoteScrollback, then render
    const { ansi: frozen, lineCount } = await renderFrozen(<AgentCard id={1} text="First response" />, COLS)
    outputPhase.promoteScrollback!(frozen, lineCount)

    const liveBuf2 = makeLiveBuffer(COLS, ROWS, ["Footer: 1 frozen"])
    const ansi2 = outputPhase(liveBuf, liveBuf2, "inline", 0, ROWS)
    term.feed(ansi2)

    // Check all four border corners
    const text = term.getText()
    expect(text).toContain("╭")
    expect(text).toContain("╮")
    expect(text).toContain("╰")
    expect(text).toContain("╯")

    // Content should be inside borders
    expect(term.buffer).toContainText("Agent 1")
    expect(term.buffer).toContainText("First response")

    // Content lines should have │ on both sides
    for (const line of text.split("\n")) {
      const trimmed = line.trimEnd()
      if (trimmed.includes("Agent 1") || trimmed.includes("First response")) {
        expect(trimmed).toMatch(/│.*│/)
      }
    }
  })

  test("3 frozen items all preserve right borders through promotion", async () => {
    const term = createTestTerminal(COLS, ROWS)
    const outputPhase = createOutputPhase({})

    // Initial render
    const liveBuf = makeLiveBuffer(COLS, ROWS, ["Footer"])
    const ansi1 = outputPhase(null, liveBuf, "inline", 0, ROWS)
    term.feed(ansi1)

    // Freeze 3 items at once (simulate compaction)
    let allFrozen = ""
    let totalLines = 0
    for (let i = 1; i <= 3; i++) {
      const { ansi, lineCount } = await renderFrozen(<AgentCard id={i} text={`Response ${i}`} />, COLS)
      allFrozen += ansi
      totalLines += lineCount
    }
    outputPhase.promoteScrollback!(allFrozen, totalLines)

    const liveBuf2 = makeLiveBuffer(COLS, ROWS, ["Footer: 3 frozen"])
    const ansi2 = outputPhase(liveBuf, liveBuf2, "inline", 0, ROWS)
    term.feed(ansi2)

    const text = term.getText()

    // All 3 items should have top-right and bottom-right corners
    expect(countChar(text, "╮")).toBe(3)
    expect(countChar(text, "╯")).toBe(3)

    // All agents should be present
    expect(term.buffer).toContainText("Agent 1")
    expect(term.buffer).toContainText("Agent 2")
    expect(term.buffer).toContainText("Agent 3")

    // Every content line should have │ on both sides
    for (const line of text.split("\n")) {
      const trimmed = line.trimEnd()
      if (/Agent \d/.test(trimmed) || /Response \d/.test(trimmed)) {
        expect(trimmed).toMatch(/│.*│/)
      }
    }
  })

  test("8 frozen items overflow beyond terminal rows, all borders intact in scrollback", async () => {
    const TERM_ROWS = 20
    const term = createTestTerminal(COLS, TERM_ROWS)
    const outputPhase = createOutputPhase({})

    // Initial render
    const liveBuf = makeLiveBuffer(COLS, TERM_ROWS, ["Footer"])
    const ansi1 = outputPhase(null, liveBuf, "inline", 0, TERM_ROWS)
    term.feed(ansi1)

    // Freeze 8 items at once — each is ~6 lines (border + content), total ~48 lines
    // This overflows a 20-row terminal into scrollback
    let allFrozen = ""
    let totalLines = 0
    for (let i = 1; i <= 8; i++) {
      const { ansi, lineCount } = await renderFrozen(
        <AgentCard id={i} text={`Response ${i} with some longer text`} />,
        COLS,
      )
      allFrozen += ansi
      totalLines += lineCount
    }
    outputPhase.promoteScrollback!(allFrozen, totalLines)

    const liveBuf2 = makeLiveBuffer(COLS, TERM_ROWS, ["Footer: 8 frozen"])
    const ansi2 = outputPhase(liveBuf, liveBuf2, "inline", 0, TERM_ROWS)
    term.feed(ansi2)

    // Get ALL text (viewport + scrollback)
    const fullText = term.getText()

    // All 8 items should have complete borders
    expect(countChar(fullText, "╮")).toBe(8)
    expect(countChar(fullText, "╯")).toBe(8)

    // All agents should be present somewhere in the buffer
    for (let i = 1; i <= 8; i++) {
      expect(fullText).toContain(`Agent ${i}`)
    }

    // Check scrollback specifically — early items should be in scrollback
    const scrollback = term.scrollback.getText()
    expect(scrollback).toContain("Agent 1")

    // Every content line (in both scrollback and viewport) should have │ on both sides
    for (const line of fullText.split("\n")) {
      const trimmed = line.trimEnd()
      if (/Agent \d/.test(trimmed) || /Response \d/.test(trimmed)) {
        expect(trimmed).toMatch(/│.*│/)
      }
    }
  })
})

// ============================================================================
// Scrollback promotion: progressive freezing
// ============================================================================

describe("scrollback promotion → progressive freezing", () => {
  test("freezing items one at a time preserves borders on each", async () => {
    const term = createTestTerminal(COLS, ROWS)
    const outputPhase = createOutputPhase({})

    // Initial render with live content
    let liveBuf = makeLiveBuffer(COLS, ROWS, ["Live content", "Footer"])
    let prevBuf: TerminalBuffer | null = null
    const ansi1 = outputPhase(null, liveBuf, "inline", 0, ROWS)
    term.feed(ansi1)
    prevBuf = liveBuf

    // Progressively freeze 5 items, one at a time
    for (let i = 1; i <= 5; i++) {
      const { ansi, lineCount } = await renderFrozen(<AgentCard id={i} text={`Response ${i}`} />, COLS)
      outputPhase.promoteScrollback!(ansi, lineCount)

      const nextBuf = makeLiveBuffer(COLS, ROWS, [`Footer: ${i} frozen`])
      const frame = outputPhase(prevBuf, nextBuf, "inline", 0, ROWS)
      term.feed(frame)
      prevBuf = nextBuf
    }

    const fullText = term.getText()

    // All 5 items should have complete borders
    expect(countChar(fullText, "╮")).toBe(5)
    expect(countChar(fullText, "╯")).toBe(5)

    // All agents present
    for (let i = 1; i <= 5; i++) {
      expect(fullText).toContain(`Agent ${i}`)
    }

    // Content lines have │ on both sides
    for (const line of fullText.split("\n")) {
      const trimmed = line.trimEnd()
      if (/Agent \d/.test(trimmed) || /Response \d/.test(trimmed)) {
        expect(trimmed).toMatch(/│.*│/)
      }
    }
  })
})

// ============================================================================
// Compaction: "jump up" bug
// ============================================================================

describe("scrollback promotion → compaction (jump up)", () => {
  test("compacting all items does not corrupt viewport", async () => {
    const TERM_ROWS = 24
    const term = createTestTerminal(COLS, TERM_ROWS)
    const outputPhase = createOutputPhase({})

    // Simulate a running showcase: first render live content that fills the viewport
    // (multiple agent cards taking ~20 rows)
    const tallContent: string[] = []
    tallContent.push("╭" + "─".repeat(COLS - 2) + "╮")
    tallContent.push("│ Agent 1" + " ".repeat(COLS - 11) + "│")
    tallContent.push("│ Response text" + " ".repeat(COLS - 16) + "│")
    tallContent.push("╰" + "─".repeat(COLS - 2) + "╯")
    tallContent.push("╭" + "─".repeat(COLS - 2) + "╮")
    tallContent.push("│ Agent 2" + " ".repeat(COLS - 11) + "│")
    tallContent.push("│ Response text" + " ".repeat(COLS - 16) + "│")
    tallContent.push("╰" + "─".repeat(COLS - 2) + "╯")
    tallContent.push("╭" + "─".repeat(COLS - 2) + "╮")
    tallContent.push("│ Agent 3" + " ".repeat(COLS - 11) + "│")
    tallContent.push("│ Response text" + " ".repeat(COLS - 16) + "│")
    tallContent.push("╰" + "─".repeat(COLS - 2) + "╯")
    for (let i = tallContent.length; i < TERM_ROWS - 1; i++) {
      tallContent.push("")
    }
    tallContent.push("Footer: status")

    const buf1 = makeLiveBuffer(COLS, TERM_ROWS, tallContent)
    const ansi1 = outputPhase(null, buf1, "inline", 0, TERM_ROWS)
    term.feed(ansi1)

    expect(term.buffer).toContainText("Agent 1")
    expect(term.buffer).toContainText("Footer: status")

    // Now compact: freeze all 3 agents at once via renderStringSync
    let frozenContent = ""
    let frozenLines = 0
    for (let i = 1; i <= 3; i++) {
      const { ansi, lineCount } = await renderFrozen(<AgentCard id={i} text="Response text" />, COLS)
      frozenContent += ansi
      frozenLines += lineCount
    }
    outputPhase.promoteScrollback!(frozenContent, frozenLines)

    // Live area now just shows a "compacting" message
    const buf2 = makeLiveBuffer(COLS, TERM_ROWS, ["Compacting context...", "Footer: compacted"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, TERM_ROWS)
    term.feed(ansi2)

    // After compaction, the viewport should show the compacting message
    const viewportText = term.screen.getText()
    expect(viewportText).toContain("Compacting")
    expect(viewportText).toContain("Footer: compacted")

    // Frozen items should be in scrollback (or partially visible)
    const fullText = term.getText()
    expect(fullText).toContain("Agent 1")
    expect(fullText).toContain("Agent 2")
    expect(fullText).toContain("Agent 3")

    // All borders intact
    expect(countChar(fullText, "╮")).toBeGreaterThanOrEqual(3)
    expect(countChar(fullText, "╯")).toBeGreaterThanOrEqual(3)

    // All borders should be intact in the full terminal output
    for (const line of fullText.split("\n")) {
      const trimmed = line.trimEnd()
      if (/Agent \d/.test(trimmed)) {
        expect(trimmed).toMatch(/│.*│/)
      }
    }
  })

  test("subsequent renders after compaction are positioned correctly (no jump-up)", async () => {
    const TERM_ROWS = 24
    const term = createTestTerminal(COLS, TERM_ROWS)
    const outputPhase = createOutputPhase({})

    // Frame 1: Initial live content
    const buf1 = makeLiveBuffer(COLS, TERM_ROWS, ["Live content line 1", "Live content line 2", "Footer: running"])
    const ansi1 = outputPhase(null, buf1, "inline", 0, TERM_ROWS)
    term.feed(ansi1)
    expect(term.buffer).toContainText("Footer: running")

    // Frame 2: Compact — freeze 3 items
    let frozenContent = ""
    let frozenLines = 0
    for (let i = 1; i <= 3; i++) {
      const { ansi, lineCount } = await renderFrozen(<AgentCard id={i} text={`Response ${i}`} />, COLS)
      frozenContent += ansi
      frozenLines += lineCount
    }
    outputPhase.promoteScrollback!(frozenContent, frozenLines)

    const buf2 = makeLiveBuffer(COLS, TERM_ROWS, ["Compacting...", "Footer: compacted"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, TERM_ROWS)
    term.feed(ansi2)

    // Frame 3: Post-compaction — regular live update (no promotion)
    // This tests that cursor tracking survived the compaction correctly
    const buf3 = makeLiveBuffer(COLS, TERM_ROWS, ["New live content", "Footer: resumed"])
    const ansi3 = outputPhase(buf2, buf3, "inline", 0, TERM_ROWS)
    term.feed(ansi3)

    // The viewport should show the latest live content, not garbled content
    const viewportText = term.screen.getText()
    expect(viewportText).toContain("New live content")
    expect(viewportText).toContain("Footer: resumed")

    // The frozen items should still be in the buffer (viewport or scrollback)
    const fullText = term.getText()
    expect(fullText).toContain("Agent 1")
    expect(fullText).toContain("Agent 2")
    expect(fullText).toContain("Agent 3")

    // Frame 4: Another live update — verify no accumulating drift
    const buf4 = makeLiveBuffer(COLS, TERM_ROWS, ["Updated content", "Footer: stable"])
    const ansi4 = outputPhase(buf3, buf4, "inline", 0, TERM_ROWS)
    term.feed(ansi4)

    const viewport2 = term.screen.getText()
    expect(viewport2).toContain("Updated content")
    expect(viewport2).toContain("Footer: stable")
    // Old live content should NOT remain in viewport (it was overwritten)
    expect(viewport2).not.toContain("New live content")
  })

  test("compaction with many items overflowing terminal preserves all borders", async () => {
    const TERM_ROWS = 20
    const term = createTestTerminal(COLS, TERM_ROWS)
    const outputPhase = createOutputPhase({})

    // Initial: a simple live buffer
    const buf1 = makeLiveBuffer(COLS, TERM_ROWS, ["Initial content"])
    const ansi1 = outputPhase(null, buf1, "inline", 0, TERM_ROWS)
    term.feed(ansi1)

    // Compact 10 items at once — each ~6 lines = ~60 lines total, way beyond 20 rows
    let frozenContent = ""
    let frozenLines = 0
    for (let i = 1; i <= 10; i++) {
      const { ansi, lineCount } = await renderFrozen(<AgentCard id={i} text={`Exchange ${i} response`} />, COLS)
      frozenContent += ansi
      frozenLines += lineCount
    }
    outputPhase.promoteScrollback!(frozenContent, frozenLines)

    const buf2 = makeLiveBuffer(COLS, TERM_ROWS, ["Footer: done"])
    const ansi2 = outputPhase(buf1, buf2, "inline", 0, TERM_ROWS)
    term.feed(ansi2)

    // Full buffer should contain all 10 agents with borders
    const fullText = term.getText()
    expect(countChar(fullText, "╮")).toBe(10)
    expect(countChar(fullText, "╯")).toBe(10)

    for (let i = 1; i <= 10; i++) {
      expect(fullText).toContain(`Agent ${i}`)
    }

    // Every content line should have │ on both sides
    for (const line of fullText.split("\n")) {
      const trimmed = line.trimEnd()
      if (/Agent \d/.test(trimmed) || /Exchange \d/.test(trimmed)) {
        expect(trimmed).toMatch(/│.*│/)
      }
    }

    // Footer should be visible in viewport
    expect(term.screen).toContainText("Footer: done")
  })
})
