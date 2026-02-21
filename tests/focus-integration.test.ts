/**
 * Integration tests for the inkx focus system.
 *
 * Tests the FocusManager + focus-events + focus-queries working together
 * with fake InkxNode trees. These tests verify the full focus lifecycle:
 * Tab cycling, spatial navigation, scope trapping, autoFocus, and
 * event dispatch on focus changes.
 *
 * NOTE: These tests don't require React or rendered components — they exercise
 * the pure TypeScript primitives. React component integration (useFocusable,
 * useFocusWithin with rendered components) is tested separately after
 * FocusManagerContext wiring is complete.
 */

import { describe, expect, it, vi } from "vitest"
import {
  createFocusEvent,
  createKeyEvent,
  dispatchFocusEvent,
  dispatchKeyEvent,
  type InkxFocusEvent,
  type InkxKeyEvent,
} from "../src/focus-events.js"
import { createFocusManager } from "../src/focus-manager.js"
import { findByTestID, getTabOrder } from "../src/focus-queries.js"
import { emptyKey, type Key } from "../src/keys.js"
import type { InkxNode, Rect } from "../src/types.js"

// ============================================================================
// Helpers
// ============================================================================

function fakeNode(
  testID: string,
  opts: {
    focusable?: boolean
    focusScope?: boolean
    parent?: InkxNode
    screenRect?: Rect
    onFocus?: (e: InkxFocusEvent) => void
    onBlur?: (e: InkxFocusEvent) => void
    onKeyDown?: (e: InkxKeyEvent, dispatch?: (msg: unknown) => void) => void
    onKeyDownCapture?: (e: InkxKeyEvent) => void
    nextFocusRight?: string
    nextFocusDown?: string
  } = {},
): InkxNode {
  const node = {
    type: "inkx-box" as const,
    props: {
      testID,
      ...(opts.focusable !== undefined ? { focusable: opts.focusable } : {}),
      ...(opts.focusScope ? { focusScope: true } : {}),
      ...(opts.onFocus ? { onFocus: opts.onFocus } : {}),
      ...(opts.onBlur ? { onBlur: opts.onBlur } : {}),
      ...(opts.onKeyDown ? { onKeyDown: opts.onKeyDown } : {}),
      ...(opts.onKeyDownCapture ? { onKeyDownCapture: opts.onKeyDownCapture } : {}),
      ...(opts.nextFocusRight ? { nextFocusRight: opts.nextFocusRight } : {}),
      ...(opts.nextFocusDown ? { nextFocusDown: opts.nextFocusDown } : {}),
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

function makeKey(overrides: Partial<Key> = {}): Key {
  return { ...emptyKey(), ...overrides }
}

// ============================================================================
// Tab Cycling
// ============================================================================

describe("Tab cycling", () => {
  it("Tab cycles through all focusable nodes in DFS order", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { focusable: true, parent: root })
    const b = fakeNode("b", { focusable: true, parent: root })
    const c = fakeNode("c", { focusable: true, parent: root })

    // Simulate Tab presses
    fm.focusNext(root)
    expect(fm.activeId).toBe("a")

    fm.focusNext(root)
    expect(fm.activeId).toBe("b")

    fm.focusNext(root)
    expect(fm.activeId).toBe("c")

    // Wraps around
    fm.focusNext(root)
    expect(fm.activeId).toBe("a")
  })

  it("Shift+Tab cycles backwards", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { focusable: true, parent: root })
    const b = fakeNode("b", { focusable: true, parent: root })
    const c = fakeNode("c", { focusable: true, parent: root })

    // Start at end
    fm.focusPrev(root)
    expect(fm.activeId).toBe("c")

    fm.focusPrev(root)
    expect(fm.activeId).toBe("b")

    fm.focusPrev(root)
    expect(fm.activeId).toBe("a")

    // Wraps around
    fm.focusPrev(root)
    expect(fm.activeId).toBe("c")
  })

  it("Tab with nested containers visits children in DFS order", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const sidebar = fakeNode("sidebar", { focusable: false, parent: root })
    const s1 = fakeNode("s1", { focusable: true, parent: sidebar })
    const s2 = fakeNode("s2", { focusable: true, parent: sidebar })
    const main = fakeNode("main", { focusable: false, parent: root })
    const m1 = fakeNode("m1", { focusable: true, parent: main })

    fm.focusNext(root)
    expect(fm.activeId).toBe("s1")
    fm.focusNext(root)
    expect(fm.activeId).toBe("s2")
    fm.focusNext(root)
    expect(fm.activeId).toBe("m1")
    fm.focusNext(root)
    expect(fm.activeId).toBe("s1") // Wrap
  })
})

