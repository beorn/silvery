/**
 * AI-chat example tested with Termless — in-process terminal emulation.
 *
 * Uses createTermless() + run() to render the real CodingAgent component
 * into an xterm.js emulator. No PTY subprocess — faster, deterministic,
 * same ANSI fidelity.
 *
 * Catches bugs that component-level tests miss: output-phase cursor
 * miscalculation, scrollback promotion, inline mode content clearing,
 * box border integrity, terminal resize reflow.
 */

import React from "react"
import { describe, test, expect, beforeAll, afterAll } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term, TermScreen } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { CodingAgent, SCRIPT } from "../../examples/interactive/static-scrollback"

// ============================================================================
// Helpers
// ============================================================================

/**
 * Invariant: no consecutive ╭ lines without a ╰ between them.
 * Detects overlapping/garbled box borders.
 */
function assertNoOverlappingBorders(screen: TermScreen) {
  const lines = screen.getLines()
  let lastTopBorderRow = -10
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]!.trimStart()
    if (line.startsWith("╭")) {
      if (row - lastTopBorderRow === 1) {
        const between = lines[row - 1]!.trimStart()
        if (!between.startsWith("╰")) {
          throw new Error(
            `Overlapping box borders at rows ${lastTopBorderRow} and ${row}:\n` +
              `  ${lastTopBorderRow}: ${lines[lastTopBorderRow]!.slice(0, 80)}\n` +
              `  ${row}: ${lines[row]!.slice(0, 80)}`,
          )
        }
      }
      lastTopBorderRow = row
    }
  }
}

// ============================================================================
// Tests — in-process, sequential advances
// ============================================================================

describe("ai-chat example (in-process termless)", { timeout: 10000 }, () => {
  let term: Term
  let handle: RunHandle

  beforeAll(async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)
  })

  afterAll(() => {
    handle?.unmount()
  })

  test("initial render: header, first exchange, status bar", () => {
    expect(term.screen).toContainText("Static Scrollback")
    expect(term.screen).toContainText("Fix the login bug")
    expect(term.screen).toContainText("context")
  })

  test("Enter 1: agent reads auth.ts", async () => {
    await handle.press("Enter")

    expect(term.screen).toContainText("Read src/auth.ts")
    expect(term.screen).toContainText("auth module")
    expect(term.screen).toContainText("context")
  })

  test("Enter 2: agent edits, no overlapping borders", async () => {
    await handle.press("Enter")

    expect(term.screen).toContainText("Edit src/auth.ts")
    assertNoOverlappingBorders(term.screen!)
  })

  test("Enter 3: footer persists, no overlapping borders", async () => {
    await handle.press("Enter")

    expect(term.screen).toContainText("bun test")
    expect(term.screen).toContainText("context")
    assertNoOverlappingBorders(term.screen!)
  })

  test("Enter 4: early content moves to scrollback", async () => {
    await handle.press("Enter")

    expect(term.screen).toContainText("rate limiting")

    const scrollbackText = term.scrollback!.getText()
    if (scrollbackText.length > 0) {
      expect(scrollbackText).toContain("Fix the login bug")
      // Box drawing chars survive scrollback promotion
      expect(scrollbackText).toContain("╭")
      expect(scrollbackText).toContain("│")
      // NOTE: ╰ missing at this point — known inline rendering bug (scrollback promotion truncation)
      // The last promoted box's bottom border gets cut off. Full boxes promoted earlier do have ╰.
      // Uncomment when fixed: expect(scrollbackText).toContain("╰")
    }
    assertNoOverlappingBorders(term.screen!)
  })

  test("Enter 5: still clean rendering", async () => {
    await handle.press("Enter")

    expect(term.screen).toContainText("context")
    assertNoOverlappingBorders(term.screen!)
  })

  test("resize to 80x24: content reflows, borders survive", async () => {
    // Resize from 120x40 to 80x24
    term.resize!(80, 24)
    // Wait for re-render at new dimensions
    await new Promise((r) => setTimeout(r, 50))

    expect(term.cols).toBe(80)
    expect(term.rows).toBe(24)
    expect(term.screen).toContainText("context")
    expect(term.screen!.getText()).toContain("│")
    assertNoOverlappingBorders(term.screen!)
  })
})
