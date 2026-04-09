/**
 * Pointer State Machine — pure TEA `(action, state) → [state, effects[]]`.
 *
 * Disambiguates mouse gestures: text selection vs node drag vs area selection.
 * The machine DECIDES what a gesture means; effects are consumed by the
 * integration layer (DragFeature) which calls into selection/drag systems.
 *
 * Key design points:
 * - Pure function, no side effects
 * - Drag threshold: distance > 2 cells transitions pointing → dragging
 * - Alt+drag always overrides to text selection
 * - Shift+click extends existing selection
 * - Double-click detection via timing (300ms window)
 */

import type { AgNode } from "@silvery/ag/types"
import type { Rect } from "@silvery/ag/types"

// ============================================================================
// Types
// ============================================================================

export interface Position {
  x: number
  y: number
}

export type PointerState =
  | { type: "idle" }
  | { type: "pointing-text"; anchor: Position; scope: Rect | null; target: AgNode }
  | { type: "pointing-node"; target: AgNode; startPos: Position }
  | { type: "pointing-empty"; startPos: Position }
  | { type: "dragging-text"; anchor: Position; head: Position; scope: Rect | null }
  | { type: "dragging-node"; target: AgNode; startPos: Position; currentPos: Position }
  | { type: "dragging-area"; startPos: Position; currentPos: Position }

export type PointerAction =
  | {
      type: "pointerDown"
      x: number
      y: number
      altKey: boolean
      shiftKey: boolean
      target: AgNode | null
      targetUserSelect: "text" | "auto" | "none"
      targetDraggable: boolean
    }
  | { type: "pointerMove"; x: number; y: number }
  | { type: "pointerUp"; x: number; y: number }
  | { type: "cancel" }

export type PointerEffect =
  | { type: "startSelection"; anchor: Position; scope: Rect | null }
  | { type: "extendSelection"; head: Position }
  | { type: "finishSelection" }
  | { type: "clearSelection" }
  | { type: "startDrag"; target: AgNode }
  | { type: "updateDrag"; pos: Position }
  | { type: "finishDrag"; target: AgNode; pos: Position }
  | { type: "cancelDrag" }
  | { type: "click"; target: AgNode; x: number; y: number }
  | { type: "doubleClick"; target: AgNode; x: number; y: number }

// ============================================================================
// Constants
// ============================================================================

/** Distance in cells before pointing transitions to dragging */
export const DRAG_THRESHOLD = 2

/** Time window for double-click detection (ms) */
const DOUBLE_CLICK_TIME_MS = 300

/** Distance threshold for double-click detection (cells) */
const DOUBLE_CLICK_DISTANCE = 2

// ============================================================================
// Double-Click Tracking
// ============================================================================

export interface PointerDoubleClickState {
  lastDownTime: number
  lastDownX: number
  lastDownY: number
}

export function createPointerDoubleClickState(): PointerDoubleClickState {
  return {
    lastDownTime: 0,
    lastDownX: -999,
    lastDownY: -999,
  }
}

/**
 * Check if a pointerDown qualifies as a double-click.
 * Returns true if this down event is the second in a double-click pair.
 * Updates the state for the next check.
 */
export function checkPointerDoubleClick(
  state: PointerDoubleClickState,
  x: number,
  y: number,
  now: number = Date.now(),
): boolean {
  const timeDelta = now - state.lastDownTime
  const dx = Math.abs(x - state.lastDownX)
  const dy = Math.abs(y - state.lastDownY)

  const isDouble = timeDelta <= DOUBLE_CLICK_TIME_MS && dx <= DOUBLE_CLICK_DISTANCE && dy <= DOUBLE_CLICK_DISTANCE

  // Update state
  state.lastDownTime = now
  state.lastDownX = x
  state.lastDownY = y

  // If double-click, reset so triple-click doesn't register
  if (isDouble) {
    state.lastDownTime = 0
  }

  return isDouble
}

// ============================================================================
// State Factory
// ============================================================================

export function createPointerState(): PointerState {
  return { type: "idle" }
}

// ============================================================================
// Helpers
// ============================================================================

function distance(a: Position, b: Position): number {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  return Math.max(dx, dy) // Chebyshev distance (cell-based)
}

// ============================================================================
// Update
// ============================================================================

/**
 * Pure TEA state machine for pointer gesture disambiguation.
 *
 * Processes pointer actions and returns [newState, effects[]].
 * Effects are consumed by the integration hook.
 */
