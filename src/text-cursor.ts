/**
 * Text Cursor Utilities
 *
 * Pure functions for mapping between flat character offsets and visual
 * (row, col) positions in word-wrapped text. Uses the same wrapText()
 * function as the rendering pipeline, guaranteeing cursor positions
 * match what's displayed on screen.
 *
 * Architecture layer 0 — no state, no hooks, no components.
 * Used by: TextArea (layer 3), useTextEdit (layer 1), and apps
 * that need cursor math without the full component stack.
 *
 * @example
 * ```ts
 * import { cursorToRowCol, cursorMoveDown } from 'inkx'
 *
 * const { row, col } = cursorToRowCol("hello world", 5, 8)
 * // row=0, col=5 (fits in 8-wide line)
 *
 * const next = cursorMoveDown("hello world\nfoo", 3, 8)
 * // next = 12 (moved to row 1, col 3 → "foo"[3] = end)
 * ```
 */
import { wrapText } from "./unicode.js"

// =============================================================================
// Types
// =============================================================================

export interface WrappedLine {
  /** The text content of this visual line */
  line: string
  /** Character offset in the original text where this line starts */
  startOffset: number
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Convert a flat cursor offset to visual (row, col) in word-wrapped text.
 *
 * Uses wrapText() from unicode.ts — the same function the render pipeline
 * uses — so cursor positions always match what's displayed on screen.
 */
export function cursorToRowCol(
  text: string,
  cursor: number,
  wrapWidth: number,
): { row: number; col: number } {
  if (wrapWidth <= 0) return { row: 0, col: 0 }

  const logicalLines = text.split("\n")
  let charsSeen = 0
  let row = 0

  for (let li = 0; li < logicalLines.length; li++) {
    const line = logicalLines[li]!
    const wrapped = wrapText(line, wrapWidth, false)
    const lines = wrapped.length === 0 ? [""] : wrapped

    for (let wi = 0; wi < lines.length; wi++) {
      const wLine = lines[wi]!
      const lineLen = wLine.length
      const isLastWrappedLine = wi === lines.length - 1

      if (isLastWrappedLine) {
        const endOfLogical = charsSeen + lineLen
        if (cursor <= endOfLogical) {
          return { row, col: cursor - charsSeen }
        }
        charsSeen = endOfLogical + 1 // +1 for \n
      } else {
        if (cursor <= charsSeen + lineLen) {
          return { row, col: cursor - charsSeen }
        }
        charsSeen += lineLen
      }
      row++
    }
  }

  return { row: Math.max(0, row - 1), col: 0 }
}

/**
 * Get all wrapped display lines with their starting character offsets.
 *
 * Each entry represents one visual line on screen. The startOffset can be
 * used to convert a (row, col) back to a flat cursor position:
 * `flatOffset = lines[row].startOffset + col`
 */
export function getWrappedLines(text: string, wrapWidth: number): WrappedLine[] {
  if (wrapWidth <= 0) return [{ line: "", startOffset: 0 }]

  const logicalLines = text.split("\n")
  const result: WrappedLine[] = []
  let offset = 0

  for (let li = 0; li < logicalLines.length; li++) {
    const line = logicalLines[li]!
    const wrapped = wrapText(line, wrapWidth, false)
    const lines = wrapped.length === 0 ? [""] : wrapped

    for (const wLine of lines) {
      result.push({ line: wLine, startOffset: offset })
      offset += wLine.length
    }
    offset++ // for \n
  }

  return result
}

/**
 * Convert visual (row, col) to a flat cursor offset.
 *
 * Clamps col to the line length if the target column exceeds it
 * (important for stickyX behavior on short lines).
 */
export function rowColToCursor(
  text: string,
  row: number,
  col: number,
  wrapWidth: number,
): number {
  const lines = getWrappedLines(text, wrapWidth)
  if (row < 0) return 0
  if (row >= lines.length) return text.length
  const line = lines[row]!
  return line.startOffset + Math.min(col, line.line.length)
}

/**
 * Move cursor up one visual line.
 *
 * Returns the new cursor offset, or null if already on the first visual line
 * (indicating a boundary — the caller should handle cross-block navigation).
 *
 * @param stickyX - Preferred column position for vertical movement.
 *   When moving through lines of different lengths, the cursor tries to
 *   stay at this column. Pass the col from the original position before
 *   the first vertical move in a sequence.
 */
export function cursorMoveUp(
  text: string,
  cursor: number,
  wrapWidth: number,
  stickyX?: number,
): number | null {
  if (wrapWidth <= 0) return cursor > 0 ? 0 : null

  const lines = getWrappedLines(text, wrapWidth)
  const { row, col } = cursorToRowCol(text, cursor, wrapWidth)

  if (row === 0) return null // at first visual line — boundary

  const targetX = stickyX ?? col
  const targetLine = lines[row - 1]!
  return targetLine.startOffset + Math.min(targetX, targetLine.line.length)
}

/**
 * Move cursor down one visual line.
 *
 * Returns the new cursor offset, or null if already on the last visual line
 * (indicating a boundary — the caller should handle cross-block navigation).
 *
 * @param stickyX - Preferred column position for vertical movement.
 */
export function cursorMoveDown(
  text: string,
  cursor: number,
  wrapWidth: number,
  stickyX?: number,
): number | null {
  if (wrapWidth <= 0) return cursor < text.length ? text.length : null

  const lines = getWrappedLines(text, wrapWidth)
  const { row, col } = cursorToRowCol(text, cursor, wrapWidth)

  if (row >= lines.length - 1) return null // at last visual line — boundary

  const targetX = stickyX ?? col
  const targetLine = lines[row + 1]!
  return targetLine.startOffset + Math.min(targetX, targetLine.line.length)
}

/**
 * Count total visual lines after word wrapping.
 */
export function countVisualLines(text: string, wrapWidth: number): number {
  return getWrappedLines(text, wrapWidth).length
}
