/**
 * DOM-level Mouse Events for silvery
 *
 * Provides React DOM-compatible mouse event infrastructure:
 * - SilveryMouseEvent / SilveryWheelEvent synthetic event objects
 * - Tree-based hit testing using scrollRect (replaces manual HitRegistry)
 * - Event dispatch with bubbling (target → root, stopPropagation support)
 * - Double-click detection (300ms / 2-cell threshold)
 * - mouseenter/mouseleave tracking (no bubble, like DOM spec)
 */

import { createLogger } from "loggily"
import type { FocusManager } from "@silvery/ag/focus-manager"
import { findFocusableAncestor } from "@silvery/ag/focus-queries"
import type { ParsedMouse } from "./mouse"
import { getAncestorPath, pointInRect } from "@silvery/ag/tree-utils"
import type { AgNode, Rect, UserSelect } from "@silvery/ag/types"
import type { SelectionScope } from "@silvery/headless/selection"
import { setHovered, setArmed } from "@silvery/ag/interactive-signals"

// Re-export canonical types from ag (avoid duplicate type definitions)
export type { SilveryMouseEvent, SilveryWheelEvent } from "@silvery/ag/mouse-event-types"
import type { SilveryMouseEvent, SilveryWheelEvent } from "@silvery/ag/mouse-event-types"

const mouseLog = createLogger("silvery:mouse")

// ============================================================================
// Mouse Event Handler Props — canonical location is @silvery/ag
// ============================================================================

import type { MouseEventProps } from "@silvery/ag/mouse-event-types"

// ============================================================================
// Event Factory
// ============================================================================

/**
 * Create a synthetic mouse event.
 *
 * Modifier keys are merged from two sources:
 * - SGR mouse protocol: reports Ctrl, Alt/Meta, Shift (reliable)
 * - Keyboard tracking: reports Super/Cmd, Hyper, CapsLock, NumLock (via Kitty protocol)
 *
 * `metaKey` = keyboard-tracked Super (Cmd on macOS). SGR "meta" maps to `altKey`.
 */
export function createMouseEvent(
  type: SilveryMouseEvent["type"],
  x: number,
  y: number,
  target: AgNode,
  parsed: ParsedMouse,
  keyboardMods?: KeyboardModifierState,
): SilveryMouseEvent {
  let propagationStopped = false
  let defaultPrevented = false
  const metaKey = keyboardMods?.super ?? false
  if (type === "click" || type === "mousedown") {
    mouseLog.debug?.(
      `createMouseEvent(${type}) metaKey=${metaKey} keyboardMods.super=${keyboardMods?.super}`,
    )
  }

  return {
    type,
    clientX: x,
    clientY: y,
    button: parsed.button,
    altKey: parsed.meta,
    ctrlKey: parsed.ctrl,
    metaKey,
    shiftKey: parsed.shift,
    target,
    currentTarget: target,
    nativeEvent: parsed,
    get propagationStopped() {
      return propagationStopped
    },
    get defaultPrevented() {
      return defaultPrevented
    },
    stopPropagation() {
      propagationStopped = true
    },
    preventDefault() {
      defaultPrevented = true
    },
  }
}

/**
 * Create a synthetic wheel event.
 */
export function createWheelEvent(
  x: number,
  y: number,
  target: AgNode,
  parsed: ParsedMouse,
  keyboardMods?: KeyboardModifierState,
): SilveryWheelEvent {
  const base = createMouseEvent("wheel", x, y, target, parsed, keyboardMods) as SilveryWheelEvent
  base.deltaY = parsed.delta ?? 0
  base.deltaX = 0
  return base
}

// ============================================================================
// Hit Testing
// ============================================================================

/**
 * Tree-based hit test: find the deepest node whose scrollRect contains (x, y).
 * Uses reverse child order (last sibling wins = highest z-order, like DOM).
 * Respects overflow:hidden clipping.
 */