// ============================================================================
// Focus Scope Trapping
// ============================================================================

describe("focusScope trapping", () => {
  it("Tab within a focusScope only cycles scoped children", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const outside = fakeNode("outside", { focusable: true, parent: root })
    const scope = fakeNode("modal", { focusScope: true, parent: root })
    const m1 = fakeNode("m1", { focusable: true, parent: scope })
    const m2 = fakeNode("m2", { focusable: true, parent: scope })

    // Tab within the modal scope
    fm.focusNext(root, scope)
    expect(fm.activeId).toBe("m1")
    fm.focusNext(root, scope)
    expect(fm.activeId).toBe("m2")
    fm.focusNext(root, scope)
    expect(fm.activeId).toBe("m1") // Wraps within scope, never visits "outside"
  })

  it("getTabOrder excludes children of foreign focusScope", () => {
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { focusable: true, parent: root })
    const scope = fakeNode("scope", { focusScope: true, parent: root })
    fakeNode("scoped", { focusable: true, parent: scope })
    const b = fakeNode("b", { focusable: true, parent: root })

    const order = getTabOrder(root)
    expect(order.map((n) => (n.props as Record<string, unknown>).testID)).toEqual(["a", "b"])
  })
})

// ============================================================================
// Spatial Navigation (Arrow Keys)
// ============================================================================

describe("Arrow key spatial navigation", () => {
  function layoutFn(node: InkxNode): Rect | null {
    return node.screenRect
  }

  it("ArrowRight moves focus to the nearest node on the right", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const left = fakeNode("left", { focusable: true, parent: root, screenRect: { x: 0, y: 5, width: 10, height: 5 } })
    const right = fakeNode("right", { focusable: true, parent: root, screenRect: { x: 20, y: 5, width: 10, height: 5 } })

    fm.focus(left)
    fm.focusDirection(root, "right", layoutFn)

    expect(fm.activeId).toBe("right")
  })

  it("ArrowDown moves focus to the nearest node below", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const top = fakeNode("top", { focusable: true, parent: root, screenRect: { x: 5, y: 0, width: 10, height: 5 } })
    const bottom = fakeNode("bottom", { focusable: true, parent: root, screenRect: { x: 5, y: 10, width: 10, height: 5 } })

    fm.focus(top)
    fm.focusDirection(root, "down", layoutFn)

    expect(fm.activeId).toBe("bottom")
  })

  it("uses explicit nextFocus link over spatial heuristic", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", {
      focusable: true,
      parent: root,
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      nextFocusRight: "c",
    })
    const b = fakeNode("b", { focusable: true, parent: root, screenRect: { x: 15, y: 0, width: 10, height: 5 } })
    const c = fakeNode("c", { focusable: true, parent: root, screenRect: { x: 30, y: 0, width: 10, height: 5 } })

    fm.focus(a)
    fm.focusDirection(root, "right", layoutFn)

    // Explicit link to "c" overrides spatial nearest ("b")
    expect(fm.activeId).toBe("c")
  })

  it("does nothing when nothing is focused", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    fakeNode("a", { focusable: true, parent: root, screenRect: { x: 0, y: 0, width: 10, height: 5 } })

    fm.focusDirection(root, "right", layoutFn)
    expect(fm.activeElement).toBeNull()
  })
})

// ============================================================================
// Focus Events (onFocus / onBlur)
// ============================================================================

describe("Focus events dispatch", () => {
  it("fires onFocus on the newly focused node", () => {
    const handler = vi.fn()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { focusable: true, parent: root, onFocus: handler })

    const event = createFocusEvent("focus", a, null)
    dispatchFocusEvent(event)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]![0].type).toBe("focus")
    expect(handler.mock.calls[0]![0].target).toBe(a)
  })

  it("fires onBlur on the previously focused node with relatedTarget", () => {
    const handler = vi.fn()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { focusable: true, parent: root, onBlur: handler })
    const b = fakeNode("b", { focusable: true, parent: root })

    const event = createFocusEvent("blur", a, b)
    dispatchFocusEvent(event)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]![0].relatedTarget).toBe(b)
  })

  it("onFocus bubbles to ancestors", () => {
    const log: string[] = []
    const root = fakeNode("root", { focusable: false, onFocus: () => log.push("root") })
    const container = fakeNode("container", { focusable: false, parent: root, onFocus: () => log.push("container") })
    const item = fakeNode("item", { focusable: true, parent: container, onFocus: () => log.push("item") })

    const event = createFocusEvent("focus", item, null)
    dispatchFocusEvent(event)

    expect(log).toEqual(["item", "container", "root"])
  })
})

