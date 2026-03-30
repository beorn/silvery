/**
 * Tests for VirtualList scroll bugs:
 *
 * Bug 1 (scroll-blank-top): When scrolling down, blank rows appear between
 * the column header and first visible card. The leadingHeight placeholder
 * overshoots when estimated heights are larger than measured heights, because
 * unmeasured items above the render window use the inflated estimate.
 *
 * Bug 2 (scroll-bottom): Column scroll doesn't reach the bottom — items
 * hidden below the fold. The maxScrollOffset uses estimatedVisibleCount which
 * can be wrong when measured heights diverge from estimates.
 *
 * These bugs are tested at the useVirtualizer level (unit tests on the
 * computation engine) because the component-level createRenderer does
 * synchronous layout where all items get measured immediately. The real bugs
 * manifest when items outside the render window are never measured.
 */

import { describe, test, expect, beforeEach } from "vitest"

// Import the internal helpers we need to test.
// The hook itself is hard to test without React, but the helper functions
// and the hook's computation logic can be verified by simulating state.
import {
  calcAverageHeight,
  getHeight,
  sumHeights,
} from "../../packages/ag-react/src/hooks/useVirtualizer"

// ============================================================================
// Bug 1: getHeight / sumHeights for unmeasured items should use measured avg
// ============================================================================

describe("Bug 1: leadingHeight with unmeasured items", () => {
  test("getHeight uses measured average for unmeasured items when measurements exist", () => {
    // Simulate: estimate=4, but we measured some items at height=2.
    // Item at index 5 is unmeasured. It should use average measured (2), not estimate (4).
    const estimateHeight = 4
    const measuredHeights = new Map<string | number, number>([
      [10, 2],
      [11, 2],
      [12, 2],
      [13, 2],
      [14, 2],
    ])
    const getItemKey = (index: number) => index
    // Compute average measured height (what sumHeights would compute)
    const avgMeasured = calcAverageHeight(20, estimateHeight, measuredHeights)

    // Unmeasured item (index 5, key 5) — should use measured average (2), not estimate (4)
    const height = getHeight(5, estimateHeight, measuredHeights, getItemKey, avgMeasured)
    expect(height, "unmeasured item should use average measured height, not estimate").toBe(2)
  })

  test("getHeight returns estimate when no measurements exist", () => {
    const height = getHeight(0, 4, undefined, undefined)
    expect(height).toBe(4)
  })

  test("getHeight returns measured value when item is measured", () => {
    const measuredHeights = new Map<string | number, number>([[0, 3]])
    const height = getHeight(0, 4, measuredHeights, (i) => i)
    expect(height).toBe(3)
  })

  test("sumHeights for unmeasured range uses measured average", () => {
    // Items 0-9 are unmeasured (outside render window).
    // Items 10-14 are measured at height 2.
    // Estimate is 4.
    // sumHeights(0, 10) should use measured avg (2) per item = 20, not estimate (4) = 40.
    const estimateHeight = 4
    const measuredHeights = new Map<string | number, number>([
      [10, 2],
      [11, 2],
      [12, 2],
      [13, 3],
      [14, 2],
    ])
    const getItemKey = (index: number) => index

    const total = sumHeights(0, 10, estimateHeight, 0, measuredHeights, getItemKey)
    // Average measured = (2+2+2+3+2)/5 = 2.2
    // Expected: 10 * 2.2 = 22 (not 10 * 4 = 40)
    expect(total, "sumHeights for unmeasured items should use measured average").toBeLessThanOrEqual(25)
    expect(total, "sumHeights should not use the inflated estimate").toBeLessThan(40)
  })

  test("sumHeights with gap uses measured average for unmeasured items", () => {
    const estimateHeight = 4
    const measuredHeights = new Map<string | number, number>([
      [10, 2],
      [11, 2],
      [12, 2],
    ])
    const getItemKey = (index: number) => index

    // 5 unmeasured items (0-4) with gap=1
    const total = sumHeights(0, 5, estimateHeight, 1, measuredHeights, getItemKey)
    // Expected: 5 * 2 + 4 * 1 = 14 (with measured avg)
    // Wrong: 5 * 4 + 4 * 1 = 24 (with estimate)
    expect(total, "sumHeights with gap should use measured average").toBeLessThanOrEqual(16)
  })
})

// ============================================================================
// Bug 2: estimatedVisibleCount and max scroll offset
// ============================================================================

describe("Bug 2: scroll range reaches all items", () => {
  test("calcAverageHeight uses measurements over estimate", () => {
    const measuredHeights = new Map<string | number, number>([
      [0, 2],
      [1, 3],
      [2, 2],
    ])
    const avg = calcAverageHeight(20, 4, measuredHeights)
    // Average of measured: (2+3+2)/3 ≈ 2.33
    expect(avg).toBeCloseTo(2.33, 1)
    // Must not be the estimate (4)
    expect(avg).toBeLessThan(4)
  })

  test("sumHeights for trailing range uses measured average for unmeasured items", () => {
    // Items 15-19 are unmeasured (trailing, after render window).
    // Items 5-14 are measured at height 2.
    const estimateHeight = 4
    const measuredHeights = new Map<string | number, number>()
    for (let i = 5; i < 15; i++) {
      measuredHeights.set(i, 2)
    }
    const getItemKey = (index: number) => index

    // Trailing: sumHeights(15, 20) — 5 unmeasured items
    const total = sumHeights(15, 20, estimateHeight, 0, measuredHeights, getItemKey)
    // Should use measured avg (2), not estimate (4)
    // Expected: 5 * 2 = 10, not 5 * 4 = 20
    expect(total, "trailing sumHeights should use measured average").toBeLessThanOrEqual(12)
  })
})
