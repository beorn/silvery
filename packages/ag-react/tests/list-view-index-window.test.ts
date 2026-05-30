/**
 * ListView index-window helpers — pure-math regression tests.
 *
 * Two bugs from the 2026-05-09 /pro audit (Kimi K2.6):
 *
 *   B. `indexTrailingSpacer` must never go negative — Yoga rejects
 *      negative height props. The expression is over-determined; tiny
 *      rounding errors from fractional measured heights can dip it
 *      below zero. The helper clamps to >= 0.
 *
 *   C. `viewportFirstItem` mapping (child-index -> item-index) must
 *      account for the interstitial gap-Box (or `renderSeparator`)
 *      that the render path injects between every pair of consecutive
 *      visible items. Without that adjustment, child index 1 (a gap
 *      node) maps to "item 1" — sending the viewport to the wrong
 *      window once the user scrolls.
 *
 * These tests are pure-math: no renderer, no React. The helpers are
 * the same code paths the component uses, so any regression here also
 * regresses the live render.
 */

import { describe, test, expect } from "vitest"
import {
  computeIndexTrailingSpacer,
  createHeightModel,
  mapChildIndexToItem,
} from "@silvery/ag-react"

describe("computeIndexTrailingSpacer (Bug B — never negative)", () => {
  test("uniform heights, gap=0, end at every position — always non-negative", () => {
    const n = 10
    const m = createHeightModel({ itemCount: n, estimate: () => 5, gap: 0 })
    for (let end = 0; end <= n; end++) {
      const spacer = computeIndexTrailingSpacer(m, end, n, 0)
      expect(spacer, `spacer at end=${end} (gap=0) must be >= 0`).toBeGreaterThanOrEqual(0)
    }
  })

  test("uniform heights, gap=2, end at every position — always non-negative", () => {
    const n = 10
    const m = createHeightModel({ itemCount: n, estimate: () => 5, gap: 2 })
    for (let end = 0; end <= n; end++) {
      const spacer = computeIndexTrailingSpacer(m, end, n, 2)
      expect(spacer, `spacer at end=${end} (gap=2) must be >= 0`).toBeGreaterThanOrEqual(0)
    }
  })

  test("at end-of-list (end === itemCount) the spacer is exactly 0", () => {
    const n = 7
    const m = createHeightModel({ itemCount: n, estimate: () => 4, gap: 3 })
    expect(computeIndexTrailingSpacer(m, n, n, 3)).toBe(0)
  })

  test("matches sumHeights(end, n) — the rendered-layout invariant", () => {
    // Reference value: sum of effective heights for [end, n) plus the gaps
    // hidden by the trailing spacer. When at least one visible item precedes
    // the spacer, the boundary gap after that last visible item is hidden too.
    const n = 6
    const heights = [3, 7, 2, 5, 4, 6]
    const gap = 2
    const m = createHeightModel({ itemCount: n, estimate: (i) => heights[i] ?? 1, gap })
    for (let end = 0; end <= n; end++) {
      const trailingCount = n - end
      const sumHeights = heights.slice(end).reduce((s, h) => s + h, 0)
      const hiddenGaps =
        (end === 0 ? Math.max(0, trailingCount - 1) : trailingCount) * gap
      const expected = sumHeights + hiddenGaps
      expect(
        computeIndexTrailingSpacer(m, end, n, gap),
        `end=${end}: expected ${expected} (= sumHeights ${sumHeights} + hiddenGaps ${hiddenGaps})`,
      ).toBe(expected)
    }
  })

  test("variable heights with measurements — never negative across all end positions", () => {
    const n = 12
    const m = createHeightModel({ itemCount: n, estimate: () => 4, gap: 1 })
    // Measure some items larger than estimate, others smaller — exercises
    // the totalRows arithmetic with realistic noise.
    m.setMeasured(2, 9)
    m.setMeasured(5, 1)
    m.setMeasured(8, 7)
    m.setMeasured(11, 2)
    for (let end = 0; end <= n; end++) {
      const spacer = computeIndexTrailingSpacer(m, end, n, 1)
      expect(
        spacer,
        `spacer at end=${end} (variable measured) must be >= 0`,
      ).toBeGreaterThanOrEqual(0)
    }
  })

  test("itemCount=0 returns 0", () => {
    const m = createHeightModel({ itemCount: 0, estimate: () => 1, gap: 0 })
    expect(computeIndexTrailingSpacer(m, 0, 0, 0)).toBe(0)
    expect(computeIndexTrailingSpacer(m, 5, 0, 2)).toBe(0)
  })

  test("end > itemCount is clamped to 0 (defensive)", () => {
    const n = 5
    const m = createHeightModel({ itemCount: n, estimate: () => 3, gap: 1 })
    expect(computeIndexTrailingSpacer(m, n + 10, n, 1)).toBe(0)
  })
})

