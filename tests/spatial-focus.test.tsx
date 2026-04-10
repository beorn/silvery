/**
 * Spatial Focus Navigation Tests
 *
 * Proves focusDirection() works for spatial (arrow key) navigation:
 * - 3x2 grid: arrow keys reach the correct neighbor
 * - Edge cases: corner nodes, asymmetric grids
 * - Cone-based selection: only candidates within the 45-degree cone are reached
 * - Kanban layout: varied-height cards across columns
 *
 * Tests the pure findSpatialTarget() function directly (unit-level)
 * and focusDirection() via the FocusManager (integration-level).
 */

import { describe, test, expect } from "vitest"
import { createFocusManager } from "@silvery/create"
import { findSpatialTarget } from "@silvery/ag/focus-queries"
import type { AgNode, BoxProps, Rect } from "@silvery/ag/types"
import { INITIAL_EPOCH } from "@silvery/ag/epoch"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal AgNode stub with a screen rect for spatial tests. */
function stubNode(testID: string, rect: Rect, opts?: { focusable?: boolean; children?: AgNode[] }): AgNode {
  const children = opts?.children ?? []
  const node: AgNode = {
    type: "silvery-box",
    props: { testID, focusable: opts?.focusable ?? true } as BoxProps,
    children,
    parent: null,
    layoutNode: {} as any,
    boxRect: null,
    scrollRect: rect,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: INITIAL_EPOCH,
    layoutDirty: false,
    contentDirtyEpoch: INITIAL_EPOCH,
    stylePropsDirtyEpoch: INITIAL_EPOCH,
    bgDirtyEpoch: INITIAL_EPOCH,
    subtreeDirtyEpoch: INITIAL_EPOCH,
    childrenDirtyEpoch: INITIAL_EPOCH,
    layoutSubscribers: new Set(),
  }
  for (const child of children) {
    child.parent = node
  }
  return node
}

/** Build a 3x2 grid of focusable nodes. Layout:
 *
 *   [a1]  [a2]  [a3]
 *   [b1]  [b2]
 *
 * Each cell is 10 wide, 3 tall, with 2-col gaps.
 */
function buildGrid3x2() {
  const a1 = stubNode("a1", { x: 0, y: 0, width: 10, height: 3 })
  const a2 = stubNode("a2", { x: 12, y: 0, width: 10, height: 3 })
  const a3 = stubNode("a3", { x: 24, y: 0, width: 10, height: 3 })
  const b1 = stubNode("b1", { x: 0, y: 4, width: 10, height: 3 })
  const b2 = stubNode("b2", { x: 12, y: 4, width: 10, height: 3 })

  const root = stubNode(
    "root",
    { x: 0, y: 0, width: 36, height: 7 },
    {
      focusable: false,
      children: [a1, a2, a3, b1, b2],
    },
  )

  return { root, a1, a2, a3, b1, b2 }
}

/** Layout function that reads scrollRect from the node. */
function layoutFn(node: AgNode): Rect | null {
  return node.scrollRect
}

// ============================================================================
// Unit Tests: findSpatialTarget (pure function)
// ============================================================================

describe("findSpatialTarget — pure spatial queries", () => {
  test("right from a1 finds a2", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(a1, "right", candidates, layoutFn)
    expect(target).toBe(a2)
  })

  test("right from a2 finds a3", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(a2, "right", candidates, layoutFn)
    expect(target).toBe(a3)
  })

  test("left from a2 finds a1", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(a2, "left", candidates, layoutFn)
    expect(target).toBe(a1)
  })

  test("down from a1 finds b1", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(a1, "down", candidates, layoutFn)
    expect(target).toBe(b1)
  })

  test("down from a2 finds b2", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(a2, "down", candidates, layoutFn)
    expect(target).toBe(b2)
  })

  test("up from b1 finds a1", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(b1, "up", candidates, layoutFn)
    expect(target).toBe(a1)
  })

  test("up from b2 finds a2", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(b2, "up", candidates, layoutFn)
    expect(target).toBe(a2)
  })

  // Edge cases: corners

  test("up from a1 (top-left corner) finds nothing", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(a1, "up", candidates, layoutFn)
    expect(target).toBeNull()
  })

  test("left from a1 (top-left corner) finds nothing", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(a1, "left", candidates, layoutFn)
    expect(target).toBeNull()
  })

  test("right from a3 (top-right corner) finds nothing", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(a3, "right", candidates, layoutFn)
    expect(target).toBeNull()
  })

  test("down from a3 finds nothing (no node below in cone)", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    // a3 is at x=24, b2 is at x=12 — b2's center (x=17) is too far left
    // for the 45-degree cone from a3's center (x=29)
    const target = findSpatialTarget(a3, "down", candidates, layoutFn)
    expect(target).toBeNull()
  })

  test("down from b1 (bottom-left) finds nothing", () => {
    const { a1, a2, a3, b1, b2 } = buildGrid3x2()
    const candidates = [a1, a2, a3, b1, b2]
    const target = findSpatialTarget(b1, "down", candidates, layoutFn)
    expect(target).toBeNull()
  })
})

