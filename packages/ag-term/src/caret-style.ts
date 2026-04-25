/**
 * Caret style — terminal-target mapping from focus + editable state to a
 * `CursorShape` (DECSCUSR).
 *
 * Phase of `km-silvery.cursor-invariants` (invariant 6): the
 * framework-agnostic core (`@silvery/ag`) must not branch on terminal-only
 * concepts like block/underline/bar. The terminal layer owns the mapping
 * from "this caret belongs to a focused editable" → DECSCUSR shape.
 *
 * **Default mapping**:
 *   - focused editable      → `bar`  (matches DECSCUSR bar/I-beam)
 *   - non-focused / unknown → `block` (matches the historical default)
 *
 * Consumers override by passing an explicit `shape` field on the legacy
 * `BoxProps.cursorOffset.shape` slot (deprecated — see invariant 6) or, for
 * direct stores, in `CursorState.shape`.
 *
 * Cross-target renderers (canvas / DOM) must not depend on this — they read
 * focus state from the active cursor node directly and decide their own
 * caret rendering. This module is `@silvery/ag-term` only.
 */

import type { CursorShape } from "./output"
import type { AgNode, BoxProps } from "@silvery/ag/types"

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolve the terminal caret shape for the active cursor node.
 *
 * @param activeNode - The AgNode whose `cursorOffset` produced the active
 *   `CursorRect`. Pass null when there is no active layout-output cursor
 *   (e.g., the legacy `cursorStore` path is in use).
 * @param explicitShape - Shape explicitly set by the caller (the deprecated
 *   `cursorOffset.shape` field or the legacy `CursorState.shape`). When
 *   present, takes precedence over the focus-derived default.
 * @returns A `CursorShape` value the scheduler/output layer can pass to
 *   `setCursorStyle(shape)` (DECSCUSR), or `null` to defer to the terminal
 *   default via `resetCursorStyle()`.
 */
export function resolveCaretStyle(
  activeNode: AgNode | null,
  explicitShape?: CursorShape | undefined,
): CursorShape | null {
  // Explicit shape (deprecated path) wins for one cycle of back-compat.
  if (explicitShape) return explicitShape

  if (!activeNode) {
    // Legacy cursorStore path or no caret at all — defer to terminal default.
    return null
  }

  const props = activeNode.props as BoxProps | undefined
  // Box is editable when it actually declares a cursorOffset. (We don't have
  // a separate "editable" prop; declaring cursor is the proxy.) When the
  // owning Box also has focus, present a bar/I-beam — the conventional
  // editing affordance across modern terminals.
  if (props?.cursorOffset && activeNode.interactiveState?.focused) {
    return "bar"
  }

  // Non-focused declarer: defer to terminal default. The legacy
  // historical behaviour of the silvery scheduler was to NOT emit
  // `setCursorStyle` when shape was undefined — equivalent to the terminal
  // default — so returning null here preserves that behaviour.
  return null
}

/**
 * Walk a tree and return the AgNode whose `cursorOffset` produced the active
 * caret rect (matching the precedence rules of `findActiveCursorRect`).
 *
 * Used by the scheduler to feed `resolveCaretStyle`. Re-walks the tree to
 * keep `findActiveCursorRect` returning a value-only (data) result rather
 * than coupling it to the AgNode reference.
 *
 * Returns null when no caret is active.
 */
export function findActiveCursorNode(root: AgNode): AgNode | null {
  let focusedNode: AgNode | null = null
  let fallbackNode: AgNode | null = null

  function walk(node: AgNode): void {
    for (const child of node.children) walk(child)
    const props = node.props as BoxProps | undefined
    if (!props?.cursorOffset) return
    const offset = props.cursorOffset
    if (offset.visible === false) return
    fallbackNode = node
    if (node.interactiveState?.focused) {
      focusedNode = node
    }
  }

  walk(root)
  return focusedNode ?? fallbackNode
}