export function hitTest(node: AgNode, x: number, y: number): AgNode | null {
  const rect = node.scrollRect
  if (!rect) return null

  // Check if point is within this node's bounds
  if (!pointInRect(x, y, rect)) return null

  // pointerEvents="none" makes this node and its subtree invisible to hit testing
  const props = node.props as { overflow?: string; pointerEvents?: string }
  if (props.pointerEvents === "none") return null

  // Check overflow clipping — if overflow is "hidden" or "scroll",
  // children outside this node's rect are not hittable
  const clips = props.overflow === "hidden" || props.overflow === "scroll"

  // DFS: check children in reverse order (last child = top z-order, like DOM)
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    // If parent clips, skip children whose scrollRect doesn't overlap parent
    if (clips) {
      const childRect = child.scrollRect
      if (childRect && !pointInRect(x, y, rect)) {
        continue
      }
    }
    const hit = hitTest(child, x, y)
    if (hit) return hit
  }

  // Check virtual text children with inlineRects (nested Text inside Text).
  // These don't have scrollRect/layoutNode, so standard DFS misses them.
  if (node.type === "silvery-text") {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i]!
      if (child.inlineRects) {
        for (const inlineRect of child.inlineRects) {
          if (pointInRect(x, y, inlineRect)) return child
        }
      }
    }
  }

  // No child matched — this node is the target (if it has a scrollRect)
  return node
}

// ============================================================================
// Selection Hit Testing
// ============================================================================

/**
 * Resolve the effective userSelect value for a node.
 * "auto" inherits from parent; root defaults to "text".
 */
export function resolveUserSelect(node: AgNode): "none" | "text" | "contain" {
  let current: AgNode | null = node
  while (current) {
    const props = current.props as { userSelect?: UserSelect }
    const value = props.userSelect
    if (value === "none" || value === "text" || value === "contain") return value
    // "auto" or undefined — walk up
    current = current.parent
  }
  // Root default is "text"
  return "text"
}

/**
 * Selection hit test: find the deepest node whose text is selectable at (x, y).
 *
 * Unlike pointer hitTest, this:
 * - Ignores pointerEvents (a node with pointerEvents="none" can still be selectable)
 * - Respects userSelect (a node with userSelect="none" is not a selection target)
 */
export function selectionHitTest(node: AgNode, x: number, y: number): AgNode | null {
  const rect = node.scrollRect
  if (!rect) return null

  if (!pointInRect(x, y, rect)) return null

  // userSelect="none" blocks this subtree from selection hit testing
  // But only if explicitly "none" — "auto" inherits and root defaults to "text"
  const props = node.props as { overflow?: string; userSelect?: UserSelect }
  const resolved = resolveUserSelect(node)
  if (resolved === "none") return null

  // Check overflow clipping (same as pointer hitTest)
  const clips = props.overflow === "hidden" || props.overflow === "scroll"

  // DFS: check children in reverse order (last child = top z-order)
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    if (clips) {
      const childRect = child.scrollRect
      if (childRect && !pointInRect(x, y, rect)) {
        continue
      }
    }
    const hit = selectionHitTest(child, x, y)
    if (hit) return hit
  }

  // Check virtual text children with inlineRects
  if (node.type === "silvery-text") {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i]!
      if (child.inlineRects) {
        for (const inlineRect of child.inlineRects) {
          if (pointInRect(x, y, inlineRect)) return child
        }
      }
    }
  }

  return node
}

/**
 * Find the contain boundary for a node.
 * Walks up to the nearest `userSelect="contain"` ancestor and returns its scrollRect
 * as a SelectionScope. Returns null if no contain boundary exists.
 */
export function findContainBoundary(node: AgNode): SelectionScope | null {
  let current: AgNode | null = node
  while (current) {
    const props = current.props as { userSelect?: UserSelect }
    if (props.userSelect === "contain") {
      const rect = current.scrollRect
      if (rect) {
        return {
          top: rect.y,
          bottom: rect.y + rect.height - 1,
          left: rect.x,
          right: rect.x + rect.width - 1,
        }
      }
    }
    current = current.parent
  }
  return null
}

