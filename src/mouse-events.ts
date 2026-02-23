/**
 * DOM-level Mouse Events for inkx
 *
 * Provides React DOM-compatible mouse event infrastructure:
 * - InkxMouseEvent / InkxWheelEvent synthetic event objects
 * - Tree-based hit testing using screenRect (replaces manual HitRegistry)
 * - Event dispatch with bubbling (target → root, stopPropagation support)
 * - Double-click detection (300ms / 2-cell threshold)
 * - mouseenter/mouseleave tracking (no bubble, like DOM spec)
 */

import type { FocusManager } from "./focus-manager.js"
import { findFocusableAncestor } from "./focus-queries.js"
import type { ParsedMouse } from "./mouse.js"
import { getAncestorPath, pointInRect } from "./tree-utils.js"
import type { InkxNode } from "./types.js"

// ============================================================================
// Event Types
// ============================================================================

/**
 * Synthetic mouse event, mirroring React.MouseEvent / DOM MouseEvent.
 */
export interface InkxMouseEvent {
  /** Terminal column (0-indexed) */
  clientX: number
  /** Terminal row (0-indexed) */
  clientY: number
  /** Mouse button: 0=left, 1=middle, 2=right */
  button: number
  /** Modifier keys */
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  /** Deepest node under cursor */
  target: InkxNode
  /** Node whose handler is currently firing (changes during bubble) */
  currentTarget: InkxNode
  /** Event type */
  type: "click" | "dblclick" | "mousedown" | "mouseup" | "mousemove" | "mouseenter" | "mouseleave" | "wheel"
  /** Stop event from bubbling to parent nodes */
  stopPropagation(): void
  /** Prevent default behavior */
  preventDefault(): void
  /** Whether stopPropagation() was called */
  readonly propagationStopped: boolean
  /** Whether preventDefault() was called */
  readonly defaultPrevented: boolean
  /** Raw parsed mouse data from SGR protocol */
  nativeEvent: ParsedMouse
}

/**
 * Synthetic wheel event, extending InkxMouseEvent with scroll deltas.
 */
export interface InkxWheelEvent extends InkxMouseEvent {
  /** Vertical scroll: -1 (up) or +1 (down) */
  deltaY: number
  /** Horizontal scroll: always 0 for terminals */
  deltaX: number
}

// ============================================================================
// Mouse Event Handler Props (added to BoxProps/TextProps)
// ============================================================================

export interface MouseEventProps {
  onClick?: (event: InkxMouseEvent) => void
  onDoubleClick?: (event: InkxMouseEvent) => void
  onMouseDown?: (event: InkxMouseEvent) => void
  onMouseUp?: (event: InkxMouseEvent) => void
  onMouseMove?: (event: InkxMouseEvent) => void
  onMouseEnter?: (event: InkxMouseEvent) => void
  onMouseLeave?: (event: InkxMouseEvent) => void
  onWheel?: (event: InkxWheelEvent) => void
}

// ============================================================================
// Event Factory
// ============================================================================

/**
 * Create a synthetic mouse event.
 */
