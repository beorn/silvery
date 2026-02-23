/**
 * Tests for focus-queries.ts — pure tree query functions.
 *
 * Tests findFocusableAncestor, getTabOrder, findByTestID,
 * findSpatialTarget, and getExplicitFocusLink.
 */

import { describe, expect, it } from "vitest"
import {
  findByTestID,
  findFocusableAncestor,
  findSpatialTarget,
  getExplicitFocusLink,
  getTabOrder,
} from "../src/focus-queries.js"
import type { InkxNode, Rect } from "../src/types.js"

// ============================================================================
// Helpers
// ============================================================================

function fakeNode(
  testID: string,
  opts: {
    focusable?: boolean
    focusScope?: boolean
    display?: string
    parent?: InkxNode
    screenRect?: Rect
  } = {},
): InkxNode {
  const node = {
    type: "inkx-box" as const,
    props: {
      testID,
      ...(opts.focusable !== undefined ? { focusable: opts.focusable } : {}),
      ...(opts.focusScope ? { focusScope: true } : {}),
      ...(opts.display ? { display: opts.display } : {}),
    },
    children: [] as InkxNode[],
    parent: opts.parent ?? null,
    layoutNode: null,
    screenRect: opts.screenRect ?? null,
  } as unknown as InkxNode
  if (opts.parent) {
    opts.parent.children.push(node)
  }
  return node
}

// ============================================================================
// findFocusableAncestor
// ============================================================================

describe("findFocusableAncestor", () => {
  it("returns self if focusable", () => {
    const node = fakeNode("a", { focusable: true })
    expect(findFocusableAncestor(node)).toBe(node)
  })

  it("walks up to find nearest focusable ancestor", () => {
    const parent = fakeNode("parent", { focusable: true })
    const child = fakeNode("child", { parent })
    const grandchild = fakeNode("grandchild", { parent: child })

    expect(findFocusableAncestor(grandchild)).toBe(parent)
  })

  it("returns null if no focusable ancestor", () => {
    const root = fakeNode("root")
    const child = fakeNode("child", { parent: root })

    expect(findFocusableAncestor(child)).toBeNull()
  })

  it("skips display:none nodes", () => {
    const parent = fakeNode("parent", { focusable: true })
    const hidden = fakeNode("hidden", { focusable: true, display: "none", parent })
    const child = fakeNode("child", { parent: hidden })

    // hidden is focusable but display:none, so it's skipped
    expect(findFocusableAncestor(child)).toBe(parent)
  })
})

// ============================================================================
// getTabOrder
// ============================================================================

describe("getTabOrder", () => {
  it("returns focusable nodes in DFS order", () => {
    const root = fakeNode("root")
    const a = fakeNode("a", { focusable: true, parent: root })
    const b = fakeNode("b", { focusable: true, parent: root })
    const c = fakeNode("c", { focusable: true, parent: root })

    const order = getTabOrder(root)
    expect(order).toEqual([a, b, c])
  })

  it("includes nested focusable nodes in DFS order", () => {
    const root = fakeNode("root")
    const container = fakeNode("container", { parent: root })
    const a = fakeNode("a", { focusable: true, parent: container })
    const b = fakeNode("b", { focusable: true, parent: root })

    const order = getTabOrder(root)
    expect(order).toEqual([a, b])
  })

  it("skips non-focusable nodes", () => {
    const root = fakeNode("root")
    fakeNode("plain", { parent: root })
    const focusable = fakeNode("focusable", { focusable: true, parent: root })

    const order = getTabOrder(root)
    expect(order).toEqual([focusable])
  })

  it("skips display:none subtrees", () => {
    const root = fakeNode("root")
    const a = fakeNode("a", { focusable: true, parent: root })
    const hidden = fakeNode("hidden", { display: "none", parent: root })
    fakeNode("inside-hidden", { focusable: true, parent: hidden })

    const order = getTabOrder(root)
    expect(order).toEqual([a])
  })

  it("respects focusScope boundaries", () => {
    const root = fakeNode("root")
    const a = fakeNode("a", { focusable: true, parent: root })
    const scope = fakeNode("scope", { focusScope: true, parent: root })
    fakeNode("scoped-child", { focusable: true, parent: scope })
    const b = fakeNode("b", { focusable: true, parent: root })

    // Without specifying a scope, focusScope children are skipped
    const order = getTabOrder(root)
    expect(order).toEqual([a, b])
  })

  it("includes children when scope matches", () => {
    const root = fakeNode("root")
    const scope = fakeNode("scope", { focusScope: true, parent: root })
    const x = fakeNode("x", { focusable: true, parent: scope })
    const y = fakeNode("y", { focusable: true, parent: scope })

    // When we scope to the focusScope node, its children are included
    const order = getTabOrder(root, scope)
    expect(order).toEqual([x, y])
  })

  it("returns empty array for tree with no focusable nodes", () => {
    const root = fakeNode("root")
    fakeNode("plain", { parent: root })

    expect(getTabOrder(root)).toEqual([])
  })
})

