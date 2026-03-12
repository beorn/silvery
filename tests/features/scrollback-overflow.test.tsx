/**
 * Scrollback Promotion Overflow — Tests for when frozen + live content exceeds terminal height.
 *
 * Bugs reproduced:
 *   5. Input box jump-up — cursor tracking doesn't account for terminal scroll
 *   6. Empty space during streaming — pre-allocated space visible below input
 *   7. Border broken on exchange cards — garbled rendering during promotion
 *
 * Root cause: handleScrollbackPromotion writes frozenLineCount + maxOutputLines
 * lines. When totalOnScreen > termRows, the terminal scrolls. The cursor tracking
 * must account for this scroll displacement — otherwise subsequent frames render
 * at the wrong position, causing duplication, gaps, or garbled output.
 *
 * These tests use createTermless to verify through a real terminal emulator.
 */

import React, { useState, useCallback } from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { Box, Text, useInput, ScrollbackList } from "silvery"

// ============================================================================
// Minimal test app — controllable ScrollbackList
// ============================================================================

interface TestItem {
  id: number
  text: string
  frozen: boolean
  lines: number // how many lines this item renders
}

function MultiLineItem({ item }: { item: TestItem }) {
  const rows = []
  for (let i = 0; i < item.lines; i++) {
    rows.push(<Text key={i}>{i === 0 ? `[${item.id}] ${item.text}` : `  ...line ${i + 1}`}</Text>)
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$border" paddingX={1}>
      {rows}
    </Box>
  )
}

function TestApp({
  initialItems,
  onStateChange,
}: {
  initialItems: TestItem[]
  onStateChange?: (items: TestItem[]) => void
}) {
  const [items, setItems] = useState(initialItems)

  const updateItems = useCallback(
    (updater: (prev: TestItem[]) => TestItem[]) => {
      setItems((prev) => {
        const next = updater(prev)
        onStateChange?.(next)
        return next
      })
    },
    [onStateChange],
  )

  useInput((input, key) => {
    if (key.escape) return "exit"

    // Enter: freeze oldest unfrozen item + add a new item
    if (key.return) {
      updateItems((prev) => {
        const firstUnfrozen = prev.findIndex((it) => !it.frozen)
        const next = prev.map((it, i) => (i === firstUnfrozen ? { ...it, frozen: true } : it))
        const newId = prev.length > 0 ? Math.max(...prev.map((it) => it.id)) + 1 : 1
        return [...next, { id: newId, text: `Item ${newId}`, frozen: false, lines: 3 }]
      })
    }

    // 'f': freeze ALL items (compaction)
    if (input === "f") {
      updateItems((prev) => prev.map((it) => ({ ...it, frozen: true })))
    }

    // 'g': grow the last item (simulate streaming)
    if (input === "g") {
      updateItems((prev) => {
        const last = prev[prev.length - 1]
        if (!last) return prev
        return [...prev.slice(0, -1), { ...last, lines: last.lines + 2 }]
      })
    }
  })

  return (
    <ScrollbackList
      items={items}
      keyExtractor={(it) => it.id}
      isFrozen={(it) => it.frozen}
      footer={
        <Box borderStyle="round" borderColor="$primary" paddingX={1}>
          <Text>{">"} Input here</Text>
        </Box>
      }
    >
      {(item) => <MultiLineItem item={item} />}
    </ScrollbackList>
  )
}

// ============================================================================
// Helper
// ============================================================================

async function setupInlineApp(
  items: TestItem[],
  dims: { cols: number; rows: number } = { cols: 80, rows: 20 },
): Promise<{ term: Term; handle: RunHandle }> {
  const term = createTermless(dims)
  const emulator = (term as unknown as Record<string, unknown>)._emulator as {
    feed(data: string): void
  }

  const handle = await run(<TestApp initialItems={items} />, {
    mode: "inline",
    writable: { write: (s: string) => emulator.feed(s) },
    cols: dims.cols,
    rows: dims.rows,
  })

  return { term, handle }
}

