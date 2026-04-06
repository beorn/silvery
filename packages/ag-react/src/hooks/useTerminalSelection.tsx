/**
 * useTerminalSelection — React hook for buffer-level text selection.
 *
 * Manages selection state via the TEA state machine from @silvery/ag-term.
 * Provides mouse handlers for create-app.tsx to wire into mouse interception.
 * Uses selectionHitTest (separate from pointer hitTest) for userSelect awareness.
 *
 * When copy is triggered, consults the nearest ancestor CopyProvider for
 * semantic enrichment. Plain text always goes to the system clipboard
 * immediately via OSC 52; rich data is stored in an internal clipboard
 * for paste enrichment.
 */

import React, { createContext, useCallback, useContext, useState, useRef, type ReactNode } from "react"
import {
  type TerminalSelectionState,
  type SelectionRange,
  type SelectionScope,
  createTerminalSelectionState,
  terminalSelectionUpdate,
  extractText,
} from "@silvery/ag-term/selection"
import type { TerminalBuffer } from "@silvery/ag-term/buffer"
import { copyToClipboard } from "@silvery/ag-term/clipboard"
import { selectionHitTest, findContainBoundary, resolveUserSelect } from "@silvery/ag-term/mouse-events"
import type { AgNode } from "@silvery/ag/types"
import type { CopyEvent, ClipboardData } from "@silvery/ag-term/semantic-copy"
import { useCopyProvider } from "./useCopyProvider"

// ============================================================================
// Types
// ============================================================================

export interface TerminalSelectionOptions {
  /** Copy text to clipboard on mouseup (tmux-like). Default: false. */
  copyOnSelect?: boolean
}

export interface UseTerminalSelectionResult {
  /** Current selection range, or null if nothing is selected */
  selection: SelectionRange | null
  /** True while mouse button is held and selection is in progress */
  isSelecting: boolean
  /** Who initiated the selection: "mouse" | "keyboard" | null */
  source: "mouse" | "keyboard" | null
  /** Called on mouse down to start selection. Uses selectionHitTest for userSelect awareness. */
  handleMouseDown(col: number, row: number, root: AgNode, altKey?: boolean): void
  /** Called on mouse move to extend selection */
  handleMouseMove(col: number, row: number): void
  /** Called on mouse up to finish selection */
  handleMouseUp(col: number, row: number, buffer: TerminalBuffer, stdout: NodeJS.WriteStream): void
  /** Clear the current selection */
  clearSelection(): void
  /** Explicitly copy the current selection to clipboard */
  copySelection(buffer: TerminalBuffer, stdout: NodeJS.WriteStream): void
  /** Last internally copied ClipboardData for paste enrichment */
  lastCopy: ClipboardData | null
}

// ============================================================================
// Drag Threshold
// ============================================================================

/** Minimum distance (cells) before a mousedown becomes a selection drag */
const DRAG_THRESHOLD_DISTANCE = 2
/** Minimum time (ms) before a mousedown becomes a selection drag */
const DRAG_THRESHOLD_TIME = 100

// ============================================================================
// Context
// ============================================================================

const TerminalSelectionCtx = createContext<UseTerminalSelectionResult | null>(null)

// ============================================================================
// Internal clipboard store
// ============================================================================

/**
 * Shared internal clipboard — stores the last copy's rich data so paste
 * events can detect internal copies and include structured data.
 */
let internalClipboard: ClipboardData | null = null

/**
 * Get the current internal clipboard data.
 * Used by paste event handling to detect internal copies.
 */
export function getInternalClipboard(): ClipboardData | null {
  return internalClipboard
}

// ============================================================================
// Provider
// ============================================================================

/**
 * Provider that gives its subtree access to terminal text selection state.
 * Wrap your silvery app root in this.
 */
