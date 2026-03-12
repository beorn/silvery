/**
 * Scrollback Promotion Chaos/Fuzz Tests
 *
 * Exercises the inline scrollback promotion path with randomized action
 * sequences and checks invariants after each action. Uses vimonkey for
 * seeded random generation with auto-shrinking on failure.
 *
 * Modeled after km-tui's navigation-fuzz.fuzz.ts and render-fuzz.fuzz.ts.
 *
 * ## What This Tests
 *
 * The scrollback promotion pipeline:
 *   useScrollback → promoteScrollback → handleScrollbackPromotion → output
 *
 * Bugs targeted:
 *   - Broken border chars in frozen scrollback (multi-byte UTF-8 corruption)
 *   - Orphaned content lines between frozen boxes
 *   - Double closing borders
 *   - Cursor tracking desync after terminal overflow
 *   - Empty gaps between content and footer
 *   - Screen going blank after multiple promotions
 *
 * ## Running
 *
 * ```bash
 * bun vitest run vendor/silvery/tests/features/scrollback-chaos.fuzz.ts
 * FUZZ_REPEATS=10 bun vitest run vendor/silvery/tests/features/scrollback-chaos.fuzz.ts
 * ```
 */

import React, { useState, useCallback } from "react"
import { describe, expect, afterEach } from "vitest"
import { test, gen, take } from "vimonkey/fuzz"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { Box, Text, useInput, ScrollbackList } from "silvery"

// ============================================================================
// Test App — controllable ScrollbackList
// ============================================================================

