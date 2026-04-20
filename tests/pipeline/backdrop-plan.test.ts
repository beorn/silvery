/**
 * Unit tests for `buildPlan` — the pure stage-1 function of the
 * backdrop-fade pass. These tests exercise plan construction in isolation,
 * without any buffer/realizer coupling, so failures point directly at the
 * marker collection / scrim resolution / single-amount invariant logic.
 *
 * Integration behavior (stage-2 realizers, STRICT overlay determinism) is
 * covered by `tests/features/backdrop-fade.test.tsx`.
 */
import { describe, test, expect } from "vitest"
import type { AgNode, Rect } from "@silvery/ag/types"
import { buildPlan } from "@silvery/ag-term/pipeline/backdrop"

/**
 * Minimal AgNode factory for plan tests — `collectBackdropMarkers` only
 * reads `props`, `children`, and `screenRect ?? scrollRect ?? boxRect`.
 * The other AgNode fields are unused and set to null to keep the test
 * fixtures readable.
 */
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

const RECT: Rect = { x: 0, y: 0, width: 10, height: 4 }

describe("buildPlan — inactive cases", () => {
  test("empty tree returns inactive plan", () => {
    const root = fakeNode({})
    const plan = buildPlan(root)
    expect(plan.active).toBe(false)
    expect(plan.amount).toBe(0)
    expect(plan.includes).toEqual([])
    expect(plan.excludes).toEqual([])
  })

  test("colorLevel=none short-circuits even with markers present", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT)])
    const plan = buildPlan(root, { colorLevel: "none" })
    expect(plan.active).toBe(false)
  })

  test("zero-amount marker is pruned (no include rect)", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0 }, RECT)])
    const plan = buildPlan(root)
    expect(plan.active).toBe(false)
  })

  test("negative amount is pruned", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": -0.5 }, RECT)])
    const plan = buildPlan(root)
    expect(plan.active).toBe(false)
  })

  test("missing rect is pruned (zero-size marker)", () => {
    const zeroRect: Rect = { x: 0, y: 0, width: 0, height: 0 }
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, zeroRect)])
    const plan = buildPlan(root)
    expect(plan.active).toBe(false)
  })
})

describe("buildPlan — scrim + default resolution", () => {
  test("dark theme bg derives black scrim", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.active).toBe(true)
    expect(plan.scrim).toBe("#000000")
    // defaultFg is the opposite of the scrim (white on dark).
    expect(plan.defaultFg).toBe("#ffffff")
  })

  test("light theme bg derives white scrim", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT)])
    const plan = buildPlan(root, { defaultBg: "#ffffff" })
    expect(plan.scrim).toBe("#ffffff")
    expect(plan.defaultFg).toBe("#000000")
  })

  test("missing defaultBg leaves scrim=null (legacy fallback path)", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT)])
    const plan = buildPlan(root)
    expect(plan.scrim).toBeNull()
    expect(plan.defaultFg).toBeNull()
  })

  test("explicit scrimColor overrides luminance-derived value", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e", scrimColor: "#808080" })
    expect(plan.scrim).toBe("#808080")
  })

  test("explicit defaultFg overrides the scrim-derived fallback", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e", defaultFg: "#abcdef" })
    expect(plan.defaultFg).toBe("#abcdef")
  })

  test("defaultBg is normalized and stored on the plan", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT)])
    const plan = buildPlan(root, { defaultBg: "#123456" })
    expect(plan.defaultBg).toBe("#123456")
  })
})

describe("buildPlan — marker collection", () => {
  test("data-backdrop-fade collects into includes", () => {
    const child = fakeNode({ "data-backdrop-fade": 0.25 }, RECT)
    const root = fakeNode({}, null, [child])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.includes).toHaveLength(1)
    expect(plan.excludes).toHaveLength(0)
    // The per-rect `amount` was removed in the A1 follow-up; the single
    // `plan.amount` is the source of truth for realization.
    expect(plan.amount).toBe(0.25)
    expect(plan.includes[0]!.rect).toBe(RECT)
  })

  test("data-backdrop-fade-excluded collects into excludes", () => {
    const child = fakeNode({ "data-backdrop-fade-excluded": 0.4 }, RECT)
    const root = fakeNode({}, null, [child])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.excludes).toHaveLength(1)
    expect(plan.includes).toHaveLength(0)
  })

  test("marker clamps amount > 1 to 1", () => {
    const child = fakeNode({ "data-backdrop-fade": 2.5 }, RECT)
    const root = fakeNode({}, null, [child])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.amount).toBe(1)
  })

  test("nested markers are collected in walk order", () => {
    const inner: Rect = { x: 2, y: 2, width: 4, height: 2 }
    const deep = fakeNode({ "data-backdrop-fade": 0.4 }, inner)
    const mid = fakeNode({}, null, [deep])
    const top = fakeNode({ "data-backdrop-fade": 0.4 }, RECT, [mid])
    const root = fakeNode({}, null, [top])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.includes).toHaveLength(2)
    // Walk order: parent before child.
    expect(plan.includes[0]!.rect).toBe(RECT)
    expect(plan.includes[1]!.rect).toBe(inner)
  })
})

describe("buildPlan — single-amount invariant", () => {
  test("matching amounts pass through unchanged", () => {
    const root = fakeNode({}, null, [
      fakeNode({ "data-backdrop-fade": 0.4 }, RECT),
      fakeNode({ "data-backdrop-fade-excluded": 0.4 }, RECT),
    ])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.amount).toBe(0.4)
  })

  test("mismatched amounts fall back to first-observed (dev-mode warn)", () => {
    // assertSingleAmount warns in non-production NODE_ENV but still picks
    // the first amount. We verify the clamp+first-wins behavior; the warn
    // is a dev signal, not part of the return contract.
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production" // suppress the console.warn to keep test output clean
    try {
      const root = fakeNode({}, null, [
        fakeNode({ "data-backdrop-fade": 0.4 }, RECT),
        fakeNode({ "data-backdrop-fade": 0.6 }, RECT),
      ])
      const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
      expect(plan.amount).toBe(0.4)
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })
})
