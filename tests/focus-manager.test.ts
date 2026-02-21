/**
 * Tests for FocusManager — pure state container, no React.
 *
 * Tests focus/blur, subscribe/notify, scope management, scopeMemory,
 * focusNext/focusPrev tab cycling, and spatial navigation.
 */

import { describe, expect, it, vi } from "vitest"
import { createFocusManager, type FocusManager } from "../src/focus-manager.js"
import type { InkxNode } from "../src/types.js"

// ============================================================================
// Helpers
// ============================================================================

function fakeNode(testID: string, opts: { focusable?: boolean; parent?: InkxNode; focusScope?: boolean } = {}): InkxNode {
  const node = {
    type: "inkx-box" as const,
    props: {
      testID,
      focusable: opts.focusable ?? true,
      ...(opts.focusScope ? { focusScope: true } : {}),
    },
    children: [] as InkxNode[],
    parent: opts.parent ?? null,
    layoutNode: null,
    layoutDirty: false,
    contentDirty: false,
    paintDirty: false,
    bgDirty: false,
    subtreeDirty: false,
    screenRect: null,
    layoutSubscribers: new Set(),
  } as unknown as InkxNode
  if (opts.parent) {
    opts.parent.children.push(node)
  }
  return node
}

function buildTree(): { root: InkxNode; a: InkxNode; b: InkxNode; c: InkxNode } {
  const root = fakeNode("root", { focusable: false })
  const a = fakeNode("a", { parent: root })
  const b = fakeNode("b", { parent: root })
  const c = fakeNode("c", { parent: root })
  return { root, a, b, c }
}

// ============================================================================
// Focus / Blur
// ============================================================================

describe("focus/blur", () => {
  it("focus sets activeElement and activeId", () => {
    const fm = createFocusManager()
    const { a } = buildTree()

    fm.focus(a)
    expect(fm.activeElement).toBe(a)
    expect(fm.activeId).toBe("a")
  })

  it("blur clears activeElement", () => {
    const fm = createFocusManager()
    const { a } = buildTree()

    fm.focus(a)
    fm.blur()
    expect(fm.activeElement).toBeNull()
    expect(fm.activeId).toBeNull()
  })

  it("focus sets previousElement from last focus", () => {
    const fm = createFocusManager()
    const { a, b } = buildTree()

    fm.focus(a)
    fm.focus(b)
    expect(fm.previousElement).toBe(a)
    expect(fm.previousId).toBe("a")
    expect(fm.activeElement).toBe(b)
  })

  it("blur sets previousElement", () => {
    const fm = createFocusManager()
    const { a } = buildTree()

    fm.focus(a)
    fm.blur()
    expect(fm.previousElement).toBe(a)
    expect(fm.previousId).toBe("a")
  })

  it("focus stores origin", () => {
    const fm = createFocusManager()
    const { a } = buildTree()

    fm.focus(a, "keyboard")
    expect(fm.focusOrigin).toBe("keyboard")

    fm.focus(a, "mouse")
    expect(fm.focusOrigin).toBe("mouse")
  })

  it("focus same node with same origin is a no-op", () => {
    const fm = createFocusManager()
    const { a } = buildTree()
    const listener = vi.fn()

    fm.focus(a, "keyboard")
    fm.subscribe(listener)
    fm.focus(a, "keyboard")

    expect(listener).not.toHaveBeenCalled()
  })

  it("focus same node with different origin notifies", () => {
    const fm = createFocusManager()
    const { a } = buildTree()
    const listener = vi.fn()

    fm.focus(a, "keyboard")
    fm.subscribe(listener)
    fm.focus(a, "mouse")

    expect(listener).toHaveBeenCalledOnce()
    expect(fm.focusOrigin).toBe("mouse")
  })

  it("blur when nothing focused is a no-op", () => {
    const fm = createFocusManager()
    const listener = vi.fn()

    fm.subscribe(listener)
    fm.blur()

    expect(listener).not.toHaveBeenCalled()
  })
})

// ============================================================================
// focusById
// ============================================================================

