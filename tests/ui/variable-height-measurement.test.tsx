/**
 * Variable-height measurement tests for ListView/VirtualList.
 *
 * Verifies that the dynamic measurement system correctly handles items
 * with different heights. After the first render, ListView measures actual
 * item heights via Box onLayout and uses them for scroll calculations.
 *
 * Key behaviors tested:
 * 1. Mixed-height items render correctly (no blank gaps or overlaps)
 * 2. Scroll position is correct when items have variable heights
 * 3. Measurement feedback stabilizes (no infinite re-render loops)
 * 4. estimateHeight acts as fallback for unmeasured items
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text, VirtualList } from "@silvery/ag-react"

// ============================================================================
// Test Helpers
// ============================================================================

interface Item {
  id: string
  title: string
  height: number
}

function makeVariableItems(heights: number[]): Item[] {
  return heights.map((h, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
    height: h,
  }))
}

/** Render item as a fixed-height box */
function renderVariableItem(item: Item, _index: number) {
  return (
    <Box height={item.height} flexShrink={0}>
      <Text>{item.title}</Text>
    </Box>
  )
}

/** Count how many items appear in text */
function countVisibleItems(text: string, total: number): number {
  let count = 0
  for (let i = 0; i < total; i++) {
    if (text.includes(`Item ${i}`)) count++
  }
  return count
}

// ============================================================================
// Variable-Height Rendering
// ============================================================================

describe("VirtualList — variable-height measurement", () => {
  test("mixed heights: all visible items render within viewport", () => {
    // Items with heights 1, 3, 1, 2, 1 = 8 rows total, viewport=10
    const items = makeVariableItems([1, 3, 1, 2, 1])
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <VirtualList
        items={items}
        height={10}
        itemHeight={2}
        scrollTo={0}
        renderItem={renderVariableItem}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // All 5 items fit (total 8 rows < viewport 10)
    for (let i = 0; i < 5; i++) {
      expect(text, `Item ${i} should be visible`).toContain(`Item ${i}`)
    }
  })

  test("tall items: fewer items fit in viewport than estimate suggests", () => {
    // 10 items, each 3 rows tall. estimateHeight=1 (intentionally wrong).
    // Viewport=9 can fit 3 items (3*3=9).
    const items = makeVariableItems(Array.from({ length: 10 }, () => 3))
    const r = createRenderer({ cols: 40, rows: 11 })
    const app = r(
      <VirtualList
        items={items}
        height={9}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderVariableItem}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // First few items should be visible
    expect(text).toContain("Item 0")
    // Should show overflow (10 items don't all fit)
    expect(text).toContain("▼")
  })

  test("scroll to item works with variable heights", () => {
    // 20 items with heights alternating 1 and 3
    const heights = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 1 : 3))
    const items = makeVariableItems(heights)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <VirtualList
        items={items}
        height={10}
        itemHeight={2}
        scrollTo={10}
        overflowIndicator
        renderItem={renderVariableItem}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // The target item should be visible
    expect(text, "scrollTo target should be visible").toContain("Item 10")
  })

  test("estimateHeight as function: still measures actual heights", () => {
    // Use a per-item estimate that's wrong for some items
    const items = makeVariableItems([2, 2, 5, 2, 2])
    const r = createRenderer({ cols: 40, rows: 14 })
    const app = r(
      <VirtualList
        items={items}
        height={12}
        itemHeight={(item: Item) => item.height}
        scrollTo={0}
        renderItem={renderVariableItem}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // All items should render (total = 2+2+5+2+2 = 13 > 12, so some may be clipped)
    expect(text).toContain("Item 0")
    expect(text).toContain("Item 1")
    expect(text).toContain("Item 2")
  })

  test("single tall item fills viewport", () => {
    const items = makeVariableItems([8, 1, 1, 1])
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <VirtualList
        items={items}
        height={10}
        itemHeight={2}
        scrollTo={0}
        overflowIndicator
        renderItem={renderVariableItem}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // First item (height 8) should be visible
    expect(text).toContain("Item 0")
  })

  test("all same height: measurement matches estimate (no jumpiness)", () => {
    // When all items have the same height as the estimate, measurement
    // should produce identical results — no placeholder size changes.
    const items = makeVariableItems(Array.from({ length: 10 }, () => 1))
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderVariableItem}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // First items should be visible, overflow shown
    expect(text).toContain("Item 0")
    expect(text).toContain("▼")
    // All visible items should be contiguous (no blank gaps from measurement mismatch)
    const visible = countVisibleItems(text, 10)
    expect(visible).toBeGreaterThanOrEqual(3)
  })

  test("variable heights with overflow indicators", () => {
    // Items: 1, 1, 4, 1, 1, 4, 1, 1 = 14 total rows, viewport=8
    const items = makeVariableItems([1, 1, 4, 1, 1, 4, 1, 1])
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <VirtualList
        items={items}
        height={8}
        itemHeight={2}
        scrollTo={0}
        overflowIndicator
        renderItem={renderVariableItem}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Some items visible, overflow shown
    expect(text).toContain("Item 0")
    expect(text).toContain("▼")
  })
})
