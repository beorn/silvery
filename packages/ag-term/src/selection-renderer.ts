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
 *
 * When `inverseAttr` is true, applying the change toggles the cell's inverse
 * attribute (SGR 7) — this is the legacy parity fallback for cells with
 * default fg/bg, where swapping null↔null would produce no visible change.
 * The terminal handles the actual visual swap at display time.
 *
 * When `inverseAttr` is false (or absent), applying the change overwrites the
 * cell's fg/bg directly — used for explicit theme tokens (selectionFg /
 * selectionBg) or fallback fg/bg swap when both colors are non-null.
 */
export interface SelectionCellChange {
  col: number
  row: number
  fg: Color
  bg: Color
  inverseAttr?: boolean
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
      let inverseAttr = false

      if (theme?.selectionBg != null) {
        // Use theme tokens
        newFg = theme.selectionFg ?? cellFg
        newBg = theme.selectionBg
      } else if (cellFg == null && cellBg == null) {
        // Default fg/bg on both: swapping null↔null is a no-op. Use the
        // legacy SGR 7 inverse attribute toggle so the terminal flips fg/bg
        // at display time. This matches the behavior of the deleted
        // `renderSelectionOverlay` function (which wrote `\x1b[7m`) for the
        // common case where rendered text uses default colors.
        newFg = cellFg
        newBg = cellBg
        inverseAttr = true
      } else {
        // Fallback: swap fg/bg (handles already-inverted content correctly)
        newFg = cellBg
        newBg = cellFg
      }

      changes.push({ col, row, fg: newFg, bg: newBg, inverseAttr })
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
    if (change.inverseAttr) {
      // Toggle the inverse attr — terminal handles fg/bg swap at display.
      // Used when both colors are default (null) so direct swap would no-op.
      buffer.setCell(change.col, change.row, {
        ...cell,
        attrs: { ...cell.attrs, inverse: !cell.attrs.inverse },
      })
    } else {
      buffer.setCell(change.col, change.row, {
        ...cell,
        fg: change.fg,
        bg: change.bg,
      })
    }
  }
}

// Legacy `renderSelectionOverlay` (ANSI past the buffer) was deleted on
// 2026-04-24 — see km-silvery.delete-render-selection-overlay. The visual
// "selection only extends, never shrinks" bug class is structurally
// impossible with the compose+apply pattern above: selection styling lives
// in the buffer cells, so the output diff engine tracks lifecycle (cells
// that were styled last frame but aren't this frame get repainted).
