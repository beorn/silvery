/**
 * Selection style composition.
 *
 * Applies selection highlight as a cell-style transform in the rendering pipeline,
 * NOT as an ANSI overlay. Selection composes correctly with existing cell styles
 * (fg/bg/attrs), handles already-inverted content, and flows through the normal
 * diff/output renderer.
 *
 * Called after render phase, before output phase.
 */

import type { Color, TerminalBuffer } from "./buffer"
import {
  type SelectionRange,
  type SelectionScope,
  normalizeRange,
} from "@silvery/headless/selection"

// ============================================================================
// Types
// ============================================================================

/**
 * Selection theme tokens. If provided, these override the fallback fg/bg swap.
 */
export interface SelectionTheme {
  /** Foreground color for selected text */
  selectionFg?: Color
  /** Background color for selected text */
  selectionBg?: Color
}

/**
 * A single cell change produced by selection composition.
 * Used as a sparse overlay — only cells within the selection range are affected.
 */
export interface SelectionCellChange {
  col: number
  row: number
  fg: Color
  bg: Color
}

// ============================================================================
// Style Composition
// ============================================================================

/**
 * Compute selection style changes for all cells within a selection range.
 *
 * Returns a sparse list of cell changes (fg/bg only). The caller applies these
 * to the buffer before the output phase diffs it. This approach:
 * - Composes correctly with existing cell styles
 * - Handles already-inverted content (swaps back to normal instead of double-inverting)
 * - Respects SELECTABLE_FLAG per cell (skip non-selectable)
 * - Works with the normal diff/output renderer (no separate ANSI pass)
 *
 * @param buffer The rendered buffer (post-render-phase)
 * @param selection Current selection range, or null
 * @param theme Optional selection theme colors
 * @param respectSelectableFlag When true, skip cells without SELECTABLE_FLAG
 */
export function composeSelectionCells(
  buffer: TerminalBuffer,
  selection: SelectionRange | null,
  theme?: SelectionTheme,
  respectSelectableFlag = false,
  scope?: SelectionScope | null,
): SelectionCellChange[] {
  if (!selection) return []

  const { startRow, startCol, endRow, endCol } = normalizeRange(selection)
  const changes: SelectionCellChange[] = []

  for (let row = startRow; row <= endRow; row++) {
    let colStart = row === startRow ? startCol : 0
    let colEnd = row === endRow ? endCol : buffer.width - 1
    // Clip to contain scope on every row so selection highlight never paints
    // outside a `userSelect="contain"` ancestor, even on interior rows.
    if (scope) {
      colStart = Math.max(colStart, scope.left)
      colEnd = Math.min(colEnd, scope.right)
      if (colStart > colEnd) continue
    }

    for (let col = colStart; col <= colEnd; col++) {
      // Skip continuation cells (second half of wide chars)
      if (buffer.isCellContinuation(col, row)) continue

      // Skip non-selectable cells when flag checking is enabled
      if (respectSelectableFlag && !buffer.isCellSelectable(col, row)) continue

      const cellFg = buffer.getCellFg(col, row)
      const cellBg = buffer.getCellBg(col, row)

      let newFg: Color
      let newBg: Color

      if (theme?.selectionBg != null) {
        // Use theme tokens
        newFg = theme.selectionFg ?? cellFg
        newBg = theme.selectionBg
      } else {
        // Fallback: swap fg/bg (handles already-inverted content correctly)
        // If fg is null (default), use a visible fallback
        newFg = cellBg
        newBg = cellFg
      }

      changes.push({ col, row, fg: newFg, bg: newBg })
    }
  }

  return changes
}

/**
 * Apply selection style changes to a buffer.
 *
 * Modifies the buffer in-place by setting fg/bg on affected cells.
 * Call this after the render phase and before the output phase.
 *
 * @param buffer The rendered buffer to modify
 * @param changes Cell changes from composeSelectionCells
 */
export function applySelectionToBuffer(
  buffer: TerminalBuffer,
  changes: SelectionCellChange[],
): void {
  for (const change of changes) {
    const cell = buffer.getCell(change.col, change.row)
    buffer.setCell(change.col, change.row, {
      ...cell,
      fg: change.fg,
      bg: change.bg,
    })
  }
}

// ============================================================================
// Legacy API (deprecated — kept for backwards compatibility)
// ============================================================================

/**
 * Generate ANSI sequences to render selection overlay (inverse video on selected cells).
 *
 * @deprecated Use composeSelectionCells + applySelectionToBuffer instead.
 * This approach re-emits characters with SGR 7m, which doesn't compose correctly
 * with existing cell styles. The new style composition approach modifies cell data
 * before the output phase, producing correct results.
 */
export function renderSelectionOverlay(
  selection: SelectionRange | null,
  buffer: TerminalBuffer,
  mode: "fullscreen" | "inline" = "fullscreen",
  scope?: SelectionScope | null,
): string {
  if (!selection) return ""

  const { startRow, startCol, endRow, endCol } = normalizeRange(selection)
  let out = ""

  for (let row = startRow; row <= endRow; row++) {
    let colStart = row === startRow ? startCol : 0
    let colEnd = row === endRow ? endCol : buffer.width - 1
    // Clip to contain scope on every row (see composeSelectionCells above).
    if (scope) {
      colStart = Math.max(colStart, scope.left)
      colEnd = Math.min(colEnd, scope.right)
    }

    if (colStart > colEnd) continue

    if (mode === "fullscreen") {
      out += `\x1b[${row + 1};${colStart + 1}H`
    }

    out += "\x1b[7m"
    for (let col = colStart; col <= colEnd; col++) {
      out += buffer.getCell(col, row).char
    }
    out += "\x1b[27m"
  }

  return out
}
