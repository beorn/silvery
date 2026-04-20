/**
 * Backdrop fade — pro review regression suite (A1/A2/A3/A4/A7 + sentinels).
 *
 * These tests pin the behaviors introduced by the second pro-review
 * tightening pass. Each block maps to one fix:
 *
 *   1. Mixed-amount invariant           → A1 (single plan.amount source of truth)
 *   2. Presence-style marker coercion   → A2 (DEFAULT_AMOUNT)
 *   3. Light-theme fg deemphasize       → A3 (scrimTowardLight polarity)
 *   4. Overlap dedup in region walker   → A4 (Uint8Array bitset)
 *   5. Kitty inactive-frame cleanup     → A5 (earlier pass, re-pinned)
 *   6. Explicit scrim without defaultBg → A6 (earlier pass, re-pinned)
 *   7. Hex normalization                → A7 (normalizeHex)
 *   8. Readonly sentinel freeze         → C3 (INACTIVE_PLAN / EMPTY_RESULT)
 *
 * Integration / visual behavior is covered by `tests/features/backdrop-fade.test.tsx`.
 */

import { describe, test, expect } from "vitest"
import type { AgNode, Rect } from "@silvery/ag/types"
import {
  buildPlan,
  DEFAULT_AMOUNT,
  deemphasizeOklchToward,
  forEachFadeRegionCell,
  INACTIVE_PLAN,
  normalizeHex,
} from "@silvery/ag-term/pipeline/backdrop"
import { hexToOklch } from "@silvery/color"

/** Minimal AgNode factory — matches `backdrop-plan.test.ts`. */
function fakeNode(
  props: Record<string, unknown>,
  rect: Rect | null = null,
  children: AgNode[] = [],
): AgNode {
  return {
    type: "silvery-box",
    props,
    children,
    parent: null,
    layoutNode: null,
    prevLayout: null,
    boxRect: rect,
    scrollRect: null,
    prevScrollRect: null,
    screenRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: 0,
    dirtyBits: 0,
    dirtyEpoch: 0,
  } as unknown as AgNode
}

const RECT_A: Rect = { x: 0, y: 0, width: 10, height: 4 }
const RECT_B: Rect = { x: 5, y: 0, width: 10, height: 4 } // overlaps x=[5,10), y=[0,4) with RECT_A

describe("backdrop-pro A1: single plan.amount, not per-rect", () => {
  test("mixed amounts surface via plan.mixedAmounts, amount is first-observed", () => {
    // Two includes with different amounts. The invariant is "first wins",
    // the flag is "something was inconsistent". Production stays stable
    // (no throw), and the orchestrator can warn in dev.
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production" // suppress console.warn (not under test here)
    try {
      const root = fakeNode({}, null, [
        fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A),
        fakeNode({ "data-backdrop-fade": 0.6 }, RECT_B),
      ])
      const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
      expect(plan.active).toBe(true)
      expect(plan.mixedAmounts).toBe(true)
      expect(plan.amount).toBe(0.4) // first-observed wins
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })

  test("PlanRect shape has no `amount` — plan.amount is the sole source", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.3 }, RECT_A)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.includes).toHaveLength(1)
    // Structural check: PlanRect only carries the `rect` field. TS also
    // enforces this via the `readonly rect: Rect` interface; this line
    // catches accidental runtime-level additions.
    expect(Object.keys(plan.includes[0] as object)).toEqual(["rect"])
    expect(plan.amount).toBe(0.3)
  })

  test("mismatch across include + exclude lists is also detected", () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      const root = fakeNode({}, null, [
        fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A),
        fakeNode({ "data-backdrop-fade-excluded": 0.7 }, RECT_B),
      ])
      const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
      expect(plan.mixedAmounts).toBe(true)
      expect(plan.amount).toBe(0.4)
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })
})