// ============================================================================
// Key Events on Focused Node
// ============================================================================

describe("Key events on focused node", () => {
  it("onKeyDown fires on the focused node", () => {
    const handler = vi.fn()
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { focusable: true, parent: root, onKeyDown: handler })

    fm.focus(a)

    const key = makeKey()
    const event = createKeyEvent("j", key, a)
    dispatchKeyEvent(event)

    expect(handler).toHaveBeenCalledOnce()
  })

  it("key events bubble from focused node to ancestors", () => {
    const log: string[] = []
    const root = fakeNode("root", { focusable: false, onKeyDown: () => log.push("root") })
    const container = fakeNode("container", { focusable: false, parent: root, onKeyDown: () => log.push("container") })
    const item = fakeNode("item", { focusable: true, parent: container, onKeyDown: () => log.push("item") })

    const fm = createFocusManager()
    fm.focus(item)

    const key = makeKey()
    const event = createKeyEvent("j", key, item)
    dispatchKeyEvent(event)

    expect(log).toEqual(["item", "container", "root"])
  })

  it("capture handler on ancestor intercepts before target", () => {
    const log: string[] = []
    const root = fakeNode("root", {
      focusable: false,
      onKeyDownCapture: () => log.push("root-capture"),
      onKeyDown: () => log.push("root-bubble"),
    })
    const item = fakeNode("item", { focusable: true, parent: root, onKeyDown: () => log.push("item") })

    const fm = createFocusManager()
    fm.focus(item)

    const key = makeKey()
    const event = createKeyEvent("j", key, item)
    dispatchKeyEvent(event)

    expect(log).toEqual(["root-capture", "item", "root-bubble"])
  })
})

// ============================================================================
// Full Lifecycle: Focus Change + Event Dispatch
// ============================================================================

describe("Full lifecycle", () => {
  it("Tab focus change fires blur/focus events and then key events work on new target", () => {
    const focusLog: string[] = []
    const keyLog: string[] = []

    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", {
      focusable: true,
      parent: root,
      onFocus: () => focusLog.push("a-focus"),
      onBlur: () => focusLog.push("a-blur"),
      onKeyDown: () => keyLog.push("a-key"),
    })
    const b = fakeNode("b", {
      focusable: true,
      parent: root,
      onFocus: () => focusLog.push("b-focus"),
      onBlur: () => focusLog.push("b-blur"),
      onKeyDown: () => keyLog.push("b-key"),
    })

    const fm = createFocusManager()

    // Focus "a"
    fm.focus(a)
    dispatchFocusEvent(createFocusEvent("focus", a, null))
    expect(focusLog).toEqual(["a-focus"])

    // Send key to "a"
    dispatchKeyEvent(createKeyEvent("j", makeKey(), a))
    expect(keyLog).toEqual(["a-key"])

    // Move focus to "b"
    dispatchFocusEvent(createFocusEvent("blur", a, b))
    fm.focus(b)
    dispatchFocusEvent(createFocusEvent("focus", b, a))

    expect(focusLog).toEqual(["a-focus", "a-blur", "b-focus"])
    expect(fm.activeId).toBe("b")
    expect(fm.previousId).toBe("a")

    // Send key to "b"
    dispatchKeyEvent(createKeyEvent("k", makeKey(), b))
    expect(keyLog).toEqual(["a-key", "b-key"])
  })

  it("scope memory preserves last focused element", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const scope = fakeNode("modal", { focusScope: true, parent: root })
    const m1 = fakeNode("m1", { focusable: true, parent: scope })
    const m2 = fakeNode("m2", { focusable: true, parent: scope })

    fm.enterScope("modal")
    fm.focus(m1)
    fm.focus(m2)

    expect(fm.scopeMemory["modal"]).toBe("m2")

    fm.exitScope()
    expect(fm.scopeStack).toEqual([])
  })

  it("snapshot reflects state for useSyncExternalStore consumers", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { focusable: true, parent: root })
    const b = fakeNode("b", { focusable: true, parent: root })

    // Initial snapshot
    const snap0 = fm.getSnapshot()
    expect(snap0.activeId).toBeNull()

    // After focusing
    fm.focus(a, "keyboard")
    const snap1 = fm.getSnapshot()
    expect(snap1.activeId).toBe("a")
    expect(snap1.focusOrigin).toBe("keyboard")

    // After moving focus
    fm.focus(b, "mouse")
    const snap2 = fm.getSnapshot()
    expect(snap2.activeId).toBe("b")
    expect(snap2.previousId).toBe("a")
    expect(snap2.focusOrigin).toBe("mouse")
  })

  it("hasFocusWithin works with deeply nested focus", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const panel = fakeNode("panel", { focusable: false, parent: root })
    const section = fakeNode("section", { focusable: false, parent: panel })
    const item = fakeNode("item", { focusable: true, parent: section })
    const other = fakeNode("other", { focusable: false, parent: root })

    fm.focus(item)

    expect(fm.hasFocusWithin(root, "panel")).toBe(true)
    expect(fm.hasFocusWithin(root, "section")).toBe(true)
    expect(fm.hasFocusWithin(root, "item")).toBe(true)
    expect(fm.hasFocusWithin(root, "other")).toBe(false)
    expect(fm.hasFocusWithin(root, "root")).toBe(true) // Item is within root
  })
})

