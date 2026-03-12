/**
 * Spec-level tests for the ai-chat showcase.
 *
 * Tests the core interaction patterns of the CodingAgent:
 * - Initial render (first exchange visible, footer with prompt)
 * - Script advancement via Enter
 * - Exit behavior (Escape, Ctrl+D double-tap)
 * - Tab toggles auto mode
 * - Thinking blocks display
 * - Layout correctness at various terminal sizes
 *
 * Uses a minimal TestCodingAgent that mirrors the real CodingAgent's state
 * machine but strips streaming animation (instant reveal) for testability.
 * Does NOT use ScrollbackList — uses a simple list so all items remain in
 * app.text (ScrollbackList auto-freezes items that scroll off-screen).
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text, TextInput } from "../../src/index.js"
import { useInput, type Key } from "@silvery/term/runtime"

// ============================================================================
// Minimal CodingAgent reproduction
// ============================================================================

interface Exchange {
  id: number
  role: "user" | "agent" | "system"
  content: string
  thinking?: string
}

const TEST_SCRIPT: Array<Omit<Exchange, "id">> = [
  { role: "user", content: "Fix the login bug in auth.ts" },
  { role: "agent", content: "Let me look at the auth module.", thinking: "Reading auth.ts..." },
  { role: "agent", content: "Found the bug. Fixing now." },
  { role: "user", content: "Can you also add rate limiting?" },
  { role: "agent", content: "I'll wire in the rate limiter." },
  { role: "agent", content: "All done! Summary of changes." },
]

function TestFooter({
  onSubmit,
  done,
  autoMode,
}: {
  onSubmit: (text: string) => void
  done: boolean
  autoMode: boolean
}) {
  const [inputText, setInputText] = useState("")

  return (
    <Box flexDirection="column">
      <Text color="$muted">{done ? "[done]" : autoMode ? "[auto]" : "[ready]"}</Text>
      {!done && (
        <Box>
          <Text bold>{"❯ "}</Text>
          <TextInput
            value={inputText}
            onChange={setInputText}
            onSubmit={(text) => {
              onSubmit(text)
              setInputText("")
            }}
            placeholder="Type a message..."
          />
        </Box>
      )}
    </Box>
  )
}

function ExchangeView({ exchange }: { exchange: Exchange }) {
  const prefix = exchange.role === "user" ? "You" : exchange.role === "agent" ? "Agent" : "System"
  return (
    <Box flexDirection="column">
      <Text>
        {prefix}: {exchange.content}
      </Text>
      {exchange.thinking && (
        <Text color="$muted" italic>
          thinking: {exchange.thinking}
        </Text>
      )}
    </Box>
  )
}

/**
 * Test CodingAgent — same state machine as the real one, with:
 * - No streaming animation (instant reveal)
 * - No ScrollbackList (plain list so items stay in app.text)
 * - Synchronous state transitions (no setTimeout)
 */
