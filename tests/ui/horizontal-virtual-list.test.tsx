/**
 * HorizontalVirtualList tests.
 *
 * Verifies viewport-based item rendering and overflow indicator behavior,
 * particularly at boundary widths where items partially fit.
 *
 * Bug context: At certain terminal widths, calcActualVisibleCount used
 * ceil semantics which counted partially-fitting items as "visible",
 * causing overflow indicators to disappear and all items to render
 * with flexShrink=0 in a container too small to hold them.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/react"
import { HorizontalVirtualList } from "../../packages/ui/src/components/HorizontalVirtualList"

// ============================================================================
// Test Helpers
// ============================================================================

interface Column {
  id: string
  title: string
}

function makeColumns(n: number): Column[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `col-${i}`,
    title: `Column ${i}`,
  }))
}

function renderColumn(col: Column, _index: number) {
  return (
    <Box width={39}>
      <Text>{col.title}</Text>
    </Box>
  )
}

// ============================================================================
// Visible Count Tests (floor semantics)
// ============================================================================

describe("HorizontalVirtualList — visible count", () => {
  test("exact fit: 7 items × 39 in 273-wide viewport renders all 7", () => {
    const columns = makeColumns(8)
    // width=275, overflowIndicatorWidth=1 → effectiveViewport = 275-2 = 273
    // 7 × 39 = 273, exact fit
    const r = createRenderer({ cols: 275, rows: 10 })
    const app = r(
      <HorizontalVirtualList
        items={columns}
        width={275}
        height={10}
        itemWidth={39}
        scrollTo={0}
        overflowIndicator
        overflowIndicatorWidth={1}
        renderItem={renderColumn}
        keyExtractor={(col) => col.id}
      />,
    )
    const text = stripAnsi(app.text)
    // 7 columns should be visible (0-6)
    for (let i = 0; i < 7; i++) {
      expect(text).toContain(`Column ${i}`)
    }
    // 8th column should NOT be visible (it's beyond the viewport)
    expect(text).not.toContain("Column 7")
  })

  test("partial fit: 7 items × 39 in 278-wide viewport renders 7, not 8", () => {
    const columns = makeColumns(8)
    // width=280, overflowIndicatorWidth=1 → effectiveViewport = 280-2 = 278
    // 7 × 39 = 273 < 278 (7 fully fit, 8th would need 312)
    // Previously: ceil(278/39)=8, rendered all 8 → layout corruption
    // Now: floor(278/39)=7, renders only 7
    const r = createRenderer({ cols: 280, rows: 10 })
    const app = r(
      <HorizontalVirtualList
        items={columns}
        width={280}
        height={10}
        itemWidth={39}
        scrollTo={0}
        overflowIndicator
        overflowIndicatorWidth={1}
        renderItem={renderColumn}
        keyExtractor={(col) => col.id}
      />,
    )
    const text = stripAnsi(app.text)
    // 7 columns should be visible
    for (let i = 0; i < 7; i++) {
      expect(text).toContain(`Column ${i}`)
    }
    // 8th column should NOT be visible
    expect(text).not.toContain("Column 7")
  })

  test("all items fit: 8 items × 39 in 314-wide viewport renders all 8", () => {
    const columns = makeColumns(8)
    // width=316 → effectiveViewport = 314, 8 × 39 = 312 ≤ 314
    const r = createRenderer({ cols: 316, rows: 10 })
    const app = r(
      <HorizontalVirtualList
        items={columns}
        width={316}
        height={10}
        itemWidth={39}
        scrollTo={0}
        overflowIndicator
        overflowIndicatorWidth={1}
        renderItem={renderColumn}
        keyExtractor={(col) => col.id}
      />,
    )
    const text = stripAnsi(app.text)
    for (let i = 0; i < 8; i++) {
      expect(text).toContain(`Column ${i}`)
    }
  })
})

// ============================================================================
// Overflow Indicator Tests
// ============================================================================

describe("HorizontalVirtualList — overflow indicators", () => {
  test("shows right overflow indicator when items partially fit viewport", () => {
    const columns = makeColumns(8)
    // width=280, effectiveViewport=278, 7 fully fit, 1 hidden
    const r = createRenderer({ cols: 280, rows: 10 })
    const app = r(
      <HorizontalVirtualList
        items={columns}
        width={280}
        height={10}
        itemWidth={39}
        scrollTo={0}
        overflowIndicator
        overflowIndicatorWidth={1}
        renderItem={renderColumn}
        keyExtractor={(col) => col.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Should show right overflow indicator with count=1
    expect(text).toContain("1▶")
  })

  test("no overflow indicators when all items fit", () => {
    const columns = makeColumns(3)
    // 3 items × 39 = 117, width=200 → effectiveViewport=198, all fit
    const r = createRenderer({ cols: 200, rows: 10 })
    const app = r(
      <HorizontalVirtualList
        items={columns}
        width={200}
        height={10}
        itemWidth={39}
        scrollTo={0}
        overflowIndicator
        overflowIndicatorWidth={1}
        renderItem={renderColumn}
        keyExtractor={(col) => col.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).not.toContain("◀")
    expect(text).not.toContain("▶")
  })

  test("custom overflow indicator receives correct hidden count", () => {
    const columns = makeColumns(10)
    let capturedCount = -1
    // width=200, effectiveViewport=198, 10 items × 39 = 390
    // floor(198/39)=5, overflowAfter = 10-0-5 = 5
    const r = createRenderer({ cols: 200, rows: 10 })
    r(
      <HorizontalVirtualList
        items={columns}
        width={200}
        height={10}
        itemWidth={39}
        scrollTo={0}
        renderOverflowIndicator={(dir, count) => {
          if (dir === "after") capturedCount = count
          return (
            <Box width={1}>
              <Text>{dir === "before" ? "◀" : "▶"}</Text>
            </Box>
          )
        }}
        overflowIndicatorWidth={1}
        renderItem={renderColumn}
        keyExtractor={(col) => col.id}
      />,
    )
    expect(capturedCount).toBe(5)
  })
})

// ============================================================================
// Variable Width Tests
// ============================================================================

describe("HorizontalVirtualList — variable widths", () => {
  test("variable widths: only fully-fitting items rendered", () => {
    // Items with widths: 20, 30, 20, 30, 20 = 120 total
    // Viewport: 80. Items 0-2 (20+30+20=70 ≤ 80), item 3 would be 70+30=100 > 80
    const items = [
      { id: "a", w: 20 },
      { id: "b", w: 30 },
      { id: "c", w: 20 },
      { id: "d", w: 30 },
      { id: "e", w: 20 },
    ]
    const r = createRenderer({ cols: 80, rows: 10 })
    const app = r(
      <HorizontalVirtualList
        items={items}
        width={80}
        height={10}
        itemWidth={(item) => item.w}
        scrollTo={0}
        renderItem={(item) => (
          <Box width={item.w}>
            <Text>{item.id}</Text>
          </Box>
        )}
        keyExtractor={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("a")
    expect(text).toContain("b")
    expect(text).toContain("c")
    expect(text).not.toContain("d")
    expect(text).not.toContain("e")
  })
})

// ============================================================================
// Gap Tests
// ============================================================================

describe("HorizontalVirtualList — gap handling", () => {
  test("gap reduces number of visible items correctly", () => {
    // 5 items × 10 width with gap=2: items 0-4 would need 10+12+12+12+12=58
    // Viewport: 40. Items 0-2: 10+12+12=34 ≤ 40. Item 3: 34+12=46 > 40.
    const items = makeColumns(5)
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <HorizontalVirtualList
        items={items}
        width={40}
        height={10}
        itemWidth={10}
        gap={2}
        scrollTo={0}
        renderItem={(col) => (
          <Box width={10}>
            <Text>{col.title}</Text>
          </Box>
        )}
        keyExtractor={(col) => col.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Column 0")
    expect(text).toContain("Column 1")
    expect(text).toContain("Column 2")
    expect(text).not.toContain("Column 3")
  })
})

// ============================================================================
// Boundary Parametric Tests (catch width-dependent bugs)
// ============================================================================

describe("HorizontalVirtualList — boundary widths", () => {
  // The bug that motivated this: at specific widths, ceil-based visible count
  // equals total item count, causing overflowAfter=0 and rendering ALL items
  // with flexShrink=0 in a container too small to hold them.
  //
  // Test across the critical boundary where floor(effectiveViewport/itemWidth)
  // transitions from N-1 to N (matching item count).

  const ITEM_WIDTH = 39
  const ITEM_COUNT = 8
  const INDICATOR_WIDTH = 1

  // Invariant: rendered item count should never exceed what fully fits
  test.each([
    // effectiveViewport = width - 2*indicatorWidth
    // floor((ev + 0) / 39) = visible count
    { width: 275, expectedVisible: 7 }, // ev=273, 273/39=7.0, floor=7
    { width: 276, expectedVisible: 7 }, // ev=274, 274/39=7.02, floor=7
    { width: 278, expectedVisible: 7 }, // ev=276, 276/39=7.07, floor=7
    { width: 280, expectedVisible: 7 }, // ev=278, 278/39=7.13, floor=7 (was 8 with ceil!)
    { width: 300, expectedVisible: 7 }, // ev=298, 298/39=7.64, floor=7
    { width: 314, expectedVisible: 8 }, // ev=312, 312/39=8.0, floor=8 (all fit)
    { width: 316, expectedVisible: 8 }, // ev=314, all fit with room to spare
  ])("width=$width → $expectedVisible visible items", ({ width, expectedVisible }) => {
    const columns = makeColumns(ITEM_COUNT)
    const r = createRenderer({ cols: width, rows: 10 })
    const app = r(
      <HorizontalVirtualList
        items={columns}
        width={width}
        height={10}
        itemWidth={ITEM_WIDTH}
        scrollTo={0}
        overflowIndicator
        overflowIndicatorWidth={INDICATOR_WIDTH}
        renderItem={renderColumn}
        keyExtractor={(col) => col.id}
      />,
    )
    const text = stripAnsi(app.text)

    // Exactly expectedVisible columns should appear
    for (let i = 0; i < expectedVisible; i++) {
      expect(text, `Column ${i} should be visible at width=${width}`).toContain(`Column ${i}`)
    }
    for (let i = expectedVisible; i < ITEM_COUNT; i++) {
      expect(text, `Column ${i} should NOT be visible at width=${width}`).not.toContain(`Column ${i}`)
    }

    // Overflow indicator invariant
    const hiddenCount = ITEM_COUNT - expectedVisible
    if (hiddenCount > 0) {
      expect(text, `Should show right overflow indicator at width=${width}`).toContain(`${hiddenCount}▶`)
    }
  })

  // Property: total rendered width never exceeds effective viewport
  test.each([270, 275, 278, 280, 285, 290, 300, 310, 315, 320])(
    "width=%i: rendered items fit within viewport",
    (width) => {
      const columns = makeColumns(ITEM_COUNT)
      const effectiveViewport = width - 2 * INDICATOR_WIDTH
      const expectedVisible = Math.min(ITEM_COUNT, Math.floor(effectiveViewport / ITEM_WIDTH))
      const totalRenderedWidth = expectedVisible * ITEM_WIDTH

      expect(totalRenderedWidth).toBeLessThanOrEqual(effectiveViewport)
    },
  )
})
