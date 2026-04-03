/**
 * AI-chat example tested with Termless — in-process terminal emulation.
 *
 * Uses createTermless() + run() to render the real AIChat component
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
import type { Term } from "../../packages/ag-term/src/ansi/term"
import type { TermScreen } from "../../packages/ag-term/src/ansi/types"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { AIChat, SCRIPT } from "../../examples/apps/aichat/index"

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

/** Wait for renders to settle. */
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

// ============================================================================
// Tests — in-process, sequential advances
// ============================================================================

describe("ai-chat example (in-process termless)", { timeout: 15000 }, () => {
  let term: Term
  let handle: RunHandle

  beforeAll(async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<AIChat script={SCRIPT} autoStart={false} fastMode={true} />, term)
    // Wait for mount advance + fastMode auto-chain to settle
    await settle()
  })

  afterAll(() => {
    handle?.unmount()
  })

  test("initial render: first exchanges visible, status bar", () => {
    // With fastMode=true, mount advance() chains through user[0] + agent[1-4],
    // stopping at user[5]. Header is hidden once exchanges exist.
    // Earlier entries may be frozen into scrollback (MAX_LIVE_TURNS=3).
    const screenText = term.screen!.getText()
    // Last agent entry content should be on screen
    expect(screenText).toContain("Fixed")
    expect(screenText).toContain("ctx")
  })

  test("Enter 1: rate limiting turn, no overlapping borders", async () => {
    // Submits pre-filled "Nice. Can you also add rate limiting?" then
    // fastMode chains through all agent entries (Grep, Edit, Bash, summary).
    // With working timer rendering, auto-advance effects fire during settle,
    // so rate limiting text may scroll to scrollback.
    await handle.press("Enter")
    await settle()

    const allText = (term.scrollback?.getText() ?? "") + term.screen!.getText()
    expect(allText.toLowerCase()).toContain("rate limit")
    expect(term.screen).toContainText("ctx")
    assertNoOverlappingBorders(term.screen!)
  })

  test("Enter 2: i18n turn, box chars preserved", async () => {
    await handle.press("Enter")
    await settle()

    // Box drawing chars survive whether on-screen or in scrollback.
    const screenText = term.screen!.getText()
    const scrollbackText = term.scrollback!.getText()
    const allText = scrollbackText + screenText
    expect(allText).toContain("╭")
    expect(allText).toContain("│")
    expect(allText).toContain("╰")
    assertNoOverlappingBorders(term.screen!)
  })

  test("Enter 3: still clean rendering", async () => {
    await handle.press("Enter")
    await settle()

    expect(term.screen).toContainText("ctx")
    assertNoOverlappingBorders(term.screen!)
  })

  test("resize to 80x24: content reflows, borders survive", async () => {
    // Resize from 120x40 to 80x24
    term.resize!(80, 24)
    // Wait for re-render at new dimensions
    await settle(50)

    expect(term.cols).toBe(80)
    expect(term.rows).toBe(24)
    expect(term.screen).toContainText("ctx")
    expect(term.screen!.getText()).toContain("│")
    assertNoOverlappingBorders(term.screen!)
  })
})