// ============================================================================
// Draggable Resolution
// ============================================================================

/**
 * Check if a node has draggable=true.
 * Unlike userSelect, draggable is NOT inherited — only the exact node is checked.
 * Ancestors' draggable prop has no effect on children.
 */
export function resolveNodeDraggable(node: AgNode | null): boolean {
  if (!node) return false
  const props = node.props as { draggable?: boolean }
  return props.draggable === true
}

// ============================================================================
// Event Dispatch
// ============================================================================

/** Map event type to the handler prop name */
const EVENT_HANDLER_MAP: Record<string, string & keyof MouseEventProps> = {
  click: "onClick",
  dblclick: "onDoubleClick",
  mousedown: "onMouseDown",
  mouseup: "onMouseUp",
  mousemove: "onMouseMove",
  mouseenter: "onMouseEnter",
  mouseleave: "onMouseLeave",
  wheel: "onWheel",
}

/**
 * Dispatch a mouse event through the render tree with DOM-style bubbling.
 *
 * Bubbles from target → root, calling the appropriate handler on each node.
 * stopPropagation() halts bubbling. mouseenter/mouseleave do NOT bubble (DOM spec).
 */
export function dispatchMouseEvent(event: SilveryMouseEvent): void {
  const handlerProp = EVENT_HANDLER_MAP[event.type]
  if (!handlerProp) return

  // mouseenter/mouseleave don't bubble (DOM spec)
  const noBubble = event.type === "mouseenter" || event.type === "mouseleave"

  if (noBubble) {
    // Only fire on the target itself
    const handler = (event.target.props as Record<string, unknown>)[handlerProp] as
      | ((e: SilveryMouseEvent) => void)
      | undefined
    if (handler) {
      const mutableEvent = event as { currentTarget: AgNode }
      mutableEvent.currentTarget = event.target
      handler(event)
    }
    return
  }

  // Bubble phase: fire from target up to root
  const path = getAncestorPath(event.target)
  for (const node of path) {
    if (event.propagationStopped) break

    const handler = (node.props as Record<string, unknown>)[handlerProp] as
      | ((e: SilveryMouseEvent) => void)
      | undefined
    if (handler) {
      const mutableEvent = event as { currentTarget: AgNode }
      mutableEvent.currentTarget = node
      handler(event)
    }
  }
}

// ============================================================================
// Double-Click Detection
// ============================================================================

export interface DoubleClickState {
  lastClickTime: number
  lastClickX: number
  lastClickY: number
  lastClickButton: number
}

export function createDoubleClickState(): DoubleClickState {
  return {
    lastClickTime: 0,
    lastClickX: -999,
    lastClickY: -999,
    lastClickButton: -1,
  }
}

const DOUBLE_CLICK_TIME_MS = 300
const DOUBLE_CLICK_DISTANCE = 2

/**
 * Check if a click qualifies as a double-click, given the previous click state.
 * Updates the state for the next check.
 * Returns true if this is a double-click.
 */
export function checkDoubleClick(
  state: DoubleClickState,
  x: number,
  y: number,
  button: number,
  now: number = Date.now(),
): boolean {
  const timeDelta = now - state.lastClickTime
  const dx = Math.abs(x - state.lastClickX)
  const dy = Math.abs(y - state.lastClickY)
  const sameButton = button === state.lastClickButton

  const isDouble =
    sameButton &&
    timeDelta <= DOUBLE_CLICK_TIME_MS &&
    dx <= DOUBLE_CLICK_DISTANCE &&
    dy <= DOUBLE_CLICK_DISTANCE

  // Update state
  state.lastClickTime = now
  state.lastClickX = x
  state.lastClickY = y
  state.lastClickButton = button

  // If double-click, reset so triple-click doesn't register as another double
  if (isDouble) {
    state.lastClickTime = 0
  }

  return isDouble
}

// ============================================================================
// Mouse Enter/Leave Tracking
// ============================================================================

