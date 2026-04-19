/**
 * Termless coverage — fills gaps in the silvery test suite for:
 *
 * 1. Terminal resize + reflow through real emulator (not just createRenderer)
 * 2. Inline mode output phase verification through termless
 * 3. ScrollbackList freeze/promote cycle with cell-level border verification
 *
 * Uses createTermless() from @silvery/test for in-process terminal emulation.
 * Every test renders React components through the full pipeline (layout, content,
 * output) into a real xterm.js emulator, then asserts on screen/scrollback state.
 */

import React, { useState } from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/ag-term/src/ansi/term"
import { run, useInput, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { Box, Text, ListView } from "../../src/index"

// ============================================================================
// Test Components
// ============================================================================

/** Renders a list of labeled rows to fill the terminal. */
function RowListApp({ count }: { count: number }) {
  const [n, setN] = useState(count)

  useInput((input) => {
    if (input === "a") setN((c) => c + 5)
    if (input === "d") setN((c) => Math.max(1, c - 5))
    if (input === "q") return "exit"
  })

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Items ({n})</Text>
      {Array.from({ length: n }, (_, i) => (
        <Text key={i}>
          Row {i}: {"content-".repeat(4)}
          {i}
        </Text>
      ))}
    </Box>
  )
}

/** Multi-column layout that reflows on resize. */
function MultiColumnApp() {
  return (
    <Box flexDirection="row" width="100%">
      <Box flexDirection="column" borderStyle="round" width="50%" paddingX={1}>
        <Text bold>Left Column</Text>
        <Text>Alpha item here</Text>
        <Text>Beta item here</Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" width="50%" paddingX={1}>
        <Text bold>Right Column</Text>
        <Text>Gamma item here</Text>
        <Text>Delta item here</Text>
      </Box>
    </Box>
  )
}

/** ListView with cache for freeze/promote testing. */
interface FreezeItem {
  id: number
  text: string
  frozen: boolean
}

function FreezePromoteApp({ initialItems }: { initialItems: FreezeItem[] }) {
  const [items, setItems] = useState(initialItems)

  useInput((input, key) => {
    if (key.escape) return "exit"

    // Enter: freeze oldest unfrozen + add new item
    if (key.return) {
      setItems((prev) => {
        const firstUnfrozen = prev.findIndex((it: FreezeItem) => !it.frozen)
        if (firstUnfrozen < 0) return prev
        const next = prev.map((it: FreezeItem, i: number) =>
          i === firstUnfrozen ? { ...it, frozen: true } : it,
        )
        const newId = prev.length > 0 ? Math.max(...prev.map((it: FreezeItem) => it.id)) + 1 : 1
        return [...next, { id: newId, text: `Item ${newId}`, frozen: false }]
      })
    }
  })

  return (
    <Box flexDirection="column">
      <ListView
        items={items}
        height={20}
        getKey={(it: FreezeItem) => it.id}
        cache={{ mode: "auto", isCacheable: (it: FreezeItem) => it.frozen }}
        renderItem={(item: FreezeItem) => (
          <Box flexDirection="column" borderStyle="round" borderColor="$border" paddingX={1}>
            <Text>
              [{item.id}] {item.text}
            </Text>
          </Box>
        )}
      />
      <Box borderStyle="round" borderColor="$primary" paddingX={1}>
        <Text>{">"} Input area</Text>
      </Box>
    </Box>
  )
}

const settle = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms))

// ============================================================================
// 1. Terminal Resize + Reflow
// ============================================================================