describe("focusById", () => {
  it("focuses a node found by testID", () => {
    const fm = createFocusManager()
    const { root, b } = buildTree()

    fm.focusById("b", root)
    expect(fm.activeElement).toBe(b)
  })

  it("does nothing if testID not found", () => {
    const fm = createFocusManager()
    const { root } = buildTree()

    fm.focusById("nonexistent", root)
    expect(fm.activeElement).toBeNull()
  })
})

// ============================================================================
// Subscribe / Snapshot
// ============================================================================

describe("subscribe/getSnapshot", () => {
  it("subscribe fires listener on focus change", () => {
    const fm = createFocusManager()
    const { a } = buildTree()
    const listener = vi.fn()

    fm.subscribe(listener)
    fm.focus(a)

    expect(listener).toHaveBeenCalledOnce()
  })

  it("unsubscribe stops notifications", () => {
    const fm = createFocusManager()
    const { a, b } = buildTree()
    const listener = vi.fn()

    const unsub = fm.subscribe(listener)
    fm.focus(a)
    expect(listener).toHaveBeenCalledOnce()

    unsub()
    fm.focus(b)
    expect(listener).toHaveBeenCalledOnce() // Not called again
  })

  it("getSnapshot returns consistent object between changes", () => {
    const fm = createFocusManager()
    const snap1 = fm.getSnapshot()
    const snap2 = fm.getSnapshot()
    expect(snap1).toBe(snap2) // Same reference (cached)
  })

  it("getSnapshot returns new object after change", () => {
    const fm = createFocusManager()
    const { a } = buildTree()

    const snap1 = fm.getSnapshot()
    fm.focus(a)
    const snap2 = fm.getSnapshot()

    expect(snap1).not.toBe(snap2)
    expect(snap2.activeId).toBe("a")
  })
})

// ============================================================================
// Scope Management
// ============================================================================

describe("scope management", () => {
  it("enterScope pushes to scopeStack", () => {
    const fm = createFocusManager()
    fm.enterScope("modal")
    expect(fm.scopeStack).toEqual(["modal"])
  })

  it("exitScope pops from scopeStack", () => {
    const fm = createFocusManager()
    fm.enterScope("modal")
    fm.exitScope()
    expect(fm.scopeStack).toEqual([])
  })

  it("nested scopes stack correctly", () => {
    const fm = createFocusManager()
    fm.enterScope("modal")
    fm.enterScope("submenu")
    expect(fm.scopeStack).toEqual(["modal", "submenu"])
    fm.exitScope()
    expect(fm.scopeStack).toEqual(["modal"])
  })

  it("exitScope on empty stack is a no-op", () => {
    const fm = createFocusManager()
    fm.exitScope() // Should not throw
    expect(fm.scopeStack).toEqual([])
  })

  it("scopeMemory remembers focused element per scope", () => {
    const fm = createFocusManager()
    const { a } = buildTree()

    fm.enterScope("modal")
    fm.focus(a, "keyboard")

    expect(fm.scopeMemory["modal"]).toBe("a")
  })
})

// ============================================================================
// focusNext / focusPrev
// ============================================================================

describe("focusNext/focusPrev", () => {
  it("focusNext cycles through tab order", () => {
    const fm = createFocusManager()
    const { root, a, b, c } = buildTree()

    fm.focusNext(root)
    expect(fm.activeElement).toBe(a)

    fm.focusNext(root)
    expect(fm.activeElement).toBe(b)

    fm.focusNext(root)
    expect(fm.activeElement).toBe(c)

    // Wraps around
    fm.focusNext(root)
    expect(fm.activeElement).toBe(a)
  })

  it("focusPrev cycles backwards", () => {
    const fm = createFocusManager()
    const { root, a, b, c } = buildTree()

    // With nothing focused, focusPrev starts at the last element
    fm.focusPrev(root)
    expect(fm.activeElement).toBe(c)

    fm.focusPrev(root)
    expect(fm.activeElement).toBe(b)

    fm.focusPrev(root)
    expect(fm.activeElement).toBe(a)

    // Wraps around
    fm.focusPrev(root)
    expect(fm.activeElement).toBe(c)
  })

  it("focusNext with no focusable nodes is a no-op", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })

    fm.focusNext(root)
    expect(fm.activeElement).toBeNull()
  })
})

