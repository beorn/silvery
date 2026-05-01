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

/** Position property on a Box that takes the node out of normal flow. */
function isAbsolutePositioned(node: AgNode): boolean {
  const p = node.props as { position?: string }
  return p.position === "absolute"
}

/**
 * Geometry-based hit test for absolute-positioned descendants.
 *
 * Walks the whole subtree rooted at `node` in tree order. For each
 * absolute-positioned descendant whose scrollRect contains (x, y), recurse
 * into it as a standalone hit-test (which finds the deepest in-flow child
 * under that absolute) and track the latest-in-tree hit — that one paints
 * on top (third pass in render order uses natural child order, so later =
 * higher z).
 *
 * Respects pointerEvents="none" on the absolute root and its ancestors,
 * and overflow:hidden/scroll clipping on ancestors up to `node`.
 *
 * Returns null if no absolute descendant covers (x, y).
 */
function hitTestAbsoluteDescendants(
  node: AgNode,
  x: number,
  y: number,
  ancestorClipRect: Rect | null,
): AgNode | null {
  let result: AgNode | null = null

  for (const child of node.children) {
    // Honor pointerEvents="none" on any ancestor of the absolute node.
    const cp = child.props as { pointerEvents?: string; overflow?: string }
    if (cp.pointerEvents === "none") continue

    // Compute the effective clip rect for this child's descendants.
    let childClip = ancestorClipRect
    if (cp.overflow === "hidden" || cp.overflow === "scroll") {
      const cr = child.scrollRect
      if (cr) {
        childClip = childClip ? intersectRect(childClip, cr) : cr
      }
    }

    if (isAbsolutePositioned(child) && child.scrollRect) {
      // If an ancestor clips and the absolute node is outside the clip, skip.
      const clipExcludes = ancestorClipRect && !pointInRect(x, y, ancestorClipRect)
      if (!clipExcludes && pointInRect(x, y, child.scrollRect)) {
        // Recurse INTO the absolute node to find the deepest descendant
        // under it. We use hitTestInFlow plus a nested absolute pass so
        // nested absolutes also resolve geometrically.
        const nestedAbs = hitTestAbsoluteDescendants(child, x, y, null)
        const hit = nestedAbs ?? hitTestInFlow(child, x, y)
        if (hit) {
          // Later-in-tree wins for z-order (paints on top in absolute pass).
          result = hit
        }
      }
    }

    // Continue searching this child's subtree for deeper absolute descendants
    // (an absolute node can contain nested absolute nodes; we still want the
    // latest one to win).
    const deeper = hitTestAbsoluteDescendants(child, x, y, childClip)
    if (deeper) result = deeper
  }

  return result
}

/** Compute the intersection of two rects; returns a zero-size rect if disjoint. */
function intersectRect(a: Rect, b: Rect): Rect {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
}

/**
 * In-flow (non-absolute) DFS hit test. Used by both `hitTest` after the
 * absolute pass, and by `hitTestAbsoluteDescendants` when recursing into a
 * matched absolute to find the deepest in-flow descendant under it.
 *
 * Skips absolute children — they're handled by the absolute pass at the
 * entry point (`hitTest`).
 */
function hitTestInFlow(node: AgNode, x: number, y: number): AgNode | null {
  const rect = node.scrollRect
  if (!rect) return null

  if (!pointInRect(x, y, rect)) return null

  const props = node.props as { overflow?: string; pointerEvents?: string }
  if (props.pointerEvents === "none") return null

  const clips = props.overflow === "hidden" || props.overflow === "scroll"

  // DFS: reverse child order (last child = top z-order).
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    if (isAbsolutePositioned(child)) continue // handled by absolute pass

    if (clips) {
      const childRect = child.scrollRect
      if (childRect && !pointInRect(x, y, rect)) {
        continue
      }
    }
    const hit = hitTestInFlow(child, x, y)
    if (hit) return hit
  }

  // Virtual text children with inlineRects (nested Text inside Text).
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
 * Tree-based hit test: find the deepest node whose scrollRect contains (x, y).
 *
 * Uses reverse child order (last sibling wins = highest z-order, like DOM).
 * Respects overflow:hidden clipping and pointerEvents="none".
 *
 * ### Absolute-positioned nodes escape parent bounds
 *
 * Absolute descendants participate in hit-testing by GEOMETRY, not by
 * tree order / parent rect containment. An absolute child can be placed
 * outside its parent's bounding rect (e.g., a popover anchored near a
 * viewport edge); it still occupies screen cells at its own geometry and
 * must be hittable.
 *
 * The hit test runs an "absolute pass" first that walks the whole subtree
 * for absolute descendants and returns the latest-in-tree hit (matching
 * the three-pass render order where absolute children paint on top of
 * normal + sticky content). If no absolute descendant covers the point,
 * it falls through to standard in-flow DFS.
 *
 * A recursive sub-call (via `hitTest(absolute, ...)`) would re-run the
 * absolute pass on that absolute's subtree — which is correct: nested
 * absolutes also need geometry-based hit testing.
 */
