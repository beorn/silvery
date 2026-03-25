/**
 * Table-driven tests for the scroll tier planner.
 *
 * planScrollRender() is a pure function that decides which tier strategy
 * a scroll container uses for each frame. These tests verify the decision
 * logic in isolation (no DOM, no buffer, no rendering).
 */

import { describe, test, expect } from "vitest"
import { planScrollRender } from "@silvery/ag-term/pipeline/render-phase"
import type { ScrollPlanInputs, ScrollPlan } from "@silvery/ag-term/pipeline/render-phase"

/** All-false inputs (fresh render, nothing changed). */
function defaults(): ScrollPlanInputs {
  return {
    scrollOffsetChanged: false,
    visibleRangeChanged: false,
    hasStickyChildren: false,
    childrenNeedFreshRender: false,
    childrenDirty: false,
    hasPrevBuffer: false,
    ancestorCleared: false,
    contentRegionCleared: false,
    scrollBg: null,
  }
}

describe("scroll tier planner — tier selection", () => {
  test.each<{ name: string; overrides: Partial<ScrollPlanInputs>; expected: ScrollPlan["tier"] }>([
    // Tier 1: shift
    {
      name: "scroll only, no sticky -> shift",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true },
      expected: "shift",
    },

    // Tier 2: clear
    {
      name: "scroll with sticky -> clear",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true, hasStickyChildren: true },
      expected: "clear",
    },
    {
      name: "childrenDirty -> clear",
      overrides: { hasPrevBuffer: true, childrenDirty: true },
      expected: "clear",
    },
    {
      name: "childrenNeedFreshRender -> clear",
      overrides: { hasPrevBuffer: true, childrenNeedFreshRender: true },
      expected: "clear",
    },
    {
      name: "visibleRangeChanged -> clear",
      overrides: { hasPrevBuffer: true, visibleRangeChanged: true },
      expected: "clear",
    },
    {
      name: "scroll + childrenDirty -> clear (not shift)",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true, childrenDirty: true },
      expected: "clear",
    },
    {
      name: "scroll + visibleRangeChanged -> clear (not shift)",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true, visibleRangeChanged: true },
      expected: "clear",
    },

    // Tier 3: subtree-only
    {
      name: "fresh render (no prev buffer) -> subtree-only",
      overrides: {},
      expected: "subtree-only",
    },
    {
      name: "only subtreeDirty (nothing else) -> subtree-only",
      overrides: { hasPrevBuffer: true },
      expected: "subtree-only",
    },
    {
      name: "no prev buffer, scroll changed -> subtree-only (no prev = no shift/clear)",
      overrides: { scrollOffsetChanged: true },
      expected: "subtree-only",
    },
  ])("$name", ({ overrides, expected }) => {
    const plan = planScrollRender({ ...defaults(), ...overrides })
    expect(plan.tier).toBe(expected)
  })
})

describe("scroll tier planner — stickyForceRefresh", () => {
  test("subtree-only with sticky -> stickyForceRefresh", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      hasStickyChildren: true,
    })
    expect(plan.tier).toBe("subtree-only")
    expect(plan.stickyForceRefresh).toBe(true)
  })

  test("shift tier -> no stickyForceRefresh (sticky forces clear instead)", () => {
    // With sticky children, shift is blocked -> tier becomes clear
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      scrollOffsetChanged: true,
      hasStickyChildren: true,
    })
    expect(plan.tier).toBe("clear")
    expect(plan.stickyForceRefresh).toBe(false)
  })

  test("clear tier with sticky -> no stickyForceRefresh (clear handles it)", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
      hasStickyChildren: true,
    })
    expect(plan.tier).toBe("clear")
    expect(plan.stickyForceRefresh).toBe(false)
  })

  test("no sticky children -> no stickyForceRefresh", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
    })
    expect(plan.tier).toBe("subtree-only")
    expect(plan.stickyForceRefresh).toBe(false)
  })

  test("no prev buffer with sticky -> no stickyForceRefresh (fresh render)", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasStickyChildren: true,
    })
    expect(plan.stickyForceRefresh).toBe(false)
  })
})

describe("scroll tier planner — child propagation", () => {
  test("shift tier -> childHasPrev preserves hasPrevBuffer", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      scrollOffsetChanged: true,
    })
    expect(plan.childHasPrev).toBe(true)
  })

  test("clear tier -> childHasPrev is false", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
    })
    expect(plan.childHasPrev).toBe(false)
  })

  test("clear tier -> childAncestorCleared is true", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
    })
    expect(plan.childAncestorCleared).toBe(true)
  })

  test("subtree-only -> childHasPrev preserves hasPrevBuffer", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
    })
    expect(plan.childHasPrev).toBe(true)
  })

  test("subtree-only with ancestorCleared -> childAncestorCleared propagates", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      ancestorCleared: true,
    })
    expect(plan.childAncestorCleared).toBe(true)
  })

  test("subtree-only with contentRegionCleared -> childAncestorCleared propagates", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      contentRegionCleared: true,
    })
    expect(plan.childAncestorCleared).toBe(true)
  })
})

describe("scroll tier planner — clearBg", () => {
  test("shift tier passes scrollBg as clearBg", () => {
    const bg = { r: 0, g: 128, b: 255 }
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      scrollOffsetChanged: true,
      scrollBg: bg,
    })
    expect(plan.clearBg).toBe(bg)
  })

  test("clear tier passes scrollBg as clearBg", () => {
    const bg = { r: 0, g: 128, b: 255 }
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
      scrollBg: bg,
    })
    expect(plan.clearBg).toBe(bg)
  })

  test("subtree-only tier has null clearBg", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
    })
    expect(plan.clearBg).toBeNull()
  })
})

describe("scroll tier planner — reasons", () => {
  test("shift includes SHIFT reason", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      scrollOffsetChanged: true,
    })
    expect(plan.reasons).toContain("SHIFT")
  })

  test("clear with childrenDirty includes childrenDirty reason", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
    })
    expect(plan.reasons).toContain("childrenDirty")
  })

  test("stickyForceRefresh includes reason", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      hasStickyChildren: true,
    })
    expect(plan.reasons).toContain("stickyForceRefresh")
  })
})