// ============================================================================
// hasFocusWithin
// ============================================================================

describe("hasFocusWithin", () => {
  it("returns true when focused node is in the subtree", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const container = fakeNode("container", { focusable: false, parent: root })
    const item = fakeNode("item", { parent: container })

    fm.focus(item)
    expect(fm.hasFocusWithin(root, "container")).toBe(true)
  })

  it("returns false when focused node is outside the subtree", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const sidebar = fakeNode("sidebar", { focusable: false, parent: root })
    const main = fakeNode("main", { focusable: false, parent: root })
    const item = fakeNode("item", { parent: sidebar })

    fm.focus(item)
    expect(fm.hasFocusWithin(root, "main")).toBe(false)
  })

  it("returns false when nothing is focused", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    fakeNode("a", { parent: root })

    expect(fm.hasFocusWithin(root, "a")).toBe(false)
  })
})

// ============================================================================
// getFocusPath
// ============================================================================

describe("getFocusPath", () => {
  it("returns testID path from focused node to root", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const panel = fakeNode("panel", { focusable: false, parent: root })
    const item = fakeNode("item", { parent: panel })

    fm.focus(item)
    const path = fm.getFocusPath(root)
    expect(path).toEqual(["item", "panel", "root"])
  })

  it("returns empty array when nothing is focused", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })

    expect(fm.getFocusPath(root)).toEqual([])
  })
})

// ============================================================================
// Spatial Navigation
// ============================================================================

describe("focusDirection", () => {
  it("navigates to the nearest node in a direction", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const left = fakeNode("left", { parent: root })
    const right = fakeNode("right", { parent: root })

    // Assign screen rects for spatial navigation
    ;(left as unknown as Record<string, unknown>).screenRect = { x: 0, y: 0, width: 10, height: 5 }
    ;(right as unknown as Record<string, unknown>).screenRect = { x: 15, y: 0, width: 10, height: 5 }

    fm.focus(left)
    fm.focusDirection(root, "right", (n) => (n as unknown as Record<string, unknown>).screenRect as any)

    expect(fm.activeElement).toBe(right)
  })

  it("uses explicit nextFocus link when available", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { parent: root })
    const b = fakeNode("b", { parent: root })

    // Set explicit link: pressing right from "a" goes to "b"
    ;(a.props as Record<string, unknown>).nextFocusRight = "b"

    fm.focus(a)
    fm.focusDirection(root, "right")

    expect(fm.activeElement).toBe(b)
  })

  it("does nothing when no candidates in direction", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const only = fakeNode("only", { parent: root })
    ;(only as unknown as Record<string, unknown>).screenRect = { x: 0, y: 0, width: 10, height: 5 }

    fm.focus(only)
    fm.focusDirection(root, "right", (n) => (n as unknown as Record<string, unknown>).screenRect as any)

    // Still focused on the same node
    expect(fm.activeElement).toBe(only)
  })
})

// ============================================================================
// onFocusChange callback
// ============================================================================