describe("backdrop-pro A2: presence-style markers default to 0.25", () => {
  test("DEFAULT_AMOUNT is 0.25 (calibration pin)", () => {
    expect(DEFAULT_AMOUNT).toBe(0.25)
  })

  test("`data-backdrop-fade` === true materializes as the default amount", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": true }, RECT_A)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.active).toBe(true)
    expect(plan.amount).toBe(DEFAULT_AMOUNT)
  })

  test("empty-string value (HTML presence idiom) materializes as the default", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": "" }, RECT_A)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.amount).toBe(DEFAULT_AMOUNT)
  })

  test("numeric-string values are coerced", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": "0.5" }, RECT_A)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.amount).toBe(0.5)
  })

  test("non-numeric strings are rejected as inactive", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": "bad" }, RECT_A)])
    const plan = buildPlan(root)
    expect(plan.active).toBe(false)
  })

  test("false is treated as opt-out (not presence)", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": false }, RECT_A)])
    const plan = buildPlan(root)
    expect(plan.active).toBe(false)
  })

  test("negative numeric-string is pruned", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": "-0.3" }, RECT_A)])
    const plan = buildPlan(root)
    expect(plan.active).toBe(false)
  })
})

describe("backdrop-pro A3: light-theme fg polarity", () => {
  test("auto-scrim on a light theme sets scrimTowardLight=true", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A)])
    const plan = buildPlan(root, { defaultBg: "#ffffff" })
    expect(plan.scrim).toBe("#ffffff")
    expect(plan.scrimTowardLight).toBe(true)
    // defaultFg falls back to the OPPOSITE of the scrim polarity
    expect(plan.defaultFg).toBe("#000000")
  })

  test("auto-scrim on a dark theme sets scrimTowardLight=false", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.scrim).toBe("#000000")
    expect(plan.scrimTowardLight).toBe(false)
    expect(plan.defaultFg).toBe("#ffffff")
  })

  test("custom tinted scrim uses LUMINANCE, not string equality, for polarity", () => {
    // A mid-dark grey custom scrim (#333333 ≈ lum 0.03) is below the
    // threshold → scrimTowardLight=false (behaves as "dark" scrim).
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A)])
    const planDark = buildPlan(root, { scrimColor: "#333333" })
    expect(planDark.scrim).toBe("#333333")
    expect(planDark.scrimTowardLight).toBe(false)

    // A near-white tinted scrim (#eeeeee) is above → scrimTowardLight=true.
    const planLight = buildPlan(root, { scrimColor: "#eeeeee" })
    expect(planLight.scrim).toBe("#eeeeee")
    expect(planLight.scrimTowardLight).toBe(true)
  })

  test("null scrim plan defaults scrimTowardLight=false (legacy branch)", () => {
    // No defaultBg, no scrimColor → scrim stays null, polarity defaults to
    // the dark-theme branch. The realizer short-circuits to the legacy
    // "mix fg toward cell.bg" path when scrim is null.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A)])
    const plan = buildPlan(root)
    expect(plan.scrim).toBeNull()
    expect(plan.scrimTowardLight).toBe(false)
  })
})

