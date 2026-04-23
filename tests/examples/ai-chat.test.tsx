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
    // On mount, the intro system exchange is shown and the demo waits for
    // user input (bead km-silvery.inline-bugs bug 4 — mount no longer
    // auto-advances). Type a short message then Enter to submit, which
    // kicks off the fastMode chain through user[0]+agent[1-4].
    await settle(150)
    for (const c of "go") await handle.press(c)
    await settle(50)
    await handle.press("Enter")
    // Poll until "Fixed" appears — the fastMode chain fires after the 150ms
    // autoAdvance delay plus React render + emulator paint. Poll for up to
    // 2s to be robust against test scheduling jitter.
    for (let i = 0; i < 40; i++) {
      const text = term.screen!.getText()
      if (text.includes("Fixed")) break
      await settle(50)
    }
  })

  afterAll(() => {
    handle?.unmount()
    // Dispose the Term so the xterm.js Terminal is released —
    // see bead km-silvery.termless-memleak.
    ;(term as unknown as { [Symbol.dispose]?: () => void })?.[Symbol.dispose]?.()
  })

  test("initial render: first exchanges visible", async () => {
    // With fastMode=true, the submitted user message kicks off the script
    // and the fastMode chain walks through user[0] + agent[1-4], stopping
    // at user[5]. In fullscreen retain mode, all exchanges stay in the
    // render tree — the virtualizer windows them within the viewport.
    //
    // Allow one more settle so the final chained state paints to the
    // emulator before we read term.screen (beforeAll returns immediately
    // after the last await; React may not have flushed the terminal write).
    await new Promise((r) => setTimeout(r, 100))
    const screenText = term.screen!.getText()
    const scrollback = term.scrollback?.getText?.() ?? ""
    const combined = scrollback + "\n" + screenText
    // Agent entry content should be somewhere (screen or scrollback).
    expect(combined).toContain("Fixed")
    // Box borders from tool call boxes
    expect(combined).toContain("┃")
    assertNoOverlappingBorders(term.screen!)
  })

  test("Enter 1: rate limiting turn, no overlapping borders", async () => {
    // Submits pre-filled "Nice. Can you also add rate limiting?" then
    // fastMode chains through all agent entries (Grep, Edit, Bash, summary).
    // Type a short message to submit (Enter alone is a no-op after bug-2
    // fix; Tab→Enter has a fill sync race — see beforeAll for details).
    for (const c of "ok") await handle.press(c)
    await settle(20)
    await handle.press("Enter")
    await settle()

    const screenText = term.screen!.getText()
    expect(screenText.toLowerCase()).toContain("rate limit")
    assertNoOverlappingBorders(term.screen!)
  })

  test("Enter 2: i18n turn, box chars preserved", async () => {
    // Type a short message to submit (Enter alone is a no-op after bug-2
    // fix; Tab→Enter has a fill sync race — see beforeAll for details).
    for (const c of "ok") await handle.press(c)
    await settle(20)
    await handle.press("Enter")
    await settle()

    // Box drawing chars should be visible on screen (exchanges have borders)
    const screenText = term.screen!.getText()
    expect(screenText).toContain("┃")
    assertNoOverlappingBorders(term.screen!)
  })

  test("Enter 3: still clean rendering", async () => {
    // Type a short message to submit (Enter alone is a no-op after bug-2
    // fix; Tab→Enter has a fill sync race — see beforeAll for details).
    for (const c of "ok") await handle.press(c)
    await settle(20)
    await handle.press("Enter")
    await settle()

    const screenText = term.screen!.getText()
    // Content should be visible and borders clean
    expect(screenText.length).toBeGreaterThan(100)
    assertNoOverlappingBorders(term.screen!)
  })

  test("resize to 80x24: content reflows, borders survive", async () => {
    // Resize from 120x40 to 80x24
    term.resize!(80, 24)
    // Wait for re-render at new dimensions
    await settle(50)

    expect(term.size.cols()).toBe(80)
    expect(term.size.rows()).toBe(24)
    const screenText = term.screen!.getText()
    // Content should still render after resize
    expect(screenText.length).toBeGreaterThan(100)
    assertNoOverlappingBorders(term.screen!)
  })
})