describe("onFocusChange callback", () => {
  it("fires with (null, newNode) on first focus", () => {
    const callback = vi.fn()
    const fm = createFocusManager({ onFocusChange: callback })
    const { a } = buildTree()

    fm.focus(a)

    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith(null, a, "programmatic")
  })

  it("fires with (oldNode, newNode) when changing focus", () => {
    const callback = vi.fn()
    const fm = createFocusManager({ onFocusChange: callback })
    const { a, b } = buildTree()

    fm.focus(a)
    fm.focus(b)

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenNthCalledWith(1, null, a, "programmatic")
    expect(callback).toHaveBeenNthCalledWith(2, a, b, "programmatic")
  })

  it("fires with (oldNode, null) on blur", () => {
    const callback = vi.fn()
    const fm = createFocusManager({ onFocusChange: callback })
    const { a } = buildTree()

    fm.focus(a)
    callback.mockClear()

    fm.blur()

    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith(a, null, null)
  })

  it("does not fire when focusing same node (no-op)", () => {
    const callback = vi.fn()
    const fm = createFocusManager({ onFocusChange: callback })
    const { a } = buildTree()

    fm.focus(a)
    callback.mockClear()

    fm.focus(a) // Same node, same origin — no change
    expect(callback).not.toHaveBeenCalled()
  })

  it("does not fire when blur called with nothing focused", () => {
    const callback = vi.fn()
    const fm = createFocusManager({ onFocusChange: callback })

    fm.blur()
    expect(callback).not.toHaveBeenCalled()
  })

  it("passes correct origin", () => {
    const callback = vi.fn()
    const fm = createFocusManager({ onFocusChange: callback })
    const { a, b } = buildTree()

    fm.focus(a, "keyboard")
    expect(callback).toHaveBeenCalledWith(null, a, "keyboard")

    fm.focus(b, "mouse")
    expect(callback).toHaveBeenCalledWith(a, b, "mouse")
  })

  it("fires during focusNext navigation", () => {
    const callback = vi.fn()
    const fm = createFocusManager({ onFocusChange: callback })
    const { root, a, b } = buildTree()

    fm.focusNext(root)
    expect(callback).toHaveBeenCalledWith(null, a, "keyboard")

    fm.focusNext(root)
    expect(callback).toHaveBeenCalledWith(a, b, "keyboard")
  })
})

// ============================================================================
// Scope-aware tab navigation
// ============================================================================

describe("scope-aware focusNext/focusPrev", () => {
  it("focusNext respects active scope from scopeStack", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const outside = fakeNode("outside", { parent: root })
    const scope = fakeNode("modal", { focusable: false, parent: root, focusScope: true })
    const m1 = fakeNode("m1", { parent: scope })
    const m2 = fakeNode("m2", { parent: scope })

    // Enter the modal scope
    fm.enterScope("modal")

    // Tab should only cycle within the scope
    fm.focusNext(root)
    expect(fm.activeId).toBe("m1")

    fm.focusNext(root)
    expect(fm.activeId).toBe("m2")

    // Wraps within scope, never visits "outside"
    fm.focusNext(root)
    expect(fm.activeId).toBe("m1")
  })

  it("focusPrev respects active scope from scopeStack", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const outside = fakeNode("outside", { parent: root })
    const scope = fakeNode("modal", { focusable: false, parent: root, focusScope: true })
    const m1 = fakeNode("m1", { parent: scope })
    const m2 = fakeNode("m2", { parent: scope })

    // Enter the modal scope
    fm.enterScope("modal")

    // Shift+Tab should only cycle within the scope
    fm.focusPrev(root)
    expect(fm.activeId).toBe("m2")

    fm.focusPrev(root)
    expect(fm.activeId).toBe("m1")

    // Wraps within scope
    fm.focusPrev(root)
    expect(fm.activeId).toBe("m2")
  })

  it("after exitScope, tab navigation is global again", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { parent: root })
    const scope = fakeNode("modal", { focusable: false, parent: root, focusScope: true })
    const m1 = fakeNode("m1", { parent: scope })
    const b = fakeNode("b", { parent: root })

    fm.enterScope("modal")
    fm.focusNext(root)
    expect(fm.activeId).toBe("m1")

    fm.exitScope()

    // Now tab should see global order: a, b (modal is not focusable, its children are behind scope)
    fm.focus(a)
    fm.focusNext(root)
    expect(fm.activeId).toBe("b")
  })

  it("explicit scope parameter overrides scopeStack", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const scope1 = fakeNode("scope1", { focusable: false, parent: root, focusScope: true })
    const s1a = fakeNode("s1a", { parent: scope1 })
    const s1b = fakeNode("s1b", { parent: scope1 })
    const scope2 = fakeNode("scope2", { focusable: false, parent: root, focusScope: true })
    const s2a = fakeNode("s2a", { parent: scope2 })

    // Push scope1 on the stack
    fm.enterScope("scope1")

    // But explicitly pass scope2 — it should override
    fm.focusNext(root, scope2)
    expect(fm.activeId).toBe("s2a")
  })
})