/**
 * Compute mouseenter/mouseleave transitions between two ancestor paths.
 *
 * Returns { entered, left } — arrays of nodes that were entered or left.
 * Mirrors the DOM spec: fire mouseleave on nodes in prevPath not in nextPath,
 * and mouseenter on nodes in nextPath not in prevPath.
 */
export function computeEnterLeave(
  prevPath: AgNode[],
  nextPath: AgNode[],
): { entered: AgNode[]; left: AgNode[] } {
  const prevSet = new Set(prevPath)
  const nextSet = new Set(nextPath)

  const entered = nextPath.filter((n) => !prevSet.has(n))
  const left = prevPath.filter((n) => !nextSet.has(n))

  return { entered, left }
}

// ============================================================================
// High-Level Mouse Event Processor
// ============================================================================

/**
 * Options for creating a mouse event processor.
 */
export interface MouseEventProcessorOptions {
  /** Optional focus manager — enables click-to-focus behavior.
   *  On mousedown, the deepest focusable ancestor of the hit target is focused. */
  focusManager?: FocusManager
}

/**
 * State for the mouse event processor.
 */
/**
 * Keyboard modifier state tracked from Kitty protocol key events.
 * Merged into mouse events to provide accurate modifier detection
 * (SGR mouse protocol reports Ctrl/Alt/Shift but NOT Cmd/Super).
 */
export interface KeyboardModifierState {
  super: boolean
  hyper: boolean
  capsLock: boolean
  numLock: boolean
}

export interface MouseEventProcessorState {
  doubleClick: DoubleClickState
  /** Previous hover path (for enter/leave tracking) */
  hoverPath: AgNode[]
  /** Whether the left button is currently down (for click detection) */
  mouseDownTarget: AgNode | null
  /** Optional focus manager for click-to-focus */
  focusManager?: FocusManager
  /** Modifier state from Kitty keyboard events, merged into mouse events */
  keyboardModifiers: KeyboardModifierState
}

export function createMouseEventProcessor(
  options?: MouseEventProcessorOptions,
): MouseEventProcessorState {
  return {
    doubleClick: createDoubleClickState(),
    hoverPath: [],
    mouseDownTarget: null,
    focusManager: options?.focusManager,
    keyboardModifiers: { super: false, hyper: false, capsLock: false, numLock: false },
  }
}

/**
 * Update keyboard modifier state from a parsed key event.
 * Call this for every keyboard event so mouse events can include accurate modifiers.
 */
export function updateKeyboardModifiers(
  state: MouseEventProcessorState,
  key: {
    super?: boolean
    hyper?: boolean
    capsLock?: boolean
    numLock?: boolean
    eventType?: string
  },
): void {
  // On key release events, clear the modifier. On press/repeat, set it.
  const isRelease = key.eventType === "release"
  const prevSuper = state.keyboardModifiers.super
  if (key.super !== undefined) state.keyboardModifiers.super = isRelease ? false : key.super
  if (key.hyper !== undefined) state.keyboardModifiers.hyper = isRelease ? false : key.hyper
  if (key.capsLock !== undefined) state.keyboardModifiers.capsLock = key.capsLock
  if (key.numLock !== undefined) state.keyboardModifiers.numLock = key.numLock
  if (state.keyboardModifiers.super !== prevSuper) {
    mouseLog.debug?.(
      `keyboardModifiers.super: ${prevSuper} → ${state.keyboardModifiers.super} (key.super=${key.super}, eventType=${key.eventType})`,
    )
  }
}

/**
 * Process a raw ParsedMouse event and dispatch DOM-level events on the render tree.
 *
 * Call this for every SGR mouse event received. It handles:
 * - mousedown / mouseup
 * - click (on mouseup if same target as mousedown)
 * - dblclick (based on timing)
 * - mousemove + mouseenter/mouseleave
 * - wheel
 */