describe("backdrop-pro A4: shared region walker with overlap dedup", () => {
  test("overlapping includes visit each cell exactly once", () => {
    // RECT_A = x=[0,10), y=[0,4). RECT_B = x=[5,15), y=[0,4). Overlap =
    // x=[5,10), y=[0,4) → 20 cells. Union (with dedup) should be 10*4 +
    // 10*4 - 20 = 60 cells.
    const visits = new Map<string, number>()
    const count = forEachFadeRegionCell(
      16,
      4,
      [{ rect: RECT_A }, { rect: RECT_B }],
      [],
      (x, y) => {
        const key = `${x},${y}`
        visits.set(key, (visits.get(key) ?? 0) + 1)
      },
    )
    expect(count).toBe(60)
    expect(visits.size).toBe(60)
    for (const [, n] of visits) expect(n).toBe(1) // no double-visits
  })

  test("excludes walker visits outside-rect cells exactly once", () => {
    // Buffer 4x4 = 16 cells, exclude interior 2x2 at (1,1)-(2,2) → 12 cells outside
    const visits = new Set<string>()
    const count = forEachFadeRegionCell(
      4,
      4,
      [],
      [{ rect: { x: 1, y: 1, width: 2, height: 2 } }],
      (x, y) => {
        visits.add(`${x},${y}`)
      },
    )
    expect(count).toBe(12)
    // Interior was excluded
    expect(visits.has("1,1")).toBe(false)
    expect(visits.has("2,2")).toBe(false)
    // Corners and edges were visited
    expect(visits.has("0,0")).toBe(true)
    expect(visits.has("3,3")).toBe(true)
  })

  test("clips out-of-bounds rects to the buffer", () => {
    const visits: Array<[number, number]> = []
    const count = forEachFadeRegionCell(
      4,
      4,
      [{ rect: { x: -2, y: -2, width: 5, height: 5 } }],
      [],
      (x, y) => visits.push([x, y]),
    )
    // Clipped to x=[0,3), y=[0,3) = 9 cells.
    expect(count).toBe(9)
    for (const [x, y] of visits) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(4)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(4)
    }
  })

  test("empty includes + excludes is a no-op", () => {
    const count = forEachFadeRegionCell(4, 4, [], [], () => {
      throw new Error("should not be called")
    })
    expect(count).toBe(0)
  })
})

describe("backdrop-pro A7: hex normalization", () => {
  test("normalizeHex canonicalizes case, shorthand, leading #, whitespace", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc")
    expect(normalizeHex("abc")).toBe("#aabbcc")
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc")
    expect(normalizeHex("AaBbCc")).toBe("#aabbcc")
    expect(normalizeHex("  #abc ")).toBe("#aabbcc")
    expect(normalizeHex("#000")).toBe("#000000")
    expect(normalizeHex("#000000")).toBe("#000000")
    expect(normalizeHex("#FFFfFF")).toBe("#ffffff")
  })

  test("normalizeHex rejects invalid hex characters (0g, etc.)", () => {
    expect(normalizeHex("#00000g")).toBeNull()
    expect(normalizeHex("#gggggg")).toBeNull()
    expect(normalizeHex("#00")).toBeNull() // wrong length
    expect(normalizeHex("#000000000")).toBeNull() // too long
    expect(normalizeHex("")).toBeNull()
    expect(normalizeHex(null)).toBeNull()
    expect(normalizeHex(undefined)).toBeNull()
  })

  test("buildPlan normalizes defaultBg before storing", () => {
    // Input "#1E1E2E" (uppercase) normalizes to "#1e1e2e" in the plan,
    // so downstream string comparisons (scrim derivation, etc.) work
    // regardless of how the app happened to type the hex value.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A)])
    const plan = buildPlan(root, { defaultBg: "#1E1E2E" })
    expect(plan.defaultBg).toBe("#1e1e2e")
    expect(plan.scrim).toBe("#000000")
  })

  test("buildPlan normalizes 3-char shorthand scrimColor", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A)])
    const plan = buildPlan(root, { scrimColor: "#ABC" })
    expect(plan.scrim).toBe("#aabbcc")
  })

  test("buildPlan rejects invalid hex strings and falls back", () => {
    // Invalid scrimColor falls back to auto-derived from defaultBg.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A)])
    const plan = buildPlan(root, { scrimColor: "#zzz", defaultBg: "#1e1e2e" })
    // scrimColor normalized to null → falls back to auto-derive from defaultBg.
    expect(plan.scrim).toBe("#000000")
  })
})

