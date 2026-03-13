/**
 * Focus Manager Unit Tests
 *
 * Tests for focus-manager.ts correctness:
 * - activateScope should not double-notify subscribers
 * - scopeStack getter should not leak mutable reference
 * - focus cleanup on node removal (handleSubtreeRemoved)
 * - hidden nodes excluded from focus queries
 */

import { describe, test, expect, vi } from "vitest"
import { createFocusManager, getTabOrder } from "@silvery/tea"
import type { TeaNode, BoxProps } from "@silvery/tea/types"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal TeaNode stub for focus manager tests. */
function stubNode(testID: string, opts?: { focusable?: boolean; children?: TeaNode[] }): TeaNode {
  const children = opts?.children ?? []
  const node: TeaNode = {
    type: "silvery-box",
    props: { testID, focusable: opts?.focusable ?? true } as BoxProps,
    children,
    parent: null,
    layoutNode: {} as any,
    contentRect: null,
    screenRect: null,
    renderRect: null,
    prevLayout: null,
    prevScreenRect: null,
    prevRenderRect: null,
    layoutChangedThisFrame: false,
    layoutDirty: false,
    contentDirty: false,
    paintDirty: false,
    bgDirty: false,
    subtreeDirty: false,
    childrenDirty: false,
    layoutSubscribers: new Set(),
  }
  for (const child of children) {
    child.parent = node
  }
  return node
}

/** Build a tree: root with child scopes, each containing a focusable. */
function buildScopedTree() {
  const itemA = stubNode("item-a", { focusable: true })
  const scopeA = stubNode("scope-a", { focusable: false, children: [itemA] })
  const itemB = stubNode("item-b", { focusable: true })
  const scopeB = stubNode("scope-b", { focusable: false, children: [itemB] })
  const root = stubNode("root", { focusable: false, children: [scopeA, scopeB] })
  return { root, scopeA, scopeB, itemA, itemB }
}

// ============================================================================
// Tests
// ============================================================================

