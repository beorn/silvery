/**
 * placeFloating — pure rect math for anchor-relative floating decorations.
 *
 * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
 *
 * Pins all 12 placements deterministically. Each test fixes a specific
 * `(anchor, target, placement)` triple and asserts the exact result rect —
 * if any of these change, downstream popover/tooltip layout breaks.
 *
 * Bead: km-silvery.overlay-anchor-impl-v1
 */

import { describe, test, expect } from "vitest"
import { placeFloating } from "@silvery/ag/place-floating"
import type { Rect } from "@silvery/ag/types"

// Anchor: a 10x4 rect at (20, 10). Choosing odd dimensions vs target width
// ensures center-alignment math (which uses Math.round) is unambiguous.
const ANCHOR: Rect = { x: 20, y: 10, width: 10, height: 4 }

// Target: a 6x2 floating decoration. The width/height differs from the
// anchor's so start/center/end alignment all produce distinct X (or Y)
// coordinates — pinning rounding behavior at the same time.
const TARGET = { width: 6, height: 2 }

// Helper: assert exact rect equality with informative diff on failure.
function expectRect(actual: Rect, expected: Rect): void {
  expect(actual).toEqual(expected)
}

// ============================================================================
// Top side — floating sits ABOVE the anchor; Y = anchor.y - target.height
// ============================================================================

describe("placeFloating: top side", () => {
  test("top-start: floating left edge aligns with anchor left edge", () => {
    expectRect(placeFloating(ANCHOR, TARGET, "top-start"), {
      x: 20,
      y: 8,
      width: 6,
      height: 2,
    })
  })

  test("top-center: floating centered on anchor X axis", () => {
    // (10 - 6) / 2 = 2 → x = 20 + 2 = 22
    expectRect(placeFloating(ANCHOR, TARGET, "top-center"), {
      x: 22,
      y: 8,
      width: 6,
      height: 2,
    })
  })

  test("top-end: floating right edge aligns with anchor right edge", () => {
    // anchor right = 20 + 10 = 30; floating right edge at 30 → x = 30 - 6 = 24
    expectRect(placeFloating(ANCHOR, TARGET, "top-end"), {
      x: 24,
      y: 8,
      width: 6,
      height: 2,
    })
  })
})

// ============================================================================
// Bottom side — floating sits BELOW; Y = anchor.y + anchor.height
// ============================================================================

describe("placeFloating: bottom side", () => {
  test("bottom-start: floating left edge aligns with anchor left edge", () => {
    expectRect(placeFloating(ANCHOR, TARGET, "bottom-start"), {
      x: 20,
      y: 14,
      width: 6,
      height: 2,
    })
  })

  test("bottom-center: floating centered on anchor X axis", () => {
    expectRect(placeFloating(ANCHOR, TARGET, "bottom-center"), {
      x: 22,
      y: 14,
      width: 6,
      height: 2,
    })
  })

  test("bottom-end: floating right edge aligns with anchor right edge", () => {
    expectRect(placeFloating(ANCHOR, TARGET, "bottom-end"), {
      x: 24,
      y: 14,
      width: 6,
      height: 2,
    })
  })
})

// ============================================================================
// Left side — floating sits to the LEFT; X = anchor.x - target.width
// ============================================================================

describe("placeFloating: left side", () => {
  test("left-start: floating top edge aligns with anchor top edge", () => {
    expectRect(placeFloating(ANCHOR, TARGET, "left-start"), {
      x: 14,
      y: 10,
      width: 6,
      height: 2,
    })
  })

  test("left-center: floating centered on anchor Y axis", () => {
    // (4 - 2) / 2 = 1 → y = 10 + 1 = 11
    expectRect(placeFloating(ANCHOR, TARGET, "left-center"), {
      x: 14,
      y: 11,
      width: 6,
      height: 2,
    })
  })

  test("left-end: floating bottom edge aligns with anchor bottom edge", () => {
    // anchor bottom = 10 + 4 = 14; floating bottom at 14 → y = 14 - 2 = 12
    expectRect(placeFloating(ANCHOR, TARGET, "left-end"), {
      x: 14,
      y: 12,
      width: 6,
      height: 2,
    })
  })
})

// ============================================================================
// Right side — floating sits to the RIGHT; X = anchor.x + anchor.width
// ============================================================================

describe("placeFloating: right side", () => {
  test("right-start: floating top edge aligns with anchor top edge", () => {
    expectRect(placeFloating(ANCHOR, TARGET, "right-start"), {
      x: 30,
      y: 10,
      width: 6,
      height: 2,
    })
  })

  test("right-center: floating centered on anchor Y axis", () => {
    expectRect(placeFloating(ANCHOR, TARGET, "right-center"), {
      x: 30,
      y: 11,
      width: 6,
      height: 2,
    })
  })

  test("right-end: floating bottom edge aligns with anchor bottom edge", () => {
    expectRect(placeFloating(ANCHOR, TARGET, "right-end"), {
      x: 30,
      y: 12,
      width: 6,
      height: 2,
    })
  })
})

// ============================================================================
// Determinism + structural properties
// ============================================================================

describe("placeFloating: properties", () => {
  test("output rect's width/height equal target's width/height (no clamping)", () => {
    // Even with a target larger than the anchor, the result preserves target
    // size — placeFloating doesn't shift or shrink. Apps that need overflow
    // detection do it themselves (v1 fixed-placement contract).
    const big = { width: 100, height: 50 }
    const placements: Array<Parameters<typeof placeFloating>[2]> = [
      "top-start",
      "top-center",
      "top-end",
      "bottom-start",
      "bottom-center",
      "bottom-end",
      "left-start",
      "left-center",
      "left-end",
      "right-start",
      "right-center",
      "right-end",
    ]
    for (const p of placements) {
      const r = placeFloating(ANCHOR, big, p)
      expect(r.width).toBe(100)
      expect(r.height).toBe(50)
    }
  })

  test("calling placeFloating twice with the same inputs returns equal rects", () => {
    const a = placeFloating(ANCHOR, TARGET, "bottom-center")
    const b = placeFloating(ANCHOR, TARGET, "bottom-center")
    expect(a).toEqual(b)
  })
})
