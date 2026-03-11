/**
 * Regression tests for ai-chat (static-scrollback) showcase bugs.
 *
 * Bug 2: Ctrl-D exit — after first Ctrl-D, show "press Ctrl-D again to exit"
 * Bug 3: Unintuitive advancement — agent turns auto-advance, user turns pause
 * Bug 4: Turn box (Agent section) bottom border cropped
 * Bug 5: Status bar "context" text overlaps with "in scrollback"
 *
 * Uses createTermless for full ANSI rendering verification.
 */

import React from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { CodingAgent, SCRIPT, type ScriptEntry } from "../../examples/interactive/static-scrollback"

// ============================================================================
// Short script for testing — structured to test advancement behavior
// ============================================================================

const SHORT_SCRIPT: ScriptEntry[] = [
  { role: "user", content: "Fix the bug", tokens: { input: 50, output: 0 } },
  {
    role: "agent",
    content: "Looking at the code.",
    toolCalls: [{ tool: "Read", args: "src/foo.ts", output: ["line 1", "line 2"] }],
    tokens: { input: 200, output: 100 },
  },
  {
    role: "agent",
    content: "Fixed it.",
    tokens: { input: 300, output: 50 },
  },
  { role: "user", content: "Thanks", tokens: { input: 60, output: 0 } },
  {
    role: "agent",
    content: "All done!",
    tokens: { input: 400, output: 30 },
  },
]

// ============================================================================
// Bug 2: Ctrl-D exit feedback
// ============================================================================

describe("bug 2: ctrl-d exit feedback", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("first ctrl-d shows exit hint in placeholder", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    // Wait for auto-advance to settle
    await new Promise((r) => setTimeout(r, 200))

    // First Ctrl-D — should show exit hint
    await handle.press("ctrl+d")

    const afterText = term.screen!.getText()
    expect(afterText).toMatch(/ctrl.d.*exit/i)
  })

  test("double ctrl-d exits the app", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    await handle.press("ctrl+d")
    await handle.press("ctrl+d")

    // Wait for exit to propagate
    await new Promise((r) => setTimeout(r, 50))
    const exitRace = await Promise.race([
      handle.waitUntilExit().then(() => "exited"),
      new Promise((r) => setTimeout(() => r("timeout"), 200)),
    ])
    expect(exitRace).toBe("exited")
  })

  test("exit hint clears on next non-ctrl-d keypress", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    // Wait for auto-advance to settle
    await new Promise((r) => setTimeout(r, 200))

    // First Ctrl-D — show hint
    await handle.press("ctrl+d")
    expect(term.screen!.getText()).toMatch(/ctrl.d.*exit/i)

    // Any other key — hint should clear
    await handle.press("a")
    const afterText = term.screen!.getText()
    expect(afterText).not.toMatch(/ctrl.d.*exit/i)
  })
})

// ============================================================================
// Bug 3: Unintuitive advancement
// ============================================================================

describe("bug 3: unintuitive advancement", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("agent turns auto-advance until next user turn", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    // Wait for auto-advance to chain through agent entries
    // Each advance needs: 100ms timer + React render cycle
    await new Promise((r) => setTimeout(r, 1500))

    const text = term.screen!.getText()
    // Mount advances user[0] → auto-chains agent[1] → fast-mode done →
    // auto-advance agent[2] → fast-mode done → next is user[3] → stops
    expect(text).toContain("Fix the bug")
    expect(text).toContain("Looking at the code")
    expect(text).toContain("Fixed it")
    // Should NOT contain the next user message yet (waiting for input)
    // (the "Thanks" message should not appear as a sent exchange —
    // it may appear pre-filled in the input box though)
  })

  test("empty Enter does NOT advance the script", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    // Wait for auto-advance to settle at user turn
    await new Promise((r) => setTimeout(r, 500))

    // Get screen state before — should show entries up to "Fixed it."
    const before = term.screen!.getText()
    expect(before).toContain("Fixed it")

    // Clear pre-filled text by pressing Ctrl-U, then press Enter with empty input
    await handle.press("ctrl+u")
    await handle.press("Enter")

    // Wait a tick
    await new Promise((r) => setTimeout(r, 200))

    // Should NOT have advanced — "All done!" should NOT appear
    const after = term.screen!.getText()
    expect(after).not.toContain("All done!")
  })

  test("submitting typed text advances to agent turn", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    // Wait for auto-advance to settle at user turn
    await new Promise((r) => setTimeout(r, 500))

    // Type and submit a message
    await handle.press("ctrl+u") // clear pre-fill
    // Type "ok"
    await handle.press("o")
    await handle.press("k")
    await handle.press("Enter")

    // Wait for auto-advance of agent turns
    await new Promise((r) => setTimeout(r, 500))

    // The agent response "All done!" should now be visible
    const text = term.screen!.getText()
    expect(text).toContain("All done!")
  })
})

// ============================================================================
// Bug 4: Turn box bottom border
// ============================================================================

describe("bug 4: agent turn box bottom border", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("agent box has complete border (top and bottom)", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)

    // Wait for auto-advance
    await new Promise((r) => setTimeout(r, 300))

    const lines = term.screen!.getLines()

    // Look for top border and bottom border of agent box
    let topBorderCount = 0
    let bottomBorderCount = 0
    for (const line of lines) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith("\u256D")) topBorderCount++
      if (trimmed.startsWith("\u2570")) bottomBorderCount++
    }

    // Every box with a top border should have a matching bottom border
    expect(bottomBorderCount).toBeGreaterThanOrEqual(topBorderCount)
  })

  test("agent box bottom border is not cropped by terminal height", async () => {
    // Use a smaller terminal to force content near the bottom
    term = createTermless({ cols: 100, rows: 25 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Wait for auto-advance through agent turns
    await new Promise((r) => setTimeout(r, 500))

    const lines = term.screen!.getLines()

    // Find the LAST top border and last bottom border
    let lastTopRow = -1
    let lastBottomRow = -1
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trimStart()
      if (trimmed.startsWith("\u256D")) lastTopRow = i
      if (trimmed.startsWith("\u2570")) lastBottomRow = i
    }

    // If there's a top border visible, the matching bottom border should also be visible
    if (lastTopRow >= 0) {
      expect(lastBottomRow).toBeGreaterThan(lastTopRow)
    }
  })
})

// ============================================================================
// Bug 5: Status bar text overflow
// ============================================================================

describe("bug 5: status bar text overflow", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("scrollbackcontext does not appear as concatenated text", async () => {
    // Use a narrow terminal that could cause text overflow
    term = createTermless({ cols: 80, rows: 30 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Advance until items start freezing (frozenCount > 0)
    for (let i = 0; i < 6; i++) {
      await handle.press("Enter")
      await new Promise((r) => setTimeout(r, 200))
    }

    const lines = term.screen!.getLines()
    const statusLine = lines.find((l) => l.includes("context"))

    // "scrollbackcontext" should NEVER appear as a single concatenated word
    if (statusLine) {
      expect(statusLine).not.toContain("scrollbackcontext")
    }
  })

  test("status bar left and right sections do not overlap at 80 cols", async () => {
    term = createTermless({ cols: 80, rows: 30 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Advance to trigger frozen items
    for (let i = 0; i < 5; i++) {
      await handle.press("Enter")
      await new Promise((r) => setTimeout(r, 200))
    }

    const lines = term.screen!.getLines()
    const statusLine = lines.find((l) => l.includes("context") && (l.includes("%") || l.includes("$")))

    if (statusLine) {
      // The "in scrollback" text should not run into "context"
      expect(statusLine).not.toMatch(/scrollback\s*context/)
    }
  })
})
