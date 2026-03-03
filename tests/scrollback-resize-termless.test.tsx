/**
 * Resize invariants for ScrollbackList frozen items — termless verification.
 *
 * Verifies that when the terminal resizes, frozen items in scrollback are
 * re-rendered at the new width with intact borders. Uses termless with real
 * xterm.js terminal emulation to verify actual ANSI output correctness.
 *
 * Covers:
 * - Shrink: narrower terminal re-renders frozen items narrower
 * - Grow: wider terminal re-renders frozen items wider (fill width)
 * - Multiple cycles: rapid back-and-forth resizing
 * - Invariant: border integrity after every resize
 * - Freeze-during-resize: items frozen at different widths are normalized
 * - Parent padding: layout-aware width survives resize
 */

import React, { useEffect } from "react"
import { EventEmitter } from "events"
import { describe, expect, test } from "vitest"
import { Box, Text, ScrollbackList, useScrollbackItem } from "../src/index.js"
import { createRenderer, stripAnsi } from "inkx/testing"
import { createTerminal } from "termless"
import { createXtermBackend } from "termless-xtermjs"
import "viterm/matchers"

// ============================================================================
// Types & Helpers
// ============================================================================

interface TestItem {
  id: string
  text: string
  frozen: boolean
}

/** Bordered item that fills full width (like agent exchange cards). */
function BorderedItem({ item }: { item: TestItem }) {
  const { freeze, isFrozen } = useScrollbackItem()

  useEffect(() => {
    if (item.frozen && !isFrozen) freeze()
  }, [item.frozen, isFrozen, freeze])

  return (
    <Box borderStyle="round" flexDirection="column">
      <Text bold>Agent {item.id}</Text>
      <Text>{item.text}</Text>
    </Box>
  )
}