describe("backdrop-pro C3: readonly sentinels are frozen", () => {
  test("INACTIVE_PLAN is frozen", () => {
    expect(Object.isFrozen(INACTIVE_PLAN)).toBe(true)
    // Freeze is shallow in JS; we also froze the inner arrays.
    expect(Object.isFrozen(INACTIVE_PLAN.includes)).toBe(true)
    expect(Object.isFrozen(INACTIVE_PLAN.excludes)).toBe(true)
  })

  test("INACTIVE_PLAN cannot be mutated by a rogue consumer", () => {
    // Runtime safety: even if TypeScript `readonly` is stripped somehow
    // (JS consumer, cast-away), the freeze holds in strict mode. In
    // sloppy mode the assignment silently fails; in strict mode it
    // throws. Vitest runs tests in strict mode.
    expect(() => {
      // @ts-expect-error — intentional violation for runtime check.
      INACTIVE_PLAN.active = true
    }).toThrow()
  })
})

describe("backdrop-pro A6: explicit scrim without defaultBg still activates two-channel", () => {
  test("plan carries scrim even when defaultBg is null", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_A)])
    const plan = buildPlan(root, { scrimColor: "#000000" })
    expect(plan.scrim).toBe("#000000")
    expect(plan.defaultBg).toBeNull()
    // defaultFg falls back to the opposite of the scrim polarity
    expect(plan.defaultFg).toBe("#ffffff")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A3 realization — the light-theme deemphasize math lands in lightness.
// Verifying the POLARITY directly via deemphasizeOklchToward; the integration
// is exercised end-to-end by `tests/features/backdrop-fade.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

describe("backdrop-pro A3 realization: deemphasizeOklchToward polarity", () => {
  test("dark-theme fg drifts toward black (L decreases)", () => {
    const before = hexToOklch("#cdd6f4")! // pale lavender
    const after = hexToOklch(deemphasizeOklchToward("#cdd6f4", 0.5, false))!
    expect(after.L).toBeLessThan(before.L)
    expect(after.C).toBeLessThan(before.C)
    // Hue preserved (hue wraps at 360 — account for wrap in case of drift)
    const hueDelta = Math.min(
      Math.abs(after.H - before.H),
      Math.abs(after.H - before.H + 360),
      Math.abs(after.H - before.H - 360),
    )
    expect(hueDelta).toBeLessThan(5)
  })

  test("light-theme fg drifts toward white (L increases)", () => {
    // Start from a mid-dark teal so there's headroom to rise toward 1.
    const before = hexToOklch("#0a5d5d")!
    expect(before.L).toBeLessThan(0.6)
    const after = hexToOklch(deemphasizeOklchToward("#0a5d5d", 0.5, true))!
    // L moved UP toward 1 — the light-theme polarity behavior.
    expect(after.L).toBeGreaterThan(before.L)
    // Chroma still drops (quadratic falloff is symmetric).
    expect(after.C).toBeLessThan(before.C)
  })

  test("amount=0 is a passthrough in both polarities", () => {
    // At amount=0 the transform is the identity. We compare in OKLCH
    // space to avoid hex round-trip rounding noise.
    const src = "#cdd6f4"
    const srcOklch = hexToOklch(src)!
    const darkOklch = hexToOklch(deemphasizeOklchToward(src, 0, false))!
    const lightOklch = hexToOklch(deemphasizeOklchToward(src, 0, true))!
    expect(darkOklch.L).toBeCloseTo(srcOklch.L, 3)
    expect(darkOklch.C).toBeCloseTo(srcOklch.C, 3)
    expect(lightOklch.L).toBeCloseTo(srcOklch.L, 3)
    expect(lightOklch.C).toBeCloseTo(srcOklch.C, 3)
  })

  test("amount=1 dark → pure black; amount=1 light → pure white", () => {
    // Mid-grey source so polarity-specific pull is unambiguous.
    const darkExtreme = hexToOklch(deemphasizeOklchToward("#808080", 1, false))!
    expect(darkExtreme.L).toBeCloseTo(0, 2)

    const lightExtreme = hexToOklch(deemphasizeOklchToward("#808080", 1, true))!
    expect(lightExtreme.L).toBeCloseTo(1, 2)
  })
})