export function createMouseEvent(
  type: InkxMouseEvent["type"],
  x: number,
  y: number,
  target: InkxNode,
  parsed: ParsedMouse,
): InkxMouseEvent {
  let propagationStopped = false
  let defaultPrevented = false

  return {
    type,
    clientX: x,
    clientY: y,
    button: parsed.button,
    altKey: parsed.meta,
    ctrlKey: parsed.ctrl,
    metaKey: false,
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
export function createWheelEvent(x: number, y: number, target: InkxNode, parsed: ParsedMouse): InkxWheelEvent {
  const base = createMouseEvent("wheel", x, y, target, parsed) as InkxWheelEvent
  base.deltaY = parsed.delta ?? 0
  base.deltaX = 0
  return base
}

// ============================================================================
// Hit Testing
// ============================================================================

/**
 * Tree-based hit test: find the deepest node whose screenRect contains (x, y).
 * Uses reverse child order (last sibling wins = highest z-order, like DOM).
 * Respects overflow:hidden clipping.
 */
export function hitTest(node: InkxNode, x: number, y: number): InkxNode | null {
  const rect = node.screenRect
  if (!rect) return null

  // Check if point is within this node's bounds
  if (!pointInRect(x, y, rect)) return null

  // Check overflow clipping — if overflow is "hidden" or "scroll",
  // children outside this node's rect are not hittable
  const props = node.props as { overflow?: string }
  const clips = props.overflow === "hidden" || props.overflow === "scroll"

  // DFS: check children in reverse order (last child = top z-order, like DOM)
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    // If parent clips, skip children whose screenRect doesn't overlap parent
    if (clips) {
      const childRect = child.screenRect
      if (childRect && !pointInRect(x, y, rect)) {
        continue
      }
    }
    const hit = hitTest(child, x, y)
    if (hit) return hit
  }

  // No child matched — this node is the target (if it has a screenRect)
  return node
}

// ============================================================================
// Event Dispatch
// ============================================================================

/** Map event type to the handler prop name */
const EVENT_HANDLER_MAP: Record<string, keyof MouseEventProps> = {
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
export function dispatchMouseEvent(event: InkxMouseEvent): void {
  const handlerProp = EVENT_HANDLER_MAP[event.type]
  if (!handlerProp) return

  // mouseenter/mouseleave don't bubble (DOM spec)
  const noBubble = event.type === "mouseenter" || event.type === "mouseleave"

  if (noBubble) {
    // Only fire on the target itself
    const handler = (event.target.props as Record<string, unknown>)[handlerProp] as
      | ((e: InkxMouseEvent) => void)
      | undefined
    if (handler) {
      const mutableEvent = event as { currentTarget: InkxNode }
      mutableEvent.currentTarget = event.target
      handler(event)
    }
    return
  }

  // Bubble phase: fire from target up to root
  const path = getAncestorPath(event.target)
  for (const node of path) {
    if (event.propagationStopped) break

    const handler = (node.props as Record<string, unknown>)[handlerProp] as ((e: InkxMouseEvent) => void) | undefined
    if (handler) {
      const mutableEvent = event as { currentTarget: InkxNode }
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
    sameButton && timeDelta <= DOUBLE_CLICK_TIME_MS && dx <= DOUBLE_CLICK_DISTANCE && dy <= DOUBLE_CLICK_DISTANCE

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
  prevPath: InkxNode[],
  nextPath: InkxNode[],
): { entered: InkxNode[]; left: InkxNode[] } {
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
export interface MouseEventProcessorState {
  doubleClick: DoubleClickState
  /** Previous hover path (for enter/leave tracking) */
  hoverPath: InkxNode[]
  /** Whether the left button is currently down (for click detection) */
  mouseDownTarget: InkxNode | null
  /** Optional focus manager for click-to-focus */
  focusManager?: FocusManager
}

export function createMouseEventProcessor(options?: MouseEventProcessorOptions): MouseEventProcessorState {
  return {
    doubleClick: createDoubleClickState(),
    hoverPath: [],
    mouseDownTarget: null,
    focusManager: options?.focusManager,
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
export function processMouseEvent(state: MouseEventProcessorState, parsed: ParsedMouse, root: InkxNode): void {
  const { x, y, action } = parsed
  const target = hitTest(root, x, y)
  if (!target) return

  if (action === "down") {
    state.mouseDownTarget = target

    // Click-to-focus: find nearest focusable ancestor and focus it
    if (state.focusManager) {
      const focusable = findFocusableAncestor(target)
      if (focusable) {
        state.focusManager.focus(focusable, "mouse")
      }
    }

    const event = createMouseEvent("mousedown", x, y, target, parsed)
    dispatchMouseEvent(event)
  } else if (action === "up") {
    const event = createMouseEvent("mouseup", x, y, target, parsed)
    dispatchMouseEvent(event)

    // Click = mouseup on the same node (or ancestor) where mousedown happened
    // DOM actually fires click even if up is on a different element, but the target
    // is the nearest common ancestor. For simplicity, we fire click on the up target
    // if mousedown was on the same target or a descendant.
    if (state.mouseDownTarget) {
      const clickEvent = createMouseEvent("click", x, y, target, parsed)
      dispatchMouseEvent(clickEvent)

      // Check for double-click
      const isDouble = checkDoubleClick(state.doubleClick, x, y, parsed.button)
      if (isDouble) {
        const dblEvent = createMouseEvent("dblclick", x, y, target, parsed)
        dispatchMouseEvent(dblEvent)
      }
    }

    state.mouseDownTarget = null
  } else if (action === "move") {
    const event = createMouseEvent("mousemove", x, y, target, parsed)
    dispatchMouseEvent(event)

    // Compute enter/leave transitions
    const newPath = getAncestorPath(target)
    const { entered, left } = computeEnterLeave(state.hoverPath, newPath)

    // Fire mouseleave on nodes that were left (reverse order = deepest first)
    for (const node of left) {
      const leaveEvent = createMouseEvent("mouseleave", x, y, node, parsed)
      dispatchMouseEvent(leaveEvent)
    }

    // Fire mouseenter on newly entered nodes (forward order = shallowest first)
    for (const node of entered.reverse()) {
      const enterEvent = createMouseEvent("mouseenter", x, y, node, parsed)
      dispatchMouseEvent(enterEvent)
    }

    state.hoverPath = newPath
  } else if (action === "wheel") {
    const event = createWheelEvent(x, y, target, parsed)
    dispatchMouseEvent(event)
  }
}