export function hitTest(node: AgNode, x: number, y: number): AgNode | null {
  // 1. Absolute pass: find the topmost absolute descendant under (x, y).
  //    Respects pointerEvents and overflow:hidden/scroll clipping on
  //    ancestors.
  const absHit = hitTestAbsoluteDescendants(node, x, y, null)
  if (absHit) return absHit

  // 2. In-flow DFS (classic tree walk).
  return hitTestInFlow(node, x, y)
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

export interface SelectionBoundary {
  node: AgNode
  scope: SelectionScope
  hardContain: boolean
}

function nodeSelectionScope(node: AgNode): SelectionScope | null {
  const rect = node.scrollRect
  if (!rect) return null
  return {
    top: rect.y,
    bottom: rect.y + rect.height - 1,
    left: rect.x,
    right: rect.x + rect.width - 1,
  }
}

/**
 * Return the selectable document-ancestor chain for a node, nearest first.
 *
 * This is the DOM-like selection path: ordinary selectable nodes create
 * semantic selection regions, while `userSelect="contain"` marks a CSS-style
 * hard containment boundary that selection must not escape.
 */
export function findSelectionBoundaries(node: AgNode): SelectionBoundary[] {
  const boundaries: SelectionBoundary[] = []
  let current: AgNode | null = node
  while (current) {
    const resolved = resolveUserSelect(current)
    if (resolved !== "none") {
      const scope = nodeSelectionScope(current)
      if (scope) {
        const props = current.props as { userSelect?: UserSelect }
        boundaries.push({ node: current, scope, hardContain: props.userSelect === "contain" })
      }
    }
    current = current.parent
  }
  return boundaries
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
  tripleclick: "onTripleClick",
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
// Click-Count Detection (single / double / triple)
// ============================================================================

/**
 * Click-count state tracker.
 *
 * Counts up to 3 consecutive clicks within `MULTI_CLICK_TIME_MS` and
 * `MULTI_CLICK_DISTANCE` cells of each other on the same button. After
 * count reaches 3, the next click resets to 1 (matching DOM behavior:
 * `MouseEvent.detail` increments to 3, then a new click chain starts).
 *
 * `DoubleClickState` is kept as a backwards-compatible alias.
 */
export interface ClickCountState {
  lastClickTime: number
  lastClickX: number
  lastClickY: number
  lastClickButton: number
  /** Number of consecutive clicks in the current chain (1, 2, or 3). */
  count: number
}

/** @deprecated Use `ClickCountState` instead — kept as an alias for callers
 *  that haven't migrated to the count-based API. */
export type DoubleClickState = ClickCountState

export function createClickCountState(): ClickCountState {
  return {
    lastClickTime: 0,
    lastClickX: -999,
    lastClickY: -999,
    lastClickButton: -1,
    count: 0,
  }
}

/** @deprecated Use `createClickCountState()` instead. */
export const createDoubleClickState = createClickCountState

const MULTI_CLICK_TIME_MS = 300
const MULTI_CLICK_DISTANCE = 2

/**
 * Determine the consecutive-click count for the current click.
 *
 * Returns 1 for a fresh click, 2 for a double-click, 3 for a triple-click.
 * Subsequent clicks restart the chain at 1.
 *
 * Updates `state` so the next call sees the right history.
 */
export function checkClickCount(
  state: ClickCountState,
  x: number,
  y: number,
  button: number,
  now: number = Date.now(),
): 1 | 2 | 3 {
  const timeDelta = now - state.lastClickTime
  const dx = Math.abs(x - state.lastClickX)
  const dy = Math.abs(y - state.lastClickY)
  const sameButton = button === state.lastClickButton
  const inChain =
    sameButton &&
    timeDelta <= MULTI_CLICK_TIME_MS &&
    dx <= MULTI_CLICK_DISTANCE &&
    dy <= MULTI_CLICK_DISTANCE

  let count: 1 | 2 | 3
  if (!inChain || state.count >= 3) {
    count = 1
  } else if (state.count === 1) {
    count = 2
  } else {
    count = 3
  }

  state.lastClickTime = now
  state.lastClickX = x
  state.lastClickY = y
  state.lastClickButton = button
  state.count = count

  return count
}

/**
 * Check if a click qualifies as a double-click. Backwards-compatible
 * wrapper around `checkClickCount`.
 *
 * @deprecated Use `checkClickCount` and inspect the returned count
 *   (`=== 2` for dblclick, `=== 3` for tripleclick).
 */
export function checkDoubleClick(
  state: ClickCountState,
  x: number,
  y: number,
  button: number,
  now: number = Date.now(),
): boolean {
  return checkClickCount(state, x, y, button, now) === 2
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
  /** Optional ancestor that captures move/up for the active mouse press. */
  mouseCaptureTarget: AgNode | null
  /** Optional focus manager for click-to-focus */
  focusManager?: FocusManager
  /** Modifier state from Kitty keyboard events, merged into mouse events */
  keyboardModifiers: KeyboardModifierState
  /** Aggregate `defaultPrevented` from the most recent click/dblclick/tripleclick
   *  dispatch chain. Set by `processMouseEvent` on every mouseup so callers
   *  (e.g., the runtime selection wiring) can gate auto-select on whether the
   *  component tree consumed the click. Reset to false at the start of each
   *  mouseup dispatch. */
  lastClickPrevented: boolean
}

export function createMouseEventProcessor(
  options?: MouseEventProcessorOptions,
): MouseEventProcessorState {
  return {
    doubleClick: createDoubleClickState(),
    hoverPath: [],
    mouseDownTarget: null,
    mouseCaptureTarget: null,
    focusManager: options?.focusManager,
    keyboardModifiers: { super: false, hyper: false, capsLock: false, numLock: false },
    lastClickPrevented: false,
  }
}

function findMouseCaptureTarget(node: AgNode | null): AgNode | null {
  let current = node
  while (current) {
    const props = current.props as { mouseCapture?: boolean }
    if (props.mouseCapture === true) return current
    current = current.parent
  }
  return null
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
    state.mouseCaptureTarget = findMouseCaptureTarget(target)

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
    const dispatchTarget = state.mouseCaptureTarget ?? target
    // Clear armed state on the mousedown target
    if (state.mouseDownTarget) {
      setArmed(state.mouseDownTarget, false)
    }

    // Reset aggregate at the start of every mouseup so callers reading
    // `lastClickPrevented` after dispatch see only this dispatch's signal.
    state.lastClickPrevented = false

    const event = createMouseEvent("mouseup", x, y, dispatchTarget, parsed, state.keyboardModifiers)
    dispatchMouseEvent(event)

    // Click = mouseup on the same node (or ancestor) where mousedown happened
    // DOM actually fires click even if up is on a different element, but the target
    // is the nearest common ancestor. For simplicity, we fire click on the up target
    // if mousedown was on the same target or a descendant.
    if (state.mouseDownTarget) {
      // Resolve the multi-click count BEFORE creating the event so we can
      // attach `detail` (DOM `MouseEvent.detail` convention).
      const count = checkClickCount(state.doubleClick, x, y, parsed.button)
      const clickEvent = createMouseEvent("click", x, y, dispatchTarget, parsed, state.keyboardModifiers)
      ;(clickEvent as { detail?: 1 | 2 | 3 }).detail = count
      dispatchMouseEvent(clickEvent)
      if (clickEvent.defaultPrevented) {
        defaultPrevented = true
        state.lastClickPrevented = true
      }

      if (count >= 2) {
        const dblEvent = createMouseEvent("dblclick", x, y, dispatchTarget, parsed, state.keyboardModifiers)
        ;(dblEvent as { detail?: 1 | 2 | 3 }).detail = 2
        dispatchMouseEvent(dblEvent)
        if (dblEvent.defaultPrevented) {
          defaultPrevented = true
          state.lastClickPrevented = true
        }
      }
      if (count === 3) {
        const tripleEvent = createMouseEvent(
          "tripleclick",
          x,
          y,
          dispatchTarget,
          parsed,
          state.keyboardModifiers,
        )
        ;(tripleEvent as { detail?: 1 | 2 | 3 }).detail = 3
        dispatchMouseEvent(tripleEvent)
        if (tripleEvent.defaultPrevented) {
          defaultPrevented = true
          state.lastClickPrevented = true
        }
      }
    }

    state.mouseDownTarget = null
    state.mouseCaptureTarget = null
  } else if (action === "move") {
    const dispatchTarget = state.mouseCaptureTarget ?? target
    const event = createMouseEvent("mousemove", x, y, dispatchTarget, parsed, state.keyboardModifiers)
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
