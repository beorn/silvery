/**
 * Interactive Signal Utilities
 *
 * Writer functions for per-node interactive state. State machines call these
 * during event processing to update hovered/armed/selected/focused/dropTarget
 * on AgNode instances.
 *
 * Each setter returns true if the value actually changed — callers can use
 * this for efficient dirty tracking (skip re-render if nothing changed).
 *
 * The InteractiveState object is lazily created on first write to avoid
 * allocating on nodes that never receive interactive events.
 */

import type { AgNode, InteractiveState } from "./types"

// ============================================================================
// Lazy Initialization
// ============================================================================

/**
 * Ensure a node has an InteractiveState object, creating one if needed.
 * Returns the (possibly newly created) state.
 */
export function ensureInteractiveState(node: AgNode): InteractiveState {
  if (!node.interactiveState) {
    node.interactiveState = {
      hovered: false,
      armed: false,
      selected: false,
      focused: false,
      dropTarget: false,
    }
  }
  return node.interactiveState
}

// ============================================================================
// Individual Setters (return true if value changed)
// ============================================================================

/**
 * Set the hovered state. Returns true if the value changed.
 */
export function setHovered(node: AgNode, value: boolean): boolean {
  const state = ensureInteractiveState(node)
  if (state.hovered === value) return false
  state.hovered = value
  return true
}

/**
 * Set the armed state (pointer-down, awaiting click). Returns true if the value changed.
 */
export function setArmed(node: AgNode, value: boolean): boolean {
  const state = ensureInteractiveState(node)
  if (state.armed === value) return false
  state.armed = value
  return true
}

/**
 * Set the selected state. Returns true if the value changed.
 */
export function setSelected(node: AgNode, value: boolean): boolean {
  const state = ensureInteractiveState(node)
  if (state.selected === value) return false
  state.selected = value
  return true
}

/**
 * Set the focused state. Returns true if the value changed.
 */
export function setFocused(node: AgNode, value: boolean): boolean {
  const state = ensureInteractiveState(node)
  if (state.focused === value) return false
  state.focused = value
  return true
}

/**
 * Set the dropTarget state. Returns true if the value changed.
 */
export function setDropTarget(node: AgNode, value: boolean): boolean {
  const state = ensureInteractiveState(node)
  if (state.dropTarget === value) return false
  state.dropTarget = value
  return true
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Clear all interactive state on a node.
 * Useful on pointer-up, focus-change, or when a node is removed from the tree.
 *
 * Sets the interactiveState reference to null to free the object.
 */
export function clearInteractiveState(node: AgNode): void {
  node.interactiveState = null
}
