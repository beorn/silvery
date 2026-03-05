/**
 * Scrollback compaction tests — reproducing bugs from the static-scrollback demo.
 *
 * Bug 1: computeCumulativeTokens counts frozen exchanges, so after auto-compact
 * at 95% context, every new exchange immediately re-triggers compaction.
 * The user can never type because the app is stuck in perpetual compaction.
 *
 * Bug 2: After resize, frozen content in scrollback is duplicated.
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, TextInput, ScrollbackList } from "../src/index.js"
import { createRenderer, stripAnsi } from "@hightea/term/testing"
import { createTerminalFixture } from "@termless/test"

// ============================================================================
// Minimal compaction app (distilled from static-scrollback.tsx)
// ============================================================================

interface Exchange {
  id: number
  content: string
  tokens: number
  frozen: boolean
}

const CONTEXT_WINDOW = 1000 // Small window for test (real demo uses 200_000)

function computeCumulativeTokens(exchanges: Exchange[]): number {
  let total = 0
  for (const ex of exchanges) {
    total += ex.tokens
  }
  return total
}

/**
 * Minimal app that mimics the demo's compaction behavior.
 * - Items freeze to scrollback on compact
 * - Auto-compact at 95% context
 * - After compaction, advance adds next scripted item
 * - BUG: auto-compact counts frozen items → infinite loop
 */