// ============================================================================
// Integration Tests: FocusManager.focusDirection
// ============================================================================

describe("FocusManager.focusDirection — integration", () => {
  test("navigates right across a row", () => {
    const fm = createFocusManager()
    const { root, a1, a2, a3 } = buildGrid3x2()

    fm.focus(a1, "keyboard")
    expect(fm.activeId).toBe("a1")

    fm.focusDirection(root, "right", layoutFn)
    expect(fm.activeId).toBe("a2")

    fm.focusDirection(root, "right", layoutFn)
    expect(fm.activeId).toBe("a3")

    // At the edge — should stay on a3
    fm.focusDirection(root, "right", layoutFn)
    expect(fm.activeId).toBe("a3")
  })

  test("navigates down between rows", () => {
    const fm = createFocusManager()
    const { root, a1 } = buildGrid3x2()

    fm.focus(a1, "keyboard")
    fm.focusDirection(root, "down", layoutFn)
    expect(fm.activeId).toBe("b1")
  })

  test("navigates up between rows", () => {
    const fm = createFocusManager()
    const { root, b2 } = buildGrid3x2()

    fm.focus(b2, "keyboard")
    fm.focusDirection(root, "up", layoutFn)
    expect(fm.activeId).toBe("a2")
  })

  test("round-trip: right then left returns to origin", () => {
    const fm = createFocusManager()
    const { root, a1 } = buildGrid3x2()

    fm.focus(a1, "keyboard")
    fm.focusDirection(root, "right", layoutFn)
    expect(fm.activeId).toBe("a2")

    fm.focusDirection(root, "left", layoutFn)
    expect(fm.activeId).toBe("a1")
  })

  test("round-trip: down then up returns to origin", () => {
    const fm = createFocusManager()
    const { root, a2 } = buildGrid3x2()

    fm.focus(a2, "keyboard")
    fm.focusDirection(root, "down", layoutFn)
    expect(fm.activeId).toBe("b2")

    fm.focusDirection(root, "up", layoutFn)
    expect(fm.activeId).toBe("a2")
  })

  test("does nothing when no element is focused", () => {
    const fm = createFocusManager()
    const { root } = buildGrid3x2()

    expect(fm.activeId).toBeNull()
    fm.focusDirection(root, "right", layoutFn)
    expect(fm.activeId).toBeNull()
  })
})

// ============================================================================
// Kanban Layout: varied-height cards across columns
// ============================================================================

