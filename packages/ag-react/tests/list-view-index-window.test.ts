/**
 * ListView index-window helpers — pure-math regression tests.
 *
 * Bug B from the 2026-05-09 /pro audit (Kimi K2.6):
 *   `indexTrailingSpacer` must never go negative — Yoga rejects
 *   negative height props. The expression is over-determined; tiny
 *   rounding errors from fractional measured heights can dip it
 *   below zero. The helper clamps to >= 0.
 *
 * These tests are pure-math: no renderer, no React. The helper is
 * the same code path the component uses, so any regression here also
 * regresses the live render.
 */

import { describe, test, expect } from "vitest"
import { computeIndexTrailingSpacer, createHeightModel } from "@silvery/ag-react"

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
    // Reference value: sum of effective heights for [end, n) plus the
    // (m-1) gaps BETWEEN those items. The spacer represents that exact
    // slice of the virtual list.
    const n = 6
    const heights = [3, 7, 2, 5, 4, 6]
    const gap = 2
    const m = createHeightModel({ itemCount: n, estimate: (i) => heights[i] ?? 1, gap })
    for (let end = 0; end <= n; end++) {
      const trailingCount = n - end
      const sumHeights = heights.slice(end).reduce((s, h) => s + h, 0)
      const internalGaps = Math.max(0, trailingCount - 1) * gap
      const expected = sumHeights + internalGaps
      expect(
        computeIndexTrailingSpacer(m, end, n, gap),
        `end=${end}: expected ${expected} (= sumHeights ${sumHeights} + internalGaps ${internalGaps})`,
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
