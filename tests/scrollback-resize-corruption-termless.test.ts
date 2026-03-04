/**
 * Resize scrollback invariants — verifies that after a terminal resize,
 * the output phase renders live content cleanly below re-emitted frozen items.
 *
 * The useScrollback resize handler:
 * 1. Calls resetInlineState() — resets cursor tracking, sets forceFirstRender=true
 * 2. Clears scrollback+screen (ED3+CUP+ED2)
 * 3. Re-emits all frozen items at the new width
 * 4. Should NOT call notifyScrollback() — the re-emitted frozen items are the
 *    new baseline, not a displacement offset. resetInlineState()'s forceFirstRender
 *    already makes the output phase treat the next render as first frame.
 *
 * These tests verify the correct post-resize behavior: scrollbackOffset=0,
 * forceFirstRender=true (via resetInlineState), prev=null.
 */

import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { createOutputPhase } from "../src/pipeline/output-phase.js"
import { createTerminalFixture } from "@termless/test"

// ============================================================================
// Helpers
// ============================================================================

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

function createTestTerminal(cols: number, rows: number) {
  return createTerminalFixture({
    cols,
    rows,
    scrollbackLimit: 1000,
  })
}

// ============================================================================
// Resize after scrollback: correct behavior with scrollbackOffset=0
// ============================================================================

describe("resize after scrollback promotion → termless", () => {
  test("post-resize render with forceFirstRender: live content below frozen items", () => {
    const COLS = 40
    const ROWS = 10
    const term = createTestTerminal(COLS, ROWS)
    const outputPhase = createOutputPhase({})

    // Frame 1: render 5 lines of live content
    const buf1 = makeBuffer(COLS, ROWS, ["Item 1", "Item 2", "Item 3", "Item 4", "Footer"])
    term.feed(outputPhase(null, buf1, "inline", 0, ROWS))

    // Frame 2: promote Item 1 + Item 2 to scrollback
    outputPhase.promoteScrollback!("Item 1\x1b[K\r\nItem 2\x1b[K\r\n", 2)
    const buf2 = makeBuffer(COLS, ROWS, ["Item 3", "Item 4", "Footer"])
    term.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    expect(term.screen).toContainText("Item 3")
    expect(term.screen).toContainText("Footer")

    // === SIMULATE RESIZE ===
    // Step 1: resetInlineState (forceFirstRender=true, cursor tracking reset)
    outputPhase.resetInlineState!()

    // Step 2+3: Clear terminal and re-emit frozen items
    term.feed("\x1b[3J\x1b[H\x1b[2J" + "Item 1\r\nItem 2\r\n")

    // Step 4: Post-resize render — scrollbackOffset MUST be 0
    // (notifyScrollback should NOT be called from resize handler)
    const buf3 = makeBuffer(COLS, ROWS, ["Item 3", "Item 4", "Footer"])
    const ansi3 = outputPhase(null, buf3, "inline", 0, ROWS)
    term.feed(ansi3)

    // Frozen items preserved in terminal
    expect(term.buffer.getText()).toContain("Item 1")
    expect(term.buffer.getText()).toContain("Item 2")

    // Live content rendered below frozen items
    expect(term.screen).toContainText("Item 3")
    expect(term.screen).toContainText("Item 4")
    expect(term.screen).toContainText("Footer")
  })

  test("resize with many frozen items: all content intact", () => {
    const COLS = 60
    const ROWS = 8
    const term = createTestTerminal(COLS, ROWS)
    const outputPhase = createOutputPhase({})

    // Frame 1: 7 lines (nearly fills the 8-row terminal)
    const lines = Array.from({ length: 6 }, (_, i) => `Exchange ${i + 1}`)
    const buf1 = makeBuffer(COLS, ROWS, [...lines, "Status bar"])
    term.feed(outputPhase(null, buf1, "inline", 0, ROWS))

    // Promote first 5 items to scrollback
    const frozenContent = Array.from({ length: 5 }, (_, i) =>
      `Exchange ${i + 1}\x1b[K\r\n`
    ).join("")
    outputPhase.promoteScrollback!(frozenContent, 5)

    const buf2 = makeBuffer(COLS, ROWS, ["Exchange 6", "Status bar"])
    term.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    // Resize
    outputPhase.resetInlineState!()
    const reEmit = "\x1b[3J\x1b[H\x1b[2J" +
      Array.from({ length: 5 }, (_, i) => `Exchange ${i + 1}\r\n`).join("")
    term.feed(reEmit)

    // Post-resize: scrollbackOffset=0 (correct)
    const buf3 = makeBuffer(COLS, ROWS, ["Exchange 6", "Status bar"])
    term.feed(outputPhase(null, buf3, "inline", 0, ROWS))

    // All exchanges present
    const fullText = term.buffer.getText()
    for (let i = 1; i <= 6; i++) {
      expect(fullText).toContain(`Exchange ${i}`)
    }
    expect(term.screen).toContainText("Status bar")
  })

  test("multiple resizes maintain clean scrollback", () => {
    const COLS = 50
    const ROWS = 8
    const term = createTestTerminal(COLS, ROWS)
    const outputPhase = createOutputPhase({})

    // Initial: 4 lines
    const buf1 = makeBuffer(COLS, ROWS, ["A", "B", "C", "Status"])
    term.feed(outputPhase(null, buf1, "inline", 0, ROWS))

    // Promote A + B
    outputPhase.promoteScrollback!("A\x1b[K\r\nB\x1b[K\r\n", 2)
    const buf2 = makeBuffer(COLS, ROWS, ["C", "Status"])
    term.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    // First resize
    outputPhase.resetInlineState!()
    term.feed("\x1b[3J\x1b[H\x1b[2J" + "A\r\nB\r\n")
    const buf3 = makeBuffer(COLS, ROWS, ["C", "Status"])
    term.feed(outputPhase(null, buf3, "inline", 0, ROWS))

    expect(term.screen).toContainText("C")
    expect(term.screen).toContainText("Status")

    // Second resize (terminal widens)
    outputPhase.resetInlineState!()
    term.resize(70, ROWS)
    term.feed("\x1b[3J\x1b[H\x1b[2J" + "A\r\nB\r\n")
    const buf4 = makeBuffer(70, ROWS, ["C", "Status"])
    term.feed(outputPhase(null, buf4, "inline", 0, ROWS))

    expect(term.screen).toContainText("C")
    expect(term.screen).toContainText("Status")
    expect(term.buffer.getText()).toContain("A")
    expect(term.buffer.getText()).toContain("B")
  })
})
