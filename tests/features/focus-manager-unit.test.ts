/**
 * Focus Manager Unit Tests
 *
 * Tests for focus-manager.ts correctness:
 * - activateScope should not double-notify subscribers
 * - scopeStack getter should not leak mutable reference
 */

import { describe, test, expect, vi } from "vitest"
import { createFocusManager } from "@silvery/tea"
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
