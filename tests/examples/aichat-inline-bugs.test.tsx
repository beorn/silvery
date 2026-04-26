/**
 * AI-chat inline mode bug regression tests.
 *
 * Tracks the eight bugs from bead km-silvery.inline-bugs:
 * 1. Compaction says 'session complete' — user can't continue
 * 2. Text auto-inserted into input
 * 3. Tab behavior wrong — empty→fill, non-empty→submit
 * 4. Intro text missing — 'AI Chat' header + feature bullets
 * 5. Input box jump-up
 * 6. Empty space during streaming
 * 7. Border broken
 * 8. Focus outline when unfocused
 */

import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/ag-term/src/ansi/term"
import type { TermScreen } from "../../packages/ag-term/src/ansi/types"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { AIChat, SCRIPT } from "../../examples/apps/aichat/index"

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

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

describe("aichat inline bugs", { timeout: 15000 }, () => {
  let term: Term
  let handle: RunHandle

  async function setup(
    opts: {
      mode?: "inline" | "fullscreen"
      autoStart?: boolean
      fastMode?: boolean
      cols?: number
      rows?: number
      focusReporting?: boolean
    } = {},
  ) {
    const {
      mode = "inline",
      autoStart = false,
      fastMode = true,
      cols = 100,
      rows = 30,
      focusReporting = true,
    } = opts
    term = createTermless({ cols, rows })
    handle = await run(
      <AIChat
        script={SCRIPT}
        autoStart={autoStart}
        fastMode={fastMode}
        inline={mode === "inline"}
      />,
      term,
      { mode, focusReporting },
    )
    await settle()
  }

  afterEach(() => {
    handle?.unmount()
    ;(term as unknown as { [Symbol.dispose]?: () => void })?.[Symbol.dispose]?.()
  })

  // ==========================================================================
  // Bug 4: Intro text missing — 'AI Chat' header + feature bullets
  // ==========================================================================

  test("bug 4: intro 'AI Chat' header and feature bullets should appear on first render", async () => {
    term = createTermless({ cols: 100, rows: 40 })
    // With autoStart=false, the intro should be visible at the top of the
    // scrollback — ListView keeps all exchanges addressable and the intro is
    // the first item. Even after mount's doAdvance chains through the first
    // agent response, the intro exchange must remain in the render tree.
    handle = await run(<AIChat script={SCRIPT} autoStart={false} fastMode={true} />, term, {
      mode: "inline",
      focusReporting: true,
    })
    await settle(300)

    // Check both screen and scrollback — in inline mode with a long session,
    // the intro may scroll into terminal scrollback.
    const screenText = term.screen!.getText()
    const scrollbackText = term.scrollback?.getText?.() ?? ""
    const combined = scrollbackText + "\n" + screenText
    expect(combined).toContain("AI Chat")
    // Feature bullets from INTRO_TEXT
    expect(combined).toContain("ListView")
  })

  // ==========================================================================
  // Bug 2: Text auto-inserted into input — empty Enter used to silently
  // submit the placeholder as if the user had typed it.
  // ==========================================================================

  test("bug 2: empty Enter is a no-op (does not submit the placeholder)", async () => {
    await setup({ mode: "inline", fastMode: false, autoStart: false })
    await settle(80)

    // Starting state: intro + empty input (no agent response yet).
    expect(countAgentBullets(term.screen!)).toBe(0)

    // Press Enter with empty input. Old behavior: placeholder gets submitted
    // ("Fix the login bug...") and agent starts thinking. New behavior: no-op.
    await handle.press("Enter")
    await settle(200)

    // Still no agent bullet — nothing was submitted.
    expect(countAgentBullets(term.screen!)).toBe(0)
  })

  // ==========================================================================
  // Bug 1: Compaction says 'session complete' in non-auto mode
  // ==========================================================================

  test("bug 1: manual mode never marks session done", async () => {
    await setup({ autoStart: false, fastMode: true })
    // Exercise the script via Tab (fill) + Enter (submit) — empty Enter is
    // a no-op after the bug-2 fix, so we can't spam Enter to advance.
    for (let i = 0; i < 3; i++) {
      await handle.press("Tab")
      await settle(50)
      await handle.press("Enter")
      await settle()
    }

    const screenText = term.screen!.getText()
    // "Session complete" overlay must NOT appear in manual mode.
    expect(screenText).not.toContain("Session complete")
  })

  // ==========================================================================
  // Bug 7: Borders are not broken — no overlapping box borders
  // ==========================================================================

  test("bug 7: no overlapping borders during streaming (inline mode)", async () => {
    await setup({ mode: "inline", fastMode: true })
    // Advance the script with Tab-then-Enter (empty Enter is now a no-op).
    for (let i = 0; i < 2; i++) {
      await handle.press("Tab")
      await settle(50)
      await handle.press("Enter")
      await settle()
    }

    assertNoOverlappingBorders(term.screen!)
  })

  test("bug 7: input-box border spans the full width (not truncated to 4 chars)", async () => {
    // Regression: with `flexDirection="row"` and no explicit width, the
    // bordered Box sized to fit only the ❯ prefix and the TextInput overflowed
    // outside the border. Top/bottom borders became "╭──╮" / "╰──╯" while
    // the middle row's content extended well past the right border.
    await setup({ mode: "inline", cols: 100, rows: 30, autoStart: false, fastMode: false })
    await settle(80)

    // Find the ╭ top-border row and measure its length. A broken border shows
    // as `╭──╮` (4 chars) while a correct one spans most of the width.
    const lines = term.screen!.getLines()
    const topRow = lines.find((line) => line.trimStart().startsWith("╭"))
    expect(topRow).toBeDefined()
    const borderLen = topRow!.trim().length
    expect(borderLen).toBeGreaterThan(40) // generous lower bound for a 100-col terminal
  })

  // ==========================================================================
  // Bug 8: Focus outline when unfocused — input box border should NOT be
  // $border-focus color when terminal is unfocused.
  // ==========================================================================

  test("bug 8: input border reflects terminal focus state", async () => {
    await setup({ mode: "inline", focusReporting: true, fastMode: false, autoStart: false })
    await settle(80)

    // Find the border row, capture the color of a border cell.
    const findBorderCell = () => {
      const lines = term.screen!.getLines()
      for (let row = 0; row < lines.length; row++) {
        const line = lines[row]!
        const col = line.indexOf("╭")
        if (col >= 0) return { row, col }
      }
      return null
    }

    const focusedCell = findBorderCell()
    expect(focusedCell).not.toBeNull()
    const focusedFg = (term.screen!.cell?.(focusedCell!.row, focusedCell!.col) as any)?.fg

    // Send focus-out (CSI O) — border color should flip to $inputborder.
    ;(term as any).sendInput?.("\x1b[O")
    await settle(150)

    const unfocusedCell = findBorderCell()
    expect(unfocusedCell).not.toBeNull()
    const unfocusedFg = (term.screen!.cell?.(unfocusedCell!.row, unfocusedCell!.col) as any)?.fg

    // The placeholder also flips to "Click to focus" — this confirms the
    // re-render fired and the DemoFooter received terminalFocused=false.
    expect(term.screen!.getText()).toContain("Click to focus")

    // The foreground color of the border cell must differ between focused
    // and unfocused states. Exact colors are theme-dependent.
    if (focusedFg != null && unfocusedFg != null) {
      expect(JSON.stringify(focusedFg)).not.toBe(JSON.stringify(unfocusedFg))
    }
  })

  test("typing + Enter submits (smoke test)", async () => {
    await setup({ mode: "inline", fastMode: false, autoStart: false })
    await settle(80)

    const agentBefore = countAgentBullets(term.screen!)
    for (const c of "test") await handle.press(c)
    await settle(50)
    await handle.press("Enter")
    await settle(500)

    const agentAfter = countAgentBullets(term.screen!)
    expect(agentAfter).toBeGreaterThan(agentBefore)
  })

  // ==========================================================================
  // Bug 5: Input box jump-up — the footer's vertical position should not
  // oscillate during a single interaction. After a press, content may grow
  // once and the footer moves with it — but it should not immediately bounce
  // back up to its old position in the next frame.
  // ==========================================================================

  test("bug 5: input border row doesn't bounce (no jump-up) after submit", async () => {
    await setup({ mode: "inline", cols: 100, rows: 30, fastMode: false, autoStart: false })
    await settle(80)

    const findBorderRow = () => {
      const lines = term.screen!.getLines()
      for (let row = 0; row < lines.length; row++) {
        if (lines[row]!.trimStart().startsWith("╭")) return row
      }
      return -1
    }

    const rowBefore = findBorderRow()
    expect(rowBefore).toBeGreaterThanOrEqual(0)

    // Send Tab + Enter — fills the scripted message into the input, then
    // submits it. Empty Enter is a no-op after the bug-2 fix.
    await handle.press("Tab")
    await settle(50)
    await handle.press("Enter")

    // Capture the border row position every 30ms for ~600ms. The row
    // should move monotonically (downward as content grows, or stable)
    // — never oscillate (jump up after going down).
    const samples: number[] = []
    for (let i = 0; i < 20; i++) {
      await settle(30)
      const r = findBorderRow()
      if (r >= 0) samples.push(r)
    }

    // No oscillation: each sample should be >= the minimum achieved so far
    // (content grows, footer moves down or stays put, never jumps back up
    // past a position it already left).
    let maxSeen = samples[0] ?? 0
    let jumped = false
    let prev = samples[0] ?? 0
    for (const r of samples) {
      if (r > maxSeen) maxSeen = r
      // Allow monotonic movement; detect a decrease of more than 1 row as a
      // jump-up (a single-row decrease can happen on stream-end if content
      // gets virtualized away, which is expected).
      if (r < prev - 1) jumped = true
      prev = r
    }
    expect(jumped).toBe(false)
  })

  // ==========================================================================
  // Bug 3: Tab behavior — empty input should fill text, non-empty should submit
  // ==========================================================================

  test("bug 3: tab with empty input fills placeholder into input (does not submit)", async () => {
    await setup({ mode: "inline", fastMode: false, autoStart: false })
    await settle(100)

    // Starting state: no scripted exchanges have been sent. Verify by asking
    // how many agent bullets ("●") appear on screen — should be 0 since the
    // intro is a system exchange and no agent has responded yet.
    const beforeAgent = countAgentBullets(term.screen!)
    expect(beforeAgent).toBe(0)

    await handle.press("Tab")
    await settle(150)

    const afterText = term.screen!.getText()
    // The scripted message content ("Fix the login bug...") must appear in
    // the input box as VALUE after Tab. We can tell it's a value and not a
    // placeholder by checking that the agent is still silent — if submit
    // had fired, the agent would have started thinking.
    expect(afterText).toContain("Fix the login bug")
    const afterAgent = countAgentBullets(term.screen!)
    expect(afterAgent).toBe(0)
  })

  test("bug 3: tab with non-empty input submits like Enter", async () => {
    // Use fastMode: false so we can interact before the demo auto-chains.
    // autoStart: false keeps mount from advancing (after the bug 4 fix).
    await setup({ mode: "inline", fastMode: false, autoStart: false })

    await settle(50)

    // Agent bullet count before: should be 0 (no scripted advance yet).
    const agentBefore = countAgentBullets(term.screen!)

    // Type directly into the empty input.
    for (const c of "hello world") await handle.press(c)
    await settle(50)
    expect(term.screen!.getText()).toContain("hello world")

    // Tab with non-empty input should submit — which in the state machine
    // means `submit` fires and a user exchange is added; then scheduled
    // autoAdvance kicks off the next scripted agent response.
    await handle.press("Tab")
    await settle(400)

    // Agent bullet count must increase — submitting triggered the agent.
    const agentAfter = countAgentBullets(term.screen!)
    expect(agentAfter).toBeGreaterThan(agentBefore)
  })
})