function TestCodingAgent({ script = TEST_SCRIPT }: { script?: typeof TEST_SCRIPT }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [scriptIdx, setScriptIdx] = useState(0)
  const [done, setDone] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const nextId = useRef(0)
  const lastCtrlDRef = useRef(0)

  const advance = useCallback(() => {
    if (scriptIdx >= script.length) {
      setDone(true)
      return
    }
    const entry = script[scriptIdx]!
    const id = nextId.current++
    setExchanges((prev) => [...prev, { ...entry, id }])
    setScriptIdx((idx) => idx + 1)
  }, [scriptIdx, script])

  // Auto-advance the first entry on mount
  useEffect(() => {
    if (exchanges.length === 0 && script.length > 0) {
      advance()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useInput((input: string, key: Key) => {
    if (key.escape) return "exit"
    if (key.ctrl && input === "d") {
      const now = Date.now()
      if (now - lastCtrlDRef.current < 500) return "exit"
      lastCtrlDRef.current = now
      return
    }
    if (key.tab) {
      setAutoMode((m) => !m)
      return
    }
  })

  const handleSubmit = useCallback(
    (_text: string) => {
      if (done) return
      advance()
    },
    [done, advance],
  )

  return (
    <Box flexDirection="column" paddingX={1}>
      {exchanges.map((ex) => (
        <ExchangeView key={ex.id} exchange={ex} />
      ))}

      <TestFooter onSubmit={handleSubmit} done={done} autoMode={autoMode} />
    </Box>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("ai-chat showcase", () => {
  // -------------------------------------------------------------------------
  // Initial render
  // -------------------------------------------------------------------------

  test("renders first exchange on mount", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    const text = stripAnsi(app.text)
    expect(text).toContain("You: Fix the login bug")
    expect(text).toContain("[ready]")
  })

  test("footer shows prompt input", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    const text = stripAnsi(app.text)
    expect(text).toContain("❯")
    expect(text).toContain("Type a message")
  })

  // -------------------------------------------------------------------------
  // Script advancement via Enter
  // -------------------------------------------------------------------------

  test("Enter advances to next exchange", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    expect(stripAnsi(app.text)).toContain("You: Fix the login bug")

    await app.press("Enter")

    const text = stripAnsi(app.text)
    expect(text).toContain("Agent: Let me look at the auth module")
  })

  test("multiple Enter presses advance through script", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    await app.press("Enter")
    await app.press("Enter")
    await app.press("Enter")

    const text = stripAnsi(app.text)
    expect(text).toContain("rate limiting")
  })

  test("advancing past end of script shows done state", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    // Advance through all 6 entries (first auto-advanced, 5 more)
    for (let i = 0; i < 5; i++) {
      await app.press("Enter")
    }

    expect(stripAnsi(app.text)).toContain("All done!")

    // One more Enter to trigger done
    await app.press("Enter")
    const text = stripAnsi(app.text)
    expect(text).toContain("[done]")
    // Input prompt should disappear when done
    expect(text).not.toContain("❯")
  })

  // -------------------------------------------------------------------------
  // All exchanges remain visible
  // -------------------------------------------------------------------------

  test("all exchanges visible after multiple advances", async () => {
    const r = createRenderer({ cols: 80, rows: 40 })
    const app = r(<TestCodingAgent />)

    await app.press("Enter")
    await app.press("Enter")

    const text = stripAnsi(app.text)
    // First exchange (user)
    expect(text).toContain("Fix the login bug")
    // Second exchange (agent)
    expect(text).toContain("Let me look at the auth module")
    // Third exchange (agent)
    expect(text).toContain("Found the bug")
  })

  // -------------------------------------------------------------------------
  // Exit behavior
  // -------------------------------------------------------------------------

  test("Escape exits the app", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    expect(app.exitCalled()).toBe(false)
    await app.press("Escape")
    expect(app.exitCalled()).toBe(true)
  })

  test("single Ctrl+D does not exit", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    await app.press("ctrl+d")
    expect(app.exitCalled()).toBe(false)
  })

  test("double Ctrl+D within 500ms exits", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    await app.press("ctrl+d")
    expect(app.exitCalled()).toBe(false)

    await app.press("ctrl+d")
    expect(app.exitCalled()).toBe(true)
  })

  test("Escape exits after advancing script", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    await app.press("Enter")
    await app.press("Enter")

    expect(app.exitCalled()).toBe(false)
    await app.press("Escape")
    expect(app.exitCalled()).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Tab toggles auto mode
  // -------------------------------------------------------------------------

  test.skip("Tab toggles auto mode", async () => {
    // KNOWN DIFFERENCE: The test renderer consumes Tab for focus management
    // (renderer.ts line 725-731) and never passes it to useInput handlers.
    // The production runtime (createApp) does NOT consume Tab — it flows
    // through to useInput. This means Tab-based features can only be tested
    // via the full runtime (run()), not createRenderer().
    // TODO: Consider aligning test renderer Tab handling with production.
  })

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  test("exchange appears before footer in layout", () => {
    const r = createRenderer({ cols: 60, rows: 15 })
    const app = r(<TestCodingAgent />)

    const text = stripAnsi(app.text)
    const lines = text.split("\n").filter((l) => l.trim())

    const exchangeLine = lines.findIndex((l) => l.includes("Fix the login bug"))
    const footerLine = lines.findIndex((l) => l.includes("[ready]"))
    expect(exchangeLine).toBeGreaterThanOrEqual(0)
    expect(footerLine).toBeGreaterThan(exchangeLine)
  })

  test("renders at narrow width without crashing", () => {
    const r = createRenderer({ cols: 30, rows: 10 })
    const app = r(<TestCodingAgent />)

    expect(stripAnsi(app.text).length).toBeGreaterThan(0)
  })

  test("renders at very small size", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(<TestCodingAgent />)

    expect(stripAnsi(app.text).length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Thinking blocks
  // -------------------------------------------------------------------------

  test("agent exchange with thinking shows thinking text", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent />)

    // Second script entry has thinking
    await app.press("Enter")

    const text = stripAnsi(app.text)
    expect(text).toContain("thinking: Reading auth.ts")
  })

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  test("empty script shows done on first Enter", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent script={[]} />)

    // With empty script, there are no exchanges — should show footer
    const text = stripAnsi(app.text)
    expect(text).toContain("[ready]")

    // Enter triggers advance which sets done (empty script)
    await app.press("Enter")
    expect(stripAnsi(app.text)).toContain("[done]")
  })

  test("single-entry script", async () => {
    const script = [{ role: "user" as const, content: "Hello world" }]
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestCodingAgent script={script} />)

    expect(stripAnsi(app.text)).toContain("You: Hello world")

    await app.press("Enter")
    expect(stripAnsi(app.text)).toContain("[done]")
  })
})
