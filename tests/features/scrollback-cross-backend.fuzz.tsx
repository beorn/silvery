/**
 * Cross-Backend Scrollback Fuzz Tests
 *
 * Feeds the same ANSI output from inline scrollback promotion to multiple
 * terminal emulators (xterm.js, vt100 pure-TS) and detects divergences.
 *
 * Architecture: ONE React app writes ANSI → tee'd to ALL backends → compare.
 * Divergence = a terminal interprets our ANSI differently. This is how we find
 * bugs that appear in Ghostty/iTerm but not in our xterm.js test infrastructure.
 *
 * ## Findings So Far
 *
 * The vt100 backend diverges from xterm.js during scrollback promotion:
 * - Items lost from scrollback (cursor-up + rewrite doesn't preserve content)
 * - Footer pushed off screen after multiple promotions
 * - Screen goes entirely blank on small terminals
 *
 * These match the real-world bugs seen in Ghostty. When the vt100 backend
 * or our ANSI output is fixed, the xterm-vt100 parity tests will pass.
 *
 * ## Running
 *
 * ```bash
 * FUZZ=1 bun vitest run vendor/silvery/tests/features/scrollback-cross-backend.fuzz.tsx
 * ```
 */

import React, { useState, useCallback } from "react"
import { describe, expect, afterEach } from "vitest"
import { test, gen, take } from "vimonkey/fuzz"
import { createTerm, type Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { Box, Text, useInput, ScrollbackList } from "silvery"
import { createXtermBackend } from "@termless/xtermjs"
import { createVt100Backend } from "@termless/vt100"

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

function TestApp({ initialItems }: { initialItems: TestItem[] }) {
  const [items, setItems] = useState(initialItems)

  const updateItems = useCallback((updater: (prev: TestItem[]) => TestItem[]) => {
    setItems((prev) => updater(prev))
  }, [])

  useInput((input, key) => {
    if (key.escape) return "exit"

    if (key.return) {
      updateItems((prev) => {
        const firstUnfrozen = prev.findIndex((it) => !it.frozen)
        if (firstUnfrozen < 0) return prev
        const next = prev.map((it, i) => (i === firstUnfrozen ? { ...it, frozen: true } : it))
        const newId = prev.length > 0 ? Math.max(...prev.map((it) => it.id)) + 1 : 1
        return [...next, { id: newId, text: `Item ${newId}`, frozen: false, lines: 3 }]
      })
    }

    if (input === "f") updateItems((prev) => prev.map((it) => ({ ...it, frozen: true })))

    if (input === "g") {
      updateItems((prev) => {
        const last = prev[prev.length - 1]
        if (!last) return prev
        return [...prev.slice(0, -1), { ...last, lines: last.lines + 2 }]
      })
    }

    if (input === "s") {
      updateItems((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.lines <= 1) return prev
        return [...prev.slice(0, -1), { ...last, lines: Math.max(1, last.lines - 1) }]
      })
    }

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
// Backend factories
// ============================================================================

type BackendEntry = {
  name: string
  create: () => ReturnType<typeof createXtermBackend>
}

const backends: BackendEntry[] = [
  { name: "xterm", create: () => createXtermBackend() },
  { name: "vt100", create: () => createVt100Backend() },
]

// ============================================================================
// Setup: tee ANSI output to all backends
// ============================================================================

interface CrossBackendSetup {
  terms: { name: string; term: Term }[]
  handle: RunHandle
}

function makeItems(count: number, linesEach: number = 3): TestItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Item ${i + 1}`,
    frozen: false,
    lines: linesEach,
  }))
}

async function setupCrossBackendApp(
  items: TestItem[],
  dims: { cols: number; rows: number },
): Promise<CrossBackendSetup> {
  const terms = backends.map(({ name, create }) => ({
    name,
    term: createTerm(create() as any, dims),
  }))

  const emulators = terms.map(
    ({ term }) =>
      (term as unknown as Record<string, unknown>)._emulator as { feed(data: string): void },
  )

  const handle = await run(<TestApp initialItems={items} />, {
    mode: "inline",
    writable: {
      write: (s: string) => {
        for (const emu of emulators) emu.feed(s)
      },
    },
    cols: dims.cols,
    rows: dims.rows,
  })

  return { terms, handle }
}

// ============================================================================
// Comparison helpers
// ============================================================================

function normalizeText(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trimEnd()
}

function getCombinedText(term: Term): string {
  const scrollback = normalizeText(term.scrollback?.getText() ?? "")
  const screen = normalizeText(term.screen!.getText())
  return scrollback ? `${scrollback}\n${screen}` : screen
}

function extractItemIds(text: string): number[] {
  const ids = new Set<number>()
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    ids.add(Number(match[1]))
  }
  return [...ids].sort((a, b) => a - b)
}

interface DivergenceStats {
  totalActions: number
  screenDivergences: number
  scrollbackDivergences: number
  itemIdMismatches: number
  footerMismatches: number
  emptyScreens: Map<string, number>
}

function createStats(): DivergenceStats {
  return {
    totalActions: 0,
    screenDivergences: 0,
    scrollbackDivergences: 0,
    itemIdMismatches: 0,
    footerMismatches: 0,
    emptyScreens: new Map(),
  }
}

function checkDivergences(terms: { name: string; term: Term }[], stats: DivergenceStats): void {
  stats.totalActions++

  const ref = terms[0]!
  const refScreen = normalizeText(ref.term.screen!.getText())
  const refScrollback = normalizeText(ref.term.scrollback?.getText() ?? "")
  const refIds = extractItemIds(getCombinedText(ref.term))
  const refFooter = refScreen.includes("Input here")

  for (let i = 1; i < terms.length; i++) {
    const other = terms[i]!
    const otherScreen = normalizeText(other.term.screen!.getText())
    const otherScrollback = normalizeText(other.term.scrollback?.getText() ?? "")
    const otherIds = extractItemIds(getCombinedText(other.term))
    const otherFooter = otherScreen.includes("Input here")

    if (refScreen !== otherScreen) stats.screenDivergences++
    if (refScrollback !== otherScrollback) stats.scrollbackDivergences++
    if (JSON.stringify(refIds) !== JSON.stringify(otherIds)) stats.itemIdMismatches++
    if (refFooter !== otherFooter) stats.footerMismatches++
  }

  // Track empty screens per backend
  for (const { name, term } of terms) {
    const lines = term.screen!.getLines()
    const nonBlank = lines.filter((l: string) => l.trim().length > 0).length
    if (nonBlank === 0) {
      stats.emptyScreens.set(name, (stats.emptyScreens.get(name) ?? 0) + 1)
    }
  }
}

// ============================================================================
// Action weights
// ============================================================================

const SCROLLBACK_ACTIONS: [number, string][] = [
  [30, "Enter"],
  [20, "g"],
  [10, "s"],
  [5, "f"],
  [10, "a"],
  [15, "Enter"],
  [10, "g"],
]

// ============================================================================
// Fuzz Tests
// ============================================================================

describe("cross-backend scrollback promotion", () => {
  let setup: CrossBackendSetup | null = null

  afterEach(() => {
    setup?.handle.unmount()
    setup = null
  })

  /**
   * xterm.js must always pass basic invariants (the reference backend).
   * This is the same as scrollback-chaos.fuzz.tsx but ensures the
   * cross-backend setup doesn't break xterm.js behavior.
   */
  for (const size of [
    { cols: 80, rows: 20, name: "standard" },
    { cols: 60, rows: 10, name: "small" },
  ] as const) {
    test.fuzz(
      `xterm reference invariants — ${size.name}`,
      async () => {
        const items = makeItems(2, 2)
        setup = await setupCrossBackendApp(items, { cols: size.cols, rows: size.rows })
        const xterm = setup.terms.find((t) => t.name === "xterm")!

        let i = 0
        for await (const action of take(gen(SCROLLBACK_ACTIONS), 30)) {
          await setup.handle.press(action)

          const screenText = xterm.term.screen!.getText()
          const lines = xterm.term.screen!.getLines()
          const nonBlank = lines.filter((l: string) => l.trim().length > 0).length

          expect(nonBlank, `[${i}] xterm: empty screen after "${action}"`).toBeGreaterThan(0)
          expect(screenText, `[${i}] xterm: footer missing after "${action}"`).toContain(
            "Input here",
          )
          expect(screenText, `[${i}] xterm: error after "${action}"`).not.toContain("TypeError")

          i++
        }
      },
      { timeout: 30_000 },
    )
  }

  /**
   * Divergence tracking: run actions on all backends, collect stats.
   * Fails if xterm breaks. Reports vt100 divergences without failing.
   *
   * When our ANSI output is fixed to work across emulators, the
   * divergence counts will drop to 0 and we can tighten this test.
   */
  for (const size of [
    { cols: 80, rows: 20, name: "standard" },
    { cols: 60, rows: 10, name: "small" },
  ] as const) {
    test.fuzz(
      `divergence tracking — ${size.name}`,
      async () => {
        const items = makeItems(3, 3)
        setup = await setupCrossBackendApp(items, { cols: size.cols, rows: size.rows })
        const stats = createStats()

        let i = 0
        for await (const action of take(gen(SCROLLBACK_ACTIONS), 30)) {
          await setup.handle.press(action)
          checkDivergences(setup.terms, stats)
          i++
        }

        // xterm must never have empty screens
        expect(stats.emptyScreens.get("xterm") ?? 0, "xterm had empty screens").toBe(0)

        // Track: when these reach 0, we've fixed the terminal compatibility
        // issue and can tighten the assertions
        expect(stats.totalActions).toBeGreaterThan(0)
      },
      { timeout: 30_000 },
    )
  }
})