export function processMouseEvent(
  state: MouseEventProcessorState,
  parsed: ParsedMouse,
  root: AgNode,
): boolean {
  const { x, y, action } = parsed
  const target = hitTest(root, x, y)
  if (action === "move") {
    const nodeType = target?.type ?? "null"
    const nodeId = target ? ((target.props as Record<string, unknown>).id ?? "") : ""
    // Check entire ancestor path for onMouseEnter
    let enterAncestor = ""
    if (target) {
      let n: AgNode | null = target
      while (n) {
        if ("onMouseEnter" in (n.props as Record<string, unknown>)) {
          enterAncestor = `${n.type}#${(n.props as Record<string, unknown>).id ?? ""}`
          break
        }
        n = n.parent
      }
    }
    const newPath = target ? getAncestorPath(target) : []
    const { entered } = computeEnterLeave(state.hoverPath, newPath)
    mouseLog.debug?.(
      `move x=${x} y=${y} target=${nodeType}#${nodeId} enterAncestor=${enterAncestor || "none"} entered=${entered.length} prevPath=${state.hoverPath.length}`,
    )
  }
  if (!target) return false
  let defaultPrevented = false

  if (action === "down") {
    state.mouseDownTarget = target

    // Set armed state on the target node
    setArmed(target, true)

    // Click-to-focus: find nearest focusable ancestor and focus it
    if (state.focusManager) {
      const focusable = findFocusableAncestor(target)
      if (focusable) {
        state.focusManager.focus(focusable, "mouse")
      }
    }

    const event = createMouseEvent("mousedown", x, y, target, parsed, state.keyboardModifiers)
    dispatchMouseEvent(event)
    if (event.defaultPrevented) defaultPrevented = true
  } else if (action === "up") {
    // Clear armed state on the mousedown target
    if (state.mouseDownTarget) {
      setArmed(state.mouseDownTarget, false)
    }

    const event = createMouseEvent("mouseup", x, y, target, parsed, state.keyboardModifiers)
    dispatchMouseEvent(event)

    // Click = mouseup on the same node (or ancestor) where mousedown happened
    // DOM actually fires click even if up is on a different element, but the target
    // is the nearest common ancestor. For simplicity, we fire click on the up target
    // if mousedown was on the same target or a descendant.
    if (state.mouseDownTarget) {
      const clickEvent = createMouseEvent("click", x, y, target, parsed, state.keyboardModifiers)
      dispatchMouseEvent(clickEvent)
      if (clickEvent.defaultPrevented) defaultPrevented = true

      // Check for double-click
      const isDouble = checkDoubleClick(state.doubleClick, x, y, parsed.button)
      if (isDouble) {
        const dblEvent = createMouseEvent("dblclick", x, y, target, parsed, state.keyboardModifiers)
        dispatchMouseEvent(dblEvent)
        if (dblEvent.defaultPrevented) defaultPrevented = true
      }
    }

    state.mouseDownTarget = null
  } else if (action === "move") {
    const event = createMouseEvent("mousemove", x, y, target, parsed, state.keyboardModifiers)
    dispatchMouseEvent(event)

    // Compute enter/leave transitions
    const newPath = getAncestorPath(target)
    const { entered, left } = computeEnterLeave(state.hoverPath, newPath)

    // Fire mouseleave on nodes that were left (reverse order = deepest first)
    for (const node of left) {
      setHovered(node, false)
      const leaveEvent = createMouseEvent("mouseleave", x, y, node, parsed, state.keyboardModifiers)
      dispatchMouseEvent(leaveEvent)
    }

    // Fire mouseenter on newly entered nodes (forward order = shallowest first)
    for (const node of entered.reverse()) {
      setHovered(node, true)
      const enterEvent = createMouseEvent("mouseenter", x, y, node, parsed, state.keyboardModifiers)
      dispatchMouseEvent(enterEvent)
    }

    state.hoverPath = newPath
  } else if (action === "wheel") {
    const event = createWheelEvent(x, y, target, parsed, state.keyboardModifiers)
    dispatchMouseEvent(event)
    if (event.defaultPrevented) defaultPrevented = true
  }
  return defaultPrevented
}
