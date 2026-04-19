/**
 * Drag Event Types — types and utilities for the drag-and-drop system.
 *
 * Drag events are separate from mouse events — they have different semantics.
 * Mouse events fire on the node under the cursor; drag events track the
 * dragged source node and the drop target.
 *
 * The pointer state machine (pointer-state.ts) decides when a drag starts;
 * the integration layer (DragFeature) uses these types to dispatch
 * drag events to the appropriate nodes.
 *
 * Prop types (DragEventProps, DragEventPayload) live in @silvery/ag/drag-event-types
 * since BoxProps needs them. This module provides runtime state and utilities.
 */

import type { AgNode } from "@silvery/ag/types"
import type { DragEventProps } from "@silvery/ag/drag-event-types"
import type { Position } from "@silvery/headless/pointer"

// Re-export prop types for convenience
export type { DragEventProps, DragEventPayload } from "@silvery/ag/drag-event-types"

// ============================================================================
// Drag State
// ============================================================================

/**
 * Active drag session state.
 * Created when pointer state machine emits startDrag, updated on updateDrag,
 * cleared on finishDrag/cancelDrag.
 */
export interface DragState {
  /** Whether a drag is currently active */
  active: boolean
  /** The node being dragged (has draggable=true) */
  source: AgNode
  /** Terminal position where the drag started */
  startPos: Position
  /** Current drag position (updated on every pointer move) */
  currentPos: Position
  /** Node currently under the cursor that accepts drops (has onDrop handler), or null */
  dropTarget: AgNode | null
}

// ============================================================================
// Drag Event
// ============================================================================

/**
 * Runtime drag event — structurally identical to DragEventPayload.
 * Used by the integration layer for dispatching.
 */
export interface DragEvent {
  /** The node being dragged */
  source: AgNode
  /** Current terminal position of the pointer */
  position: Position
  /** The node under the cursor (the drop target receiving this event) */
  dropTarget: AgNode | null
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a DragEvent payload.
 */
export function createDragEvent(
  source: AgNode,
  position: Position,
  dropTarget: AgNode | null,
): DragEvent {
  return { source, position, dropTarget }
}

/**
 * Create initial DragState when a drag starts.
 */
export function createDragState(source: AgNode, startPos: Position): DragState {
  return {
    active: true,
    source,
    startPos,
    currentPos: startPos,
    dropTarget: null,
  }
}

/**
 * Check if a node accepts drops (has any drag event handler).
 */
export function isDropTarget(node: AgNode | null): boolean {
  if (!node) return false
  const props = node.props as DragEventProps
  return !!(props.onDragEnter || props.onDragLeave || props.onDragOver || props.onDrop)
}

/**
 * Find the nearest ancestor (including self) that is a drop target.
 * Returns null if no ancestor accepts drops.
 */
export function findDropTarget(node: AgNode | null): AgNode | null {
  let current = node
  while (current) {
    if (isDropTarget(current)) return current
    current = current.parent
  }
  return null
}
