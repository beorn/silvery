/**
 * Selection state machine — pure TEA `(action, state) → [state, effects[]]`.
 *
 * Buffer-level text selection (like native terminal selection).
 * Operates on terminal buffer coordinates, not the React tree.
 */

import type { TerminalBuffer } from "./buffer"

// ============================================================================
// Types
// ============================================================================

export interface SelectionPosition {
  col: number
  row: number
}

export interface SelectionRange {
  anchor: SelectionPosition
  head: SelectionPosition
}

export interface TerminalSelectionState {
  range: SelectionRange | null
  /** True while mouse button is held */
  selecting: boolean
}

export type SelectionAction =
  | { type: "start"; col: number; row: number }
  | { type: "extend"; col: number; row: number }
  | { type: "finish" }
  | { type: "clear" }

export type SelectionEffect = { type: "copy"; text: string } | { type: "render" }

// ============================================================================
// State
// ============================================================================

export function createTerminalSelectionState(): TerminalSelectionState {
  return { range: null, selecting: false }
}

// ============================================================================
// Update
// ============================================================================

export function terminalSelectionUpdate(action: SelectionAction, state: TerminalSelectionState): [TerminalSelectionState, SelectionEffect[]] {
  switch (action.type) {
    case "start": {
      const pos: SelectionPosition = { col: action.col, row: action.row }
      return [{ range: { anchor: pos, head: pos }, selecting: true }, [{ type: "render" }]]
    }

    case "extend": {
      if (!state.selecting) return [state, []]
      const head: SelectionPosition = { col: action.col, row: action.row }
      return [{ range: { anchor: state.range!.anchor, head }, selecting: true }, [{ type: "render" }]]
    }

    case "finish": {
      if (!state.range) return [{ ...state, selecting: false }, []]
      return [{ range: state.range, selecting: false }, []]
    }

    case "clear": {
      const hadRange = state.range !== null
      return [createTerminalSelectionState(), hadRange ? [{ type: "render" }] : []]
    }
  }
}

// ============================================================================
// Range Normalization
// ============================================================================

export function normalizeRange(range: SelectionRange): {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
} {
  const { anchor, head } = range

  if (anchor.row < head.row || (anchor.row === head.row && anchor.col <= head.col)) {
    return { startRow: anchor.row, startCol: anchor.col, endRow: head.row, endCol: head.col }
  }

  return { startRow: head.row, startCol: head.col, endRow: anchor.row, endCol: anchor.col }
}

// ============================================================================
// Text Extraction
// ============================================================================

export function extractText(buffer: TerminalBuffer, range: SelectionRange): string {
  const { startRow, startCol, endRow, endCol } = normalizeRange(range)
  const lines: string[] = []

  for (let row = startRow; row <= endRow; row++) {
    const colStart = row === startRow ? startCol : 0
    const colEnd = row === endRow ? endCol : buffer.width - 1

    let line = ""
    for (let col = colStart; col <= colEnd; col++) {
      line += buffer.getCell(col, row).char
    }

    // Trim trailing spaces
    line = line.replace(/\s+$/, "")

    // Skip completely empty rows
    if (line.length > 0) {
      lines.push(line)
    }
  }

  return lines.join("\n")
}
