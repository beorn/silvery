/**
 * Termless tests for ScrollbackList border integrity.
 *
 * Verifies that items frozen to scrollback preserve their borders
 * (especially right borders) when rendered through a real terminal emulator.
 * Also tests that live items have matching borders and that the
 * freeze-to-scrollback transition doesn't cause visual artifacts.
 *
 * Uses termless with xterm.js backend to emulate a real terminal.
 */

import React, { useEffect } from "react"
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

/** Item with a border (like the showcase agent cards). */
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

/** Simple non-bordered item for comparison. */
function SimpleItem({ item }: { item: TestItem }) {
  const { freeze, isFrozen } = useScrollbackItem()

  useEffect(() => {
    if (item.frozen && !isFrozen) freeze()
  }, [item.frozen, isFrozen, freeze])

  return <Text>Item {item.id}: {item.text}</Text>
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

function createTestTerminal(cols: number, rows: number) {
  return createTerminal({
    backend: createXtermBackend({ cols, rows }),
    cols,
    rows,
    scrollbackLimit: 1000,
  })
}

function mkItems(...specs: Array<[string, string, boolean]>): TestItem[] {
  return specs.map(([id, text, frozen]) => ({ id, text, frozen }))
}

// ============================================================================
// Border integrity in frozen (scrollback) items
// ============================================================================

describe("frozen item border integrity → termless", () => {
  test("frozen bordered items preserve all four border sides in scrollback", () => {
    const COLS = 60
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    const items = mkItems(
      ["1", "First response", true],
      ["2", "Second response", false],
    )

    render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Item 1 should have been written to stdout (frozen)
    expect(writes.length).toBeGreaterThan(0)

    // Feed the frozen output to termless
    const term = createTestTerminal(COLS, 20)
    for (const w of writes) {
      term.feed(w)
    }

    // Verify borders: top, bottom, left, right
    expect(term.buffer).toContainText("╭") // top-left
    expect(term.buffer).toContainText("╮") // top-right
    expect(term.buffer).toContainText("╰") // bottom-left
    expect(term.buffer).toContainText("╯") // bottom-right

    // Verify content is inside the border
    expect(term.buffer).toContainText("Agent 1")
    expect(term.buffer).toContainText("First response")

    // Verify right border specifically: each content row should have │ on both sides
    const viewportText = term.screen.getText()
    const lines = viewportText.split("\n").filter((l) => l.trim().length > 0)

    for (const line of lines) {
      const trimmed = line.trimEnd()
      if (trimmed.includes("Agent 1") || trimmed.includes("First response")) {
        // Content lines should have │ on left and right
        expect(trimmed).toMatch(/│.*│/)
      }
    }

    term.close()
  })

  test("multiple frozen bordered items all have right borders", () => {
    const COLS = 60
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    const items = mkItems(
      ["1", "First", true],
      ["2", "Second", true],
      ["3", "Third", true],
      ["4", "Fourth (live)", false],
    )

    render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // All 3 frozen items should be written
    expect(writes.length).toBeGreaterThan(0)

    const term = createTestTerminal(COLS, 40)
    for (const w of writes) {
      term.feed(w)
    }

    // Count border corners — 3 items × 2 corners each side = 6 top-right, 6 bottom-right
    const text = term.getText()
    const topRightCount = (text.match(/╮/g) || []).length
    const bottomRightCount = (text.match(/╯/g) || []).length

    expect(topRightCount).toBe(3) // 3 frozen items
    expect(bottomRightCount).toBe(3)

    // Verify each item's content is present
    expect(term.buffer).toContainText("Agent 1")
    expect(term.buffer).toContainText("Agent 2")
    expect(term.buffer).toContainText("Agent 3")

    term.close()
  })

  test("frozen item border width matches terminal width", () => {
    const COLS = 80
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    const items = mkItems(["1", "Hello", true], ["2", "Live", false])

    render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    expect(writes.length).toBeGreaterThan(0)

    const term = createTestTerminal(COLS, 20)
    for (const w of writes) {
      term.feed(w)
    }

    // The top border line should span close to COLS
    const topBorderRow = term.row(0).getText()
    // Should start with ╭ and end with ╮
    expect(topBorderRow.startsWith("╭")).toBe(true)
    expect(topBorderRow.endsWith("╮")).toBe(true)

    // Border width: ╭ + dashes + ╮ should be COLS (or COLS-based)
    expect(topBorderRow.length).toBeGreaterThanOrEqual(COLS - 2) // At least close to full width

    term.close()
  })
})

describe("high-count frozen items → termless", () => {
  test("10 frozen bordered items all preserve right borders", () => {
    const COLS = 80
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    // 10 frozen items + 1 live — simulates many items before compaction
    const items = mkItems(
      ...Array.from({ length: 10 }, (_, i) => [
        String(i + 1),
        `Response ${i + 1} with some longer text to fill the box`,
        true,
      ] as [string, string, boolean]),
      ["11", "Still live", false],
    )

    render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    expect(writes.length).toBeGreaterThan(0)

    // Feed to a large terminal so nothing is clipped by viewport
    const term = createTestTerminal(COLS, 200)
    for (const w of writes) {
      term.feed(w)
    }

    const text = term.getText()

    // All 10 items should have top-right and bottom-right corners
    const topRightCount = (text.match(/╮/g) || []).length
    const bottomRightCount = (text.match(/╯/g) || []).length
    expect(topRightCount).toBe(10)
    expect(bottomRightCount).toBe(10)

    // Verify each item's content is present
    for (let i = 1; i <= 10; i++) {
      expect(term.buffer).toContainText(`Agent ${i}`)
    }

    // Verify every content line has │ on both sides
    const lines = text.split("\n").filter((l) => l.trim().length > 0)
    for (const line of lines) {
      const trimmed = line.trimEnd()
      if (/Agent \d+/.test(trimmed) || /Response \d+/.test(trimmed)) {
        expect(trimmed).toMatch(/│.*│/)
      }
    }

    term.close()
  })

  test("compaction: all items freeze at once preserves borders", () => {
    const COLS = 80
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    // Phase 1: All live
    const liveItems = mkItems(
      ...Array.from({ length: 8 }, (_, i) => [
        String(i + 1),
        `Exchange ${i + 1}`,
        false,
      ] as [string, string, boolean]),
    )

    const app = render(
      <ScrollbackList
        items={liveItems}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // All items should be live — no writes to stdout yet
    expect(writes.length).toBe(0)
    expect(app.text).toContain("Agent 1")

    // Phase 2: Compact — freeze all 8 items at once
    const frozenItems = mkItems(
      ...Array.from({ length: 8 }, (_, i) => [
        String(i + 1),
        `Exchange ${i + 1}`,
        true,
      ] as [string, string, boolean]),
    )

    app.rerender(
      <ScrollbackList
        items={frozenItems}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // All 8 items should be written to stdout now
    expect(writes.length).toBeGreaterThan(0)

    const term = createTestTerminal(COLS, 200)
    for (const w of writes) {
      term.feed(w)
    }

    const text = term.getText()

    // All 8 items should have complete borders
    const topRightCount = (text.match(/╮/g) || []).length
    const bottomRightCount = (text.match(/╯/g) || []).length
    expect(topRightCount).toBe(8)
    expect(bottomRightCount).toBe(8)

    // Verify every content line has │ on both sides
    const lines = text.split("\n").filter((l) => l.trim().length > 0)
    for (const line of lines) {
      const trimmed = line.trimEnd()
      if (/Agent \d+/.test(trimmed) || /Exchange \d+/.test(trimmed)) {
        expect(trimmed).toMatch(/│.*│/)
      }
    }

    term.close()
  })
})

// ============================================================================
// Live item borders (viewport)
// ============================================================================

describe("live item borders in viewport", () => {
  test("live bordered items have both left and right borders", () => {
    const COLS = 60
    const { stdout } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    const items = mkItems(
      ["1", "Live item one", false],
      ["2", "Live item two", false],
    )

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Live area should have borders
    const text = app.text
    expect(text).toContain("╭")
    expect(text).toContain("╮")
    expect(text).toContain("╰")
    expect(text).toContain("╯")

    // Count: 2 items × 1 top-right corner each = 2
    const topRightCount = (text.match(/╮/g) || []).length
    expect(topRightCount).toBe(2)
  })
})

// ============================================================================
// Border consistency: frozen vs live width
// ============================================================================

describe("border width consistency between frozen and live", () => {
  test("frozen and live items render at same width", () => {
    const COLS = 80
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    // Start with 3 items, first 2 frozen
    const items = mkItems(
      ["1", "Frozen item", true],
      ["2", "Also frozen", true],
      ["3", "Live item", false],
    )

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    expect(writes.length).toBeGreaterThan(0)

    // Get frozen item border width from stdout
    const frozenAnsi = writes.join("")
    const frozenPlain = stripAnsi(frozenAnsi)
    const frozenLines = frozenPlain.split("\n").filter((l) => l.includes("╭"))
    const frozenBorderWidth = frozenLines[0]?.trimEnd().length ?? 0

    // Get live item border width from render
    const liveText = app.text
    const liveLines = liveText.split("\n").filter((l) => l.includes("╭"))
    const liveBorderWidth = liveLines[0]?.trimEnd().length ?? 0

    // Both should be the same width
    expect(frozenBorderWidth).toBe(liveBorderWidth)
  })
})

// ============================================================================
// Parent padding: frozen items match live width and position
// ============================================================================

describe("parent padding: frozen items match live layout", () => {
  test("frozen items have left-padding matching parent paddingX", () => {
    const COLS = 60
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    // Phase 1: All live (so layout info is computed before freezing)
    const items1 = mkItems(
      ["1", "First item", false],
      ["2", "Second item", false],
    )

    const app = render(
      <Box paddingX={1}>
        <ScrollbackList
          items={items1}
          keyExtractor={(t) => t.id}
          stdout={stdout}
        >
          {(item) => <BorderedItem item={item} />}
        </ScrollbackList>
      </Box>,
    )

    // No frozen items yet — no writes to stdout
    expect(writes.length).toBe(0)

    // Get live border top-line width (includes padding)
    const liveLines = app.text.split("\n")
    const liveBorderLine = liveLines.find((l) => l.includes("╭"))
    expect(liveBorderLine).toBeDefined()
    const liveBorderWidth = liveBorderLine!.trimEnd().length

    // Phase 2: Freeze first item
    const items2 = mkItems(
      ["1", "First item", true],
      ["2", "Second item", false],
    )

    app.rerender(
      <Box paddingX={1}>
        <ScrollbackList
          items={items2}
          keyExtractor={(t) => t.id}
          stdout={stdout}
          isFrozen={(t) => t.frozen}
        >
          {(item) => <BorderedItem item={item} />}
        </ScrollbackList>
      </Box>,
    )

    // Item 1 should be frozen and written to stdout
    expect(writes.length).toBeGreaterThan(0)

    const frozenPlain = stripAnsi(writes.join(""))
    const frozenLines = frozenPlain.split("\n").filter((l) => l.trim().length > 0)

    // Each frozen line should start with a space (left-padding from parent paddingX=1)
    for (const line of frozenLines) {
      expect(line.startsWith(" ")).toBe(true)
    }

    // Frozen border width should match live border width
    const frozenBorderLine = frozenLines.find((l) => l.includes("╭"))
    expect(frozenBorderLine).toBeDefined()
    const frozenBorderWidth = frozenBorderLine!.trimEnd().length
    expect(frozenBorderWidth).toBe(liveBorderWidth)
  })

  test("frozen items without parent padding have no left-padding", () => {
    const COLS = 60
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    // Phase 1: All live (no parent padding)
    const items1 = mkItems(
      ["1", "First item", false],
      ["2", "Second item", false],
    )

    const app = render(
      <ScrollbackList
        items={items1}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    expect(writes.length).toBe(0)

    // Phase 2: Freeze first item
    const items2 = mkItems(
      ["1", "First item", true],
      ["2", "Second item", false],
    )

    app.rerender(
      <ScrollbackList
        items={items2}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={COLS}
      >
        {(item) => <BorderedItem item={item} />}
      </ScrollbackList>,
    )

    // Item 1 should be frozen
    expect(writes.length).toBeGreaterThan(0)

    const frozenPlain = stripAnsi(writes.join(""))
    const frozenLines = frozenPlain.split("\n").filter((l) => l.trim().length > 0)

    // Without parent padding, frozen lines should start with border character
    const borderLine = frozenLines.find((l) => l.includes("╭"))
    expect(borderLine).toBeDefined()
    expect(borderLine!.startsWith("╭")).toBe(true)
  })
})

// ============================================================================
// Freeze transition: no visual artifacts
// ============================================================================

describe("freeze transition → termless", () => {
  test("freezing items does not leave stale content in viewport", () => {
    const COLS = 60
    const { stdout, writes } = createMockStdout(COLS)
    const render = createRenderer({ cols: COLS, rows: 24 })

    // Phase 1: All live
    const items1 = mkItems(
      ["1", "Item one", false],
      ["2", "Item two", false],
      ["3", "Item three", false],
    )

    const app = render(
      <ScrollbackList
        items={items1}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        width={COLS}
      >
        {(item) => <SimpleItem item={item} />}
      </ScrollbackList>,
    )

    expect(app.text).toContain("Item 1")
    expect(app.text).toContain("Item 2")
    expect(app.text).toContain("Item 3")

    // Phase 2: Freeze first two items
    const items2 = mkItems(
      ["1", "Item one", true],
      ["2", "Item two", true],
      ["3", "Item three", false],
    )

    app.rerender(
      <ScrollbackList
        items={items2}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.frozen}
        width={COLS}
      >
        {(item) => <SimpleItem item={item} />}
      </ScrollbackList>,
    )

    // Live area should only contain item 3 now
    expect(app.text).not.toContain("Item 1")
    expect(app.text).not.toContain("Item 2")
    expect(app.text).toContain("Item 3")

    // Frozen items should be in stdout writes
    expect(writes.length).toBeGreaterThan(0)
    const frozenText = stripAnsi(writes.join(""))
    expect(frozenText).toContain("Item 1")
    expect(frozenText).toContain("Item 2")
  })
})
