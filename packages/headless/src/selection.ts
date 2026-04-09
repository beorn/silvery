/**
 * Selection state machine — pure TEA `(action, state) → [state, effects[]]`.
 *
 * Buffer-level text selection (like native terminal selection).
 * Operates on terminal buffer coordinates, not the React tree.
 *
 * Supports three granularity levels:
 * - character: default drag selection
 * - word: double-click then drag extends by words
 * - line: triple-click then drag extends by lines
 */

import type { TerminalBuffer, RowMetadata } from "@silvery/ag-term/buffer"

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

/**
 * Rectangular boundary for contain-scoped selection.
 * Derived from the nearest `userSelect="contain"` ancestor's scrollRect.
 */
export interface SelectionScope {
  top: number
  bottom: number
  left: number
  right: number
}

export type SelectionGranularity = "character" | "word" | "line"

export interface TerminalSelectionState {
  range: SelectionRange | null
  /** True while mouse button is held */
  selecting: boolean
  /** Who initiated the selection */
  source: "mouse" | "keyboard" | null
  /** Current selection granularity */
  granularity: SelectionGranularity
  /** Contain boundary — selection range is clamped to this rect */
  scope: SelectionScope | null
}

export type SelectionAction =
  | { type: "start"; col: number; row: number; scope?: SelectionScope | null; source?: "mouse" | "keyboard" }
  | {
      type: "startWord"
      col: number
      row: number
      buffer: TerminalBuffer
      scope?: SelectionScope | null
      source?: "mouse" | "keyboard"
    }
  | {
      type: "startLine"
      col: number
      row: number
      buffer: TerminalBuffer
      scope?: SelectionScope | null
      source?: "mouse" | "keyboard"
    }
  | { type: "extend"; col: number; row: number; buffer?: TerminalBuffer }
  | { type: "finish" }
  | { type: "clear" }

export type SelectionEffect = { type: "copy"; text: string } | { type: "render" }

// ============================================================================
// Word Boundary Detection
// ============================================================================

/**
 * Check if a character is a word character (not whitespace/punctuation).
 * Word chars: letters, digits, underscore (matching \w).
 */
function isWordChar(ch: string): boolean {
  return /\w/.test(ch)
}

/**
 * Find word boundaries at a given column in the buffer row.
 * Returns { startCol, endCol } inclusive of the word.
 * If the position is on whitespace/punctuation, selects that single char.
 */
export function findWordBoundary(
  buffer: TerminalBuffer,
  col: number,
  row: number,
): { startCol: number; endCol: number } {
  const width = buffer.width
  const ch = buffer.getCell(col, row).char

  if (isWordChar(ch)) {
    // Walk backwards to find word start
    let startCol = col
    while (startCol > 0 && isWordChar(buffer.getCell(startCol - 1, row).char)) {
      startCol--
    }
    // Walk forwards to find word end
    let endCol = col
    while (endCol < width - 1 && isWordChar(buffer.getCell(endCol + 1, row).char)) {
      endCol++
    }
    return { startCol, endCol }
  }

  // Non-word char: select just that character
  return { startCol: col, endCol: col }
}

// ============================================================================
// Line Boundary Detection
// ============================================================================

/**
 * Find line boundaries for a given row.
 * Returns { startCol, endCol } spanning from first content to last content.
 * If the row is empty, returns { startCol: 0, endCol: width - 1 }.
 */
export function findLineBoundary(buffer: TerminalBuffer, row: number): { startCol: number; endCol: number } {
  const width = buffer.width

  // Find last non-space column
  let endCol = width - 1
  while (endCol > 0 && buffer.getCell(endCol, row).char.trim() === "") {
    endCol--
  }

  // Find first non-space column
  let startCol = 0
  while (startCol < endCol && buffer.getCell(startCol, row).char.trim() === "") {
    startCol++
  }

  // If entirely blank (including when startCol == endCol and that cell is blank), select the full row
  if (startCol >= endCol && buffer.getCell(startCol, row).char.trim() === "") {
    return { startCol: 0, endCol: width - 1 }
  }

  return { startCol, endCol }
}

// ============================================================================
// Granularity-Aware Extend
// ============================================================================

/**
 * Extend the head position according to the current granularity.
 * For word granularity: snaps to word boundaries.
 * For line granularity: snaps to line boundaries.
 */
function extendByGranularity(
  col: number,
  row: number,
  anchor: SelectionPosition,
  granularity: SelectionGranularity,
  buffer?: TerminalBuffer,
): SelectionPosition {
  if (granularity === "character" || !buffer) {
    return { col, row }
  }

  if (granularity === "word") {
    const { startCol, endCol } = findWordBoundary(buffer, col, row)
    // Extend towards the anchor direction
    const isForward = row > anchor.row || (row === anchor.row && col >= anchor.col)
    return isForward ? { col: endCol, row } : { col: startCol, row }
  }

  if (granularity === "line") {
    const { startCol, endCol } = findLineBoundary(buffer, row)
    const isForward = row > anchor.row || (row === anchor.row && col >= anchor.col)
    return isForward ? { col: endCol, row } : { col: startCol, row }
  }

  return { col, row }
}

// ============================================================================
// State
// ============================================================================

export function createTerminalSelectionState(): TerminalSelectionState {
  return { range: null, selecting: false, source: null, granularity: "character", scope: null }
}

// ============================================================================
// Update
// ============================================================================

/**
 * Clamp a position to a scope boundary.
 */
function clampToScope(col: number, row: number, scope: SelectionScope | null): SelectionPosition {
  if (!scope) return { col, row }
  return {
    col: Math.max(scope.left, Math.min(scope.right, col)),
    row: Math.max(scope.top, Math.min(scope.bottom, row)),
  }
}

