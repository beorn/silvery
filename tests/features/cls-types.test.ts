/**
 * CLS types + rect-diff math — unit tests.
 *
 * Pure functions only: no pipeline, no termless, no render. Exercises the
 * data shape and the impact-score arithmetic that the pipeline hook and
 * strict-mode check both depend on.
 *
 * Bead: km-silvery.cls-instrumentation-primitive
 */

import { describe, expect, test } from "vitest"
import {
  aggregateReport,
  aggregateUnexpectedScore,
  computeShiftScore,
  emptyReport,
  makeShift,
  type LayoutShift,
} from "@silvery/ag/cls"
import type { Rect } from "@silvery/ag/types"

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })

describe("computeShiftScore", () => {
  test("identical rects → score 0", () => {
    const r = rect(0, 0, 10, 5)
    expect(computeShiftScore(r, r)).toBe(0)
  })

  test("equal-by-value rects → score 0 (rectEqual compares by value, not identity)", () => {
    expect(computeShiftScore(rect(3, 4, 8, 2), rect(3, 4, 8, 2))).toBe(0)
  })

  test("horizontal-only shift → area × dx", () => {
    // 4×2 rect (area 8) moves from x=0 to x=3 — distance 3, score 8 × 3 = 24
    expect(computeShiftScore(rect(0, 0, 4, 2), rect(3, 0, 4, 2))).toBe(24)
  })

  test("vertical-only shift → area × dy", () => {
    // 2×5 rect (area 10) moves from y=0 to y=4 — distance 4, score 10 × 4 = 40
    expect(computeShiftScore(rect(0, 0, 2, 5), rect(0, 4, 2, 5))).toBe(40)
  })

  test("diagonal shift → area × euclidean distance", () => {
    // 3×3 rect (area 9) moves (3, 4) — distance 5, score 9 × 5 = 45
    expect(computeShiftScore(rect(0, 0, 3, 3), rect(3, 4, 3, 3))).toBe(45)
  })

  test("shift + resize → score uses MAX of from-area and to-area", () => {
    // 2×2 rect (area 4) grows to 4×4 (area 16) and moves 1 cell right
    // Score = max(4, 16) × 1 = 16
    expect(computeShiftScore(rect(0, 0, 2, 2), rect(1, 0, 4, 4))).toBe(16)
  })

  test("same-position resize → score uses MAX area × distance=0 = 0", () => {
    // A pure size change with no position move is not a "shift" in the
    // distance sense — CLS Web treats this the same. Tests downstream
    // (sticky-expand, etc.) can detect resize separately via dimension diffs.
    expect(computeShiftScore(rect(0, 0, 2, 2), rect(0, 0, 4, 4))).toBe(0)
  })
})

describe("makeShift", () => {
  test("equal rects → null (caller can skip without branching)", () => {
    expect(makeShift("block-A", rect(0, 0, 10, 5), rect(0, 0, 10, 5), 100, "unexpected")).toBeNull()
  })

  test("different rects → populated LayoutShift", () => {
    const s = makeShift("block-A", rect(0, 0, 10, 5), rect(2, 0, 10, 5), 200, "user-action")
    expect(s).not.toBeNull()
    expect(s).toEqual({
      blockId: "block-A",
      fromRect: rect(0, 0, 10, 5),
      toRect: rect(2, 0, 10, 5),
      frameTimestamp: 200,
      reflowReason: "user-action",
    })
  })

  test("preserves reflowReason taxonomy", () => {
    for (const reason of ["user-action", "unexpected", "animation", "content-arrival"] as const) {
      const s = makeShift("X", rect(0, 0, 1, 1), rect(1, 1, 1, 1), 0, reason)
      expect(s?.reflowReason).toBe(reason)
    }
  })
})

