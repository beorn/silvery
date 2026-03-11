/**
 * Tests for the ai-chat pattern WITH the actual ScrollbackList component.
 *
 * The companion test (static-scrollback.test.tsx) uses a simplified component
 * WITHOUT ScrollbackList so all items remain in app.text. This test uses the
 * REAL ScrollbackList to verify:
 * - Frozen items are removed from the live render tree
 * - Frozen items are written to the mock stdout
 * - The live render stays clean (no garbled/stale content)
 * - Footer persists through all freezes
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { ScrollbackList } from "../../packages/ui/src/components/ScrollbackList"
import { useInput, type Key } from "@silvery/term/runtime"

// ============================================================================
// Types & Test Data
// ============================================================================

interface Exchange {
  id: string
  role: "user" | "agent"
  content: string
  frozen: boolean
}

const SCRIPT: Omit<Exchange, "id" | "frozen">[] = [
  { role: "user", content: "Fix the login bug" },
  { role: "agent", content: "Looking at the code..." },
  { role: "agent", content: "Found the issue, fixing now." },
  { role: "user", content: "Add rate limiting too" },
  { role: "agent", content: "Rate limiting added. Done!" },
]

// ============================================================================
// Mock stdout
// ============================================================================

function createMockStdout() {
  const writes: string[] = []
  return {
    write(data: string) {
      writes.push(data)
      return true
    },
    get output() {
      return writes.join("")
    },
    get writes() {
      return writes
    },
    columns: 80,
  }
}

// ============================================================================
// Components
// ============================================================================

function ExchangeView({ exchange }: { exchange: Exchange }) {
  const label = exchange.role === "user" ? "You" : "Agent"
  return (
    <Box>
      <Text>
        {label}: {exchange.content}
      </Text>
    </Box>
  )
}

function TestAiChat({
  script = SCRIPT,
  stdout,
}: {
  script?: typeof SCRIPT
  stdout?: { write(data: string): boolean; columns?: number }
}) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(false)
  const nextId = useRef(0)

  const advance = useCallback(() => {
    if (idx >= script.length) {
      setDone(true)
      return
    }
    setExchanges((prev) => [
      ...prev.map((ex) => ({ ...ex, frozen: true })),
      { ...script[idx]!, id: String(nextId.current++), frozen: false },
    ])
    setIdx((i) => i + 1)
  }, [idx, script])

  // Auto-advance the first entry on mount
  useEffect(() => {
    if (exchanges.length === 0 && script.length > 0) advance()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useInput((input: string, key: Key) => {
    if (key.escape) return "exit"
    if (key.return) {
      advance()
      return
    }
  })

  return (
    <ScrollbackList
      items={exchanges}
      keyExtractor={(ex) => ex.id}
      isFrozen={(ex) => ex.frozen}
      stdout={stdout as any}
      footer={
        <Box>
          <Text>{done ? "[done]" : "[ready]"}</Text>
        </Box>
      }
    >
      {(exchange) => <ExchangeView exchange={exchange} />}
    </ScrollbackList>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("ai-chat with ScrollbackList", () => {
  // -------------------------------------------------------------------------
  // Initial render
  // -------------------------------------------------------------------------

  test("renders first exchange on mount", () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestAiChat stdout={mockStdout} />)

    const text = stripAnsi(app.text)
    expect(text).toContain("You: Fix the login bug")
    expect(text).toContain("[ready]")
  })

  // -------------------------------------------------------------------------
  // Freezing behavior
  // -------------------------------------------------------------------------

  test("Enter advances and freezes previous exchange out of live render", async () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestAiChat stdout={mockStdout} />)

    // First exchange is live
    expect(stripAnsi(app.text)).toContain("You: Fix the login bug")

    await app.press("Enter")

    const text = stripAnsi(app.text)
    // New exchange should be visible in live render
    expect(text).toContain("Agent: Looking at the code...")
    // Previous exchange should be frozen (removed from live render)
    expect(text).not.toContain("You: Fix the login bug")
  })

  test("mock stdout receives frozen content", async () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestAiChat stdout={mockStdout} />)

    // Initial render: first exchange is live, nothing frozen yet
    expect(mockStdout.output).toBe("")

    await app.press("Enter")

    // First exchange should now be written to stdout
    const output = stripAnsi(mockStdout.output)
    expect(output).toContain("You: Fix the login bug")
  })

  // -------------------------------------------------------------------------
  // Multiple advances
  // -------------------------------------------------------------------------

  test("multiple advances don't garble — only latest exchange in live render", async () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestAiChat stdout={mockStdout} />)

    // Advance through 3 more entries (first was auto-advanced)
    await app.press("Enter")
    await app.press("Enter")
    await app.press("Enter")

    const text = stripAnsi(app.text)
    // Only the latest exchange should be in the live render
    expect(text).toContain("Add rate limiting too")
    // Previous exchanges should NOT be in live render
    expect(text).not.toContain("Fix the login bug")
    expect(text).not.toContain("Looking at the code")
    expect(text).not.toContain("Found the issue")
  })

  // -------------------------------------------------------------------------
  // Footer persistence
  // -------------------------------------------------------------------------

  test("footer persists through all freezes", async () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestAiChat stdout={mockStdout} />)

    // Check footer at each step
    expect(stripAnsi(app.text)).toContain("[ready]")

    await app.press("Enter")
    expect(stripAnsi(app.text)).toContain("[ready]")

    await app.press("Enter")
    expect(stripAnsi(app.text)).toContain("[ready]")

    await app.press("Enter")
    expect(stripAnsi(app.text)).toContain("[ready]")

    await app.press("Enter")
    expect(stripAnsi(app.text)).toContain("[ready]")

    // Advance past end of script
    await app.press("Enter")
    expect(stripAnsi(app.text)).toContain("[done]")
  })

  // -------------------------------------------------------------------------
  // All frozen items written to stdout
  // -------------------------------------------------------------------------

  test("all frozen items written to stdout after full script", async () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestAiChat stdout={mockStdout} />)

    // Advance through entire script (5 entries, first auto-advanced)
    // Each Enter freezes the previous exchange and shows the next
    for (let i = 0; i < 4; i++) {
      await app.press("Enter")
    }

    const output = stripAnsi(mockStdout.output)
    // All exchanges except the last (still live) should be in stdout
    expect(output).toContain("You: Fix the login bug")
    expect(output).toContain("Agent: Looking at the code...")
    expect(output).toContain("Agent: Found the issue, fixing now.")
    expect(output).toContain("You: Add rate limiting too")

    // The last exchange is still live (not frozen yet)
    expect(stripAnsi(app.text)).toContain("Agent: Rate limiting added. Done!")
  })

  // -------------------------------------------------------------------------
  // Clean live render after all freezes
  // -------------------------------------------------------------------------

  test("live render after full script — only last exchange and footer", async () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(<TestAiChat stdout={mockStdout} />)

    // Advance through entire script (5 entries, first auto-advanced)
    for (let i = 0; i < 4; i++) {
      await app.press("Enter")
    }

    const text = stripAnsi(app.text)
    // Only the last exchange + footer should be in the live render
    expect(text).toContain("Agent: Rate limiting added. Done!")
    expect(text).toContain("[ready]")
    // All previous exchanges should be frozen out of the live render
    expect(text).not.toContain("Fix the login bug")
    expect(text).not.toContain("Looking at the code")
    expect(text).not.toContain("Found the issue")
    expect(text).not.toContain("Add rate limiting too")

    // One more Enter to trigger done state
    await app.press("Enter")
    const doneText = stripAnsi(app.text)
    expect(doneText).toContain("[done]")
    // Last exchange is still live (advance past end doesn't freeze it)
    expect(doneText).toContain("Rate limiting added. Done!")
  })
})