describe("activateScope double-notify", () => {
  test("activateScope notifies subscribers exactly once when focusById succeeds", () => {
    const fm = createFocusManager()
    const { root, itemA } = buildScopedTree()

    // Pre-condition: focus on itemA so scopeMemory has a remembered element
    fm.focus(itemA, "programmatic")

    // Set up scopeMemory for scope-a by switching away and back
    fm.enterScope("scope-a")

    const listener = vi.fn()
    fm.subscribe(listener)

    // activateScope should trigger exactly one notification
    // (focusById finds itemA and calls focus → notify, then activateScope should NOT call notify again)
    fm.activateScope("scope-a", root)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  test("activateScope notifies subscribers exactly once when focus(order[0]) succeeds", () => {
    const fm = createFocusManager()
    const { root } = buildScopedTree()

    // No scopeMemory for scope-b, so it will fall through to getTabOrder → focus(order[0])
    const listener = vi.fn()
    fm.subscribe(listener)

    fm.activateScope("scope-b", root)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  test("activateScope still notifies once when no focusable element exists in scope", () => {
    const fm = createFocusManager()
    // Empty scope with no focusable children
    const emptyScope = stubNode("empty-scope", { focusable: false, children: [] })
    const root = stubNode("root", { focusable: false, children: [emptyScope] })

    const listener = vi.fn()
    fm.subscribe(listener)

    // No remembered element, no focusable children → neither focusById nor focus is called
    // activateScope should still notify once (scope changed)
    fm.activateScope("empty-scope", root)

    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe("scopeStack getter leaks mutable reference", () => {
  test("mutating the returned scopeStack does not affect internal state", () => {
    const fm = createFocusManager()
    fm.enterScope("scope-a")
    fm.enterScope("scope-b")

    const stack = fm.scopeStack as string[]
    // Attempt to mutate the returned array
    stack.push("scope-injected")
    stack[0] = "scope-tampered"

    // Internal state should be unaffected
    expect(fm.scopeStack).toEqual(["scope-a", "scope-b"])
    expect(fm.scopeStack).not.toContain("scope-injected")
    expect(fm.scopeStack).not.toContain("scope-tampered")
  })
})

// ============================================================================
// Focus cleanup on node removal (P0: focus-unmount)
// ============================================================================

describe("handleSubtreeRemoved", () => {
  test("blurs when the focused node itself is removed", () => {
    const fm = createFocusManager()
    const child = stubNode("child", { focusable: true })
    const root = stubNode("root", { focusable: false, children: [child] })

    fm.focus(child)
    expect(fm.activeElement).toBe(child)
    expect(fm.activeId).toBe("child")

    // Simulate removal: detach child from tree and notify focus manager
    root.children = []
    child.parent = null
    fm.handleSubtreeRemoved(child)

    expect(fm.activeElement).toBeNull()
    expect(fm.activeId).toBeNull()
  })

  test("blurs when an ancestor of the focused node is removed", () => {
    const fm = createFocusManager()
    const leaf = stubNode("leaf", { focusable: true })
    const middle = stubNode("middle", { focusable: false, children: [leaf] })
    const root = stubNode("root", { focusable: false, children: [middle] })

    fm.focus(leaf)
    expect(fm.activeElement).toBe(leaf)

    // Remove the middle subtree (which contains the focused leaf)
    root.children = []
    middle.parent = null
    fm.handleSubtreeRemoved(middle)

    expect(fm.activeElement).toBeNull()
    expect(fm.activeId).toBeNull()
  })

  test("does not blur when the removed subtree does not contain the focused node", () => {
    const fm = createFocusManager()
    const focused = stubNode("focused", { focusable: true })
    const other = stubNode("other", { focusable: true })
    const root = stubNode("root", { focusable: false, children: [focused, other] })

    fm.focus(focused)

    // Remove the other node (not the focused one)
    root.children = [focused]
    other.parent = null
    fm.handleSubtreeRemoved(other)

    // Focus should be unchanged
    expect(fm.activeElement).toBe(focused)
    expect(fm.activeId).toBe("focused")
  })

  test("clears previousElement when the removed subtree contains it", () => {
    const fm = createFocusManager()
    const nodeA = stubNode("node-a", { focusable: true })
    const nodeB = stubNode("node-b", { focusable: true })
    const root = stubNode("root", { focusable: false, children: [nodeA, nodeB] })

    // Focus A, then B → A becomes previousElement
    fm.focus(nodeA)
    fm.focus(nodeB)
    expect(fm.previousElement).toBe(nodeA)

    // Remove A (the previous element)
    root.children = [nodeB]
    nodeA.parent = null
    fm.handleSubtreeRemoved(nodeA)

    // previousElement should be cleared, but activeElement should remain
    expect(fm.previousElement).toBeNull()
    expect(fm.activeElement).toBe(nodeB)
  })

  test("focusNext works correctly after focused node is removed (no indexOf -1)", () => {
    const fm = createFocusManager()
    const nodeA = stubNode("node-a", { focusable: true })
    const nodeB = stubNode("node-b", { focusable: true })
    const nodeC = stubNode("node-c", { focusable: true })
    const root = stubNode("root", { focusable: false, children: [nodeA, nodeB, nodeC] })

    fm.focus(nodeB)

    // Remove nodeB → focus is cleared
    root.children = [nodeA, nodeC]
    nodeB.parent = null
    fm.handleSubtreeRemoved(nodeB)

    expect(fm.activeElement).toBeNull()

    // focusNext should focus the first item (not jump erratically)
    fm.focusNext(root)
    expect(fm.activeElement).toBe(nodeA)
  })

  test("hasFocusWithin returns false after focused node is removed", () => {
    const fm = createFocusManager()
    const child = stubNode("child", { focusable: true })
    const container = stubNode("container", { focusable: false, children: [child] })
    const root = stubNode("root", { focusable: false, children: [container] })

    fm.focus(child)
    expect(fm.hasFocusWithin(root, "container")).toBe(true)

    // Remove the container subtree
    root.children = []
    container.parent = null
    fm.handleSubtreeRemoved(container)

    expect(fm.hasFocusWithin(root, "container")).toBe(false)
  })

  test("notifies subscribers when focus is cleared due to removal", () => {
    const fm = createFocusManager()
    const child = stubNode("child", { focusable: true })
    const root = stubNode("root", { focusable: false, children: [child] })

    fm.focus(child)

    const listener = vi.fn()
    fm.subscribe(listener)

    root.children = []
    child.parent = null
    fm.handleSubtreeRemoved(child)

    expect(listener).toHaveBeenCalled()
  })

  test("does not notify when removal does not affect focus", () => {
    const fm = createFocusManager()
    const focused = stubNode("focused", { focusable: true })
    const other = stubNode("other", { focusable: true })
    const root = stubNode("root", { focusable: false, children: [focused, other] })

    fm.focus(focused)

    const listener = vi.fn()
    fm.subscribe(listener)

    root.children = [focused]
    other.parent = null
    fm.handleSubtreeRemoved(other)

    expect(listener).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Hidden nodes excluded from focus (P1: hidden-focusable)
// ============================================================================

describe("hidden nodes and focus", () => {
  test("hidden nodes are excluded from getTabOrder", () => {
    const visible = stubNode("visible", { focusable: true })
    const hidden = stubNode("hidden", { focusable: true })
    hidden.hidden = true
    const root = stubNode("root", { focusable: false, children: [visible, hidden] })

    const order = getTabOrder(root)
    expect(order).toEqual([visible])
    expect(order).not.toContain(hidden)
  })

  test("children of hidden nodes are excluded from getTabOrder", () => {
    const child = stubNode("child", { focusable: true })
    const hiddenParent = stubNode("hidden-parent", { focusable: false, children: [child] })
    hiddenParent.hidden = true
    const visible = stubNode("visible", { focusable: true })
    const root = stubNode("root", { focusable: false, children: [hiddenParent, visible] })

    const order = getTabOrder(root)
    expect(order).toEqual([visible])
  })

  test("focusNext skips hidden nodes", () => {
    const fm = createFocusManager()
    const nodeA = stubNode("node-a", { focusable: true })
    const nodeB = stubNode("node-b", { focusable: true })
    nodeB.hidden = true
    const nodeC = stubNode("node-c", { focusable: true })
    const root = stubNode("root", { focusable: false, children: [nodeA, nodeB, nodeC] })

    fm.focus(nodeA)
    fm.focusNext(root)

    // Should skip hidden nodeB and land on nodeC
    expect(fm.activeElement).toBe(nodeC)
  })
})
