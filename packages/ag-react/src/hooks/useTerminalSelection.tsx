/**
 * useTerminalSelection — React hook for buffer-level text selection.
 *
 * Manages selection state via the TEA state machine from @silvery/ag-term.
 * Provides mouse handlers for create-app.tsx to wire into mouse interception.
 */

import React, { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import {
  type TerminalSelectionState,
  type SelectionRange,
  createTerminalSelectionState,
  terminalSelectionUpdate,
  extractText,
} from "@silvery/ag-term/selection"
import type { TerminalBuffer } from "@silvery/ag-term/buffer"
import { copyToClipboard } from "@silvery/ag-term/clipboard"

// ============================================================================
// Types
// ============================================================================

export interface UseTerminalSelectionResult {
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

const TerminalSelectionCtx = createContext<UseTerminalSelectionResult | null>(null)

/**
 * Provider that gives its subtree access to terminal text selection state.
 * Wrap your silvery app root in this.
 */
export function TerminalSelectionProvider({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<TerminalSelectionState>(createTerminalSelectionState)

  const handleMouseDown = useCallback((col: number, row: number) => {
    setState((prev) => terminalSelectionUpdate({ type: "start", col, row }, prev)[0])
  }, [])

  const handleMouseMove = useCallback((col: number, row: number) => {
    setState((prev) => terminalSelectionUpdate({ type: "extend", col, row }, prev)[0])
  }, [])

  const handleMouseUp = useCallback((col: number, row: number, buffer: TerminalBuffer, stdout: NodeJS.WriteStream) => {
    setState((prev) => {
      const [next] = terminalSelectionUpdate({ type: "finish" }, prev)

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
    setState((prev) => terminalSelectionUpdate({ type: "clear" }, prev)[0])
  }, [])

  const value: UseTerminalSelectionResult = {
    selection: state.range,
    isSelecting: state.selecting,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    clearSelection,
  }

  return React.createElement(TerminalSelectionCtx.Provider, { value }, children)
}

/**
 * Access terminal text selection state from context.
 * Must be used within a TerminalSelectionProvider.
 */
export function useTerminalSelectionContext(): UseTerminalSelectionResult {
  const ctx = useContext(TerminalSelectionCtx)
  if (!ctx) {
    throw new Error("useTerminalSelectionContext must be used within a TerminalSelectionProvider")
  }
  return ctx
}

/**
 * Hook for buffer-level text selection.
 *
 * Returns selection state and mouse handlers. On mouseUp, extracts text
 * from the terminal buffer and copies to clipboard via OSC 52.
 *
 * Must be used within a TerminalSelectionProvider.
 */
export const useTerminalSelection = useTerminalSelectionContext