describe("Kanban layout — varied-height cards", () => {
  /**
   * Simulates a 3-column kanban board with varied card heights:
   *
   *   Column 0 (x=0)      Column 1 (x=22)     Column 2 (x=44)
   *   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
   *   │ c0-card0 (h=3)   │ │ c1-card0 (h=5)   │ │ c2-card0 (h=2)   │
   *   │ c0-card1 (h=5)   │ │ c1-card1 (h=2)   │ │ c2-card1 (h=6)   │
   *   │ c0-card2 (h=2)   │ │ c1-card2 (h=4)   │ │                   │
   *   └──────────────────┘ └──────────────────┘ └──────────────────┘
   */
  function buildKanbanLayout() {
    const colWidth = 20
    const gap = 2

    // Column 0: cards at y=1, y=4, y=9
    const c0card0 = stubNode("c0-card0", { x: 0, y: 1, width: colWidth, height: 3 })
    const c0card1 = stubNode("c0-card1", { x: 0, y: 4, width: colWidth, height: 5 })
    const c0card2 = stubNode("c0-card2", { x: 0, y: 9, width: colWidth, height: 2 })

    // Column 1: cards at y=1, y=6, y=8
    const c1card0 = stubNode("c1-card0", { x: colWidth + gap, y: 1, width: colWidth, height: 5 })
    const c1card1 = stubNode("c1-card1", { x: colWidth + gap, y: 6, width: colWidth, height: 2 })
    const c1card2 = stubNode("c1-card2", { x: colWidth + gap, y: 8, width: colWidth, height: 4 })

    // Column 2: cards at y=1, y=3
    const c2card0 = stubNode("c2-card0", { x: 2 * (colWidth + gap), y: 1, width: colWidth, height: 2 })
    const c2card1 = stubNode("c2-card1", { x: 2 * (colWidth + gap), y: 3, width: colWidth, height: 6 })

    const all = [c0card0, c0card1, c0card2, c1card0, c1card1, c1card2, c2card0, c2card1]
    const root = stubNode(
      "root",
      { x: 0, y: 0, width: 66, height: 14 },
      {
        focusable: false,
        children: all,
      },
    )

    return { root, c0card0, c0card1, c0card2, c1card0, c1card1, c1card2, c2card0, c2card1 }
  }

  test("right from column 0 reaches column 1", () => {
    const fm = createFocusManager()
    const { root, c0card0 } = buildKanbanLayout()

    fm.focus(c0card0, "keyboard")
    fm.focusDirection(root, "right", layoutFn)
    // c0-card0 center is (10, 2.5), c1-card0 center is (32, 3.5) — within right cone
    expect(fm.activeId).toBe("c1-card0")
  })

  test("left from column 1 reaches column 0", () => {
    const fm = createFocusManager()
    const { root, c1card0 } = buildKanbanLayout()

    fm.focus(c1card0, "keyboard")
    fm.focusDirection(root, "left", layoutFn)
    expect(fm.activeId).toBe("c0-card0")
  })

  test("right from column 1 reaches column 2", () => {
    const fm = createFocusManager()
    const { root, c1card0 } = buildKanbanLayout()

    fm.focus(c1card0, "keyboard")
    fm.focusDirection(root, "right", layoutFn)
    // c1-card0 center is (32, 3.5), c2-card1 center is (54, 6) — check if in cone
    // c2-card0 center is (54, 2) — closer and within right cone
    expect(fm.activeId).toBe("c2-card0")
  })

  test("down within a column navigates between cards", () => {
    const fm = createFocusManager()
    const { root, c0card0 } = buildKanbanLayout()

    fm.focus(c0card0, "keyboard")
    fm.focusDirection(root, "down", layoutFn)
    expect(fm.activeId).toBe("c0-card1")

    fm.focusDirection(root, "down", layoutFn)
    expect(fm.activeId).toBe("c0-card2")
  })

  test("up within a column navigates between cards", () => {
    const fm = createFocusManager()
    const { root, c0card2 } = buildKanbanLayout()

    fm.focus(c0card2, "keyboard")
    fm.focusDirection(root, "up", layoutFn)
    expect(fm.activeId).toBe("c0-card1")

    fm.focusDirection(root, "up", layoutFn)
    expect(fm.activeId).toBe("c0-card0")
  })

  test("varied heights: tall card in col1 navigates down correctly", () => {
    const fm = createFocusManager()
    const { root, c1card0 } = buildKanbanLayout()

    // c1-card0 is tall (h=5, y=1..6), center at y=3.5
    fm.focus(c1card0, "keyboard")
    fm.focusDirection(root, "down", layoutFn)
    // c1-card1 center at y=7, c1-card2 center at y=10 — c1-card1 is closer
    expect(fm.activeId).toBe("c1-card1")
  })

  test("cross-column navigation with height mismatch", () => {
    const fm = createFocusManager()
    const { root, c0card1 } = buildKanbanLayout()

    // c0-card1 center is (10, 6.5), moving right
    // c1-card0 center is (32, 3.5) — dy=3, dx=22, |dy| < |dx| ✓ in right cone
    // c1-card1 center is (32, 7) — dy=0.5, dx=22, |dy| < |dx| ✓ closest
    // c1-card2 center is (32, 10) — dy=3.5, dx=22, |dy| < |dx| ✓
    fm.focus(c0card1, "keyboard")
    fm.focusDirection(root, "right", layoutFn)
    expect(fm.activeId).toBe("c1-card1")
  })

  test("right from column 2 finds nothing (rightmost column)", () => {
    const fm = createFocusManager()
    const { root, c2card0 } = buildKanbanLayout()

    fm.focus(c2card0, "keyboard")
    fm.focusDirection(root, "right", layoutFn)
    expect(fm.activeId).toBe("c2-card0") // unchanged
  })
})