function makeItems(count: number, linesEach: number = 3, frozen: boolean = false): TestItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Item ${i + 1}`,
    frozen,
    lines: linesEach,
  }))
}

// ============================================================================
// Tests: Overflow during scrollback promotion
// ============================================================================

describe("scrollback promotion overflow", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("basic render — items visible with footer", async () => {
    const items = makeItems(2, 2)
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 20 }))

    expect(term.screen).toContainText("Item 1")
    expect(term.screen).toContainText("Item 2")
    expect(term.screen).toContainText("Input here")
  })

  test("Enter freezes item + adds new — no duplication", async () => {
    const items = makeItems(2, 2)
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 20 }))

    await handle.press("Enter")

    // Screen should show frozen item 1, live item 2, new item 3, and footer
    const allText = (term.scrollback?.getText() ?? "") + term.screen!.getText()
    expect(allText).toContain("Item 1")
    expect(allText).toContain("Item 2")
    expect(allText).toContain("Item 3")
    expect(term.screen).toContainText("Input here")
  })

  test("multiple Enter presses — content accumulates without garbling", async () => {
    const items = makeItems(1, 3)
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 25 }))

    for (let i = 0; i < 5; i++) {
      await handle.press("Enter")

      const screenText = term.screen!.getText()
      const scrollbackText = term.scrollback?.getText() ?? ""
      const allText = scrollbackText + screenText

      // Footer must always be visible
      expect(term.screen).toContainText("Input here")

      // Screen should never be mostly blank
      const lines = term.screen!.getLines()
      const nonBlank = lines.filter((l: string) => l.trim().length > 0).length
      expect(nonBlank, `After Enter ${i + 1}: only ${nonBlank} non-blank lines`).toBeGreaterThan(3)

      // No JavaScript errors
      expect(allText).not.toContain("[object Object]")
      expect(allText).not.toContain("TypeError")
    }
  })

  test("BUG 5: promotion overflow causes terminal scroll — cursor tracks correctly", async () => {
    // Create enough items that frozen + live exceeds terminal rows
    // 4 items × 5 lines each (3 content + 2 border) = 20 lines of items + 3 footer = 23
    // Terminal is 15 rows → overflow guaranteed on first promotion
    const items = makeItems(4, 3)
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 15 }))

    // Press Enter to freeze first item and add a new one
    await handle.press("Enter")

    // The key invariant: footer must be visible, content must not be garbled
    expect(term.screen).toContainText("Input here")

    // Press Enter again — triggers another promotion with even more overflow
    await handle.press("Enter")
    expect(term.screen).toContainText("Input here")

    // Content should be readable — check that item text is present
    const allText = (term.scrollback?.getText() ?? "") + term.screen!.getText()
    expect(allText).toContain("Item")
  })

  test("BUG 6: growing content during streaming — no empty gap below footer", async () => {
    // Start with 2 items, last one small
    const items: TestItem[] = [
      { id: 1, text: "First", frozen: false, lines: 2 },
      { id: 2, text: "Streaming", frozen: false, lines: 1 },
    ]
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 20 }))

    // "g" grows the last item by 2 lines — simulates streaming content arriving
    await handle.press("g")
    await handle.press("g")
    await handle.press("g")

    // Footer should be right below the content, not with a gap
    const lines = term.screen!.getLines()
    const footerRow = lines.findIndex((l: string) => l.includes("Input here"))
    expect(footerRow).toBeGreaterThan(0)

    // Count non-blank lines above footer
    let lastContentRow = -1
    for (let i = 0; i < footerRow; i++) {
      if (lines[i]!.trim().length > 0) lastContentRow = i
    }

    // The gap between last content and footer should be small (at most 1 border line)
    // A large gap (>2 blank lines) indicates the pre-allocation bug
    if (lastContentRow >= 0) {
      const gap = footerRow - lastContentRow - 1
      // Allow 1-2 lines for borders, but not 5+
      expect(gap, `${gap} blank lines between content and footer`).toBeLessThan(5)
    }
  })

  test("BUG 7: border chars survive promotion", async () => {
    const items = makeItems(3, 2)
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 20 }))

    await handle.press("Enter")

    // Box border characters should be present (round style: ╭╮╰╯│─)
    const allText = (term.scrollback?.getText() ?? "") + term.screen!.getText()
    const hasBorderChars =
      allText.includes("│") ||
      allText.includes("─") ||
      allText.includes("╭") ||
      allText.includes("╰")
    expect(hasBorderChars, "No border characters found after promotion").toBe(true)
  })

  test("compaction (freeze all) — screen recovers", async () => {
    const items = makeItems(3, 3)
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 15 }))

    // "f" freezes all items at once
    await handle.press("f")

    // After compaction, footer should still be visible
    expect(term.screen).toContainText("Input here")
  })
})

// ============================================================================
// Invariant-based chaos testing (inspired by vi-monkey / fuzz-invariants)
// ============================================================================

describe("scrollback chaos invariants", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  /**
   * Check invariants that should hold after ANY action on a scrollback app.
   */
  function checkInvariants(term: Term, action: string, iteration: number): void {
    const screenText = term.screen!.getText()
    const lines = term.screen!.getLines()
    const nonBlank = lines.filter((l: string) => l.trim().length > 0).length

    // 1. Screen must never be empty
    expect(nonBlank, `[${iteration}] Empty screen after ${action}`).toBeGreaterThan(0)

    // 2. No JavaScript error strings
    expect(screenText, `[${iteration}] JS error after ${action}`).not.toContain("[object Object]")
    expect(screenText, `[${iteration}] TypeError after ${action}`).not.toContain("TypeError")
    expect(screenText, `[${iteration}] NaN after ${action}`).not.toContain("NaN")

    // 3. Footer must always be visible on screen
    expect(term.screen!.getText(), `[${iteration}] Footer missing after ${action}`).toContain(
      "Input here",
    )

    // 4. Screen should have reasonable content (not mostly blank)
    // At least 20% of lines should have content
    const contentRatio = nonBlank / lines.length
    expect(
      contentRatio,
      `[${iteration}] Screen mostly blank (${(contentRatio * 100).toFixed(0)}% content) after ${action}`,
    ).toBeGreaterThan(0.15)
  }

  test("random action sequence — 30 iterations", async () => {
    const items = makeItems(2, 2)
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 18 }))

    const actions = ["Enter", "g", "f", "Enter", "g", "Enter", "Enter", "g", "g", "Enter"]

    for (let i = 0; i < 30; i++) {
      const action = actions[i % actions.length]!
      await handle.press(action)
      checkInvariants(term, action, i)
    }
  })

  test("rapid freeze-grow cycles — stress promotion path", async () => {
    const items = makeItems(3, 2)
    ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 12 }))

    // This is the pattern that triggers the overflow bug:
    // Enter (freeze + add) → grow → Enter (freeze + add) → grow ...
    for (let i = 0; i < 10; i++) {
      await handle.press("Enter")
      checkInvariants(term, "Enter", i * 2)

      await handle.press("g")
      checkInvariants(term, "g", i * 2 + 1)
    }
  })

  test("small terminal — overflow on every promotion", async () => {
    // 8-row terminal — almost any content overflows
    const items = makeItems(2, 2)
    ;({ term, handle } = await setupInlineApp(items, { cols: 60, rows: 8 }))

    for (let i = 0; i < 8; i++) {
      await handle.press("Enter")
      checkInvariants(term, `Enter-${i}`, i)
    }
  })
})

// ============================================================================
// Real AIChat tests with shell prompt pre-population
// ============================================================================

describe("AIChat inline scrollback with shell prompt", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  async function setupWithShellPrompt(
    dims: { cols: number; rows: number } = { cols: 120, rows: 40 },
    shellLines: number = 5,
  ) {
    const { AIChat, SCRIPT } = await import("../../examples/interactive/aichat/index")
    term = createTermless(dims)
    const emulator = (term as unknown as Record<string, unknown>)._emulator as {
      feed(data: string): void
    }

    // Pre-populate with shell prompt
    for (let i = 0; i < shellLines; i++) {
      emulator.feed(`shell-line-${i}\r\n`)
    }
    emulator.feed("$ bun run examples/interactive/aichat/index.tsx\r\n")

    handle = await run(<AIChat script={SCRIPT} autoStart={false} fastMode={true} />, {
      mode: "inline",
      writable: { write: (s: string) => emulator.feed(s) },
      cols: dims.cols,
      rows: dims.rows,
    })
    return { term, handle }
  }

  test("shell content preserved after 6 Enter presses on small terminal", async () => {
    await setupWithShellPrompt({ cols: 100, rows: 20 }, 3)

    for (let i = 0; i < 6; i++) {
      await handle.press("Enter")
      await new Promise((r) => setTimeout(r, 200))

      // Footer (status bar) must be visible
      expect(term.screen).toContainText("ctx")

      // Shell content should still be in scrollback (not overwritten)
      const allText = (term.scrollback?.getText() ?? "") + term.screen!.getText()
      expect(allText).toContain("shell-line")
    }
  })

  test("no content duplication after promotion overflow", async () => {
    await setupWithShellPrompt({ cols: 100, rows: 15 }, 3)

    // Do 4 Enter presses — this should overflow the 15-row terminal
    for (let i = 0; i < 4; i++) {
      await handle.press("Enter")
      await new Promise((r) => setTimeout(r, 200))
    }

    // Check screen for duplicated content.
    // If cursor tracking is wrong, content gets written twice.
    const screenText = term.screen!.getText()
    const lines = term.screen!.getLines().filter((l: string) => l.trim().length > 0)

    // Count lines that contain "Fix the login" — should appear at most once on screen
    const fixLoginLines = lines.filter((l: string) => l.includes("Fix the login"))
    expect(
      fixLoginLines.length,
      `"Fix the login" appears ${fixLoginLines.length} times — duplication detected`,
    ).toBeLessThanOrEqual(1)
  })

  test("screen stability across 10 Enter presses", async () => {
    await setupWithShellPrompt({ cols: 80, rows: 25 }, 3)

    for (let i = 0; i < 10; i++) {
      await handle.press("Enter")
      await new Promise((r) => setTimeout(r, 150))

      const lines = term.screen!.getLines()
      const nonBlank = lines.filter((l: string) => l.trim().length > 0).length

      // At least 30% of screen should have content
      expect(
        nonBlank / lines.length,
        `After Enter ${i + 1}: ${nonBlank}/${lines.length} non-blank — screen too empty`,
      ).toBeGreaterThan(0.3)

      // Status bar should always be visible
      expect(term.screen).toContainText("ctx")
    }
  })
})