describe("termless: resize + reflow", () => {
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("resize wider: content and borders stretch to new width", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    handle = await run(<MultiColumnApp />, term)

    // Verify initial layout at 40 cols
    expect(term.screen).toContainText("Left Column")
    expect(term.screen).toContainText("Right Column")
    const initialLines = term.screen!.getLines()
    const initialTopBorder = initialLines.find((l: string) => l.includes("╭"))!

    // Resize to 80 cols
    term.resize!(80, 10)
    await settle()

    expect(term.screen).toContainText("Left Column")
    expect(term.screen).toContainText("Right Column")
    const resizedLines = term.screen!.getLines()
    const resizedTopBorder = resizedLines.find((l: string) => l.includes("╭"))!

    // Borders should be wider
    expect(resizedTopBorder.length).toBeGreaterThan(initialTopBorder.length)
  })

  test("resize narrower: content reflows without truncation of visible text", async () => {
    using term = createTermless({ cols: 80, rows: 15 })
    handle = await run(<MultiColumnApp />, term)

    expect(term.screen).toContainText("Alpha item here")
    expect(term.screen).toContainText("Gamma item here")

    // Resize to narrow terminal
    term.resize!(40, 15)
    await settle()

    // Content text should still be visible (possibly wrapped)
    expect(term.screen).toContainText("Left Column")
    expect(term.screen).toContainText("Right Column")
    // Box borders should still be present
    expect(term.screen!.getText()).toContain("╭")
    expect(term.screen!.getText()).toContain("╰")
  })

  test("resize shorter: visible content capped to new terminal height", async () => {
    using term = createTermless({ cols: 60, rows: 20 })
    handle = await run(<RowListApp count={15} />, term)

    expect(term.screen).toContainText("Items (15)")
    // At 20 rows: 15 items + header + 2 borders = 18 rows, fits in 20

    // Shrink to 10 rows -- content no longer fits
    term.resize!(60, 10)
    await settle()

    // Content should still render without crash
    const lines = term.screen!.getLines()
    expect(lines.length).toBeLessThanOrEqual(10)
    // Some content should be visible (top portion in fullscreen)
    const nonBlank = lines.filter((l: string) => l.trim().length > 0).length
    expect(nonBlank).toBeGreaterThan(3)
    // Top border should be visible (fullscreen renders from top)
    const text = term.screen!.getText()
    expect(text).toContain("╭")
  })

  test("resize taller: all content rows visible when terminal grows", async () => {
    // At 8 rows, 10 items + header + 2 borders = 13 rows of content.
    // Fullscreen renders from the top, so bottom rows are clipped.
    using term = createTermless({ cols: 60, rows: 8 })
    handle = await run(<RowListApp count={10} />, term)

    const smallText = term.screen!.getText()
    // Top border should be visible (fullscreen renders from top)
    expect(smallText).toContain("╭")
    // Content should be present but bottom is clipped
    expect(smallText).toContain("Items (10)")

    // Grow to 15 rows — enough to show all content
    term.resize!(60, 15)
    await settle()

    const tallText = term.screen!.getText()
    // After resize, content re-renders at new dimensions.
    // All 10 rows should be in the output (bottom border visible).
    expect(tallText).toContain("Row 9")
    expect(tallText).toContain("╰")
  })

  test("rapid resize sequence does not corrupt output", async () => {
    using term = createTermless({ cols: 80, rows: 24 })
    handle = await run(<MultiColumnApp />, term)

    // Rapid sequence of resizes
    for (const [cols, rows] of [
      [40, 12],
      [120, 30],
      [60, 8],
      [80, 24],
    ] as const) {
      term.resize!(cols, rows)
      await settle(50)
    }

    // After settling at 80x24, content should render correctly
    expect(term.screen).toContainText("Left Column")
    expect(term.screen).toContainText("Right Column")
    expect(term.screen!.getText()).toContain("╭")
    expect(term.screen!.getText()).toContain("╰")
  })

  test("resize preserves interaction state", async () => {
    using term = createTermless({ cols: 60, rows: 12 })
    handle = await run(<RowListApp count={3} />, term)

    expect(term.screen).toContainText("Items (3)")

    // Add items via interaction
    await handle.press("a")
    expect(term.screen).toContainText("Items (8)")

    // Resize
    term.resize!(80, 20)
    await settle()

    // Interaction state should be preserved
    expect(term.screen).toContainText("Items (8)")

    // Further interaction should work
    await handle.press("a")
    expect(term.screen).toContainText("Items (13)")
  })
})

// ============================================================================
// 2. Inline Mode Output Phase via Termless
// ============================================================================

describe("termless: inline mode output", () => {
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  /** Run a component in inline mode through a termless emulator. */
  async function runInline(
    element: React.ReactElement,
    dims: { cols: number; rows: number } = { cols: 80, rows: 24 },
  ): Promise<{ term: Term; handle: RunHandle }> {
    const term = createTermless(dims)
    const emulator = (term as unknown as Record<string, unknown>)._emulator as {
      feed(data: string): void
    }

    const h = await run(element, {
      mode: "inline",
      writable: { write: (s: string) => emulator.feed(s) },
      cols: dims.cols,
      rows: dims.rows,
    })

    return { term, handle: h }
  }

  test("inline mode renders content into termless emulator", async () => {
    const { term, handle: h } = await runInline(<RowListApp count={3} />)
    handle = h

    expect(term.screen).toContainText("Items (3)")
    expect(term.screen).toContainText("Row 0")
    expect(term.screen).toContainText("Row 2")
  })

  test("inline mode interaction: adding items renders incrementally", async () => {
    const { term, handle: h } = await runInline(<RowListApp count={2} />, { cols: 60, rows: 20 })
    handle = h

    expect(term.screen).toContainText("Items (2)")

    await handle.press("a")
    await settle()

    expect(term.screen).toContainText("Items (7)")
    expect(term.screen).toContainText("Row 6")
  })

  test("inline mode content shrink clears orphan lines", async () => {
    const { term, handle: h } = await runInline(<RowListApp count={8} />, { cols: 60, rows: 20 })
    handle = h

    expect(term.screen).toContainText("Items (8)")
    expect(term.screen).toContainText("Row 7")

    // Shrink content
    await handle.press("d")
    await settle()

    expect(term.screen).toContainText("Items (3)")
    // Row 7 should no longer be visible (cleared by output phase)
    const text = term.screen!.getText()
    expect(text).not.toContain("Row 7")
  })

  test("inline mode preserves pre-existing terminal content", async () => {
    const dims = { cols: 80, rows: 24 }
    const term = createTermless(dims)
    const emulator = (term as unknown as Record<string, unknown>)._emulator as {
      feed(data: string): void
    }

    // Pre-populate with "shell" content
    emulator.feed("$ echo hello\r\n")
    emulator.feed("hello\r\n")
    emulator.feed("$ bun run app\r\n")

    handle = await run(<RowListApp count={2} />, {
      mode: "inline",
      writable: { write: (s: string) => emulator.feed(s) },
      cols: dims.cols,
      rows: dims.rows,
    })

    await settle()

    // Both shell content and app content should be visible
    const allText = (term.scrollback?.getText() ?? "") + term.screen!.getText()
    expect(allText).toContain("bun run app")
    expect(term.screen).toContainText("Items (2)")
  })
})