describe("mapChildIndexToItem (Bug C — gap-Box accounting)", () => {
  test("no leading spacer, gap=0 — child index == item index", () => {
    const opts = {
      hasLeadingSpacer: false,
      prevStart: 0,
      prevEnd: 5,
      hasInterstitial: false,
    }
    expect(mapChildIndexToItem(0, opts)).toEqual({ kind: "item", index: 0 })
    expect(mapChildIndexToItem(1, opts)).toEqual({ kind: "item", index: 1 })
    expect(mapChildIndexToItem(4, opts)).toEqual({ kind: "item", index: 4 })
    expect(mapChildIndexToItem(5, opts)).toEqual({ kind: "after" })
  })

  test("with leading spacer, gap=0 — items shift by 1", () => {
    const opts = {
      hasLeadingSpacer: true,
      prevStart: 10,
      prevEnd: 13,
      hasInterstitial: false,
    }
    expect(mapChildIndexToItem(0, opts)).toEqual({ kind: "before" })
    expect(mapChildIndexToItem(1, opts)).toEqual({ kind: "item", index: 10 })
    expect(mapChildIndexToItem(2, opts)).toEqual({ kind: "item", index: 11 })
    expect(mapChildIndexToItem(3, opts)).toEqual({ kind: "item", index: 12 })
    expect(mapChildIndexToItem(4, opts)).toEqual({ kind: "after" })
  })

  test("gap > 0 — odd children are interstitial gap-Boxes (Bug C lock-in)", () => {
    // 3 visible items with stride=2:
    //   child 0 = item(prevStart)
    //   child 1 = gap
    //   child 2 = item(prevStart+1)
    //   child 3 = gap
    //   child 4 = item(prevStart+2)
    //   child 5 = after
    const opts = {
      hasLeadingSpacer: false,
      prevStart: 0,
      prevEnd: 3,
      hasInterstitial: true,
    }
    expect(mapChildIndexToItem(0, opts)).toEqual({ kind: "item", index: 0 })
    expect(mapChildIndexToItem(1, opts)).toEqual({ kind: "interstitial" })
    expect(mapChildIndexToItem(2, opts)).toEqual({ kind: "item", index: 1 })
    expect(mapChildIndexToItem(3, opts)).toEqual({ kind: "interstitial" })
    expect(mapChildIndexToItem(4, opts)).toEqual({ kind: "item", index: 2 })
    expect(mapChildIndexToItem(5, opts)).toEqual({ kind: "after" })
  })

  test("gap > 0 with leading spacer — combined offset + stride", () => {
    // Window [10..13) with leading spacer + interstitials:
    //   child 0 = leading spacer
    //   child 1 = item 10
    //   child 2 = gap
    //   child 3 = item 11
    //   child 4 = gap
    //   child 5 = item 12
    //   child 6 = after
    const opts = {
      hasLeadingSpacer: true,
      prevStart: 10,
      prevEnd: 13,
      hasInterstitial: true,
    }
    expect(mapChildIndexToItem(0, opts)).toEqual({ kind: "before" })
    expect(mapChildIndexToItem(1, opts)).toEqual({ kind: "item", index: 10 })
    expect(mapChildIndexToItem(2, opts)).toEqual({ kind: "interstitial" })
    expect(mapChildIndexToItem(3, opts)).toEqual({ kind: "item", index: 11 })
    expect(mapChildIndexToItem(4, opts)).toEqual({ kind: "interstitial" })
    expect(mapChildIndexToItem(5, opts)).toEqual({ kind: "item", index: 12 })
    expect(mapChildIndexToItem(6, opts)).toEqual({ kind: "after" })
  })

  test("regression — pre-fix bug: gap > 0 mapping treated child 1 as item 1", () => {
    // Lock in that the BUGGY mapping never reappears. Pre-fix code did:
    //   viewportFirstItem = prev.startIndex + (f - leadingOffset)
    // With prev.startIndex=0 and f=1, that gave item index 1 — but child
    // 1 is the gap-Box between item 0 and item 1, NOT item 1 itself.
    const opts = {
      hasLeadingSpacer: false,
      prevStart: 0,
      prevEnd: 5,
      hasInterstitial: true,
    }
    const mapped = mapChildIndexToItem(1, opts)
    // The buggy result would be { kind: "item", index: 1 }. The correct
    // result is "interstitial".
    expect(mapped.kind).toBe("interstitial")
    // Item indices must be derived from EVEN local indices only.
    expect(mapChildIndexToItem(2, opts)).toEqual({ kind: "item", index: 1 })
  })

  test("empty window (prevEnd == prevStart) — everything maps to before/after", () => {
    const opts = {
      hasLeadingSpacer: false,
      prevStart: 5,
      prevEnd: 5,
      hasInterstitial: false,
    }
    expect(mapChildIndexToItem(0, opts)).toEqual({ kind: "after" })
  })

  test("single visible item with gap=true — no trailing interstitial", () => {
    // m=1: only item, no gap after it (renderer skips gap on last).
    //   child 0 = item
    //   child 1 = after
    const opts = {
      hasLeadingSpacer: false,
      prevStart: 7,
      prevEnd: 8,
      hasInterstitial: true,
    }
    expect(mapChildIndexToItem(0, opts)).toEqual({ kind: "item", index: 7 })
    expect(mapChildIndexToItem(1, opts)).toEqual({ kind: "after" })
  })
})
