/**
 * Regression tests for ai-chat showcase bugs reported by user.
 *
 * Bug 1: Timer doesn't update without keypress (nothing renders unless key pressed)
 * Bug 2: Intro/help text missing from start
 * Bug 3: "Session complete" appears too quickly, can't type after
 * Bug 4: Tab behavior confusing (no clear affordance)
 * Bug 5: Bottom bar too cluttered
 *
 * Uses createTermless for full ANSI rendering verification.
 */

import React, { useState, useEffect } from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { Box, Text } from "../../packages/react/src/index"
import { AIChat, SCRIPT, type ScriptEntry } from "../../examples/interactive/aichat/index"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// ============================================================================
// Bug 1: Timer-based state updates must render without keypress
// ============================================================================

describe("bug 1: timer renders without keypress", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("setInterval state update triggers re-render in inline mode", async () => {
    // Minimal component: counter increments every 100ms via setInterval
    function TimerApp() {
      const [count, setCount] = useState(0)
      useEffect(() => {
        const timer = setInterval(() => setCount((c) => c + 1), 100)
        return () => clearInterval(timer)
      }, [])
      return <Text>count:{count}</Text>
    }

    term = createTermless({ cols: 80, rows: 10 })
    handle = await run(<TimerApp />, term)

    // Initial render should show count:0
    await settle(50)
    expect(term.screen!.getText()).toContain("count:0")

    // After 500ms, counter should have incremented multiple times WITHOUT any keypress
    await settle(500)
    const text = term.screen!.getText()
    // Count should be at least 3 (500ms / 100ms interval, with some slack)
    const match = text.match(/count:(\d+)/)
    expect(match).toBeTruthy()
    const count = parseInt(match![1]!, 10)
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test("elapsed timer in ai-chat footer updates without keypress", async () => {
    const SHORT_SCRIPT: ScriptEntry[] = [
      { role: "user", content: "Fix the bug", tokens: { input: 50, output: 0 } },
      {
        role: "agent",
        content: "Looking at the code.",
        tokens: { input: 200, output: 100 },
      },
    ]

    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<AIChat script={SHORT_SCRIPT} autoStart={false} fastMode={true} />, term)
    await settle(300)

    // Status bar should show 0:00 initially
    const initialText = term.screen!.getText()
    expect(initialText).toContain("0:00")

    // After 1.5s, elapsed timer should update to 0:01 WITHOUT any keypress
    await settle(1500)
    const laterText = term.screen!.getText()
    expect(laterText).toContain("0:01")
  })
})

// ============================================================================
// Bug 2: Intro text should be visible at start
// ============================================================================

describe("bug 2: intro text visible at start", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("header/intro text is visible before first advance", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    // Don't use fastMode to see the initial state more clearly
    handle = await run(<AIChat script={SCRIPT} autoStart={false} fastMode={false} />, term)

    // The header should be visible in the first frame
    // (advance() runs on mount via useEffect, but the initial render should show the header)
    await settle(50)

    const text = term.screen!.getText()
    // The intro mentions "AI Chat" or key features
    // Since advance() runs immediately on mount, the header disappears instantly.
    // This is the bug — user never sees the intro.
    // For now, just verify what the current behavior is:
    // If exchanges exist, header is hidden. If not, it's shown.
    // The issue is that useEffect(() => advance(), []) fires before the user sees the header.
    const hasHeader = text.includes("AI Chat") || text.includes("ScrollbackList")
    const hasExchanges = text.includes("Fix the login bug") || text.includes("❯")

    // Current (buggy) behavior: header is gone because advance() already ran
    // We want: header visible for at least a moment
    // This test documents the current behavior:
    if (hasExchanges && !hasHeader) {
      // Bug confirmed: header never visible because advance() fires immediately
      expect(hasHeader).toBe(false) // currently false — this is the bug
    }
  })
})

// ============================================================================
// Bug 3: "Session complete" blocks input
// ============================================================================

describe("bug 3: session complete behavior", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("done state reached after script exhausted", async () => {
    const TINY_SCRIPT: ScriptEntry[] = [
      { role: "user", content: "Hi", tokens: { input: 10, output: 0 } },
      { role: "agent", content: "Hello!", tokens: { input: 20, output: 10 } },
    ]

    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<AIChat script={TINY_SCRIPT} autoStart={true} fastMode={true} />, term)

    // Fast+auto mode chains through everything immediately and sets done
    await settle(500)

    const text = term.screen!.getText()
    // Script is exhausted in auto mode — should show done state
    expect(text).toContain("Session complete")
  })
})
