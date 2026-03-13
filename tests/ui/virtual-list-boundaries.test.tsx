/**
 * VirtualList and SelectList boundary-condition tests.
 *
 * Verifies viewport-based item rendering and overflow indicator behavior,
 * particularly at boundary heights where items partially fit.
 *
 * Context: HorizontalVirtualList had a ceil/floor bug where
 * calcActualVisibleCount used Math.ceil, counting partially-fitting items
 * as "visible". These tests verify VirtualList and SelectList behave
 * correctly at boundary heights.
 *
 * VirtualList architecture:
 * - VirtualList → VirtualView → useVirtualizer (scroll/window calculations)
 * - VirtualView renders into a Box with overflow="scroll" and fixed height
 * - The Box physically clips items that don't fit and tracks hiddenAbove/Below
 * - useVirtualizer uses Math.ceil for estimatedVisibleCount, which affects
 *   scroll offset calculations (not rendering — the Box handles that)
 * - Overflow indicators (▲N/▼N) are rendered by the Box based on actual
 *   hidden child counts, consuming 1 row each from the viewport
 *
 * SelectList uses simple array slicing via maxVisible — no virtualization.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/react"
import { VirtualList } from "../../packages/ui/src/components/VirtualList"
import { SelectList } from "../../packages/ui/src/components/SelectList"
import type { SelectOption } from "../../packages/ui/src/components/SelectList"

// ============================================================================
// Test Helpers
// ============================================================================

interface Item {
  id: string
  title: string
}

function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
  }))
}

function makeSelectOptions(n: number): SelectOption[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `Option ${i}`,
    value: `opt-${i}`,
  }))
}

function renderItem(item: Item, _index: number) {
  return <Text>{item.title}</Text>
}

/** Render item as a fixed-height box (for multi-row item tests) */
function renderFixedHeightItem(h: number) {
  return (item: Item, _index: number) => (
    <Box height={h} flexShrink={0}>
      <Text>{item.title}</Text>
    </Box>
  )
}

/** Count how many items appear in text */
function countVisibleItems(text: string, prefix: string, total: number): number {
  let count = 0
  for (let i = 0; i < total; i++) {
    if (text.includes(`${prefix} ${i}`)) count++
  }
  return count
}

// ============================================================================
// VirtualList — Visible Count Tests (single-row items)
// ============================================================================

describe("VirtualList — visible count at boundary heights", () => {
  test("exact fit: 5 items in height=5 renders all 5 (no overflow indicator)", () => {
    const items = makeItems(5)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // 5 items × 1 row = 5 rows = viewport height, all fit
    for (let i = 0; i < 5; i++) {
      expect(text, `Item ${i} should be visible`).toContain(`Item ${i}`)
    }
    // No overflow since everything fits
    expect(text).not.toContain("▲")
    expect(text).not.toContain("▼")
  })

  test("overflow: 10 items in height=5 shows items + overflow indicator", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Overflow indicator takes 1 row, so 4 items + 1 indicator = 5 rows
    const visible = countVisibleItems(text, "Item", 10)
    expect(visible).toBe(4)
    expect(text).toContain("▼")
    // First 4 items should be visible (scrollTo=0)
    for (let i = 0; i < 4; i++) {
      expect(text, `Item ${i} should be visible`).toContain(`Item ${i}`)
    }
    expect(text).not.toContain("Item 4")
  })

  test("all items fit: fewer items than viewport capacity", () => {
    const items = makeItems(3)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    for (let i = 0; i < 3; i++) {
      expect(text, `Item ${i} should be visible`).toContain(`Item ${i}`)
    }
    expect(text).not.toContain("▲")
    expect(text).not.toContain("▼")
  })

  test("zero items renders empty viewport", () => {
    const items: Item[] = []
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).not.toContain("Item")
  })

  test("one item in large viewport renders correctly", () => {
    const items = makeItems(1)
    const r = createRenderer({ cols: 40, rows: 22 })
    const app = r(
      <VirtualList
        items={items}
        height={20}
        itemHeight={1}
        scrollTo={0}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 0")
  })
})

// ============================================================================
// VirtualList — Overflow Indicator Tests
// ============================================================================

