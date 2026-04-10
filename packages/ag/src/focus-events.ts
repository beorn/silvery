/**
 * DOM-level Focus and Keyboard Events for silvery
 *
 * Provides React DOM-compatible focus/keyboard event infrastructure:
 * - SilveryKeyEvent / SilveryFocusEvent synthetic event objects
 * - Event dispatch with capture/target/bubble phases (key events)
 * - Event dispatch with target + bubble (focus events)
 *
 * Follows the same patterns as mouse-events.ts for consistency.
 */

import type { Key } from "./keys"
import { getAncestorPath } from "./tree-utils.js"
import type { AgNode } from "./types"

// ============================================================================
// Event Types
// ============================================================================

/**
 * Synthetic keyboard event, mirroring React.KeyboardEvent / DOM KeyboardEvent.
 */
export interface SilveryKeyEvent {
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
  /** Kitty event type */
  eventType?: "press" | "repeat" | "release"
  /** Deepest focusable node that received this event */
  target: AgNode
  /** Node whose handler is currently firing (changes during capture/bubble) */
  currentTarget: AgNode
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
export interface SilveryFocusEvent {
  /** The node gaining or losing focus */
  target: AgNode
  /** The other node involved (losing focus on 'focus', gaining on 'blur') */
  relatedTarget: AgNode | null
  /** Event type */
  type: "focus" | "blur"
  /** Node whose handler is currently firing (changes during bubble) */
  currentTarget: AgNode
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
  onFocus?: (event: SilveryFocusEvent) => void
  /** Called when this node loses focus */
  onBlur?: (event: SilveryFocusEvent) => void
  /** Called on key down (bubble phase) */
  onKeyDown?: (event: SilveryKeyEvent, dispatch?: (msg: unknown) => void) => void
  /** Called on key up (bubble phase) */
  onKeyUp?: (event: SilveryKeyEvent, dispatch?: (msg: unknown) => void) => void
  /** Called on key down (capture phase — fires before target) */
  onKeyDownCapture?: (event: SilveryKeyEvent) => void
}

// ============================================================================
// Event Factories
// ============================================================================

/**
 * Create a synthetic keyboard event.
 */
export function createKeyEvent(input: string, key: Key, target: AgNode): SilveryKeyEvent {
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
  target: AgNode,
  relatedTarget: AgNode | null,
): SilveryFocusEvent {
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

// ============================================================================
// Event Dispatch
// ============================================================================

/**
 * Dispatch a keyboard event through the render tree with DOM-style
 * capture/target/bubble phases.
 *
 * For press/repeat events:
 *   1. Capture phase: root → target (onKeyDownCapture props)
 *   2. Target phase: target's onKeyDown
 *   3. Bubble phase: target parent → root (onKeyDown props)
 *
 * For release events:
 *   1. Target phase: target's onKeyUp
 *   2. Bubble phase: target parent → root (onKeyUp props)
 *   (No capture phase for keyUp — deliberate simplification; React DOM has onKeyUpCapture)
 *
 * stopPropagation() halts traversal at any phase.
 */
export function dispatchKeyEvent(event: SilveryKeyEvent, dispatch?: (msg: unknown) => void): void {
  const path = getAncestorPath(event.target)
  const mutableEvent = event as { currentTarget: AgNode }

  // Release events → onKeyUp (no capture phase — deliberate simplification; React DOM has onKeyUpCapture)
  const isRelease = event.eventType === "release"
  const handlerProp = isRelease ? "onKeyUp" : "onKeyDown"

  // Capture phase: root → target (onKeyDownCapture — press/repeat only)
  if (!isRelease) {
    for (let i = path.length - 1; i > 0; i--) {
      if (event.propagationStopped) return
      const node = path[i]!
      const handler = (node.props as Record<string, unknown>).onKeyDownCapture as
        | ((e: SilveryKeyEvent) => void)
        | undefined
      if (handler) {
        mutableEvent.currentTarget = node
        handler(event)
      }
    }
  }

  // Target phase
  if (!event.propagationStopped) {
    const target = path[0]!
    mutableEvent.currentTarget = target
    const handler = (target.props as Record<string, unknown>)[handlerProp] as
      | ((e: SilveryKeyEvent, d?: (msg: unknown) => void) => void)
      | undefined
    if (handler) {
      handler(event, dispatch)
    }
  }

  // Bubble phase: target parent → root
  for (let i = 1; i < path.length; i++) {
    if (event.propagationStopped) return
    const node = path[i]!
    const handler = (node.props as Record<string, unknown>)[handlerProp] as
      | ((e: SilveryKeyEvent, d?: (msg: unknown) => void) => void)
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
export function dispatchFocusEvent(event: SilveryFocusEvent): void {
  const handlerProp = event.type === "focus" ? "onFocus" : "onBlur"
  const path = getAncestorPath(event.target)
  const mutableEvent = event as { currentTarget: AgNode }

  for (const node of path) {
    if (event.propagationStopped) break

    const handler = (node.props as Record<string, unknown>)[handlerProp] as ((e: SilveryFocusEvent) => void) | undefined
    if (handler) {
      mutableEvent.currentTarget = node
      handler(event)
    }
  }
}