// ============================================================================
// Automatic Focus Event Dispatch via onFocusChange
// ============================================================================

describe("Automatic focus event dispatch (onFocusChange wiring)", () => {
  it("focus() dispatches blur on old element and focus on new element", () => {
    const focusLog: string[] = []

    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", {
      focusable: true,
      parent: root,
      onFocus: () => focusLog.push("a-focus"),
      onBlur: () => focusLog.push("a-blur"),
    })
    const b = fakeNode("b", {
      focusable: true,
      parent: root,
      onFocus: () => focusLog.push("b-focus"),
      onBlur: () => focusLog.push("b-blur"),
    })

    // Wire up event dispatch via onFocusChange (mimics what run.tsx does)
    const fm = createFocusManager({
      onFocusChange(oldNode, newNode) {
        if (oldNode) {
          dispatchFocusEvent(createFocusEvent("blur", oldNode, newNode))
        }
        if (newNode) {
          dispatchFocusEvent(createFocusEvent("focus", newNode, oldNode))
        }
      },
    })

    // Focus "a" — should fire onFocus on a
    fm.focus(a)
    expect(focusLog).toEqual(["a-focus"])

    // Move to "b" — should fire onBlur on a, then onFocus on b
    fm.focus(b)
    expect(focusLog).toEqual(["a-focus", "a-blur", "b-focus"])
  })

  it("focus events have correct relatedTarget", () => {
    const events: { type: string; targetId: string; relatedId: string | null }[] = []

    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", {
      focusable: true,
      parent: root,
      onFocus: (e) => events.push({
        type: "focus",
        targetId: (e.target.props as Record<string, unknown>).testID as string,
        relatedId: e.relatedTarget ? (e.relatedTarget.props as Record<string, unknown>).testID as string : null,
      }),
      onBlur: (e) => events.push({
        type: "blur",
        targetId: (e.target.props as Record<string, unknown>).testID as string,
        relatedId: e.relatedTarget ? (e.relatedTarget.props as Record<string, unknown>).testID as string : null,
      }),
    })
    const b = fakeNode("b", {
      focusable: true,
      parent: root,
      onFocus: (e) => events.push({
        type: "focus",
        targetId: (e.target.props as Record<string, unknown>).testID as string,
        relatedId: e.relatedTarget ? (e.relatedTarget.props as Record<string, unknown>).testID as string : null,
      }),
    })

    const fm = createFocusManager({
      onFocusChange(oldNode, newNode) {
        if (oldNode) dispatchFocusEvent(createFocusEvent("blur", oldNode, newNode))
        if (newNode) dispatchFocusEvent(createFocusEvent("focus", newNode, oldNode))
      },
    })

    // Focus a: relatedTarget is null (nothing was focused before)
    fm.focus(a)
    expect(events).toEqual([
      { type: "focus", targetId: "a", relatedId: null },
    ])

    // Focus b: blur on a has relatedTarget=b, focus on b has relatedTarget=a
    fm.focus(b)
    expect(events).toEqual([
      { type: "focus", targetId: "a", relatedId: null },
      { type: "blur", targetId: "a", relatedId: "b" },
      { type: "focus", targetId: "b", relatedId: "a" },
    ])
  })

  it("blur() dispatches blur event on the focused element", () => {
    const blurHandler = vi.fn()

    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", {
      focusable: true,
      parent: root,
      onBlur: blurHandler,
    })

    const fm = createFocusManager({
      onFocusChange(oldNode, newNode) {
        if (oldNode) dispatchFocusEvent(createFocusEvent("blur", oldNode, newNode))
        if (newNode) dispatchFocusEvent(createFocusEvent("focus", newNode, oldNode))
      },
    })

    fm.focus(a)
    blurHandler.mockClear()

    fm.blur()
    expect(blurHandler).toHaveBeenCalledOnce()
    // relatedTarget is null since nothing is gaining focus
    expect(blurHandler.mock.calls[0]![0].relatedTarget).toBeNull()
  })

  it("focusNext dispatches events automatically", () => {
    const focusLog: string[] = []

    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", {
      focusable: true,
      parent: root,
      onFocus: () => focusLog.push("a-focus"),
      onBlur: () => focusLog.push("a-blur"),
    })
    const b = fakeNode("b", {
      focusable: true,
      parent: root,
      onFocus: () => focusLog.push("b-focus"),
      onBlur: () => focusLog.push("b-blur"),
    })

    const fm = createFocusManager({
      onFocusChange(oldNode, newNode) {
        if (oldNode) dispatchFocusEvent(createFocusEvent("blur", oldNode, newNode))
        if (newNode) dispatchFocusEvent(createFocusEvent("focus", newNode, oldNode))
      },
    })

    fm.focusNext(root)
    expect(focusLog).toEqual(["a-focus"])

    fm.focusNext(root)
    expect(focusLog).toEqual(["a-focus", "a-blur", "b-focus"])
  })
})

