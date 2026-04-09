/**
 * Interactive Signals Tests
 *
 * Tests for per-node interactive state:
 * - ensureInteractiveState creates lazily
 * - Setters return change detection correctly
 * - clearInteractiveState resets all fields
 * - Hover tracking via mouseenter/mouseleave
 * - Armed tracking via mousedown/mouseup
 * - Focus tracking via focus manager
 */

import { describe, test, expect } from "vitest"
import type { AgNode, BoxProps } from "../../packages/ag/src/types"
import {
  ensureInteractiveState,
  setHovered,
  setArmed,
  setSelected,
  setFocused,
  setDropTarget,
  clearInteractiveState,
} from "../../packages/ag/src/interactive-signals"
import { createFocusManager } from "../../packages/ag/src/focus-manager"
import { createMouseEventProcessor, processMouseEvent } from "../../packages/ag-term/src/mouse-events"
import type { ParsedMouse } from "../../packages/ag-term/src/mouse"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal AgNode stub for interactive signal tests. */
function stubNode(
  id: string,
  opts?: { children?: AgNode[]; rect?: { x: number; y: number; width: number; height: number } },
): AgNode {
  const children = opts?.children ?? []
  const rect = opts?.rect ?? null
  const node: AgNode = {
    type: "silvery-box",
    props: { testID: id, focusable: true } as BoxProps,
    children,
    parent: null,
    layoutNode: {} as any,
    contentRect: null,
    scrollRect: rect,
    renderRect: rect,
    prevLayout: null,
    prevScrollRect: null,
    prevRenderRect: null,
    layoutChangedThisFrame: false,
    layoutDirty: false,
    contentDirty: false,
    stylePropsDirty: false,
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

function makeParsedMouse(action: ParsedMouse["action"], x: number, y: number, button = 0): ParsedMouse {
  return {
    action,
    x,
    y,
    button,
    ctrl: false,
    meta: false,
    shift: false,
  }
}

// ============================================================================
// ensureInteractiveState
// ============================================================================

describe("ensureInteractiveState", () => {
  test("creates state lazily on first call", () => {
    const node = stubNode("a")
    expect(node.interactiveState).toBeUndefined()

    const state = ensureInteractiveState(node)
    expect(state).toBeDefined()
    expect(state.hovered).toBe(false)
    expect(state.armed).toBe(false)
    expect(state.selected).toBe(false)
    expect(state.focused).toBe(false)
    expect(state.dropTarget).toBe(false)
  })

  test("returns existing state on subsequent calls", () => {
    const node = stubNode("a")
    const first = ensureInteractiveState(node)
    first.hovered = true
    const second = ensureInteractiveState(node)
    expect(second).toBe(first)
    expect(second.hovered).toBe(true)
  })
})

// ============================================================================
// Individual setters — change detection
// ============================================================================

describe("setters return change detection", () => {
  test("setHovered returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setHovered(node, true)).toBe(true)
    expect(node.interactiveState!.hovered).toBe(true)
    expect(setHovered(node, true)).toBe(false)
    expect(setHovered(node, false)).toBe(true)
    expect(node.interactiveState!.hovered).toBe(false)
  })

  test("setArmed returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setArmed(node, true)).toBe(true)
    expect(node.interactiveState!.armed).toBe(true)
    expect(setArmed(node, true)).toBe(false)
    expect(setArmed(node, false)).toBe(true)
  })

  test("setSelected returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setSelected(node, true)).toBe(true)
    expect(node.interactiveState!.selected).toBe(true)
    expect(setSelected(node, true)).toBe(false)
    expect(setSelected(node, false)).toBe(true)
  })

  test("setFocused returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setFocused(node, true)).toBe(true)
    expect(node.interactiveState!.focused).toBe(true)
    expect(setFocused(node, true)).toBe(false)
    expect(setFocused(node, false)).toBe(true)
  })

  test("setDropTarget returns true on change, false on no-op", () => {
    const node = stubNode("a")
    expect(setDropTarget(node, true)).toBe(true)
    expect(node.interactiveState!.dropTarget).toBe(true)
    expect(setDropTarget(node, true)).toBe(false)
    expect(setDropTarget(node, false)).toBe(true)
  })
})

// ============================================================================
// clearInteractiveState
// ============================================================================

describe("clearInteractiveState", () => {
  test("sets interactiveState to null", () => {
    const node = stubNode("a")
    setHovered(node, true)
    setArmed(node, true)
    expect(node.interactiveState).not.toBeNull()

    clearInteractiveState(node)
    expect(node.interactiveState).toBeNull()
  })

  test("no-op on node without interactive state", () => {
    const node = stubNode("a")
    // Should not throw
    clearInteractiveState(node)
    expect(node.interactiveState).toBeNull()
  })
})

// ============================================================================
// Hover tracking via mouse events
// ============================================================================

describe("hover tracking via processMouseEvent", () => {
  test("mouseenter sets hovered=true, mouseleave sets hovered=false", () => {
    const child = stubNode("child", { rect: { x: 5, y: 5, width: 10, height: 5 } })
    const root = stubNode("root", { children: [child], rect: { x: 0, y: 0, width: 80, height: 24 } })
    const state = createMouseEventProcessor()

    // Move into child — triggers mouseenter
    processMouseEvent(state, makeParsedMouse("move", 7, 7), root)
    expect(child.interactiveState?.hovered).toBe(true)

    // Move out of child — triggers mouseleave
    processMouseEvent(state, makeParsedMouse("move", 0, 0), root)
    expect(child.interactiveState?.hovered).toBe(false)
  })
})

// ============================================================================
// Armed tracking via mousedown/mouseup
// ============================================================================

describe("armed tracking via processMouseEvent", () => {
  test("mousedown sets armed=true, mouseup clears it", () => {
    const child = stubNode("child", { rect: { x: 5, y: 5, width: 10, height: 5 } })
    const root = stubNode("root", { children: [child], rect: { x: 0, y: 0, width: 80, height: 24 } })
    const state = createMouseEventProcessor()

    // Mouse down on child
    processMouseEvent(state, makeParsedMouse("down", 7, 7), root)
    expect(child.interactiveState?.armed).toBe(true)

    // Mouse up on child
    processMouseEvent(state, makeParsedMouse("up", 7, 7), root)
    expect(child.interactiveState?.armed).toBe(false)
  })
})

// ============================================================================
// Focus tracking via focus manager
// ============================================================================

describe("focus tracking via FocusManager", () => {
  test("focus sets focused=true, blur sets focused=false", () => {
    const node = stubNode("a")
    const fm = createFocusManager()

    fm.focus(node, "keyboard")
    expect(node.interactiveState?.focused).toBe(true)

    fm.blur()
    expect(node.interactiveState?.focused).toBe(false)
  })

  test("focusing a new node clears focused on old node", () => {
    const nodeA = stubNode("a")
    const nodeB = stubNode("b")
    const fm = createFocusManager()

    fm.focus(nodeA, "keyboard")
    expect(nodeA.interactiveState?.focused).toBe(true)

    fm.focus(nodeB, "keyboard")
    expect(nodeA.interactiveState?.focused).toBe(false)
    expect(nodeB.interactiveState?.focused).toBe(true)
  })

  test("handleSubtreeRemoved clears focused on removed node", () => {
    const child = stubNode("child")
    const root = stubNode("root", { children: [child] })
    const fm = createFocusManager()

    fm.focus(child, "keyboard")
    expect(child.interactiveState?.focused).toBe(true)

    fm.handleSubtreeRemoved(child)
    expect(child.interactiveState?.focused).toBe(false)
  })
})