// ============================================================================
// Cone exclusion: diagonal items outside 45-degree cone
// ============================================================================

describe("45-degree cone exclusion", () => {
  test("far diagonal item is not reachable via 'right'", () => {
    // Source at (0,0), candidate at (5, 20) — mostly down, not right
    const source = stubNode("source", { x: 0, y: 0, width: 4, height: 2 })
    const diagonal = stubNode("diagonal", { x: 5, y: 20, width: 4, height: 2 })
    const root = stubNode(
      "root",
      { x: 0, y: 0, width: 40, height: 40 },
      {
        focusable: false,
        children: [source, diagonal],
      },
    )

    const target = findSpatialTarget(source, "right", [source, diagonal], layoutFn)
    expect(target).toBeNull()
  })

  test("item directly to the side is reachable", () => {
    const source = stubNode("source", { x: 0, y: 10, width: 4, height: 2 })
    const side = stubNode("side", { x: 20, y: 10, width: 4, height: 2 })
    const root = stubNode(
      "root",
      { x: 0, y: 0, width: 40, height: 40 },
      {
        focusable: false,
        children: [source, side],
      },
    )

    const target = findSpatialTarget(source, "right", [source, side], layoutFn)
    expect(target).toBe(side)
  })

  test("item at exactly 45 degrees is on the cone boundary (included)", () => {
    // Source center at (2, 1), candidate center at (12, 11) — dx=10, dy=10
    // isInCone for "down": dy > 0 and |dx| <= |dy| → 10 <= 10 ✓
    const source = stubNode("source", { x: 0, y: 0, width: 4, height: 2 })
    const boundary = stubNode("boundary", { x: 10, y: 10, width: 4, height: 2 })

    const target = findSpatialTarget(source, "down", [source, boundary], layoutFn)
    expect(target).toBe(boundary)
  })

  test("item just outside 45-degree cone is excluded", () => {
    // Source center at (2, 1), candidate center at (14, 11) — dx=12, dy=10
    // isInCone for "down": dy > 0 and |dx| <= |dy| → 12 <= 10 ✗
    const source = stubNode("source", { x: 0, y: 0, width: 4, height: 2 })
    const outside = stubNode("outside", { x: 12, y: 10, width: 4, height: 2 })

    const target = findSpatialTarget(source, "down", [source, outside], layoutFn)
    expect(target).toBeNull()
  })
})

// ============================================================================
// Explicit focus links override spatial navigation
// ============================================================================

describe("explicit focus links", () => {
  test("nextFocusRight overrides spatial navigation", () => {
    const fm = createFocusManager()
    const a = stubNode("a", { x: 0, y: 0, width: 10, height: 3 })
    // Add explicit focus link
    ;(a.props as any).nextFocusRight = "c"
    const b = stubNode("b", { x: 12, y: 0, width: 10, height: 3 })
    const c = stubNode("c", { x: 24, y: 0, width: 10, height: 3 })
    const root = stubNode(
      "root",
      { x: 0, y: 0, width: 36, height: 3 },
      {
        focusable: false,
        children: [a, b, c],
      },
    )

    fm.focus(a, "keyboard")
    fm.focusDirection(root, "right", layoutFn)
    // Should skip b (the spatial nearest) and go to c (the explicit link)
    expect(fm.activeId).toBe("c")
  })
})
