/**
 * run() exit behavior tests
 *
 * Tests that exit handlers work correctly in the Layer 2 useInput hook:
 * - Escape returns "exit" → app exits
 * - Ctrl+D double-tap within 500ms → app exits
 * - Ctrl+C with exitOnCtrlC → app exits
 * - Single Ctrl+D does NOT exit
 *
 * Bead: km-silvery.ai-chat-bugs
 */

import React, { useRef, useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/react"
import { useInput } from "@silvery/term/runtime/run"

// ============================================================================
// Test Components
// ============================================================================

/**
 * Minimal component that mimics the ai-chat exit pattern:
 * - Escape → immediate exit
 * - Ctrl+D twice within 500ms → exit
 */
function ExitTestApp() {
  const [status, setStatus] = useState("running")
  const lastCtrlDRef = useRef(0)

  useInput((input: string, key) => {
    if (key.escape) return "exit"
    if (key.ctrl && input === "d") {
      const now = Date.now()
      if (now - lastCtrlDRef.current < 500) return "exit"
      lastCtrlDRef.current = now
      setStatus("ctrl-d-once")
      return
    }
  })

  return (
    <Box>
      <Text>Status: {status}</Text>
    </Box>
  )
}

/**
 * Component with both Layer 1 and Layer 2 useInput hooks — tests that
 * exit via Layer 2 useInput works alongside Layer 1 input handling.
 */
function DualInputApp() {
  const [text, setText] = useState("")
  const lastCtrlDRef = useRef(0)

  // Layer 2 useInput (from run.tsx) — handles exit
  useInput((input: string, key) => {
    if (key.escape) return "exit"
    if (key.ctrl && input === "d") {
      const now = Date.now()
      if (now - lastCtrlDRef.current < 500) return "exit"
      lastCtrlDRef.current = now
      return
    }
    // Accumulate printable characters
    if (!key.ctrl && input.length === 1 && input >= " ") {
      setText((t: string) => t + input)
    }
  })

  return (
    <Box flexDirection="column">
      <Text>Input: {text}</Text>
    </Box>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("run() exit behavior", () => {
  test("Escape triggers exit", async () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<ExitTestApp />)

    expect(app.text).toContain("Status: running")
    expect(app.exitCalled()).toBe(false)

    await app.press("Escape")

    expect(app.exitCalled()).toBe(true)
  })

  test("single Ctrl+D does NOT exit", async () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<ExitTestApp />)

    await app.press("ctrl+d")

    expect(app.exitCalled()).toBe(false)
    expect(app.text).toContain("Status: ctrl-d-once")
  })

  test("Ctrl+D twice within 500ms exits", async () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<ExitTestApp />)

    // Two rapid Ctrl+D presses
    await app.press("ctrl+d")
    expect(app.exitCalled()).toBe(false)

    await app.press("ctrl+d")
    expect(app.exitCalled()).toBe(true)
  })

  test("Ctrl+D twice with long gap does NOT exit", async () => {
    // Use Date.now override from the start
    const originalNow = Date.now
    let fakeTime = originalNow()
    Date.now = () => fakeTime

    try {
      const r = createRenderer({ cols: 40, rows: 5 })
      const app = r(<ExitTestApp />)

      // First Ctrl+D — records timestamp
      await app.press("ctrl+d")
      expect(app.exitCalled()).toBe(false)

      // Advance time beyond 500ms window
      fakeTime += 600

      // Second Ctrl+D — too late, resets timestamp
      await app.press("ctrl+d")
      expect(app.exitCalled()).toBe(false)

      // Third Ctrl+D quickly after second — should exit
      fakeTime += 100
      await app.press("ctrl+d")
      expect(app.exitCalled()).toBe(true)
    } finally {
      Date.now = originalNow
    }
  })

  test("exit works after text input", async () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<DualInputApp />)

    // Type some text first
    await app.press("a")
    await app.press("b")
    expect(app.text).toContain("Input: ab")

    // Escape should still trigger exit
    await app.press("Escape")
    expect(app.exitCalled()).toBe(true)
  })
})