/**
 * Count the number of user exchanges visible on screen by counting "❯" markers
 * that aren't inside the input box (heuristic: lines containing "❯" whose
 * immediately adjacent lines do not form the rounded input border).
 *
 * The DemoFooter wraps its TextInput in a `╭─…─╮ / │ ❯ … │ / ╰─…─╯` box —
 * exactly one such ❯ exists per frame. ExchangeItem's user rows use a plain
 * row with `❯` + text and no surrounding border, so they're counted.
 */
function countUserExchanges(screen: TermScreen): number {
  const lines = screen.getLines()
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.includes("❯")) continue
    const prev = lines[i - 1] ?? ""
    const next = lines[i + 1] ?? ""
    // The DemoFooter's input-box ❯ always has ╭─…─╮ directly above and
    // ╰─…─╯ directly below. Anything else is a user-exchange marker.
    const isInputBox = prev.trimStart().startsWith("╭") && next.trimStart().startsWith("╰")
    if (!isInputBox) count++
  }
  return count
}

/**
 * Count the number of agent-response bullets ("●") visible on screen.
 * ExchangeItem renders a leading "●" on every agent response row.
 */
function countAgentBullets(screen: TermScreen): number {
  const lines = screen.getLines()
  let count = 0
  for (const line of lines) {
    // Only the agent line has the "●" bullet. System/user exchanges don't.
    // The input box and status bar don't use it either.
    if (line.trimStart().startsWith("●")) count++
    else if (line.includes(" ● ")) count++
  }
  return count
}
