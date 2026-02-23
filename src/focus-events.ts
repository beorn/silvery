/**
 * DOM-level Focus and Keyboard Events for inkx
 *
 * Provides React DOM-compatible focus/keyboard event infrastructure:
 * - InkxKeyEvent / InkxFocusEvent synthetic event objects
 * - Event dispatch with capture/target/bubble phases (key events)
 * - Event dispatch with target + bubble (focus events)
 *
 * Follows the same patterns as mouse-events.ts for consistency.
 */

import type { Key } from "./keys.js"
import type { InkxNode } from "./types.js"

// ============================================================================
// Event Types
// ============================================================================

/**
 * Synthetic keyboard event, mirroring React.KeyboardEvent / DOM KeyboardEvent.
 */
export interface InkxKeyEvent {
  /** The printable character, or "" for non-printable keys */
  key: string
  /** Raw terminal input string */
  input: string
  /** Modifier keys */
  ctrl: boolean
  meta: boolean
  shift: boolean
  super: boolean
  hyper: boolean
  /** Kitty event type: 1=press, 2=repeat, 3=release */
  eventType?: 1 | 2 | 3
  /** Deepest focusable node that received this event */
  target: InkxNode
  /** Node whose handler is currently firing (changes during capture/bubble) */
  currentTarget: InkxNode
  /** Stop event from propagating further */
  stopPropagation(): void
  /** Prevent default behavior */
  preventDefault(): void
  /** Whether stopPropagation() was called */
  readonly propagationStopped: boolean
  /** Whether preventDefault() was called */
  readonly defaultPrevented: boolean
  /** Raw parsed key data */
  nativeEvent: { input: string; key: Key }
}

/**
 * Synthetic focus event, mirroring React.FocusEvent / DOM FocusEvent.
 */
export interface InkxFocusEvent {
  /** The node gaining or losing focus */
  target: InkxNode
  /** The other node involved (losing focus on 'focus', gaining on 'blur') */
  relatedTarget: InkxNode | null
  /** Event type */
  type: "focus" | "blur"
  /** Node whose handler is currently firing (changes during bubble) */
  currentTarget: InkxNode
  /** Stop event from bubbling to parent nodes */
  stopPropagation(): void
  /** Whether stopPropagation() was called */
  readonly propagationStopped: boolean
}

// ============================================================================
// Focus Event Handler Props (added to BoxProps)
// ============================================================================

export interface FocusEventProps {
  /** Whether this node can receive focus */
  focusable?: boolean
  /** Whether this node should receive focus on mount */
  autoFocus?: boolean
  /** Whether this node creates a focus scope (focus trapping boundary) */
  focusScope?: boolean
  /** ID of the node to focus when pressing Up from this node */
  nextFocusUp?: string
  /** ID of the node to focus when pressing Down from this node */
  nextFocusDown?: string
  /** ID of the node to focus when pressing Left from this node */
  nextFocusLeft?: string
  /** ID of the node to focus when pressing Right from this node */
  nextFocusRight?: string
  /** Called when this node gains focus */
  onFocus?: (event: InkxFocusEvent) => void
  /** Called when this node loses focus */
  onBlur?: (event: InkxFocusEvent) => void
  /** Called on key down (bubble phase) */
  onKeyDown?: (event: InkxKeyEvent, dispatch?: (msg: unknown) => void) => void
  /** Called on key up (bubble phase) */
  onKeyUp?: (event: InkxKeyEvent, dispatch?: (msg: unknown) => void) => void
  /** Called on key down (capture phase — fires before target) */
  onKeyDownCapture?: (event: InkxKeyEvent) => void
}

// ============================================================================
// Event Factories
// ============================================================================

/**
 * Create a synthetic keyboard event.
 */
export function createKeyEvent(input: string, key: Key, target: InkxNode): InkxKeyEvent {
  let propagationStopped = false
  let defaultPrevented = false

  return {
    key: input,
    input,
    ctrl: key.ctrl,
    meta: key.meta,
    shift: key.shift,
    super: key.super,
    hyper: key.hyper,
    eventType: key.eventType,
    target,
    currentTarget: target,
    nativeEvent: { input, key },
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
 * Create a synthetic focus event.
 */
export function createFocusEvent(
  type: "focus" | "blur",
  target: InkxNode,
  relatedTarget: InkxNode | null,
): InkxFocusEvent {
  let propagationStopped = false

  return {
    type,
    target,
    relatedTarget,
    currentTarget: target,
    get propagationStopped() {
      return propagationStopped
    },
    stopPropagation() {
      propagationStopped = true
    },
  }
}

// ============================================================================
// Tree Walking
// ============================================================================

/**
 * Collect the ancestor path from target to root (inclusive).
 */
function getAncestorPath(node: InkxNode): InkxNode[] {
  const path: InkxNode[] = []
  let current: InkxNode | null = node
  while (current) {
    path.push(current)
    current = current.parent
  }
  return path
}

// ============================================================================
// Event Dispatch
// ============================================================================

/**
 * Dispatch a keyboard event through the render tree with DOM-style
 * capture/target/bubble phases.
 *
 * 1. Capture phase: root → target (onKeyDownCapture props)
 * 2. Target phase: target's onKeyDown
 * 3. Bubble phase: target parent → root (onKeyDown props)
 *
 * stopPropagation() halts traversal at any phase.
 */
export function dispatchKeyEvent(event: InkxKeyEvent, dispatch?: (msg: unknown) => void): void {
  const path = getAncestorPath(event.target)
  const mutableEvent = event as { currentTarget: InkxNode }

  // Capture phase: root → target (reversed path, excluding target)
  for (let i = path.length - 1; i > 0; i--) {
    if (event.propagationStopped) return
    const node = path[i]!
    const handler = (node.props as Record<string, unknown>).onKeyDownCapture as ((e: InkxKeyEvent) => void) | undefined
    if (handler) {
      mutableEvent.currentTarget = node
      handler(event)
    }
  }

  // Target phase: fire onKeyDown on the target itself
  if (!event.propagationStopped) {
    const target = path[0]!
    mutableEvent.currentTarget = target
    const handler = (target.props as Record<string, unknown>).onKeyDown as
      | ((e: InkxKeyEvent, d?: (msg: unknown) => void) => void)
      | undefined
    if (handler) {
      handler(event, dispatch)
    }
  }

  // Bubble phase: target parent → root
  for (let i = 1; i < path.length; i++) {
    if (event.propagationStopped) return
    const node = path[i]!
    const handler = (node.props as Record<string, unknown>).onKeyDown as
      | ((e: InkxKeyEvent, d?: (msg: unknown) => void) => void)
      | undefined
    if (handler) {
      mutableEvent.currentTarget = node
      handler(event, dispatch)
    }
  }
}

/**
 * Dispatch a focus event through the render tree.
 *
 * Fires onFocus/onBlur on the target, then bubbles to ancestors.
 */
export function dispatchFocusEvent(event: InkxFocusEvent): void {
  const handlerProp = event.type === "focus" ? "onFocus" : "onBlur"
  const path = getAncestorPath(event.target)
  const mutableEvent = event as { currentTarget: InkxNode }

  for (const node of path) {
    if (event.propagationStopped) break

    const handler = (node.props as Record<string, unknown>)[handlerProp] as ((e: InkxFocusEvent) => void) | undefined
    if (handler) {
      mutableEvent.currentTarget = node
      handler(event)
    }
  }
}