describe("aggregateReport", () => {
  test("empty input → empty report shape", () => {
    expect(aggregateReport([])).toEqual({ shifts: [], cumulativeScore: 0, unexpectedShifts: [] })
  })

  test("cumulativeScore sums every shift regardless of reason", () => {
    const shifts: LayoutShift[] = [
      // 8 area × 1 distance = 8 (unexpected)
      { blockId: "A", fromRect: rect(0, 0, 4, 2), toRect: rect(1, 0, 4, 2), frameTimestamp: 0, reflowReason: "unexpected" },
      // 9 area × 5 distance = 45 (user-action — counted in cumulative, NOT in unexpected)
      { blockId: "B", fromRect: rect(0, 0, 3, 3), toRect: rect(3, 4, 3, 3), frameTimestamp: 1, reflowReason: "user-action" },
    ]
    const report = aggregateReport(shifts)
    expect(report.cumulativeScore).toBe(53)
    expect(report.unexpectedShifts).toHaveLength(1)
    expect(report.unexpectedShifts[0].blockId).toBe("A")
  })

  test("unexpectedShifts holds only reflowReason=unexpected", () => {
    const shifts: LayoutShift[] = [
      { blockId: "A", fromRect: rect(0, 0, 1, 1), toRect: rect(1, 0, 1, 1), frameTimestamp: 0, reflowReason: "unexpected" },
      { blockId: "B", fromRect: rect(0, 0, 1, 1), toRect: rect(1, 0, 1, 1), frameTimestamp: 0, reflowReason: "user-action" },
      { blockId: "C", fromRect: rect(0, 0, 1, 1), toRect: rect(1, 0, 1, 1), frameTimestamp: 0, reflowReason: "animation" },
      { blockId: "D", fromRect: rect(0, 0, 1, 1), toRect: rect(1, 0, 1, 1), frameTimestamp: 0, reflowReason: "content-arrival" },
      { blockId: "E", fromRect: rect(0, 0, 1, 1), toRect: rect(2, 0, 1, 1), frameTimestamp: 0, reflowReason: "unexpected" },
    ]
    const ids = aggregateReport(shifts).unexpectedShifts.map((s) => s.blockId)
    expect(ids).toEqual(["A", "E"])
  })

  test("shifts array is preserved verbatim (same reference, same order)", () => {
    const shifts: LayoutShift[] = [
      { blockId: "Z", fromRect: rect(0, 0, 1, 1), toRect: rect(1, 0, 1, 1), frameTimestamp: 5, reflowReason: "unexpected" },
    ]
    expect(aggregateReport(shifts).shifts).toBe(shifts)
  })
})

describe("aggregateUnexpectedScore", () => {
  test("ignores non-unexpected reasons", () => {
    const shifts: LayoutShift[] = [
      // 4 area × 1 = 4 (user-action — should be excluded)
      { blockId: "A", fromRect: rect(0, 0, 2, 2), toRect: rect(1, 0, 2, 2), frameTimestamp: 0, reflowReason: "user-action" },
      // 8 area × 1 = 8 (unexpected — included)
      { blockId: "B", fromRect: rect(0, 0, 4, 2), toRect: rect(1, 0, 4, 2), frameTimestamp: 0, reflowReason: "unexpected" },
    ]
    expect(aggregateUnexpectedScore(shifts)).toBe(8)
  })

  test("empty input → 0", () => {
    expect(aggregateUnexpectedScore([])).toBe(0)
  })

  test("all-unexpected → same as raw cumulative sum", () => {
    const shifts: LayoutShift[] = [
      { blockId: "A", fromRect: rect(0, 0, 2, 2), toRect: rect(1, 0, 2, 2), frameTimestamp: 0, reflowReason: "unexpected" },
      { blockId: "B", fromRect: rect(0, 0, 4, 2), toRect: rect(1, 0, 4, 2), frameTimestamp: 0, reflowReason: "unexpected" },
    ]
    expect(aggregateUnexpectedScore(shifts)).toBe(aggregateReport(shifts).cumulativeScore)
  })
})

describe("emptyReport", () => {
  test("returns the zero-state report shape", () => {
    expect(emptyReport()).toEqual({ shifts: [], cumulativeScore: 0, unexpectedShifts: [] })
  })

  test("each call returns a fresh object (no shared mutable state)", () => {
    expect(emptyReport()).not.toBe(emptyReport())
  })
})
