/**
 * SelectionFeature — service wrapping the headless selection machine.
 *
 * Connects the pure `terminalSelectionUpdate` state machine to ag-term's
 * buffer for text extraction, clipboard for copy-on-select, and the
 * input router's invalidate callback for render triggering.
 *
 * Mouse event handling:
 * - mousedown → start selection (character granularity)
 * - mousemove while selecting → extend selection range
 * - mouseup → finish selection, copy to clipboard if available
 *
 * The feature is created by withDomEvents and registered in the
 * CapabilityRegistry under SELECTION_CAPABILITY.
 */

import {
  terminalSelectionUpdate,
  createTerminalSelectionState,
  extractText,
  type TerminalSelectionState,
  type SelectionRange,
  type SelectionEffect,
} from "@silvery/headless/selection"
import type { TerminalBuffer } from "../buffer"
import type { ClipboardCapability } from "./clipboard-capability"
import { extractHtml } from "../extract-html"

// ============================================================================
// Types
// ============================================================================

/** Observable selection state + mouse handlers. */
export interface SelectionFeature {
  /** Current selection state (getter). */
  readonly state: TerminalSelectionState

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void

  /** Handle mouse down — start selection. */
  handleMouseDown(col: number, row: number, altKey: boolean): void

  /** Handle mouse move — extend selection while dragging. */
  handleMouseMove(col: number, row: number): void

  /** Handle mouse up — finish selection, trigger copy. */
  handleMouseUp(col: number, row: number): void

  /** Programmatically set a selection range (or null to clear). */
  setRange(range: SelectionRange | null): void

  /** Clear the current selection. */
  clear(): void

  /** Clean up resources. */
  dispose(): void
}

/**
 * Options for creating a bridge SelectionFeature that delegates to
 * an external state owner (e.g., create-app's inline selection state).
 */
export interface SelectionBridgeOptions {
  /** Get the current selection state. */
  getState: () => TerminalSelectionState
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
  /** Set a selection range programmatically (used by copy-mode). */
  setRange: (range: SelectionRange | null) => void
  /** Clear the selection. */
  clear: () => void
}

/** Options for creating a SelectionFeature. */
export interface SelectionFeatureOptions {
  /** Terminal buffer to extract text from (required for mouse selection / copy). */
  buffer?: TerminalBuffer
  /** Optional clipboard capability for copy-on-select. */
  clipboard?: ClipboardCapability
  /** Callback to trigger a render pass after state changes. */
  invalidate: () => void
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a SelectionFeature that wraps the headless selection machine.
 *
 * The feature manages subscriptions, processes effects from the machine,
 * and coordinates with clipboard and render invalidation.
 */
export function createSelectionFeature(options: SelectionFeatureOptions): SelectionFeature {
  const { buffer, clipboard, invalidate } = options

  let selectionState = createTerminalSelectionState()
  const listeners = new Set<() => void>()

  function notifyListeners(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  function processEffects(effects: SelectionEffect[], richRange?: SelectionRange | null): void {
    for (const effect of effects) {
      if (effect.type === "render") {
        invalidate()
      } else if (effect.type === "copy" && clipboard) {
        if (clipboard.copyRich && richRange && buffer) {
          const html = extractHtml(buffer, richRange)
          clipboard.copyRich(effect.text, html)
        } else {
          clipboard.copy(effect.text)
        }
      }
    }
  }

  function updateState(
    newState: TerminalSelectionState,
    effects: SelectionEffect[],
    richRange?: SelectionRange | null,
  ): void {
    selectionState = newState
    notifyListeners()
    processEffects(effects, richRange)
  }

  return {
    get state(): TerminalSelectionState {
      return selectionState
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    handleMouseDown(col: number, row: number, _altKey: boolean): void {
      const [newState, effects] = terminalSelectionUpdate(
        { type: "start", col, row, source: "mouse" },
        selectionState,
      )
      updateState(newState, effects)
    },

    handleMouseMove(col: number, row: number): void {
      if (!selectionState.selecting) return
      const [newState, effects] = terminalSelectionUpdate(
        { type: "extend", col, row, buffer: buffer! },
        selectionState,
      )
      updateState(newState, effects)
    },

    handleMouseUp(_col: number, _row: number): void {
      if (!selectionState.selecting) return
      const [newState, effects] = terminalSelectionUpdate({ type: "finish" }, selectionState)

      // Extract text and copy to clipboard on mouse up
      const copyEffects = [...effects]
      if (newState.range && clipboard && buffer) {
        const text = extractText(buffer, newState.range)
        if (text.length > 0) {
          copyEffects.push({ type: "copy", text })
        }
      }

      updateState(newState, copyEffects, newState.range)
    },

    setRange(range: SelectionRange | null): void {
      if (range === null) {
        const [newState, effects] = terminalSelectionUpdate({ type: "clear" }, selectionState)
        updateState(newState, effects)
      } else {
        // Set range by starting at anchor and extending to head
        const [startState, startEffects] = terminalSelectionUpdate(
          { type: "start", col: range.anchor.col, row: range.anchor.row, source: "keyboard" },
          selectionState,
        )
        const [extendState, extendEffects] = terminalSelectionUpdate(
          { type: "extend", col: range.head.col, row: range.head.row },
          startState,
        )
        const [finishState, finishEffects] = terminalSelectionUpdate(
          { type: "finish" },
          extendState,
        )
        updateState(finishState, [...startEffects, ...extendEffects, ...finishEffects])
      }
    },

    clear(): void {
      const [newState, effects] = terminalSelectionUpdate({ type: "clear" }, selectionState)
      updateState(newState, effects)
    },

    dispose(): void {
      selectionState = createTerminalSelectionState()
      listeners.clear()
    },
  }
}

// ============================================================================
// Bridge Implementation
// ============================================================================

/**
 * Create a bridge SelectionFeature that delegates to an external state owner.
 *
 * Used by create-app to expose its inline selection state to React hooks
 * (useSelection) and copy-mode (which calls setRange/clear) without
 * duplicating the state machine. Mouse handlers are no-ops — the external
 * owner (create-app's event loop) handles mouse events directly.
 */
export function createSelectionBridge(options: SelectionBridgeOptions): SelectionFeature {
  return {
    get state(): TerminalSelectionState {
      return options.getState()
    },

    subscribe(listener: () => void): () => void {
      return options.subscribe(listener)
    },

    // Mouse handlers are no-ops — create-app handles mouse events directly.
    handleMouseDown(_col: number, _row: number, _altKey: boolean): void {},
    handleMouseMove(_col: number, _row: number): void {},
    handleMouseUp(_col: number, _row: number): void {},

    setRange(range: SelectionRange | null): void {
      options.setRange(range)
    },

    clear(): void {
      options.clear()
    },

    dispose(): void {},
  }
}
