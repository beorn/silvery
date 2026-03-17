/**
 * useSelection — React hook for buffer-level text selection.
 *
 * Manages selection state via the TEA state machine from @silvery/term.
 * Provides mouse handlers for create-app.tsx to wire into mouse interception.
 */

import React, { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import {
  type SelectionState,
  type SelectionRange,
  createSelectionState,
  selectionUpdate,
  extractText,
} from "@silvery/term/selection"
import type { TerminalBuffer } from "@silvery/term/buffer"
import { copyToClipboard } from "@silvery/term/clipboard"

// ============================================================================
// Types
// ============================================================================

export interface UseSelectionResult {
  /** Current selection range, or null if nothing is selected */
  selection: SelectionRange | null
  /** True while mouse button is held and selection is in progress */
  isSelecting: boolean
  /** Called on mouse down to start selection */
  handleMouseDown(col: number, row: number): void
  /** Called on mouse move to extend selection */
  handleMouseMove(col: number, row: number): void
  /** Called on mouse up to finish selection and copy text */
  handleMouseUp(col: number, row: number, buffer: TerminalBuffer, stdout: NodeJS.WriteStream): void
  /** Clear the current selection */
  clearSelection(): void
}

// ============================================================================
// Context
// ============================================================================

const SelectionCtx = createContext<UseSelectionResult | null>(null)

/**
 * Provider that gives its subtree access to selection state.
 * Wrap your silvery app root in this.
 */
export function SelectionProvider({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<SelectionState>(createSelectionState)

  const handleMouseDown = useCallback((col: number, row: number) => {
    setState((prev) => selectionUpdate({ type: "start", col, row }, prev)[0])
  }, [])

  const handleMouseMove = useCallback((col: number, row: number) => {
    setState((prev) => selectionUpdate({ type: "extend", col, row }, prev)[0])
  }, [])

  const handleMouseUp = useCallback((col: number, row: number, buffer: TerminalBuffer, stdout: NodeJS.WriteStream) => {
    setState((prev) => {
      const [next] = selectionUpdate({ type: "finish" }, prev)

      if (next.range) {
        const text = extractText(buffer, next.range)
        if (text.length > 0) {
          copyToClipboard(stdout, text)
        }
      }

      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setState((prev) => selectionUpdate({ type: "clear" }, prev)[0])
  }, [])

  const value: UseSelectionResult = {
    selection: state.range,
    isSelecting: state.selecting,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    clearSelection,
  }

  return React.createElement(SelectionCtx.Provider, { value }, children)
}

/**
 * Access selection state from context.
 * Must be used within a SelectionProvider.
 */
export function useSelectionContext(): UseSelectionResult {
  const ctx = useContext(SelectionCtx)
  if (!ctx) {
    throw new Error("useSelectionContext must be used within a SelectionProvider")
  }
  return ctx
}

/**
 * Hook for buffer-level text selection.
 *
 * Returns selection state and mouse handlers. On mouseUp, extracts text
 * from the terminal buffer and copies to clipboard via OSC 52.
 *
 * Must be used within a SelectionProvider.
 */
export const useSelection = useSelectionContext