export function terminalSelectionUpdate(
  action: SelectionAction,
  state: TerminalSelectionState,
): [TerminalSelectionState, SelectionEffect[]] {
  switch (action.type) {
    case "start": {
      const scope = action.scope ?? null
      const pos = clampToScope(action.col, action.row, scope)
      return [
        {
          range: { anchor: pos, head: pos },
          selecting: true,
          source: action.source ?? "mouse",
          granularity: "character",
          scope,
        },
        [{ type: "render" }],
      ]
    }

    case "startWord": {
      const scope = action.scope ?? null
      const { startCol, endCol } = findWordBoundary(action.buffer, action.col, action.row)
      const anchorPos = clampToScope(startCol, action.row, scope)
      const headPos = clampToScope(endCol, action.row, scope)
      return [
        {
          range: { anchor: anchorPos, head: headPos },
          selecting: true,
          source: action.source ?? "mouse",
          granularity: "word",
          scope,
        },
        [{ type: "render" }],
      ]
    }

    case "startLine": {
      const scope = action.scope ?? null
      const { startCol, endCol } = findLineBoundary(action.buffer, action.row)
      const anchorPos = clampToScope(startCol, action.row, scope)
      const headPos = clampToScope(endCol, action.row, scope)
      return [
        {
          range: { anchor: anchorPos, head: headPos },
          selecting: true,
          source: action.source ?? "mouse",
          granularity: "line",
          scope,
        },
        [{ type: "render" }],
      ]
    }

    case "extend": {
      if (!state.selecting) return [state, []]
      const extended = extendByGranularity(
        action.col,
        action.row,
        state.range!.anchor,
        state.granularity,
        action.buffer,
      )
      const head = clampToScope(extended.col, extended.row, state.scope)
      return [
        {
          ...state,
          range: { anchor: state.range!.anchor, head },
          selecting: true,
        },
        [{ type: "render" }],
      ]
    }

    case "finish": {
      if (!state.range) return [{ ...state, selecting: false }, []]
      return [{ ...state, range: state.range, selecting: false }, []]
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

export interface ExtractTextOptions {
  /** When true, skip cells that don't have SELECTABLE_FLAG set */
  respectSelectableFlag?: boolean
  /** Row metadata for soft-wrap handling and precise trailing space trimming */
  rowMetadata?: readonly RowMetadata[]
  /**
   * Contain scope. When set, every row's col range is clamped to
   * `[scope.left, scope.right]` so the extracted text cannot include cells
   * outside the `userSelect="contain"` ancestor's rect — even across the
   * interior rows of a multi-row selection.
   */
  scope?: SelectionScope | null
}

/**
 * Extract text from a buffer within a selection range.
 *
 * Handles:
 * - Soft-wrap joining (via RowMetadata.softWrapped)
 * - Trailing space trimming (via RowMetadata.lastContentCol or content scan)
 * - Blank line preservation within selection
 * - Wide-char continuation cell skipping
 * - SELECTABLE_FLAG filtering (when respectSelectableFlag is true)
 * - Contain-scope clipping (when options.scope is set)
 */
export function extractText(buffer: TerminalBuffer, range: SelectionRange, options?: ExtractTextOptions): string {
  const { startRow, startCol, endRow, endCol } = normalizeRange(range)
  const respectSelectable = options?.respectSelectableFlag ?? false
  const rowMeta = options?.rowMetadata
  const scope = options?.scope

  const parts: string[] = []

  for (let row = startRow; row <= endRow; row++) {
    let colStart = row === startRow ? startCol : 0
    let colEnd = row === endRow ? endCol : buffer.width - 1
    // Clip to contain scope on every row, not just the anchor/head rows.
    // Without this, multi-row selections inside a contain ancestor would
    // still grab full-width cells on interior rows.
    if (scope) {
      colStart = Math.max(colStart, scope.left)
      colEnd = Math.min(colEnd, scope.right)
      if (colStart > colEnd) {
        // This row is entirely outside the scope — emit an empty line to
        // preserve row counts, then continue.
        const meta = rowMeta?.[row]
        if (!(meta?.softWrapped && row < endRow)) {
          parts.push("")
          if (row < endRow) parts.push("\n")
        }
        continue
      }
    }

    let line = ""
    for (let col = colStart; col <= colEnd; col++) {
      // Skip wide-char continuation cells
      if (buffer.isCellContinuation(col, row)) continue

      // Skip non-selectable cells when flag checking is enabled
      if (respectSelectable && !buffer.isCellSelectable(col, row)) continue

      line += buffer.getCellChar(col, row)
    }

    // Trim trailing spaces using lastContentCol if available, otherwise fallback
    const meta = rowMeta?.[row]
    if (meta && meta.lastContentCol >= 0) {
      // Compute how much of the line is trailing whitespace
      // lastContentCol is the rightmost col with non-space content
      const effectiveEnd = row === endRow ? endCol : buffer.width - 1
      const trailingCols = effectiveEnd - meta.lastContentCol
      if (trailingCols > 0 && line.length > 0) {
        // Trim up to trailingCols chars of trailing spaces
        line = line.replace(/\s+$/, "")
      }
    } else {
      line = line.replace(/\s+$/, "")
    }

    // Preserve blank lines within selection (don't drop them)
    // but join soft-wrapped lines without a newline
    if (meta?.softWrapped && row < endRow) {
      parts.push(line)
    } else {
      parts.push(line)
      // Add newline separator unless this is the last row
      if (row < endRow) {
        parts.push("\n")
      }
    }
  }

  return parts.join("")
}
