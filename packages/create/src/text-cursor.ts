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
 * import { cursorToRowCol, cursorMoveDown } from '@silvery/ag-react'
 *
 * const { row, col } = cursorToRowCol("hello world", 5, 8)
 * // row=0, col=5 (fits in 8-wide line)
 *
 * const next = cursorMoveDown("hello world\nfoo", 3, 8)
 * // next = 12 (moved to row 1, col 3 → "foo"[3] = end)
 * ```
 */
import { type Measurer, wrapText } from "@silvery/ag-term/unicode"

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
  measurer?: Measurer,
): { row: number; col: number } {
  if (wrapWidth <= 0) return { row: 0, col: 0 }
  return cursorToRowColFromLines(getWrappedLines(text, wrapWidth, measurer), cursor)
}

/** Internal: compute row/col from pre-computed wrapped lines. */
function cursorToRowColFromLines(
  lines: WrappedLine[],
  cursor: number,
): { row: number; col: number } {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const lineEnd = line.startOffset + line.line.length
    const isLast = i === lines.length - 1

    if (cursor <= lineEnd || isLast) {
      const col = Math.max(0, Math.min(cursor - line.startOffset, line.line.length))
      return { row: i, col }
    }
  }

  return { row: Math.max(0, lines.length - 1), col: 0 }
}

/**
 * Get all wrapped display lines with their starting character offsets.
 *
 * Each entry represents one visual line on screen. The startOffset can be
 * used to convert a (row, col) back to a flat cursor position:
 * `flatOffset = lines[row].startOffset + col`
 */
export function getWrappedLines(
  text: string,
  wrapWidth: number,
  measurer?: Measurer,
): WrappedLine[] {
  if (wrapWidth <= 0) return [{ line: "", startOffset: 0 }]

  const logicalLines = text.split("\n")
  const result: WrappedLine[] = []
  let offset = 0
  // Use explicit measurer when available, fall back to module-level convenience function
  const wt = measurer ? measurer.wrapText.bind(measurer) : wrapText

  for (let li = 0; li < logicalLines.length; li++) {
    const line = logicalLines[li]!
    // Use trim=true to match the renderer's wrapping behavior.
    // The renderer uses wrapText(text, width, true, true), so cursor math
    // must produce the same visual lines to keep positions synchronized.
    const wrapped = wt(line, wrapWidth, false, true)
    const lines = wrapped.length === 0 ? [""] : wrapped

    for (const wLine of lines) {
      // Skip whitespace in the original text that was trimmed:
      // - Leading spaces on continuation lines (trimmed by renderer)
      // - Trailing space at break point (consumed as separator by renderer)
      while (
        offset < text.length &&
        text[offset] === " " &&
        wLine.length > 0 &&
        text[offset] !== wLine[0]
      ) {
        offset++
      }
      result.push({ line: wLine, startOffset: offset })
      offset += wLine.length
    }
    // Skip any remaining trailing spaces before the newline
    while (offset < text.length && text[offset] === " ") {
      offset++
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
  measurer?: Measurer,
): number {
  const lines = getWrappedLines(text, wrapWidth, measurer)
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
  measurer?: Measurer,
): number | null {
  if (wrapWidth <= 0) return cursor > 0 ? 0 : null

  const lines = getWrappedLines(text, wrapWidth, measurer)
  const { row, col } = cursorToRowColFromLines(lines, cursor)

  if (row === 0) return null // at first visual line — boundary

  const targetX = stickyX ?? col
  // Try successive lines upward: if the target position equals the current cursor
  // (happens at wrap boundaries), keep going up to make real progress.
  for (let prevRow = row - 1; prevRow >= 0; prevRow--) {
    const targetLine = lines[prevRow]!
    const next = targetLine.startOffset + Math.min(targetX, targetLine.line.length)
    if (next !== cursor) return next
  }
  return null // all preceding lines map to same position — boundary
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
  measurer?: Measurer,
): number | null {
  if (wrapWidth <= 0) return cursor < text.length ? text.length : null

  const lines = getWrappedLines(text, wrapWidth, measurer)
  const { row, col } = cursorToRowColFromLines(lines, cursor)

  if (row >= lines.length - 1) return null // at last visual line — boundary

  const targetX = stickyX ?? col
  // Try successive lines: if the target position equals the current cursor
  // (happens at wrap boundaries where end-of-line-N == start-of-line-N+1),
  // advance to the next line to make real progress.
  for (let nextRow = row + 1; nextRow < lines.length; nextRow++) {
    const targetLine = lines[nextRow]!
    const next = targetLine.startOffset + Math.min(targetX, targetLine.line.length)
    if (next !== cursor) return next
  }
  return null // all remaining lines map to same position — boundary
}

/**
 * Count total visual lines after word wrapping.
 */
export function countVisualLines(text: string, wrapWidth: number, measurer?: Measurer): number {
  return getWrappedLines(text, wrapWidth, measurer).length
}