// ============================================================================
// Focus Scope: Tab Cycling with scopeStack
// ============================================================================

describe("Focus scope tab cycling via scopeStack", () => {
  it("Tab cycles within scope when scope is on the stack", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    fakeNode("outside", { focusable: true, parent: root })
    const modal = fakeNode("modal", { focusScope: true, parent: root })
    const m1 = fakeNode("m1", { focusable: true, parent: modal })
    const m2 = fakeNode("m2", { focusable: true, parent: modal })
    fakeNode("after", { focusable: true, parent: root })

    // Enter scope
    fm.enterScope("modal")

    // Tab should only cycle within modal's children
    fm.focusNext(root)
    expect(fm.activeId).toBe("m1")

    fm.focusNext(root)
    expect(fm.activeId).toBe("m2")

    // Wraps back to m1, never reaches "outside" or "after"
    fm.focusNext(root)
    expect(fm.activeId).toBe("m1")
  })

  it("Shift+Tab cycles backwards within scope", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    fakeNode("outside", { focusable: true, parent: root })
    const modal = fakeNode("modal", { focusScope: true, parent: root })
    const m1 = fakeNode("m1", { focusable: true, parent: modal })
    const m2 = fakeNode("m2", { focusable: true, parent: modal })

    fm.enterScope("modal")

    fm.focusPrev(root)
    expect(fm.activeId).toBe("m2")

    fm.focusPrev(root)
    expect(fm.activeId).toBe("m1")

    fm.focusPrev(root)
    expect(fm.activeId).toBe("m2")
  })

  it("nested scopes: innermost scope wins", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const outer = fakeNode("outer", { focusScope: true, parent: root })
    const o1 = fakeNode("o1", { focusable: true, parent: outer })
    const inner = fakeNode("inner", { focusScope: true, parent: outer })
    const i1 = fakeNode("i1", { focusable: true, parent: inner })
    const i2 = fakeNode("i2", { focusable: true, parent: inner })
    const o2 = fakeNode("o2", { focusable: true, parent: outer })

    fm.enterScope("outer")
    fm.enterScope("inner")

    // Tab should only cycle within inner scope
    fm.focusNext(root)
    expect(fm.activeId).toBe("i1")

    fm.focusNext(root)
    expect(fm.activeId).toBe("i2")

    fm.focusNext(root)
    expect(fm.activeId).toBe("i1") // Wraps within inner, never visits o1/o2

    // Exit inner scope
    fm.exitScope()

    // Now tab should cycle within outer scope (which contains inner as opaque)
    fm.focus(o1)
    fm.focusNext(root)
    // inner is a focusScope node but not focusable, so it's skipped.
    // The order is: o1, o2
    expect(fm.activeId).toBe("o2")
  })

  it("exiting scope restores global navigation", () => {
    const fm = createFocusManager()
    const root = fakeNode("root", { focusable: false })
    const a = fakeNode("a", { focusable: true, parent: root })
    const modal = fakeNode("modal", { focusScope: true, parent: root })
    const m1 = fakeNode("m1", { focusable: true, parent: modal })
    const b = fakeNode("b", { focusable: true, parent: root })

    fm.enterScope("modal")
    fm.focusNext(root)
    expect(fm.activeId).toBe("m1")

    fm.exitScope()
    expect(fm.scopeStack).toEqual([])

    // Global nav now
    fm.focus(a)
    fm.focusNext(root)
    // Global order: a, b (modal's children are hidden behind focusScope boundary)
    expect(fm.activeId).toBe("b")
  })
})