export function TerminalSelectionProvider({
  children,
  copyOnSelect = false,
}: { children?: ReactNode } & TerminalSelectionOptions) {
  const [state, setState] = useState<TerminalSelectionState>(createTerminalSelectionState)
  const [lastCopy, setLastCopy] = useState<ClipboardData | null>(null)
  const copyProvider = useCopyProvider()

  // Use ref to avoid stale closure over copyProvider
  const copyProviderRef = useRef(copyProvider)
  copyProviderRef.current = copyProvider

  // Drag threshold tracking
  const dragStart = useRef<{ col: number; row: number; time: number } | null>(null)
  const dragStarted = useRef(false)

  const handleMouseDown = useCallback((col: number, row: number, root: AgNode, altKey = false) => {
    // Alt+drag = universal override — always start selection regardless of userSelect
    let scope: SelectionScope | null = null

    if (!altKey) {
      // Use selection hit test (respects userSelect, ignores pointerEvents)
      const hit = selectionHitTest(root, col, row)
      if (!hit) return // Nothing selectable at this position

      const resolved = resolveUserSelect(hit)
      if (resolved === "none") return // Not selectable

      // Find contain boundary
      scope = findContainBoundary(hit)
    }

    // Set drag threshold tracking
    dragStart.current = { col, row, time: Date.now() }
    dragStarted.current = false

    // Start selection immediately (drag threshold is checked on extend)
    setState((prev) => terminalSelectionUpdate({
      type: "start",
      col,
      row,
      scope,
      source: "mouse",
      granularity: "char",
    }, prev)[0])
  }, [])

  const handleMouseMove = useCallback((col: number, row: number) => {
    setState((prev) => {
      if (!prev.selecting) return prev

      // Check drag threshold — don't extend until threshold is met
      if (!dragStarted.current && dragStart.current) {
        const dx = Math.abs(col - dragStart.current.col)
        const dy = Math.abs(row - dragStart.current.row)
        const dt = Date.now() - dragStart.current.time
        if (dx < DRAG_THRESHOLD_DISTANCE && dy < DRAG_THRESHOLD_DISTANCE && dt < DRAG_THRESHOLD_TIME) {
          return prev // Threshold not met — don't extend yet
        }
        dragStarted.current = true
      }

      return terminalSelectionUpdate({ type: "extend", col, row }, prev)[0]
    })
  }, [])

  const handleMouseUp = useCallback((col: number, row: number, buffer: TerminalBuffer, stdout: NodeJS.WriteStream) => {
    setState((prev) => {
      const [next] = terminalSelectionUpdate({ type: "finish" }, prev)

      // Copy on select (when enabled)
      if (copyOnSelect && next.range && dragStarted.current) {
        const text = extractText(buffer, next.range, {
          respectSelectableFlag: true,
          rowMetadata: buffer.getRowMetadataArray(),
        })
        if (text.length > 0) {
          // Always write plain text immediately — never block on async
          copyToClipboard(stdout, text)

          // Store minimal clipboard data immediately
          const baseData: ClipboardData = { text }
          internalClipboard = baseData
          setLastCopy(baseData)

          // Consult CopyProvider for semantic enrichment (best-effort)
          const provider = copyProviderRef.current
          if (provider) {
            const copyEvent: CopyEvent = { text, range: next.range }
            try {
              const result = provider.enrichCopy(copyEvent)
              if (result && typeof (result as Promise<ClipboardData>).then === "function") {
                // Async enrichment — update internal clipboard when resolved
                ;(result as Promise<ClipboardData>).then(
                  (data) => {
                    if (data) {
                      internalClipboard = data
                      setLastCopy(data)
                    }
                  },
                  () => {
                    // Enrichment failed — plain text is already in clipboard
                  },
                )
              } else if (result) {
                // Sync enrichment — update immediately
                internalClipboard = result as ClipboardData
                setLastCopy(result as ClipboardData)
              }
            } catch {
              // Enrichment failed — plain text is already in clipboard
            }
          }
        }
      }

      // Reset drag tracking
      dragStart.current = null
      dragStarted.current = false

      return next
    })
  }, [copyOnSelect])

  const clearSelection = useCallback(() => {
    setState((prev) => terminalSelectionUpdate({ type: "clear" }, prev)[0])
    dragStart.current = null
    dragStarted.current = false
  }, [])

  const copySelection = useCallback((buffer: TerminalBuffer, stdout: NodeJS.WriteStream) => {
    const { range } = state
    if (!range) return

    const text = extractText(buffer, range, {
      respectSelectableFlag: true,
      rowMetadata: buffer.getRowMetadataArray(),
    })
    if (text.length > 0) {
      copyToClipboard(stdout, text)
    }
  }, [state])

  const value: UseTerminalSelectionResult = {
    selection: state.range,
    isSelecting: state.selecting,
    source: state.source,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    clearSelection,
    copySelection,
    lastCopy,
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
 * Returns selection state and mouse handlers. Wire handleMouseDown/Move/Up
 * into the mouse event processor. handleMouseDown uses selectionHitTest
 * (respects userSelect, ignores pointerEvents) for proper selection targeting.
 * On mouseUp, extracts text from the terminal buffer and copies to clipboard
 * via OSC 52. If a CopyProvider is in the ancestor tree, enriches with
 * structured data.
 *
 * Must be used within a TerminalSelectionProvider.
 */
export const useTerminalSelection = useTerminalSelectionContext
