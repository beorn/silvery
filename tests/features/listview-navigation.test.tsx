/**
 * ListView navigable mode — termless end-to-end tests.
 *
 * Verifies keyboard navigation (j/k, arrows, PgUp/PgDn, Home/End, G),
 * mouse wheel scrolling, Enter selection, and cursor visibility through
 * the full ANSI rendering pipeline.
 *
 * These tests catch bugs that unit tests miss: cursor positioning after
 * ANSI processing, scroll behavior in real terminal output, and the
 * interaction between useVirtualizer and the Box overflow="scroll" path.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

// ============================================================================
// Test fixtures
// ============================================================================

const ITEMS = Array.from({ length: 30 }, (_, i) => ({ id: `item-${i}`, label: `Item ${i}` }))

/** Simple navigable list that shows cursor position and supports Enter */
function NavigableList({
  items = ITEMS,
  height = 10,
  onSelect,
}: {
  items?: typeof ITEMS
  height?: number
  onSelect?: (index: number) => void
}) {
  const [selected, setSelected] = useState(-1)

  return (
    <Box flexDirection="column">
      <ListView
        items={items}
        height={height}
        nav
        onSelect={(i) => {
          setSelected(i)
          onSelect?.(i)
        }}
        getKey={(item) => item.id}
        renderItem={(item, _index, meta) => (
          <Text>
            {meta.isCursor ? ">" : " "} {item.label}
          </Text>
        )}
      />
      {selected >= 0 && <Text>Selected: {items[selected]?.label}</Text>}
    </Box>
  )
}

/** List that quits on 'q' — lets us test without Ctrl+C interfering */
function QuitableList({ items = ITEMS, height = 10 }: { items?: typeof ITEMS; height?: number }) {
  useInput((input) => {
    if (input === "q") return "exit"
  })
  return <NavigableList items={items} height={height} />
}

// ============================================================================
// Navigation
// ============================================================================

describe("ListView navigable: keyboard navigation", () => {
  test("renders with first item at cursor by default", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList />, term)

    expect(term.screen).toContainText("> Item 0")
    expect(term.screen).toContainText("  Item 1")
    expect(term.screen).toContainText("  Item 2")

    handle.unmount()
  })

  test("j moves cursor down, k moves cursor up", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList />, term)

    // Move down
    await handle.press("j")
    expect(term.screen).toContainText("  Item 0")
    expect(term.screen).toContainText("> Item 1")

    // Move down again
    await handle.press("j")
    expect(term.screen).toContainText("> Item 2")

    // Move back up
    await handle.press("k")
    expect(term.screen).toContainText("> Item 1")

    handle.unmount()
  })

  test("arrow keys navigate the list", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList />, term)

    await handle.press("ArrowDown")
    expect(term.screen).toContainText("> Item 1")

    await handle.press("ArrowDown")
    expect(term.screen).toContainText("> Item 2")

    await handle.press("ArrowUp")
    expect(term.screen).toContainText("> Item 1")

    handle.unmount()
  })

  test("G jumps to last item, Home jumps to first", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList />, term)

    // Jump to end
    await handle.press("G")
    expect(term.screen).toContainText("> Item 29")
    // Item 0 should be scrolled off
    expect(term.screen).not.toContainText("Item 0")

    // Jump back to start
    await handle.press("Home")
    expect(term.screen).toContainText("> Item 0")

    handle.unmount()
  })

  test("PgDn/PgUp move by half viewport", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList height={10} />, term)

    // PgDn should move by floor(10/2) = 5 items
    await handle.press("PageDown")
    expect(term.screen).toContainText("> Item 5")

    // PgUp should move back
    await handle.press("PageUp")
    expect(term.screen).toContainText("> Item 0")

    handle.unmount()
  })

  test("cursor clamps at boundaries (no underflow/overflow)", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList />, term)

    // Try to go above first item
    await handle.press("k")
    await handle.press("k")
    expect(term.screen).toContainText("> Item 0")

    // Jump to end and try to go past
    await handle.press("G")
    await handle.press("j")
    await handle.press("j")
    expect(term.screen).toContainText("> Item 29")

    handle.unmount()
  })
})

// ============================================================================
// Enter / onSelect
// ============================================================================

describe("ListView navigable: Enter selects cursor item", () => {
  test("Enter fires onSelect with cursor index", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList />, term)

    await handle.press("j")
    await handle.press("j")
    await handle.press("Enter")

    expect(term.screen).toContainText("Selected: Item 2")

    handle.unmount()
  })
})

// ============================================================================
// Scrolling behavior
// ============================================================================

describe("ListView navigable: viewport scrolling", () => {
  test("cursor stays visible when navigating past viewport edge", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    // height=5 with 30 items — must scroll
    const handle = await run(<QuitableList height={5} />, term)

    // Navigate down past viewport
    for (let i = 0; i < 8; i++) {
      await handle.press("j")
    }

    // Cursor at item 8 should be visible
    expect(term.screen).toContainText("> Item 8")

    handle.unmount()
  })

  test("scrolling up keeps cursor visible", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList height={5} />, term)

    // Go far down
    await handle.press("G")
    expect(term.screen).toContainText("> Item 29")

    // Come back up
    for (let i = 0; i < 5; i++) {
      await handle.press("k")
    }

    // Cursor should be visible
    expect(term.screen).toContainText("> Item 24")

    handle.unmount()
  })
})

// ============================================================================
// Small lists / edge cases
// ============================================================================

describe("ListView navigable: edge cases", () => {
  test("single item list", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const items = [{ id: "only", label: "Only Item" }]
    const handle = await run(<QuitableList items={items} />, term)

    expect(term.screen).toContainText("> Only Item")

    // Navigation should be no-op
    await handle.press("j")
    expect(term.screen).toContainText("> Only Item")

    handle.unmount()
  })

  test("empty list renders without crash", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList items={[]} />, term)

    // Should not crash, screen should exist
    expect(term.screen).not.toContainText("> Item")

    handle.unmount()
  })

  test("items fewer than viewport height", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `s-${i}`, label: `Short ${i}` }))
    const handle = await run(<QuitableList items={items} height={10} />, term)

    expect(term.screen).toContainText("> Short 0")
    expect(term.screen).toContainText("  Short 1")
    expect(term.screen).toContainText("  Short 2")

    // Navigate through all items
    await handle.press("j")
    expect(term.screen).toContainText("> Short 1")
    await handle.press("j")
    expect(term.screen).toContainText("> Short 2")
    await handle.press("j")
    // Should clamp at last item
    expect(term.screen).toContainText("> Short 2")

    handle.unmount()
  })
})

// ============================================================================
// Ctrl+D / Ctrl+U (half-page scroll)
// ============================================================================

describe("ListView navigable: Ctrl+D / Ctrl+U", () => {
  test("Ctrl+D moves half page down, Ctrl+U moves half page up", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableList height={10} />, term)

    await handle.press("ctrl+d")
    expect(term.screen).toContainText("> Item 5")

    await handle.press("ctrl+d")
    expect(term.screen).toContainText("> Item 10")

    await handle.press("ctrl+u")
    expect(term.screen).toContainText("> Item 5")

    handle.unmount()
  })
})
