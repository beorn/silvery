/**
 * HeightModel — Fenwick-backed predicted-height source for variable-height
 * lists. See `packages/ag-react/src/ui/components/list-view/height-model.ts`
 * for the full contract.
 *
 * Bead: km-silvery.listview-heightmodel-unify (Phase 1).
 */

import { describe, test, expect } from "vitest"
import { createHeightModel, shouldKeepHeightModelSnapshot } from "@silvery/ag-react"
import type { HeightModel } from "@silvery/ag-react"
import {
  averageMeasuredHeightForWidth,
  getHeight,
  makeMeasureKey,
  sumHeights,
} from "../../packages/ag-react/src/hooks/useVirtualizer"
// Touch the type so it isn't pruned by the linter — semi-public surface check.
const _typeCheck: HeightModel | null = null
void _typeCheck

describe("HeightModel", () => {
  test("empty model — totalRows is 0", () => {
    const m = createHeightModel({ itemCount: 0, estimate: () => 1, gap: 0 })
    expect(m.itemCount).toBe(0)
    expect(m.totalRows()).toBe(0)
    expect(m.prefixSum(0)).toBe(0)
    expect(m.prefixSum(5)).toBe(0)
  })

  test("all-estimate (no measurements) — totalRows = n*estimate + (n-1)*gap", () => {
    const m = createHeightModel({ itemCount: 5, estimate: () => 3, gap: 1 })
    // 5 * 3 + 4 * 1 = 15 + 4 = 19
    expect(m.totalRows()).toBe(19)
    expect(m.prefixSum(0)).toBe(0)
    expect(m.prefixSum(1)).toBe(3)
    expect(m.prefixSum(3)).toBe(9)
    expect(m.prefixSum(5)).toBe(15)
  })

  test("variable estimate — prefixSum follows the function", () => {
    const m = createHeightModel({ itemCount: 4, estimate: (i) => i + 1, gap: 0 })
    // heights: [1, 2, 3, 4]
    expect(m.prefixSum(0)).toBe(0)
    expect(m.prefixSum(1)).toBe(1)
    expect(m.prefixSum(2)).toBe(3)
    expect(m.prefixSum(3)).toBe(6)
    expect(m.prefixSum(4)).toBe(10)
    expect(m.totalRows()).toBe(10)
  })

  test("setMeasured overrides estimate at that index", () => {
    const m = createHeightModel({ itemCount: 5, estimate: () => 2, gap: 0 })
    expect(m.totalRows()).toBe(10)

    m.setMeasured(2, 7)
    // heights: [2, 2, 7, 2, 2] → 15
    expect(m.totalRows()).toBe(15)
    expect(m.prefixSum(2)).toBe(4)
    expect(m.prefixSum(3)).toBe(11)
    expect(m.prefixSum(5)).toBe(15)

    // Re-measure same index — delta applied correctly, no double-counting.
    m.setMeasured(2, 4)
    // heights: [2, 2, 4, 2, 2] → 12
    expect(m.totalRows()).toBe(12)
    expect(m.prefixSum(3)).toBe(8)
  })

  test("setMeasured out-of-bounds is a no-op", () => {
    const m = createHeightModel({ itemCount: 3, estimate: () => 5, gap: 0 })
    m.setMeasured(-1, 999)
    m.setMeasured(3, 999) // index === count is out of bounds
    m.setMeasured(100, 999)
    expect(m.totalRows()).toBe(15)
  })

  test("gap math — total = sum(heights) + (n-1)*gap (NOT n*gap)", () => {
    // Per /pro review: gap is between items, not after each item.
    const m = createHeightModel({ itemCount: 1, estimate: () => 10, gap: 3 })
    expect(m.totalRows()).toBe(10) // single item — no inter-item gap

    const m2 = createHeightModel({ itemCount: 3, estimate: () => 10, gap: 3 })
    // 30 + 2*3 = 36
    expect(m2.totalRows()).toBe(36)
  })

  test("rowOfIndex includes inter-item gaps", () => {
    const m = createHeightModel({ itemCount: 4, estimate: (i) => i + 1, gap: 2 })
    // heights [1, 2, 3, 4], two-row gaps between items.
    expect(m.rowOfIndex(0)).toBe(0)
    expect(m.rowOfIndex(1)).toBe(1 + 2)
    expect(m.rowOfIndex(2)).toBe(1 + 2 + 2 + 2)
    expect(m.rowOfIndex(3)).toBe(1 + 2 + 2 + 2 + 3 + 2)
    expect(m.rowOfIndex(99)).toBe(m.totalRows())
  })

  test("rowOfIndex matches useVirtualizer spacer row math", () => {
    const heights = [1, 2, 3, 4]
    const gap = 2
    const m = createHeightModel({ itemCount: heights.length, estimate: (i) => heights[i]!, gap })

    for (let i = 0; i < heights.length; i++) {
      const virtualizerTop = sumHeights(0, i, (j) => heights[j]!, gap) + (i > 0 ? gap : 0)
      expect(m.rowOfIndex(i)).toBe(virtualizerTop)
    }
  })

  // km @km/silvery/15369 Phase A — measured-mode compat-path parity.
  //
  // The measured-mode viewport path sums heights via `useVirtualizer.sumHeights`,
  // which resolves each row as: measured cache → avgMeasured fallback (fixed
  // estimate only) → estimate. ListView configures HeightModel with that exact
  // per-index resolution (`effectiveEstimate`, which is logically identical to the
  // exported `getHeight`). These two tests pin the two paths to agree on total
  // content height and on leading-spacer (top-of-item-k) geometry — including the
  // spacer boundary gap HeightModel owns for k>0 — so measured mode is a verified
  // compat path rather than an independent measurement authority. A divergence in
  // either path's gap accounting or avgMeasured fallback fails here.
  test("measured-mode sumHeights agrees with HeightModel under a fixed estimate + sparse measurements", () => {
    const itemCount = 8
    const gap = 2
    const estimate = 3 // fixed numeric → unmeasured rows fall back to avgMeasured
    const width = 80
    const getItemKey = (i: number): string => `row-${i}`
    // Sparse measurements at the current width; the rest fall back to avgMeasured.
    const measuredHeights = new Map<string, number>([
      [makeMeasureKey("row-1", width), 5],
      [makeMeasureKey("row-2", width), 9],
      [makeMeasureKey("row-5", width), 1],
    ])
    const avg = averageMeasuredHeightForWidth(measuredHeights, width)
    // Mirror ListView's effectiveEstimate exactly (measured ?? avgMeasured ?? estimate).
    const effectiveEstimate = (i: number): number =>
      getHeight(i, estimate, measuredHeights, getItemKey, avg, width)
    const m = createHeightModel({ itemCount, estimate: effectiveEstimate, gap })

    expect(m.totalRows()).toBe(
      sumHeights(0, itemCount, estimate, gap, measuredHeights, getItemKey, width),
    )
    for (let k = 0; k < itemCount; k++) {
      const virtualizerLeading = sumHeights(0, k, estimate, gap, measuredHeights, getItemKey, width)
      expect(m.rowOfIndex(k)).toBe(virtualizerLeading + (k > 0 ? gap : 0))
    }
  })

  test("measured-mode sumHeights agrees with HeightModel under a per-index function estimate", () => {
    const itemCount = 6
    const gap = 1
    const estimate = (i: number): number => i + 2 // function estimate → no avgMeasured fallback
    const width = 100
    const getItemKey = (i: number): string => `fn-${i}`
    const measuredHeights = new Map<string, number>([
      [makeMeasureKey("fn-2", width), 8],
      [makeMeasureKey("fn-4", width), 3],
    ])
    const avg = averageMeasuredHeightForWidth(measuredHeights, width)
    const effectiveEstimate = (i: number): number =>
      getHeight(i, estimate, measuredHeights, getItemKey, avg, width)
    const m = createHeightModel({ itemCount, estimate: effectiveEstimate, gap })

    expect(m.totalRows()).toBe(
      sumHeights(0, itemCount, estimate, gap, measuredHeights, getItemKey, width),
    )
    for (let k = 0; k < itemCount; k++) {
      expect(m.rowOfIndex(k)).toBe(
        sumHeights(0, k, estimate, gap, measuredHeights, getItemKey, width) + (k > 0 ? gap : 0),
      )
    }
  })

  test("indexAtRow returns the item at or before a row", () => {
    const m = createHeightModel({ itemCount: 4, estimate: (i) => i + 1, gap: 2 })
    expect(m.indexAtRow(-1)).toBe(0)
    expect(m.indexAtRow(0)).toBe(0)
    expect(m.indexAtRow(1)).toBe(0)
    expect(m.indexAtRow(2)).toBe(0)
    expect(m.indexAtRow(3)).toBe(1)
    expect(m.indexAtRow(4)).toBe(1)
    expect(m.indexAtRow(5)).toBe(1)
    expect(m.indexAtRow(6)).toBe(1)
    expect(m.indexAtRow(7)).toBe(2)
    expect(m.indexAtRow(11)).toBe(2)
    expect(m.indexAtRow(12)).toBe(3)
    expect(m.indexAtRow(999)).toBe(3)
  })

  test("indexAtRow is null for an empty model", () => {
    const m = createHeightModel({ itemCount: 0, estimate: () => 1, gap: 0 })
    expect(m.indexAtRow(0)).toBeNull()
  })

  test("resize grow — new indices use current estimate", () => {
    const m = createHeightModel({ itemCount: 3, estimate: () => 4, gap: 0 })
    m.setMeasured(1, 10)
    expect(m.totalRows()).toBe(4 + 10 + 4) // 18

    m.update({ itemCount: 5 })
    // heights: [4, 10, 4, 4, 4] → 26
    expect(m.itemCount).toBe(5)
    expect(m.totalRows()).toBe(26)
    expect(m.prefixSum(2)).toBe(14)
  })

  test("resize shrink — drops measurements past the new count", () => {
    const m = createHeightModel({ itemCount: 5, estimate: () => 2, gap: 0 })
    m.setMeasured(4, 100)
    expect(m.totalRows()).toBe(2 + 2 + 2 + 2 + 100) // 108

    m.update({ itemCount: 3 })
    // measurement at index 4 is dropped; heights: [2, 2, 2] → 6
    expect(m.itemCount).toBe(3)
    expect(m.totalRows()).toBe(6)

    // If we grow back, the previously-measured index now uses the estimate
    // (the measurement was dropped — it doesn't resurrect).
    m.update({ itemCount: 5 })
    expect(m.totalRows()).toBe(10)
  })

  test("setEstimate replaces the function and rebuilds (preserving measurements)", () => {
    const m = createHeightModel({ itemCount: 3, estimate: () => 2, gap: 0 })
    m.setMeasured(1, 10)
    expect(m.totalRows()).toBe(14) // 2 + 10 + 2

    m.setEstimate(() => 5)
    // measurements survive a rebuild — index 1 still 10, others now 5
    expect(m.totalRows()).toBe(20) // 5 + 10 + 5
  })

  test("update({estimate}) is equivalent to setEstimate", () => {
    const m = createHeightModel({ itemCount: 3, estimate: () => 2, gap: 0 })
    m.setMeasured(0, 7)
    m.update({ estimate: () => 4 })
    // heights: [7, 4, 4] → 15
    expect(m.totalRows()).toBe(15)
  })

  test("update with gap change — recomputes total without rebuilding", () => {
    const m = createHeightModel({ itemCount: 4, estimate: () => 5, gap: 0 })
    expect(m.totalRows()).toBe(20)

    m.update({ gap: 2 })
    // 20 + 3*2 = 26
    expect(m.totalRows()).toBe(26)

    // Measurements unchanged after gap update.
    m.setMeasured(0, 1)
    // heights: [1, 5, 5, 5] = 16; +3*2 = 22
    expect(m.totalRows()).toBe(22)
  })

  test("large list (10K items) — operations stay O(log n)", () => {
    const N = 10_000
    const m = createHeightModel({ itemCount: N, estimate: () => 1, gap: 0 })

    // Sanity baseline.
    expect(m.totalRows()).toBe(N)
    expect(m.prefixSum(N / 2)).toBe(N / 2)

    // 1000 random measurements; if Fenwick is O(log n) this is fast.
    // (We assert correctness, not wall-clock — but a quadratic impl on
    // 10K items would crawl.)
    const t0 = performance.now()
    for (let i = 0; i < 1000; i++) {
      const idx = (i * 7919) % N // pseudo-random, stable
      m.setMeasured(idx, 2)
    }
    const elapsed = performance.now() - t0
    // 1000 setMeasured @ O(log 10000) ≈ 1000 * ~14 ≈ 14k ops; should be <50ms.
    expect(elapsed).toBeLessThan(500)

    // Spot-check a few prefix sums.
    const sumAll = m.prefixSum(N)
    expect(sumAll).toBe(m.totalRows()) // gap=0 so they match
    // sumAll should equal N + (number of items measured to height 2)
    // — each measurement adds 1 over the original height of 1.
    const measuredCount = new Set(Array.from({ length: 1000 }, (_, i) => (i * 7919) % N)).size
    expect(sumAll).toBe(N + measuredCount)
  })

  test("itemCount accessor is live", () => {
    const m = createHeightModel({ itemCount: 0, estimate: () => 1, gap: 0 })
    expect(m.itemCount).toBe(0)
    m.update({ itemCount: 7 })
    expect(m.itemCount).toBe(7)
    m.update({ itemCount: 3 })
    expect(m.itemCount).toBe(3)
  })

  test("prefixSum clamps to [0, itemCount]", () => {
    const m = createHeightModel({ itemCount: 3, estimate: () => 4, gap: 0 })
    expect(m.prefixSum(-1)).toBe(0)
    expect(m.prefixSum(0)).toBe(0)
    expect(m.prefixSum(3)).toBe(12)
    expect(m.prefixSum(100)).toBe(12)
  })

  test("wheel gesture keeps the height-model snapshot for measurement-only rebuilds", () => {
    expect(
      shouldKeepHeightModelSnapshot({
        wheelGestureActive: true,
        itemCount: 100,
        currentItemCount: 100,
        gap: 1,
        previousGap: 1,
        viewportWidth: 80,
        previousViewportWidth: 80,
        estimateKey: 3,
        previousEstimateKey: 3,
      }),
    ).toBe(true)

    expect(
      shouldKeepHeightModelSnapshot({
        wheelGestureActive: true,
        itemCount: 101,
        currentItemCount: 100,
        gap: 1,
        previousGap: 1,
        viewportWidth: 80,
        previousViewportWidth: 80,
        estimateKey: 3,
        previousEstimateKey: 3,
      }),
    ).toBe(false)

    expect(
      shouldKeepHeightModelSnapshot({
        wheelGestureActive: true,
        itemCount: 100,
        currentItemCount: 100,
        gap: 1,
        previousGap: 1,
        viewportWidth: 100,
        previousViewportWidth: 80,
        estimateKey: 3,
        previousEstimateKey: 3,
      }),
    ).toBe(false)
  })
})