function CompactApp({
  onCompact,
  onAdvance,
  stdout: stdoutProp,
}: {
  onCompact?: () => void
  onAdvance?: () => void
  stdout?: { write: (d: string) => boolean; columns: number; rows: number }
}) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [done, setDone] = useState(false)
  const compactingRef = useRef(false)
  const [pendingAdvance, setPendingAdvance] = useState(false)
  const [inputText, setInputText] = useState("")
  const scriptIdx = useRef(0)
  const nextId = useRef(0)
  const compactCount = useRef(0)

  // Script: token values chosen so total crosses 95% (950) after 4 entries
  const script: Array<{ content: string; tokens: number }> = [
    { content: "First response", tokens: 200 },
    { content: "Second response", tokens: 300 },
    { content: "Third response", tokens: 400 },
    { content: "Fourth response", tokens: 200 }, // cumulative: 1100 > 950
    { content: "Fifth response", tokens: 100 },
    { content: "Sixth response", tokens: 100 },
  ]

  const compact = useCallback(() => {
    if (done || compactingRef.current) return
    compactingRef.current = true
    setExchanges((prev) => prev.map((ex) => ({ ...ex, frozen: true })))
    compactCount.current++
    onCompact?.()

    // Use state transition instead of setTimeout to avoid act() warnings.
    // Set compacting=false and pendingAdvance=true in next render cycle.
    compactingRef.current = false
    setPendingAdvance(true)
  }, [done, onCompact])

  const advance = useCallback(() => {
    if (done || compactingRef.current) return
    const idx = scriptIdx.current
    if (idx >= script.length) {
      setDone(true)
      return
    }

    const entry = script[idx]!
    const id = nextId.current++
    scriptIdx.current++
    onAdvance?.()

    setExchanges((prev) => [...prev, { id, content: entry.content, tokens: entry.tokens, frozen: false }])
  }, [done, script, onAdvance])

  // Auto-advance after compaction
  useEffect(() => {
    if (!pendingAdvance) return
    setPendingAdvance(false)
    advance()
  }, [pendingAdvance, advance])

  // Initial advance
  useEffect(() => {
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-compact when ACTIVE (non-frozen) tokens reach 95%.
  // Only count non-frozen exchanges — frozen ones are in scrollback.
  useEffect(() => {
    if (done || compactingRef.current) return
    const active = exchanges.filter((ex) => !ex.frozen)
    const total = computeCumulativeTokens(active)
    if (total >= CONTEXT_WINDOW * 0.95) {
      compact()
    }
  }, [exchanges, done, compact])

  // Enter always advances (simplified from demo)
  const handleSubmit = useCallback(
    (_text: string) => {
      if (done) return
      setInputText("")
      advance()
    },
    [done, advance],
  )

  return (
    <Box flexDirection="column">
      <ScrollbackList
        items={exchanges}
        keyExtractor={(ex) => ex.id}
        isFrozen={(ex) => ex.frozen}
        stdout={stdoutProp}
        width={stdoutProp?.columns}
        footer={
          <Box borderStyle="round">
            <TextInput value={inputText} onChange={setInputText} onSubmit={handleSubmit} isActive={!done} prompt="> " />
          </Box>
        }
      >
        {(exchange) => (
          <Box borderStyle="round">
            <Text>{exchange.content}</Text>
          </Box>
        )}
      </ScrollbackList>
      <Text>
        compacts={compactCount.current} done={done ? "yes" : "no"} items={exchanges.length}
      </Text>
    </Box>
  )
}

function createMockStdout(cols = 80) {
  const writes: string[] = []
  return {
    stdout: {
      write(data: string) {
        writes.push(data)
        return true
      },
      columns: cols,
      rows: 24,
    },
    writes,
  }
}

// ============================================================================
// Bug 1: Infinite compaction loop
// ============================================================================

describe("scrollback compaction", () => {
  test("auto-compact counting frozen tokens triggers infinite compact loop", async () => {
    // After crossing 95% threshold, compact fires. Then advance adds a new
    // exchange. Because computeCumulativeTokens counts frozen items, the total
    // is still above 95%, so compact fires AGAIN. This repeats for every
    // remaining script entry.
    //
    // Expected with fix: compact fires at most ONCE per threshold crossing.

    let compactCount = 0
    const { stdout } = createMockStdout(80)

    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(<CompactApp stdout={stdout} onCompact={() => compactCount++} />)

    // Advance 3 more times to cross threshold: 200+300+400+200 = 1100 > 950
    // The compact cascade (if bugged) plays out synchronously during
    // React reconciliation — no async gap needed.
    await app.press("Enter")
    await app.press("Enter")
    await app.press("Enter")

    // THE BUG: compactCount > 1 because each post-compact advance
    // re-triggers compaction (frozen tokens still counted).
    // With fix, compactCount should be exactly 1.
    expect(compactCount).toBeLessThanOrEqual(1)
  })

  test("after compaction, TextInput still accepts typed characters", async () => {
    let compactCount = 0
    const { stdout, writes } = createMockStdout(80)

    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(<CompactApp stdout={stdout} onCompact={() => compactCount++} />)

    // Advance to cross threshold
    for (let i = 0; i < 3; i++) {
      await app.press("Enter")
      await new Promise((r) => setTimeout(r, 20))
    }

    // Wait for compaction to complete
    await new Promise((r) => setTimeout(r, 300))

    // Type characters into TextInput
    await app.press("h")
    await app.press("e")
    await app.press("l")
    await app.press("l")
    await app.press("o")

    // Verify typed text appears in the live area
    expect(app.text).toContain("hello")

    // Verify termless can see the typed text in frozen output
    if (writes.length > 0) {
      const term = createTerminalFixture({ cols: 80, rows: 40, scrollbackLimit: 1000 })
      for (const w of writes) {
        term.feed(w)
      }
      // Frozen items should be in scrollback
      expect(term.buffer).toContainText("First response")
    }
  })
})

// ============================================================================
// Bug 2: Resize corrupts visible screen
// ============================================================================

describe("scrollback resize", () => {
  test("visible screen is properly formatted after resize", async () => {
    // After freezing items to scrollback and resizing, BOTH the visible screen
    // AND scrollback must be clean. The fix uses ED3 (\x1b[3J) to clear the
    // terminal's scrollback buffer, then re-emits ALL frozen items at the new
    // width. This prevents cumulative duplication that occurred with the old
    // selective re-emit approach.

    const term = createTerminalFixture({
      cols: 100,
      rows: 30,
      scrollbackLimit: 1000,
    })

    await term.spawn(["bun", "examples/interactive/static-scrollback.tsx", "--fast"], {
      cwd: "/Users/beorn/Code/pim/km/vendor/hightea",
    })

    // Wait for initial render
    await term.waitFor("send", 10000)
    await new Promise((r) => setTimeout(r, 1500))

    // Press Enter several times to build up scrollback
    for (let i = 0; i < 5; i++) {
      term.press("Enter")
      await new Promise((r) => setTimeout(r, 2000))
    }

    // Verify status bar is visible before resize
    const screenBefore = term.screen.getText()
    expect(screenBefore).toContain("send")
    expect(screenBefore).toContain("scrollback")

    // Resize: shrink to 70 cols
    term.resize(70, 30)
    await new Promise((r) => setTimeout(r, 2000))

    // Visible screen must still have the status bar and input box
    const screenAfterShrink = term.screen.getText()
    expect(screenAfterShrink).toContain("send")

    // Check that box borders on the visible screen fit the new width
    // (no orphaned border characters or broken formatting)
    const shrinkLines = screenAfterShrink.split("\n")
    for (const line of shrinkLines) {
      // Lines with box borders should not exceed terminal width (70 cols)
      // (trimmed to handle trailing spaces)
      const trimmed = line.replace(/\s+$/, "")
      if (trimmed.length > 0) {
        expect(trimmed.length, `Line too wide after shrink: "${trimmed}"`).toBeLessThanOrEqual(70)
      }
    }

    // No content line on the visible screen should appear more than twice
    // (some content legitimately appears in multiple exchanges)
    const contentPattern = /^│\s+(.*?)\s+│$/
    const contentCounts = new Map<string, number>()
    for (const line of shrinkLines) {
      const match = contentPattern.exec(line.trim())
      if (match) {
        const content = match[1]!.trim()
        if (content && content.length > 5) {
          contentCounts.set(content, (contentCounts.get(content) || 0) + 1)
        }
      }
    }
    for (const [content, count] of contentCounts) {
      expect(count, `"${content}" duplicated ${count}x on visible screen`).toBeLessThanOrEqual(2)
    }

    // After resize with ED3, scrollback should be clean — no old-width duplicates.
    // Count occurrences of a distinctive content line in the FULL buffer (screen + scrollback).
    // With the old approach (selective re-emit), each resize added another copy.
    // With ED3 (clear scrollback + re-emit all), there should be at most 1 copy per exchange.
    const fullBufferAfterShrink = term.getText()
    const agentMatches = fullBufferAfterShrink.match(/Agent 624 tokens/g)
    expect(
      agentMatches?.length ?? 0,
      `"Agent 624 tokens" appears ${agentMatches?.length ?? 0}x in full buffer (expected ≤1)`,
    ).toBeLessThanOrEqual(1)

    // Status bar must NOT leak into scrollback — only frozen exchange content
    // should be in scrollback. The status bar (with "send", "esc quit", "ctx")
    // belongs exclusively on the visible screen.
    const scrollbackAfterShrink = term.scrollback.getText()
    expect(scrollbackAfterShrink, "status bar 'send' leaked into scrollback after resize").not.toContain("send")
    expect(scrollbackAfterShrink, "status bar 'esc quit' leaked into scrollback after resize").not.toContain("esc quit")

    // Restore to original size
    term.resize(100, 30)
    await new Promise((r) => setTimeout(r, 2000))

    // Status bar and input must still be functional
    const screenAfterRestore = term.screen.getText()
    expect(screenAfterRestore).toContain("send")

    // Borders should fit at the restored width
    const restoreLines = screenAfterRestore.split("\n")
    for (const line of restoreLines) {
      const trimmed = line.replace(/\s+$/, "")
      if (trimmed.length > 0) {
        expect(trimmed.length, `Line too wide after restore: "${trimmed}"`).toBeLessThanOrEqual(100)
      }
    }

    // Full buffer after restore should also be clean
    const fullBufferAfterRestore = term.getText()
    const agentMatchesRestore = fullBufferAfterRestore.match(/Agent 624 tokens/g)
    expect(
      agentMatchesRestore?.length ?? 0,
      `"Agent 624 tokens" appears ${agentMatchesRestore?.length ?? 0}x after restore (expected ≤1)`,
    ).toBeLessThanOrEqual(1)

    // Scrollback after restore must also be clean of status bar content
    const scrollbackAfterRestore = term.scrollback.getText()
    expect(scrollbackAfterRestore, "status bar leaked into scrollback after restore").not.toContain("send")
    expect(scrollbackAfterRestore, "status bar leaked into scrollback after restore").not.toContain("esc quit")

    // Press Enter several times AFTER resize to trigger new renders + scrollback.
    // This catches bugs where the output phase miscalculates cursor position
    // post-resize and pushes the status bar into scrollback.
    for (let i = 0; i < 3; i++) {
      term.press("Enter")
      await new Promise((r) => setTimeout(r, 2000))
    }

    const scrollbackAfterInteraction = term.scrollback.getText()
    expect(
      scrollbackAfterInteraction,
      "status bar 'send' leaked into scrollback after post-resize interaction",
    ).not.toContain("send")
    expect(
      scrollbackAfterInteraction,
      "status bar 'esc quit' leaked into scrollback after post-resize interaction",
    ).not.toContain("esc quit")
  }, 45000)
})