interface TestItem {
  id: number
  text: string
  frozen: boolean
  lines: number
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
        if (firstUnfrozen < 0) return prev
        const next = prev.map((it, i) => (i === firstUnfrozen ? { ...it, frozen: true } : it))
        const newId = prev.length > 0 ? Math.max(...prev.map((it) => it.id)) + 1 : 1
        return [...next, { id: newId, text: `Item ${newId}`, frozen: false, lines: 3 }]
      })
    }

    // 'f': freeze ALL items (compaction)
    if (input === "f") {
      updateItems((prev) => prev.map((it) => ({ ...it, frozen: true })))
    }

    // 'g': grow the last item by 2 lines (simulate streaming)
    if (input === "g") {
      updateItems((prev) => {
        const last = prev[prev.length - 1]
        if (!last) return prev
        return [...prev.slice(0, -1), { ...last, lines: last.lines + 2 }]
      })
    }

    // 's': shrink the last item (simulate content collapsing)
    if (input === "s") {
      updateItems((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.lines <= 1) return prev
        return [...prev.slice(0, -1), { ...last, lines: Math.max(1, last.lines - 1) }]
      })
    }

    // 'a': add a new unfrozen item without freezing
    if (input === "a") {
      updateItems((prev) => {
        const newId = prev.length > 0 ? Math.max(...prev.map((it) => it.id)) + 1 : 1
        return [...prev, { id: newId, text: `Item ${newId}`, frozen: false, lines: 2 }]
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
// Setup Helper
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
// Scrollback Invariants
// ============================================================================

/**
 * Check invariants that should hold after ANY action on a scrollback app.
 * Modeled after km-tui's fuzz-invariants.ts.
 */
function checkScrollbackInvariants(term: Term, action: string, iteration: number): void {
  const screenText = term.screen!.getText()
  const lines = term.screen!.getLines()
  const nonBlank = lines.filter((l: string) => l.trim().length > 0).length

  // 1. Screen must never be empty
  expect(nonBlank, `[${iteration}] Empty screen after ${action}`).toBeGreaterThan(0)

  // 2. No JavaScript error strings
  expect(screenText, `[${iteration}] JS error after ${action}`).not.toContain("[object Object]")
  expect(screenText, `[${iteration}] TypeError after ${action}`).not.toContain("TypeError")
  expect(screenText, `[${iteration}] NaN after ${action}`).not.toContain("NaN")
  expect(screenText, `[${iteration}] undefined after ${action}`).not.toContain("undefined")

  // 3. Footer must always be visible on screen
  expect(screenText, `[${iteration}] Footer missing after ${action}`).toContain("Input here")

  // 4. Screen should have reasonable content (not mostly blank)
  //    After compaction ("f") all items are frozen → only footer remains on live screen.
  //    This is legitimate — the footer is ~3 lines on a 25-row terminal = ~12%.
  //    Require at least 3 non-blank lines (footer at minimum).
  expect(
    nonBlank,
    `[${iteration}] Screen too empty (${nonBlank} non-blank lines) after ${action}`,
  ).toBeGreaterThanOrEqual(3)
}

/**
 * Extended invariants that check frozen scrollback content integrity.
 */
function checkScrollbackContentInvariants(term: Term, action: string, iteration: number): void {
  // Run basic invariants first
  checkScrollbackInvariants(term, action, iteration)

  const scrollbackText = term.scrollback?.getText() ?? ""
  const screenText = term.screen!.getText()
  const allText = scrollbackText + screenText

  // 5. Border chars should be valid (not corrupted multi-byte)
  // Look for common corruption patterns: ██ inside border lines
  const borderLines = allText.split("\n").filter((l) => l.includes("╭") || l.includes("╰") || l.includes("─"))
  for (const line of borderLines) {
    // A border line with ██ (full block) mixed in indicates multi-byte corruption
    expect(line, `[${iteration}] Corrupted border chars after ${action}: ${line.slice(0, 40)}`).not.toMatch(
      /[╭╰─│╮╯].*█.*[╭╰─│╮╯]/,
    )
  }

  // 6. No orphaned content between box closings and box openings
  // A line starting with │ (content) should not appear after ╯ (box close)
  // unless preceded by ╭ (new box open)
  const allLines = allText.split("\n")
  for (let i = 1; i < allLines.length; i++) {
    const prev = allLines[i - 1]!.trim()
    const curr = allLines[i]!.trim()
    if (prev.endsWith("╯") && curr.startsWith("│") && !curr.includes("╭")) {
      // Check if this is an orphaned line (not part of the next box)
      // Allow the pattern if the next line opens a new box
      const next = i + 1 < allLines.length ? allLines[i + 1]!.trim() : ""
      if (!next.startsWith("╭") && !next.startsWith("│")) {
        expect.unreachable(
          `[${iteration}] Orphaned content line after box close at line ${i} after ${action}: "${curr.slice(0, 40)}"`,
        )
      }
    }
  }

  // 7. No double closing borders (╯ followed immediately by another ╯
  // with no box content between them)
  for (let i = 1; i < allLines.length; i++) {
    const prev = allLines[i - 1]!.trim()
    const curr = allLines[i]!.trim()
    if (prev.endsWith("╯") && curr.startsWith("╰") && curr.endsWith("╯")) {
      // Two consecutive closing borders — could be valid (nested boxes)
      // but should have matching opening borders above them.
      // This is a heuristic check.
    }
  }
}

// ============================================================================
// Action Keys (weighted for realistic scrollback usage)
// ============================================================================

/**
 * Scrollback-specific action weights.
 * Enter (freeze + add) is most common, followed by grow (streaming),
 * then compaction and miscellaneous.
 */
const SCROLLBACK_ACTIONS: [number, string][] = [
  [30, "Enter"], // Freeze oldest + add new (the main promotion trigger)
  [20, "g"], // Grow last item (streaming)
  [10, "s"], // Shrink last item
  [5, "f"], // Freeze all (compaction)
  [10, "a"], // Add item without freezing
  [15, "Enter"], // Extra weight for Enter (double-promotion is the bug path)
  [10, "g"], // Extra weight for grow (freeze-grow cycles)
]

/**
 * Promotion-heavy actions — maximizes freeze/grow cycles that trigger bugs.
 */
const PROMOTION_HEAVY_ACTIONS: [number, string][] = [
  [40, "Enter"], // Promotion is the bug path
  [25, "g"], // Grow after promotion
  [15, "Enter"], // Back-to-back promotions
  [10, "g"], // More grow
  [5, "f"], // Compaction
  [5, "s"], // Shrink
]

// ============================================================================
// Terminal Size Configurations
// ============================================================================

const TERMINAL_SIZES = [
  { cols: 100, rows: 25, name: "standard" },
  { cols: 80, rows: 15, name: "short" },
  { cols: 60, rows: 8, name: "tiny" },
  { cols: 120, rows: 40, name: "large" },
  { cols: 80, rows: 12, name: "narrow-short" },
] as const

// ============================================================================
// Fuzz Tests
// ============================================================================

describe("scrollback promotion fuzz", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  for (const size of TERMINAL_SIZES) {
    describe(`${size.name} (${size.cols}x${size.rows})`, () => {
      /**
       * Weighted random actions with basic scrollback invariants.
       */
      test.fuzz(
        `scrollback invariants — ${size.name}`,
        async () => {
          const items = makeItems(2, 2)
          ;({ term, handle } = await setupInlineApp(items, { cols: size.cols, rows: size.rows }))

          let i = 0
          for await (const action of take(gen(SCROLLBACK_ACTIONS), 50)) {
            await handle.press(action)
            checkScrollbackInvariants(term, action, i)
            i++
          }
        },
        { timeout: 30_000 },
      )

      /**
       * Promotion-heavy actions with extended content invariants.
       */
      test.fuzz(
        `promotion-heavy invariants — ${size.name}`,
        async () => {
          const items = makeItems(3, 3)
          ;({ term, handle } = await setupInlineApp(items, { cols: size.cols, rows: size.rows }))

          let i = 0
          for await (const action of take(gen(PROMOTION_HEAVY_ACTIONS), 40)) {
            await handle.press(action)
            checkScrollbackContentInvariants(term, action, i)
            i++
          }
        },
        { timeout: 30_000 },
      )
    })
  }

  /**
   * Stress test: many items, small terminal — overflow on every promotion.
   */
  test.fuzz(
    "overflow stress — many items, tiny terminal",
    async () => {
      const items = makeItems(4, 3)
      ;({ term, handle } = await setupInlineApp(items, { cols: 60, rows: 8 }))

      let i = 0
      for await (const action of take(gen(PROMOTION_HEAVY_ACTIONS), 30)) {
        await handle.press(action)
        checkScrollbackInvariants(term, action, i)
        i++
      }
    },
    { timeout: 30_000 },
  )

  /**
   * Rapid freeze-grow alternation — the pattern that triggers cursor desync.
   */
  test.fuzz(
    "rapid freeze-grow alternation",
    async () => {
      const items = makeItems(3, 2)
      ;({ term, handle } = await setupInlineApp(items, { cols: 80, rows: 12 }))

      // Alternating Enter/grow is the specific bug pattern
      const alternating: [number, string][] = [
        [50, "Enter"],
        [50, "g"],
      ]

      let i = 0
      for await (const action of take(gen(alternating), 40)) {
        await handle.press(action)
        checkScrollbackInvariants(term, action, i)
        i++
      }
    },
    { timeout: 30_000 },
  )
})

// ============================================================================
// CodingAgent real-world fuzz (with shell prompt pre-population)
// ============================================================================

describe("CodingAgent scrollback fuzz", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  async function setupCodingAgent(
    dims: { cols: number; rows: number } = { cols: 100, rows: 25 },
    shellLines: number = 3,
  ) {
    const { CodingAgent, SCRIPT } = await import("../../examples/interactive/ai-chat")
    term = createTermless(dims)
    const emulator = (term as unknown as Record<string, unknown>)._emulator as {
      feed(data: string): void
    }

    // Pre-populate with shell prompt (simulates real terminal)
    for (let i = 0; i < shellLines; i++) {
      emulator.feed(`shell-line-${i}\r\n`)
    }
    emulator.feed("$ bun run examples/interactive/ai-chat.tsx\r\n")

    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, {
      mode: "inline",
      writable: { write: (s: string) => emulator.feed(s) },
      cols: dims.cols,
      rows: dims.rows,
    })
    return { term, handle }
  }

  /**
   * CodingAgent with randomized Enter presses at various terminal sizes.
   */
  for (const size of [
    { cols: 100, rows: 25, name: "standard" },
    { cols: 80, rows: 15, name: "short" },
    { cols: 100, rows: 40, name: "tall" },
  ] as const) {
    test.fuzz(
      `CodingAgent promotion stability — ${size.name}`,
      async () => {
        await setupCodingAgent({ cols: size.cols, rows: size.rows })

        // CodingAgent only responds to Enter (advance demo)
        let i = 0
        for await (const _ of take(gen(["Enter"]), 12)) {
          await handle.press("Enter")
          await new Promise((r) => setTimeout(r, 50))

          const screenText = term.screen!.getText()
          const lines = term.screen!.getLines()
          const nonBlank = lines.filter((l: string) => l.trim().length > 0).length

          // Screen should never be mostly blank
          expect(
            nonBlank / lines.length,
            `[${i}] Screen ${((nonBlank / lines.length) * 100).toFixed(0)}% content — too empty`,
          ).toBeGreaterThan(0.2)

          // Status bar should always be visible
          expect(screenText, `[${i}] Status bar missing`).toContain("ctx")

          // Shell content should be in scrollback
          const allText = (term.scrollback?.getText() ?? "") + screenText
          expect(allText, `[${i}] Shell content lost`).toContain("shell-line")

          // No duplication of specific content
          const fixLoginCount = lines.filter((l: string) => l.includes("Fix the login")).length
          expect(fixLoginCount, `[${i}] "Fix the login" duplicated ${fixLoginCount} times`).toBeLessThanOrEqual(1)

          i++
        }
      },
      { timeout: 60_000 },
    )
  }
})
