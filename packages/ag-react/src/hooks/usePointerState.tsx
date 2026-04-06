/**
 * usePointerState — React hook integrating the pointer state machine.
 *
 * Maintains the pointer state machine and translates its effects into
 * calls to the terminal selection system and ag node event dispatch.
 *
 * This hook is the NEW way to handle mouse gestures. useTerminalSelection
 * still works standalone for simple buffer-level selection.
 *
 * Usage:
 *   const pointer = usePointerState({ selectionCtx, root })
 *   // Wire pointer.handleMouseDown/Move/Up into mouse event interception
 */

import { useCallback, useRef, useState } from "react"
import {
  type PointerState,
  type PointerAction,
  type PointerEffect,
  type PointerDoubleClickState,
  createPointerState,
  createPointerDoubleClickState,
  checkPointerDoubleClick,
  pointerStateUpdate,
} from "@silvery/ag-term/pointer-state"
import type { AgNode } from "@silvery/ag/types"
import { hitTest } from "@silvery/ag-term/mouse-events"
import type { UseTerminalSelectionResult } from "./useTerminalSelection"
import type { TerminalBuffer } from "@silvery/ag-term/buffer"

// ============================================================================
// Types
// ============================================================================

export interface UsePointerStateOptions {
  /** Terminal selection context (from useTerminalSelection) */
  selectionCtx?: UseTerminalSelectionResult | null
  /** Render tree root for hit testing */
  root?: AgNode | null
  /** Terminal buffer for text extraction on selection finish */
  buffer?: TerminalBuffer | null
  /** stdout for clipboard copy */
  stdout?: NodeJS.WriteStream | null
}

export interface UsePointerStateResult {
  /** Current pointer state (for inspection/debugging) */
  state: PointerState
  /** Called on mousedown */
  handleMouseDown(x: number, y: number, altKey: boolean, shiftKey: boolean): void
  /** Called on mousemove */
  handleMouseMove(x: number, y: number): void
  /** Called on mouseup */
  handleMouseUp(x: number, y: number): void
  /** Called on Escape key */
  cancel(): void
}

// ============================================================================
// Resolve target props
// ============================================================================

/**
 * Walk the ancestor chain to resolve the effective userSelect value.
 * Returns "auto" by default (the CSS default).
 */
export function resolveUserSelect(node: AgNode | null): "text" | "auto" | "none" {
  let current = node
  while (current) {
    const props = current.props as Record<string, unknown>
    if (props.userSelect === "text") return "text"
    if (props.userSelect === "none") return "none"
    if (props.userSelect === "auto") return "auto"
    current = current.parent
  }
  return "auto"
}

/**
 * Walk the ancestor chain to check if any ancestor has draggable=true.
 */
export function resolveNodeDraggable(node: AgNode | null): boolean {
  let current = node
  while (current) {
    const props = current.props as Record<string, unknown>
    if (props.draggable === true) return true
    current = current.parent
  }
  return false
}

// ============================================================================
// Hook
// ============================================================================

export function usePointerState(options: UsePointerStateOptions = {}): UsePointerStateResult {
  const { selectionCtx, root, buffer, stdout } = options
  const [state, setState] = useState<PointerState>(createPointerState)
  const doubleClickRef = useRef<PointerDoubleClickState>(createPointerDoubleClickState())

  const processEffects = useCallback(
    (effects: PointerEffect[]) => {
      for (const effect of effects) {
        switch (effect.type) {
          case "startSelection":
            selectionCtx?.handleMouseDown(effect.anchor.x, effect.anchor.y)
            break
          case "extendSelection":
            selectionCtx?.handleMouseMove(effect.head.x, effect.head.y)
            break
          case "finishSelection":
            if (buffer && stdout) {
              selectionCtx?.handleMouseUp(0, 0, buffer, stdout)
            }
            break
          case "clearSelection":
            selectionCtx?.clearSelection()
            break
          case "click":
            // Click effects are dispatched by the existing mouse event system
            // (processMouseEvent). The pointer state machine identifies
            // clicks; the caller may emit them as needed.
            break
          case "doubleClick":
            // Same as click — dispatched externally
            break
          case "startDrag":
          case "updateDrag":
          case "cancelDrag":
            // Drag effects are stubs for Phase 7
            break
        }
      }
    },
    [selectionCtx, buffer, stdout],
  )

  const handleMouseDown = useCallback(
    (x: number, y: number, altKey: boolean, shiftKey: boolean) => {
      const target = root ? hitTest(root, x, y) : null
      const targetUserSelect = resolveUserSelect(target)
      const targetDraggable = resolveNodeDraggable(target)

      // Check for double-click
      const isDouble = checkPointerDoubleClick(doubleClickRef.current, x, y)

      const action: PointerAction = {
        type: "pointerDown",
        x,
        y,
        altKey,
        shiftKey,
        target,
        targetUserSelect,
        targetDraggable,
      }

      setState((prev) => {
        const [next, effects] = pointerStateUpdate(action, prev)
        processEffects(effects)

        // If double-click and we have a target, emit doubleClick effect
        // (after the state machine processes the down event)
        if (isDouble && target) {
          processEffects([{ type: "doubleClick", target, x, y }])
        }

        return next
      })
    },
    [root, processEffects],
  )

  const handleMouseMove = useCallback(
    (x: number, y: number) => {
      setState((prev) => {
        // Skip no-op moves when idle
        if (prev.type === "idle") return prev

        const action: PointerAction = { type: "pointerMove", x, y }
        const [next, effects] = pointerStateUpdate(action, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const handleMouseUp = useCallback(
    (x: number, y: number) => {
      setState((prev) => {
        if (prev.type === "idle") return prev

        const action: PointerAction = { type: "pointerUp", x, y }
        const [next, effects] = pointerStateUpdate(action, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const cancel = useCallback(() => {
    setState((prev) => {
      if (prev.type === "idle") return prev

      const [next, effects] = pointerStateUpdate({ type: "cancel" }, prev)
      processEffects(effects)
      return next
    })
  }, [processEffects])

  return {
    state,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    cancel,
  }
}