// ============================================================================
// findByTestID
// ============================================================================

describe("findByTestID", () => {
  it("finds a node by testID", () => {
    const root = fakeNode("root")
    fakeNode("a", { parent: root })
    const b = fakeNode("b", { parent: root })

    expect(findByTestID(root, "b")).toBe(b)
  })

  it("finds nested nodes", () => {
    const root = fakeNode("root")
    const container = fakeNode("container", { parent: root })
    const deep = fakeNode("deep", { parent: container })

    expect(findByTestID(root, "deep")).toBe(deep)
  })

  it("returns null for missing testID", () => {
    const root = fakeNode("root")
    fakeNode("a", { parent: root })

    expect(findByTestID(root, "nonexistent")).toBeNull()
  })

  it("returns root if testID matches root", () => {
    const root = fakeNode("root")
    expect(findByTestID(root, "root")).toBe(root)
  })
})

// ============================================================================
// findSpatialTarget
// ============================================================================

describe("findSpatialTarget", () => {
  function layoutFn(node: InkxNode): Rect | null {
    return node.screenRect
  }

  it("finds nearest node to the right", () => {
    const root = fakeNode("root")
    const a = fakeNode("a", { focusable: true, parent: root, screenRect: { x: 0, y: 0, width: 10, height: 5 } })
    const b = fakeNode("b", { focusable: true, parent: root, screenRect: { x: 20, y: 0, width: 10, height: 5 } })
    const c = fakeNode("c", { focusable: true, parent: root, screenRect: { x: 40, y: 0, width: 10, height: 5 } })

    const target = findSpatialTarget(a, "right", [a, b, c], layoutFn)
    expect(target).toBe(b) // Nearest
  })

  it("finds nearest node below", () => {
    const root = fakeNode("root")
    const top = fakeNode("top", { focusable: true, parent: root, screenRect: { x: 0, y: 0, width: 10, height: 5 } })
    const bottom = fakeNode("bottom", {
      focusable: true,
      parent: root,
      screenRect: { x: 0, y: 10, width: 10, height: 5 },
    })

    const target = findSpatialTarget(top, "down", [top, bottom], layoutFn)
    expect(target).toBe(bottom)
  })

  it("returns null when no candidates in direction", () => {
    const root = fakeNode("root")
    const a = fakeNode("a", { focusable: true, parent: root, screenRect: { x: 0, y: 0, width: 10, height: 5 } })
    const b = fakeNode("b", { focusable: true, parent: root, screenRect: { x: 20, y: 0, width: 10, height: 5 } })

    // Nothing to the left of a
    const target = findSpatialTarget(a, "left", [a, b], layoutFn)
    expect(target).toBeNull()
  })

  it("skips candidates outside the 45-degree cone", () => {
    const root = fakeNode("root")
    // Source at origin
    const src = fakeNode("src", { focusable: true, parent: root, screenRect: { x: 0, y: 0, width: 2, height: 2 } })
    // Candidate far up and slightly right — outside the "right" cone (more up than right)
    const far = fakeNode("far", { focusable: true, parent: root, screenRect: { x: 5, y: -50, width: 2, height: 2 } })

    const target = findSpatialTarget(src, "right", [src, far], layoutFn)
    expect(target).toBeNull()
  })

  it("returns null when source has no layout", () => {
    const root = fakeNode("root")
    const a = fakeNode("a", { focusable: true, parent: root }) // No screenRect
    const b = fakeNode("b", { focusable: true, parent: root, screenRect: { x: 20, y: 0, width: 10, height: 5 } })

    const target = findSpatialTarget(a, "right", [a, b], layoutFn)
    expect(target).toBeNull()
  })
})

// ============================================================================
// getExplicitFocusLink
// ============================================================================

describe("getExplicitFocusLink", () => {
  it("returns nextFocusRight value", () => {
    const node = fakeNode("a")
    ;(node.props as Record<string, unknown>).nextFocusRight = "b"

    expect(getExplicitFocusLink(node, "right")).toBe("b")
  })

  it("returns nextFocusUp value", () => {
    const node = fakeNode("a")
    ;(node.props as Record<string, unknown>).nextFocusUp = "header"

    expect(getExplicitFocusLink(node, "up")).toBe("header")
  })

  it("returns null when no explicit link", () => {
    const node = fakeNode("a")
    expect(getExplicitFocusLink(node, "right")).toBeNull()
  })

  it("returns null when value is not a string", () => {
    const node = fakeNode("a")
    ;(node.props as Record<string, unknown>).nextFocusDown = 42

    expect(getExplicitFocusLink(node, "down")).toBeNull()
  })
})
