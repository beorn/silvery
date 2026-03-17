/**
 * Selection overlay renderer.
 *
 * Post-processing step: generates ANSI sequences to render selected cells
 * with inverse video, applied after the normal output phase.
 */

import type { TerminalBuffer } from "./buffer"
import { type SelectionRange, normalizeRange } from "./selection"

// ============================================================================
// Renderer
// ============================================================================

/**
 * Generate ANSI sequences to render selection overlay (inverse video on selected cells).
 *
 * Uses absolute cursor positioning for fullscreen mode.
 * Returns empty string when there is no selection.
 */
export function renderSelectionOverlay(
  selection: SelectionRange | null,
  buffer: TerminalBuffer,
  mode: "fullscreen" | "inline" = "fullscreen",
): string {
  if (!selection) return ""

  const { startRow, startCol, endRow, endCol } = normalizeRange(selection)
  let out = ""

  for (let row = startRow; row <= endRow; row++) {
    // Determine column range for this row
    const colStart = row === startRow ? startCol : 0
    const colEnd = row === endRow ? endCol : buffer.width - 1

    if (colStart > colEnd) continue

    // Move cursor to position (ANSI is 1-based)
    if (mode === "fullscreen") {
      out += `\x1b[${row + 1};${colStart + 1}H`
    }

    // Enable inverse
    out += "\x1b[7m"

    // Re-emit characters from buffer
    for (let col = colStart; col <= colEnd; col++) {
      out += buffer.getCell(col, row).char
    }

    // Disable inverse
    out += "\x1b[27m"
  }

  return out
}