// ============================================================================
// 3. ScrollbackList Freeze/Promote with Border Verification
// ============================================================================

describe("termless: scrollbackList freeze/promote borders", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  function makeItems(count: number): FreezeItem[] {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      text: `Item ${i + 1}`,
      frozen: false,
    }))
  }

  async function setupInline(
    items: FreezeItem[],
    dims: { cols: number; rows: number } = { cols: 80, rows: 20 },
  ): Promise<void> {
    term = createTermless(dims)
    const emulator = (term as unknown as Record<string, unknown>)._emulator as {
      feed(data: string): void
    }

    handle = await run(<FreezePromoteApp initialItems={items} />, {
      mode: "inline",
      writable: { write: (s: string) => emulator.feed(s) },
      cols: dims.cols,
      rows: dims.rows,
    })
  }

  test("initial render: all items have complete box borders", async () => {
    await setupInline(makeItems(3))

    const text = term.screen!.getText()
    // Each item should have top and bottom border
    expect(text).toContain("╭")
    expect(text).toContain("╰")

    // Count border pairs -- 3 items visible in ListView viewport
    // (footer may be clipped if total height exceeds terminal rows)
    const topBorders = (text.match(/╭/g) || []).length
    const bottomBorders = (text.match(/╰/g) || []).length
    expect(topBorders).toBeGreaterThanOrEqual(3)
    expect(bottomBorders).toBeGreaterThanOrEqual(3)
  })

  test("freeze + promote: frozen item retains bottom border", async () => {
    await setupInline(makeItems(2), { cols: 80, rows: 20 })

    // Press Enter to freeze first item and add a new one
    await handle.press("Enter")
    await settle(200)

    const allText = (term.scrollback?.getText() ?? "") + term.screen!.getText()

    // All border chars should be present
    expect(allText).toContain("╭")
    expect(allText).toContain("╰")

    // Frozen item [1] should be complete with borders
    expect(allText).toContain("[1] Item 1")
    // New item [3] should appear
    expect(allText).toContain("[3] Item 3")
    // Footer should be visible
    expect(term.screen).toContainText("Input area")
  })

  test("multiple freeze cycles: no missing bottom borders", async () => {
    await setupInline(makeItems(2), { cols: 60, rows: 16 })

    for (let i = 0; i < 4; i++) {
      await handle.press("Enter")
      await settle(200)

      const screenText = term.screen!.getText()
      const scrollbackText = term.scrollback?.getText() ?? ""
      const allText = scrollbackText + screenText

      // Every top border must have a matching bottom border
      const tops = (allText.match(/╭/g) || []).length
      const bottoms = (allText.match(/╰/g) || []).length

      expect(
        bottoms,
        `After Enter ${i + 1}: ${tops} top borders but only ${bottoms} bottom borders`,
      ).toBeGreaterThanOrEqual(tops)

      // Footer should always be visible on screen
      expect(term.screen).toContainText("Input area")
    }
  })

  test("freeze all then continue: screen recovers with new content", async () => {
    await setupInline(makeItems(3), { cols: 80, rows: 20 })

    // Freeze all 3 items (3 Enter presses)
    for (let i = 0; i < 3; i++) {
      await handle.press("Enter")
      await settle(200)
    }

    // Screen should have content -- new items from freeze cycle
    const lines = term.screen!.getLines()
    const nonBlank = lines.filter((l: string) => l.trim().length > 0).length
    expect(nonBlank).toBeGreaterThan(2)

    // Footer must be on screen
    expect(term.screen).toContainText("Input area")

    // Borders should be intact
    const screenText = term.screen!.getText()
    expect(screenText).toContain("╭")
    expect(screenText).toContain("╰")
  })

  test("small terminal: overflow triggers scrollback without garbling", async () => {
    // 10-row terminal -- items overflow quickly
    await setupInline(makeItems(2), { cols: 60, rows: 10 })

    for (let i = 0; i < 5; i++) {
      await handle.press("Enter")
      await settle(200)

      // Screen must never be blank
      const lines = term.screen!.getLines()
      const nonBlank = lines.filter((l: string) => l.trim().length > 0).length
      expect(nonBlank, `Screen nearly blank after Enter ${i + 1}`).toBeGreaterThan(1)

      // Footer must remain visible
      expect(term.screen).toContainText("Input area")
    }

    // After 5 cycles, scrollback should have accumulated content
    const scrollback = term.scrollback?.getText() ?? ""
    expect(scrollback.length).toBeGreaterThan(0)
  })
})