export function pointerStateUpdate(action: PointerAction, state: PointerState): [PointerState, PointerEffect[]] {
  switch (action.type) {
    case "pointerDown":
      return handlePointerDown(action, state)
    case "pointerMove":
      return handlePointerMove(action, state)
    case "pointerUp":
      return handlePointerUp(action, state)
    case "cancel":
      return handleCancel(state)
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

function handlePointerDown(
  action: Extract<PointerAction, { type: "pointerDown" }>,
  state: PointerState,
): [PointerState, PointerEffect[]] {
  const pos: Position = { x: action.x, y: action.y }

  // Shift+click with existing selection: extend text selection
  if (action.shiftKey && (state.type === "dragging-text" || state.type === "idle")) {
    // If we had a previous text selection context, this would extend it.
    // For now, go to pointing-text which will produce extendSelection on threshold.
    if (action.target) {
      const scope = action.target.scrollRect ?? null
      return [{ type: "pointing-text", anchor: pos, scope, target: action.target }, []]
    }
  }

  // 1. altKey? -> always text selection (override)
  if (action.altKey && action.target) {
    const scope = action.target.scrollRect ?? null
    return [{ type: "pointing-text", anchor: pos, scope, target: action.target }, []]
  }

  // 2. No target -> pointing-empty
  if (!action.target) {
    return [{ type: "pointing-empty", startPos: pos }, []]
  }

  // 3. targetDraggable? -> pointing-node (future drag)
  if (action.targetDraggable) {
    return [{ type: "pointing-node", target: action.target, startPos: pos }, []]
  }

  // 4. targetUserSelect === "text" | "auto"? -> pointing-text
  if (action.targetUserSelect === "text" || action.targetUserSelect === "auto") {
    const scope = action.target.scrollRect ?? null
    return [{ type: "pointing-text", anchor: pos, scope, target: action.target }, []]
  }

  // 5. targetUserSelect === "none"? -> pointing-node (click only, no drag)
  if (action.targetUserSelect === "none") {
    return [{ type: "pointing-node", target: action.target, startPos: pos }, []]
  }

  // Fallback (shouldn't happen with exhaustive checks)
  return [{ type: "pointing-node", target: action.target, startPos: pos }, []]
}

function handlePointerMove(
  action: Extract<PointerAction, { type: "pointerMove" }>,
  state: PointerState,
): [PointerState, PointerEffect[]] {
  const pos: Position = { x: action.x, y: action.y }

  switch (state.type) {
    case "idle":
      return [state, []]

    case "pointing-text": {
      const dist = distance(state.anchor, pos)
      if (dist > DRAG_THRESHOLD) {
        // Transition to dragging-text
        return [
          { type: "dragging-text", anchor: state.anchor, head: pos, scope: state.scope },
          [
            { type: "startSelection", anchor: state.anchor, scope: state.scope },
            { type: "extendSelection", head: pos },
          ],
        ]
      }
      return [state, []]
    }

    case "pointing-node": {
      const dist = distance(state.startPos, pos)
      if (dist > DRAG_THRESHOLD) {
        // Transition to dragging-node
        return [
          { type: "dragging-node", target: state.target, startPos: state.startPos, currentPos: pos },
          [{ type: "startDrag", target: state.target }],
        ]
      }
      return [state, []]
    }

    case "pointing-empty": {
      const dist = distance(state.startPos, pos)
      if (dist > DRAG_THRESHOLD) {
        // Transition to dragging-area
        return [{ type: "dragging-area", startPos: state.startPos, currentPos: pos }, [{ type: "clearSelection" }]]
      }
      return [state, []]
    }

    case "dragging-text": {
      return [
        { type: "dragging-text", anchor: state.anchor, head: pos, scope: state.scope },
        [{ type: "extendSelection", head: pos }],
      ]
    }

    case "dragging-node": {
      return [
        { type: "dragging-node", target: state.target, startPos: state.startPos, currentPos: pos },
        [{ type: "updateDrag", pos }],
      ]
    }

    case "dragging-area": {
      return [{ type: "dragging-area", startPos: state.startPos, currentPos: pos }, []]
    }
  }
}

function handlePointerUp(
  action: Extract<PointerAction, { type: "pointerUp" }>,
  state: PointerState,
): [PointerState, PointerEffect[]] {
  switch (state.type) {
    case "idle":
      return [state, []]

    case "pointing-text": {
      // No drag threshold crossed — this is a click on a text target
      const effects: PointerEffect[] = [{ type: "click", target: state.target, x: action.x, y: action.y }]
      return [{ type: "idle" }, effects]
    }

    case "pointing-node": {
      // No drag threshold crossed — this is a click
      const effects: PointerEffect[] = [{ type: "click", target: state.target, x: action.x, y: action.y }]
      return [{ type: "idle" }, effects]
    }

    case "pointing-empty": {
      // Click on empty space — clear selection
      return [{ type: "idle" }, [{ type: "clearSelection" }]]
    }

    case "dragging-text": {
      return [{ type: "idle" }, [{ type: "finishSelection" }]]
    }

    case "dragging-node": {
      // End the node drag — emit finishDrag so integration layer can dispatch onDrop
      return [{ type: "idle" }, [{ type: "finishDrag", target: state.target, pos: { x: action.x, y: action.y } }]]
    }

    case "dragging-area": {
      return [{ type: "idle" }, []]
    }
  }
}

function handleCancel(state: PointerState): [PointerState, PointerEffect[]] {
  switch (state.type) {
    case "idle":
      return [state, []]

    case "pointing-text":
    case "pointing-node":
    case "pointing-empty":
      return [{ type: "idle" }, []]

    case "dragging-text":
      return [{ type: "idle" }, [{ type: "clearSelection" }]]

    case "dragging-node":
      return [{ type: "idle" }, [{ type: "cancelDrag" }]]

    case "dragging-area":
      return [{ type: "idle" }, [{ type: "clearSelection" }]]
  }
}
