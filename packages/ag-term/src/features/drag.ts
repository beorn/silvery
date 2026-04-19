/**
 * DragFeature — service wrapping the pointer machine for drag gestures.
 *
 * Connects the pointer state machine's drag effects to ag-term's tree-based
 * hit testing for drop target resolution, the DragEvent dispatch system,
 * and the input router's invalidate callback for render triggering.
 *
 * Mouse event handling:
 * - mousedown on a draggable=true node → start tracking
 * - mousemove past threshold (3px) → activate drag, find drop targets
 * - mouseup → dispatch onDrop to drop target, reset state
 * - Escape → cancel drag
 *
 * The feature is created by withDomEvents and registered in the
 * CapabilityRegistry under DRAG_CAPABILITY.
 */

import type { AgNode } from "@silvery/ag/types"
import type { Position } from "@silvery/headless/pointer"
import {
  createDragState,
  createDragEvent,
  findDropTarget,
  type DragState,
  type DragEventProps,
} from "../drag-events"

// ============================================================================
// Types
// ============================================================================

/** Observable drag state + mouse handlers. */
export interface DragFeature {
  /** Current drag state (getter). Null when no drag is active. */
  readonly state: DragState | null

  /** Whether the feature is tracking a potential drag (pointing or dragging). */
  readonly tracking: boolean

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void

  /**
   * Handle mouse down on a node.
   * If the node has draggable=true, starts drag tracking (pointing phase).
   * Returns true if the node is draggable and tracking has started.
   */
  handleMouseDown(col: number, row: number, node: AgNode): boolean

  /** Handle mouse move — transition from pointing to dragging, update drop target. */
  handleMouseMove(
    col: number,
    row: number,
    hitTestFn: (x: number, y: number) => AgNode | null,
  ): void

  /** Handle mouse up — emit drop event, reset state. */
  handleMouseUp(col: number, row: number, hitTestFn: (x: number, y: number) => AgNode | null): void

  /** Cancel the current drag (e.g., on Escape). */
  cancel(): void

  /** Clean up resources. */
  dispose(): void
}

/** Options for creating a DragFeature. */
export interface DragFeatureOptions {
  /** Callback to trigger a render pass after state changes. */
  invalidate: () => void
}

// ============================================================================
// Constants
// ============================================================================

/** Distance in cells before pointing transitions to dragging (Chebyshev). */
const DRAG_THRESHOLD = 3

// ============================================================================
// Implementation
// ============================================================================

/**
 * Tracking state before drag threshold is crossed.
 * This is internal — the public `state` is null until drag activates.
 */
interface PointingState {
  node: AgNode
  startPos: Position
}

/**
 * Create a DragFeature that manages drag-and-drop gestures.
 *
 * The feature manages the drag lifecycle:
 * 1. Pointing phase (mousedown on draggable, before threshold)
 * 2. Dragging phase (threshold crossed, drop targets tracked)
 * 3. Drop or cancel (mouseup dispatches onDrop, Escape cancels)
 */
export function createDragFeature(options: DragFeatureOptions): DragFeature {
  const { invalidate } = options

  let pointing: PointingState | null = null
  let dragState: DragState | null = null
  const listeners = new Set<() => void>()

  function notifyListeners(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  function distance(a: Position, b: Position): number {
    const dx = Math.abs(a.x - b.x)
    const dy = Math.abs(a.y - b.y)
    return Math.max(dx, dy) // Chebyshev distance (cell-based)
  }

  function dispatchDragEnter(target: AgNode, source: AgNode, pos: Position): void {
    const props = target.props as DragEventProps
    if (props.onDragEnter) {
      props.onDragEnter(createDragEvent(source, pos, target))
    }
  }

  function dispatchDragLeave(target: AgNode, source: AgNode, pos: Position): void {
    const props = target.props as DragEventProps
    if (props.onDragLeave) {
      props.onDragLeave(createDragEvent(source, pos, target))
    }
  }

  function dispatchDragOver(target: AgNode, source: AgNode, pos: Position): void {
    const props = target.props as DragEventProps
    if (props.onDragOver) {
      props.onDragOver(createDragEvent(source, pos, target))
    }
  }

  function dispatchDrop(target: AgNode, source: AgNode, pos: Position): void {
    const props = target.props as DragEventProps
    if (props.onDrop) {
      props.onDrop(createDragEvent(source, pos, target))
    }
  }

  function reset(): void {
    pointing = null
    dragState = null
  }

  return {
    get state(): DragState | null {
      return dragState
    },

    get tracking(): boolean {
      return pointing !== null || dragState !== null
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    handleMouseDown(col: number, row: number, node: AgNode): boolean {
      const props = node.props as { draggable?: boolean }
      if (!props.draggable) return false

      // Start pointing phase — drag hasn't started yet
      pointing = {
        node,
        startPos: { x: col, y: row },
      }
      return true
    },

    handleMouseMove(
      col: number,
      row: number,
      hitTestFn: (x: number, y: number) => AgNode | null,
    ): void {
      const pos: Position = { x: col, y: row }

      // --- Pointing phase: check threshold ---
      if (pointing && !dragState) {
        const dist = distance(pointing.startPos, pos)
        if (dist <= DRAG_THRESHOLD) return // Not past threshold yet

        // Threshold crossed — activate drag
        dragState = createDragState(pointing.node, pointing.startPos)
        dragState.currentPos = pos
        pointing = null

        // Find initial drop target
        const hitNode = hitTestFn(col, row)
        const dropTarget = findDropTarget(hitNode)
        if (dropTarget && dropTarget !== dragState.source) {
          dragState.dropTarget = dropTarget
          dispatchDragEnter(dropTarget, dragState.source, pos)
        }

        notifyListeners()
        invalidate()
        return
      }

      // --- Dragging phase: update position and drop target ---
      if (!dragState) return

      dragState.currentPos = pos

      const hitNode = hitTestFn(col, row)
      const newDropTarget = findDropTarget(hitNode)
      // Don't allow dropping on self
      const effectiveTarget =
        newDropTarget && newDropTarget !== dragState.source ? newDropTarget : null
      const prevTarget = dragState.dropTarget

      // Dispatch enter/leave events on target change
      if (prevTarget !== effectiveTarget) {
        if (prevTarget) {
          dispatchDragLeave(prevTarget, dragState.source, pos)
        }
        if (effectiveTarget) {
          dispatchDragEnter(effectiveTarget, dragState.source, pos)
        }
        dragState.dropTarget = effectiveTarget
      } else if (effectiveTarget) {
        dispatchDragOver(effectiveTarget, dragState.source, pos)
      }

      notifyListeners()
      invalidate()
    },

    handleMouseUp(
      col: number,
      row: number,
      hitTestFn: (x: number, y: number) => AgNode | null,
    ): void {
      // If still in pointing phase (threshold not crossed), just reset
      if (pointing && !dragState) {
        pointing = null
        return
      }

      if (!dragState) return

      const pos: Position = { x: col, y: row }

      // Resolve final drop target
      const hitNode = hitTestFn(col, row)
      const dropTarget = findDropTarget(hitNode)
      const effectiveTarget = dropTarget && dropTarget !== dragState.source ? dropTarget : null

      // Dispatch drop event
      if (effectiveTarget) {
        dispatchDrop(effectiveTarget, dragState.source, pos)
      }

      reset()
      notifyListeners()
      invalidate()
    },

    cancel(): void {
      if (!pointing && !dragState) return
      reset()
      notifyListeners()
      invalidate()
    },

    dispose(): void {
      reset()
      listeners.clear()
    },
  }
}