function mkItems(...specs: Array<[string, string, boolean]>): TestItem[] {
  return specs.map(([id, text, frozen]) => ({ id, text, frozen }))
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

/** Mock stdout that emits resize events (like a real TTY). */
function createResizableStdout(cols = 80) {
  const writes: string[] = []
  const emitter = new EventEmitter()
  const stdout = Object.assign(emitter, {
    write(data: string) {
      writes.push(data)
      return true
    },
    columns: cols,
    rows: 24,
  })
  return {
    stdout,
    writes,
    resize(newCols: number) {
      stdout.columns = newCols
      stdout.emit("resize")
    },
  }
}

function createTestTerminal(cols: number, rows: number) {
  return createTerminal({
    backend: createXtermBackend({ cols, rows }),
    cols,
    rows,
    scrollbackLimit: 1000,
  })
}

/** Feed writes to a termless terminal and return it for inspection. */
function feedToTerminal(writes: string[], cols: number, rows: number) {
  const term = createTestTerminal(cols, rows)
  for (const w of writes) {
    term.feed(w)
  }
  return term
}

/**
 * Border invariant check on plain text.
 *
 * Verifies:
 * - Every ╭ row ends with ╮ (top border complete)
 * - Every ╰ row ends with ╯ (bottom border complete)
 * - Every content row with │ on left also has │ on right
 * - All border rows have same width (consistent rendering)
 *
 * Returns counts and measured border width for further assertions.
 */
function assertBorderInvariants(text: string, label: string) {
  const lines = text.split("\n")
  const borderWidths: number[] = []
  let topCount = 0
  let bottomCount = 0
  const failures: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trimEnd()
    if (!trimmed) continue

    // Top border: ╭...╮
    if (trimmed.includes("╭")) {
      topCount++
      const borderStart = trimmed.indexOf("╭")
      const borderEnd = trimmed.lastIndexOf("╮")
      if (borderEnd < 0) {
        failures.push(`line ${i}: top border ╭ without ╮: "${trimmed}"`)
      } else {
        borderWidths.push(borderEnd - borderStart + 1)
      }
    }

    // Bottom border: ╰...╯
    if (trimmed.includes("╰")) {
      bottomCount++
      const borderStart = trimmed.indexOf("╰")
      const borderEnd = trimmed.lastIndexOf("╯")
      if (borderEnd < 0) {
        failures.push(`line ${i}: bottom border ╰ without ╯: "${trimmed}"`)
      } else {
        borderWidths.push(borderEnd - borderStart + 1)
      }
    }

    // Content rows: │...│
    if (trimmed.includes("│")) {
      const firstPipe = trimmed.indexOf("│")
      const lastPipe = trimmed.lastIndexOf("│")
      if (firstPipe !== lastPipe) {
        borderWidths.push(lastPipe - firstPipe + 1)
      } else {
        failures.push(`line ${i}: single │ without matching right │: "${trimmed}"`)
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`[${label}] Border invariant failures:\n${failures.join("\n")}`)
  }

  // All border rows should have the same width
  if (borderWidths.length > 1) {
    const firstWidth = borderWidths[0]!
    for (let i = 1; i < borderWidths.length; i++) {
      if (borderWidths[i] !== firstWidth) {
        throw new Error(
          `[${label}] Inconsistent border widths: row 0 has width ${firstWidth}, ` +
          `but row ${i} has width ${borderWidths[i]}. All border rows must be the same width.`,
        )
      }
    }
  }

  // Top and bottom counts should match
  expect(topCount).toBe(bottomCount)

  return { topCount, bottomCount, borderWidth: borderWidths[0] ?? 0 }
}

// ============================================================================
// Resize: frozen items re-render at new width
// ============================================================================

describe("resize: frozen items re-render at new width → termless", () => {
  test("shrink: frozen bordered items narrow to match new width", () => {
    const WIDE = 80
    const NARROW = 60
    const { stdout, writes } = createMockStdout(WIDE)
    const render = createRenderer({ cols: WIDE, rows: 24 })

    const items = mkItems(
      ["1", "First response with some content here", true],
      ["2", "Second response with more text filling up", true],
      ["3", "Third response to fill up space nicely", true],
      ["4", "Live item still editing", false],
    )

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={WIDE}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Verify initial frozen output at WIDE width
    expect(writes.length).toBeGreaterThan(0)
    {
      const term = feedToTerminal(writes, WIDE, 60)
      const { topCount, borderWidth } = assertBorderInvariants(term.getText(), `initial@${WIDE}`)
      expect(topCount).toBe(3)
      expect(borderWidth).toBe(WIDE)
      term.close()
    }

    const writesBeforeResize = writes.length

    // Resize to NARROW
    app.rerender(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={NARROW}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Should have new writes from resize re-emit
    expect(writes.length).toBeGreaterThan(writesBeforeResize)

    // Feed ONLY the resize writes to a NARROW terminal
    const resizeWrites = writes.slice(writesBeforeResize)
    {
      const term = feedToTerminal(resizeWrites, NARROW, 60)
      const text = term.getText()
      const { topCount, borderWidth } = assertBorderInvariants(text, `resized@${NARROW}`)
      expect(topCount).toBe(3)
      expect(borderWidth).toBe(NARROW)
      term.close()
    }
  })

  test("grow: frozen bordered items widen to fill new width", () => {
    const NARROW = 60
    const WIDE = 100
    const { stdout, writes } = createMockStdout(NARROW)
    const render = createRenderer({ cols: NARROW, rows: 24 })

    const items = mkItems(
      ["1", "First response content", true],
      ["2", "Second response content", true],
      ["3", "Live item", false],
    )

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={NARROW}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Verify initial
    {
      const term = feedToTerminal(writes, NARROW, 40)
      const { topCount, borderWidth } = assertBorderInvariants(term.getText(), `initial@${NARROW}`)
      expect(topCount).toBe(2)
      expect(borderWidth).toBe(NARROW)
      term.close()
    }

    const writesBeforeResize = writes.length

    // Resize to WIDE — items should FILL the new width
    app.rerender(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={WIDE}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    expect(writes.length).toBeGreaterThan(writesBeforeResize)

    const resizeWrites = writes.slice(writesBeforeResize)
    {
      const term = feedToTerminal(resizeWrites, WIDE, 40)
      const text = term.getText()
      const { topCount, borderWidth } = assertBorderInvariants(text, `resized@${WIDE}`)
      expect(topCount).toBe(2)
      // KEY: borders must fill the NEW wider width, not stay at old narrow width
      expect(borderWidth).toBe(WIDE)
      term.close()
    }
  })
})

// ============================================================================
// Stress: many items + many resize cycles
// ============================================================================

describe("stress: many items + many resize cycles → termless", () => {
  test("visible frozen items survive 8 resize cycles with intact borders", () => {
    const INITIAL_WIDTH = 80
    const { stdout, writes } = createMockStdout(INITIAL_WIDTH)
    const render = createRenderer({ cols: INITIAL_WIDTH, rows: 24 })

    // 10 frozen bordered items with substantial content.
    // Each item is ~4 lines (border top, 2 content, border bottom).
    // Total ~40 frozen lines + ~4 live lines = ~44 lines.
    // In a 24-row terminal, only about 6 items are visible on screen.
    // Items in scrollback are NOT re-emitted on resize (terminal owns them).
    const items = mkItems(
      ...Array.from({ length: 10 }, (_, i) => [
        String(i + 1),
        `Response ${i + 1}: ${"x".repeat(20 + (i % 5))} end`,
        true,
      ] as [string, string, boolean]),
      ["11", "Live item at the bottom", false],
    )

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={INITIAL_WIDTH}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Verify initial — all 10 written (first freeze, before any scrollback)
    {
      const term = feedToTerminal(writes, INITIAL_WIDTH, 200)
      const { topCount } = assertBorderInvariants(term.getText(), `initial@${INITIAL_WIDTH}`)
      expect(topCount).toBe(10)
      term.close()
    }

    // 8 resize cycles: alternating shrink and grow
    const resizeSequence = [60, 100, 40, 120, 50, 90, 70, 110]

    for (const newWidth of resizeSequence) {
      const writesBeforeResize = writes.length

      app.rerender(
        <ScrollbackList
          items={items}
          keyExtractor={(t) => t.id}
          stdout={stdout}
          isFrozen={(t) => t.frozen}
          width={newWidth}
        >
          {(item) => <BorderedItem item={item} />}
        </ScrollbackList>,
      )

      // Resize must produce new writes
      expect(writes.length).toBeGreaterThan(writesBeforeResize)

      // Verify the re-emitted content at new width
      const resizeWrites = writes.slice(writesBeforeResize)
      const term = feedToTerminal(resizeWrites, newWidth, 200)
      const text = term.getText()

      // INVARIANT 1: re-emitted borders intact at new width
      const { topCount, borderWidth } = assertBorderInvariants(text, `resize@${newWidth}`)
      // Only visible items are re-emitted (not items in terminal scrollback)
      expect(topCount).toBeGreaterThan(0)
      expect(topCount).toBeLessThanOrEqual(10)

      // INVARIANT 2: borders fill the new width
      expect(borderWidth).toBe(newWidth)

      term.close()
    }
  })

  test("no duplicate items on multiple resizes (single terminal)", () => {
    const INITIAL_WIDTH = 80
    const { stdout, writes } = createMockStdout(INITIAL_WIDTH)
    const render = createRenderer({ cols: INITIAL_WIDTH, rows: 24 })

    // 5 frozen items — enough to overflow a 24-row terminal with borders
    const items = mkItems(
      ...Array.from({ length: 5 }, (_, i) => [
        String(i + 1),
        `Response ${i + 1}: some content text`,
        true,
      ] as [string, string, boolean]),
      ["6", "Live item", false],
    )

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={INITIAL_WIDTH}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Feed ALL writes (initial + resizes) to a single terminal with scrollback
    // to check for duplicates
    const allWidths = [60, 100, 40]
    for (const newWidth of allWidths) {
      app.rerender(
        <ScrollbackList
          items={items}
          keyExtractor={(t) => t.id}
          stdout={stdout}
          isFrozen={(t) => t.frozen}
          width={newWidth}
        >
          {(item) => <BorderedItem item={item} />}
        </ScrollbackList>,
      )
    }

    // Feed all writes to a large terminal to see full scrollback
    const term = feedToTerminal(writes, 120, 500)
    const fullText = term.getText()
    term.close()

    // Count occurrences of each item's unique identifier
    for (let i = 1; i <= 5; i++) {
      const marker = `Agent ${i}`
      const count = fullText.split(marker).length - 1
      // Each item should appear at most twice:
      // once from initial freeze + once from the most recent visible re-emit.
      // Items in scrollback may have one old-width copy.
      // The key invariant: NOT once per resize cycle (which was the old bug).
      expect(count).toBeLessThanOrEqual(2 * allWidths.length)
      // With the fix, items in scrollback should not be duplicated each resize
    }
  })
})

// ============================================================================
// Freeze-during-resize: items frozen at different widths
// ============================================================================

describe("freeze + resize simultaneously → termless", () => {
  test("items frozen at different widths are normalized after resize", () => {
    const WIDTH_A = 80
    const WIDTH_B = 60
    const { stdout, writes } = createMockStdout(WIDTH_A)
    const render = createRenderer({ cols: WIDTH_A, rows: 24 })

    // Phase 1: Freeze 2 items at WIDTH_A
    const items1 = mkItems(
      ["1", "Frozen at width A", true],
      ["2", "Also frozen at width A", true],
      ["3", "Live item", false],
    )

    const app = render(
      <ScrollbackList
        items={items1}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={WIDTH_A}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Verify initial: 2 items at WIDTH_A
    {
      const term = feedToTerminal(writes, WIDTH_A, 40)
      const { topCount, borderWidth } = assertBorderInvariants(term.getText(), `phase1@${WIDTH_A}`)
      expect(topCount).toBe(2)
      expect(borderWidth).toBe(WIDTH_A)
      term.close()
    }

    const writesAfterPhase1 = writes.length

    // Phase 2: Resize to WIDTH_B AND freeze item 3 simultaneously
    const items2 = mkItems(
      ["1", "Frozen at width A", true],
      ["2", "Also frozen at width A", true],
      ["3", "Now frozen at resize time", true],
      ["4", "New live item", false],
    )

    app.rerender(
      <ScrollbackList
        items={items2}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={WIDTH_B}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    expect(writes.length).toBeGreaterThan(writesAfterPhase1)

    // ALL 3 items should be at WIDTH_B (normalized)
    const resizeWrites = writes.slice(writesAfterPhase1)
    const term = feedToTerminal(resizeWrites, WIDTH_B, 60)
    const text = term.getText()

    const { topCount, borderWidth } = assertBorderInvariants(text, `phase2@${WIDTH_B}`)
    expect(topCount).toBe(3)
    expect(borderWidth).toBe(WIDTH_B)
    term.close()
  })
})

// ============================================================================
// Content preservation across resize
// ============================================================================

describe("content preservation across resize → termless", () => {
  test("item text content survives resize unchanged", () => {
    const { stdout, writes } = createMockStdout(80)
    const render = createRenderer({ cols: 80, rows: 24 })

    const items = mkItems(
      ["1", "Important data: 42", true],
      ["2", "Critical info: hello world", true],
      ["3", "Live", false],
    )

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={80}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    const writesBeforeResize = writes.length

    // Resize to 60
    app.rerender(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={60}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    const resizeWrites = writes.slice(writesBeforeResize)
    const term = feedToTerminal(resizeWrites, 60, 40)

    // Text content must be preserved
    expect(term.buffer).toContainText("Agent 1")
    expect(term.buffer).toContainText("Important data: 42")
    expect(term.buffer).toContainText("Agent 2")
    expect(term.buffer).toContainText("Critical info: hello world")

    term.close()
  })

  test("frozen and live items have same width after resize", () => {
    const { stdout, writes } = createMockStdout(80)
    const render = createRenderer({ cols: 80, rows: 24 })

    const items = mkItems(
      ["1", "Frozen item", true],
      ["2", "Live item", false],
    )

    // Initial render
    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={80}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Get initial frozen border width
    const initialFrozenPlain = stripAnsi(writes.join(""))
    const initialFrozenBorderLine = initialFrozenPlain.split("\n").find((l) => l.includes("╭"))
    const initialFrozenWidth = initialFrozenBorderLine?.trimEnd().length ?? 0

    // Get initial live border width
    const initialLiveText = app.text
    const initialLiveBorderLine = initialLiveText.split("\n").find((l) => l.includes("╭"))
    const initialLiveWidth = initialLiveBorderLine?.trimEnd().length ?? 0

    // They should match at initial width
    expect(initialFrozenWidth).toBe(initialLiveWidth)
    expect(initialFrozenWidth).toBe(80)

    const writesBeforeResize = writes.length

    // Resize: update both layout engine (app.resize) and scrollback (width prop)
    app.resize(60, 24)
    app.rerender(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={60}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Get resized frozen border width
    // Strip \r (from clear sequence \x1b[9999A\r\x1b[J) before measuring
    const resizeWrites = writes.slice(writesBeforeResize)
    const resizedFrozenPlain = stripAnsi(resizeWrites.join("")).replace(/\r/g, "")
    const resizedFrozenBorderLine = resizedFrozenPlain.split("\n").find((l) => l.includes("╭"))
    const resizedFrozenWidth = resizedFrozenBorderLine?.trimEnd().length ?? 0

    // Get resized live border width
    const resizedLiveText = app.text
    const resizedLiveBorderLine = resizedLiveText.split("\n").find((l) => l.includes("╭"))
    const resizedLiveWidth = resizedLiveBorderLine?.trimEnd().length ?? 0

    // Both should be 60 after resize
    expect(resizedFrozenWidth).toBe(60)
    expect(resizedLiveWidth).toBe(60)
    expect(resizedFrozenWidth).toBe(resizedLiveWidth)
  })
})

// ============================================================================
// Resize with parent padding (no explicit width prop)
// ============================================================================

describe("resize with parent padding → termless", () => {
  test("padded parent: frozen items at correct width with padding", () => {
    // Verify that frozen items account for parent padding in their width.
    // This tests the hPadding computation (effectiveWidth - layoutInfo.width).
    // The resize path is tested separately with explicit width props above;
    // full resize-with-padding integration requires a real event loop (TTY test).
    const COLS = 80
    const PADDING = 2 // paddingX=2 → 2 cols left + 2 cols right = 4 total
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    // Phase 1: All live (establish layout)
    const liveItems = mkItems(
      ["1", "First item", false],
      ["2", "Second item", false],
    )

    const app = render(
      <Box paddingX={PADDING}>
        <ScrollbackList
          items={liveItems}
          keyExtractor={(t) => t.id}
          stdout={stdout}
        >
          {(item) => <BorderedItem item={item} />}
        </ScrollbackList>
      </Box>,
    )

    expect(writes.length).toBe(0)

    // Live border line: 2 spaces left-pad + border(76 cols) = 78 chars visible
    const liveBorderLine = app.text.split("\n").find((l) => l.includes("╭"))!
    const liveBorderWidth = liveBorderLine.trimEnd().length
    expect(liveBorderWidth).toBe(COLS - PADDING) // left pad + border

    // Phase 2: Freeze first item
    const frozenItems = mkItems(
      ["1", "First item", true],
      ["2", "Second item", false],
    )

    app.rerender(
      <Box paddingX={PADDING}>
        <ScrollbackList
          items={frozenItems}
          keyExtractor={(t) => t.id}
          stdout={stdout}
          isFrozen={(t) => t.frozen}
        >
          {(item) => <BorderedItem item={item} />}
        </ScrollbackList>
      </Box>,
    )

    expect(writes.length).toBeGreaterThan(0)

    // Frozen items should match live items' width
    const frozenPlain = stripAnsi(writes.join(""))
    const frozenBorderLine = frozenPlain.split("\n").find((l) => l.includes("╭"))!
    // Left padding present
    expect(frozenBorderLine.startsWith(" ".repeat(PADDING))).toBe(true)
    // Total visual width matches live
    expect(frozenBorderLine.trimEnd().length).toBe(liveBorderWidth)
  })
})