describe("VirtualList — overflow indicators", () => {
  test("shows ▼ overflow when items exceed viewport at scroll top", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("▼")
    expect(text).not.toContain("▲")
  })

  test("no overflow indicators when all items fit", () => {
    const items = makeItems(3)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).not.toContain("▲")
    expect(text).not.toContain("▼")
  })

  test("shows ▲ overflow when scrolled past beginning", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={5}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Scrolled to middle — should show ▲ indicator for items above
    expect(text).toContain("▲")
  })

  test("shows both ▲ and ▼ when scrolled to middle", () => {
    const items = makeItems(20)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={10}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Both indicators should appear
    expect(text).toContain("▲")
    expect(text).toContain("▼")
  })
})

// ============================================================================
// VirtualList — Gap Handling
// ============================================================================

describe("VirtualList — gap handling", () => {
  test("gap reduces number of visible items", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        gap={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Gap rows reduce how many items fit. Items 0 and 1 should always be visible.
    expect(text).toContain("Item 0")
    expect(text).toContain("Item 1")
    // With gap=1 and overflow indicator, fewer items fit than without gap
    const visibleWithGap = countVisibleItems(text, "Item", 10)

    // Compare with no gap
    const r2 = createRenderer({ cols: 40, rows: 7 })
    const app2 = r2(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const visibleNoGap = countVisibleItems(stripAnsi(app2.text), "Item", 10)
    expect(visibleWithGap).toBeLessThan(visibleNoGap)
  })

  test("gap=0 renders same as no gap", () => {
    const items = makeItems(10)
    const r1 = createRenderer({ cols: 40, rows: 7 })
    const app1 = r1(
      <VirtualList items={items} height={5} itemHeight={1} gap={0} scrollTo={0} renderItem={renderItem} />,
    )
    const r2 = createRenderer({ cols: 40, rows: 7 })
    const app2 = r2(
      <VirtualList items={items} height={5} itemHeight={1} scrollTo={0} renderItem={renderItem} />,
    )
    expect(stripAnsi(app1.text)).toBe(stripAnsi(app2.text))
  })
})

// ============================================================================
// VirtualList — Multi-Row Items at Boundaries
// ============================================================================

describe("VirtualList — multi-row items at boundaries", () => {
  test("3-row items in height=6: exactly 2 fit", () => {
    const items = makeItems(5)
    const r = createRenderer({ cols: 40, rows: 8 })
    const app = r(
      <VirtualList
        items={items}
        height={6}
        itemHeight={3}
        scrollTo={0}
        overflowIndicator
        renderItem={renderFixedHeightItem(3)}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // 2 × 3 = 6, exact fit
    expect(text).toContain("Item 0")
    expect(text).toContain("Item 1")
    // Overflow should be present (3 items hidden)
    expect(text).toContain("▼")
  })

  test("3-row items in height=7: 2 fully fit, partial 3rd clipped", () => {
    const items = makeItems(5)
    const r = createRenderer({ cols: 40, rows: 9 })
    const app = r(
      <VirtualList
        items={items}
        height={7}
        itemHeight={3}
        scrollTo={0}
        overflowIndicator
        renderItem={renderFixedHeightItem(3)}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // At least 2 items should be visible (2 × 3 = 6 ≤ 7)
    expect(text).toContain("Item 0")
    expect(text).toContain("Item 1")
  })

  test("3-row items in height=9: exactly 3 fit", () => {
    const items = makeItems(5)
    const r = createRenderer({ cols: 40, rows: 11 })
    const app = r(
      <VirtualList
        items={items}
        height={9}
        itemHeight={3}
        scrollTo={0}
        overflowIndicator
        renderItem={renderFixedHeightItem(3)}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // 3 × 3 = 9, exact fit
    expect(text).toContain("Item 0")
    expect(text).toContain("Item 1")
    expect(text).toContain("Item 2")
  })

  test("2-row items: overflow indicator shows when items are hidden", () => {
    const items = makeItems(8)
    const r = createRenderer({ cols: 40, rows: 8 })
    const app = r(
      <VirtualList
        items={items}
        height={6}
        itemHeight={2}
        scrollTo={0}
        overflowIndicator
        renderItem={renderFixedHeightItem(2)}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // 6 rows for 2-row items: 3 items fit exactly, but overflow indicator
    // takes 1 row → only 2 items + indicator fit in 6 rows (2+2+1=5, or 2+2+2=6)
    // The Box clips items that don't fit
    expect(text).toContain("Item 0")
    expect(text).toContain("▼")
  })
})

// ============================================================================
// VirtualList — Boundary Parametric Tests
// ============================================================================

describe("VirtualList — boundary heights (parametric)", () => {
  // Verify that rendered items never overflow the viewport.
  // The Box with overflow="scroll" handles clipping, so this tests
  // that the virtualizer + box interaction is correct.
  test.each([
    { height: 5, itemCount: 10, itemHeight: 1 },
    { height: 5, itemCount: 3, itemHeight: 1 },
    { height: 10, itemCount: 20, itemHeight: 1 },
    { height: 10, itemCount: 5, itemHeight: 1 },
    { height: 6, itemCount: 10, itemHeight: 3 },
    { height: 7, itemCount: 10, itemHeight: 3 },
    { height: 9, itemCount: 10, itemHeight: 3 },
    { height: 12, itemCount: 10, itemHeight: 3 },
    { height: 4, itemCount: 8, itemHeight: 2 },
    { height: 6, itemCount: 8, itemHeight: 2 },
  ])(
    "height=$height, $itemCount items × $itemHeight rows: items render within viewport",
    ({ height, itemCount, itemHeight }) => {
      const items = makeItems(itemCount)
      const r = createRenderer({ cols: 40, rows: height + 2 })
      const app = r(
        <VirtualList
          items={items}
          height={height}
          itemHeight={itemHeight}
          scrollTo={0}
          overflowIndicator
          renderItem={renderFixedHeightItem(itemHeight)}
          keyExtractor={(item) => item.id}
        />,
      )
      const text = stripAnsi(app.text)

      // Count visible items
      const visible = countVisibleItems(text, "Item", itemCount)

      if (itemCount * itemHeight <= height) {
        // All items fit — all should be visible
        expect(visible, `All ${itemCount} items should be visible at height=${height}`).toBe(itemCount)
      } else {
        // Items overflow — at least 1 item should be visible
        expect(visible, `At least 1 item should be visible at height=${height}`).toBeGreaterThanOrEqual(1)
        // And not all items should be visible
        expect(visible, `Not all items should be visible at height=${height}`).toBeLessThan(itemCount)
        // Overflow indicator should be present
        expect(text, `Should show ▼ overflow at height=${height}`).toContain("▼")
      }
    },
  )
})

// ============================================================================
// VirtualList — Interactive Mode Boundary Tests
// ============================================================================

describe("VirtualList — interactive mode boundaries", () => {
  test("interactive: selection at index 0 shows first item selected", () => {
    const items = makeItems(20)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        interactive
        selectedIndex={0}
        overflowIndicator
        renderItem={(item, _index, meta) => (
          <Text>
            {meta?.isSelected ? "> " : "  "}
            {item.title}
          </Text>
        )}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("> Item 0")
  })

  test("interactive: selected item is always visible", () => {
    // Test that the selected item is visible at various positions
    const items = makeItems(20)
    for (const selectedIdx of [0, 5, 10, 15, 19]) {
      const r = createRenderer({ cols: 40, rows: 7 })
      const app = r(
        <VirtualList
          items={items}
          height={5}
          itemHeight={1}
          interactive
          selectedIndex={selectedIdx}
          renderItem={(item, _index, meta) => (
            <Text>
              {meta?.isSelected ? ">" : " "}
              {item.title}
            </Text>
          )}
          keyExtractor={(item) => item.id}
        />,
      )
      const text = stripAnsi(app.text)
      expect(text, `Item ${selectedIdx} should be visible when selected`).toContain(`Item ${selectedIdx}`)
    }
  })
})

// ============================================================================
// VirtualList — Scroll Offset Behavior (ceil vs floor impact)
// ============================================================================

describe("VirtualList — scroll offset at boundaries", () => {
  // The useVirtualizer hook uses Math.ceil for estimatedVisibleCount.
  // This affects scroll offset calculations: when the visible count is
  // overestimated by 1, scrolling may not trigger soon enough, leaving
  // items partially visible when they should scroll.
  //
  // This test verifies scroll behavior is correct at boundary heights
  // where ceil and floor diverge.

  test("scroll to middle shows selected item with context", () => {
    const items = makeItems(30)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={15}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Selected item 15 should be visible
    expect(text).toContain("Item 15")
    // Should show both overflow indicators
    expect(text).toContain("▲")
    expect(text).toContain("▼")
  })

  test("scroll to end shows last items", () => {
    const items = makeItems(30)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={29}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Should show top overflow indicator (items scrolled above)
    expect(text).toContain("▲")
    // First items should NOT be visible (scrolled past)
    expect(text).not.toContain("Item 0")
    expect(text).not.toContain("Item 1")
  })

  test("scroll to start shows first items", () => {
    const items = makeItems(30)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // First item should be visible
    expect(text).toContain("Item 0")
    // Should show bottom overflow but not top
    expect(text).not.toContain("▲")
    expect(text).toContain("▼")
  })
})

// ============================================================================
// SelectList — maxVisible Windowing
// ============================================================================

describe("SelectList — maxVisible windowing", () => {
  test("maxVisible limits rendered items", () => {
    const options = makeSelectOptions(10)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(<SelectList items={options} maxVisible={5} />)
    const text = stripAnsi(app.text)

    const visible = countVisibleItems(text, "Option", 10)
    expect(visible).toBe(5)
  })

  test("all items shown when count <= maxVisible", () => {
    const options = makeSelectOptions(3)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<SelectList items={options} maxVisible={5} />)
    const text = stripAnsi(app.text)

    for (let i = 0; i < 3; i++) {
      expect(text).toContain(`Option ${i}`)
    }
  })

  test("all items shown when maxVisible is undefined", () => {
    const options = makeSelectOptions(5)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<SelectList items={options} />)
    const text = stripAnsi(app.text)

    for (let i = 0; i < 5; i++) {
      expect(text).toContain(`Option ${i}`)
    }
  })

  test("maxVisible=1 shows only highlighted item", () => {
    const options = makeSelectOptions(5)
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<SelectList items={options} maxVisible={1} highlightedIndex={2} />)
    const text = stripAnsi(app.text)

    expect(text).toContain("Option 2")
    const visible = countVisibleItems(text, "Option", 5)
    expect(visible).toBe(1)
  })

  test("maxVisible window centers on highlighted item", () => {
    const options = makeSelectOptions(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<SelectList items={options} maxVisible={5} highlightedIndex={5} />)
    const text = stripAnsi(app.text)

    // Highlighted item should be visible
    expect(text).toContain("Option 5")
    // Window centered: half = floor(5/2) = 2
    // startIdx = max(0, min(5-2, 10-5)) = 3
    // visible: 3,4,5,6,7
    expect(text).toContain("Option 3")
    expect(text).toContain("Option 4")
    expect(text).toContain("Option 6")
    expect(text).toContain("Option 7")
  })

  test("maxVisible window clamps at start", () => {
    const options = makeSelectOptions(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<SelectList items={options} maxVisible={5} highlightedIndex={0} />)
    const text = stripAnsi(app.text)

    for (let i = 0; i < 5; i++) {
      expect(text).toContain(`Option ${i}`)
    }
    expect(text).not.toContain("Option 5")
  })

  test("maxVisible window clamps at end", () => {
    const options = makeSelectOptions(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<SelectList items={options} maxVisible={5} highlightedIndex={9} />)
    const text = stripAnsi(app.text)

    for (let i = 5; i < 10; i++) {
      expect(text).toContain(`Option ${i}`)
    }
    expect(text).not.toContain("Option 4")
  })

  test("disabled items appear in visible window", () => {
    const options: SelectOption[] = [
      { label: "A", value: "a" },
      { label: "B", value: "b", disabled: true },
      { label: "C", value: "c" },
      { label: "D", value: "d" },
      { label: "E", value: "e" },
    ]
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<SelectList items={options} maxVisible={3} highlightedIndex={0} />)
    const text = stripAnsi(app.text)

    expect(text).toContain("A")
    expect(text).toContain("B")
    expect(text).toContain("C")
  })
})

// ============================================================================
// SelectList — Edge Cases
// ============================================================================

describe("SelectList — edge cases", () => {
  test("empty items list renders without errors", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<SelectList items={[]} />)
    const text = stripAnsi(app.text)
    expect(text).not.toContain("Option")
  })

  test("single item renders correctly", () => {
    const options = makeSelectOptions(1)
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<SelectList items={options} />)
    const text = stripAnsi(app.text)
    expect(text).toContain("Option 0")
  })

  test("maxVisible equal to item count shows all items", () => {
    const options = makeSelectOptions(5)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<SelectList items={options} maxVisible={5} />)
    const text = stripAnsi(app.text)

    for (let i = 0; i < 5; i++) {
      expect(text).toContain(`Option ${i}`)
    }
  })

  test("maxVisible larger than item count shows all items", () => {
    const options = makeSelectOptions(3)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<SelectList items={options} maxVisible={10} />)
    const text = stripAnsi(app.text)

    for (let i = 0; i < 3; i++) {
      expect(text).toContain(`Option ${i}`)
    }
  })
})
