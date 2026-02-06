/**
 * Phase 4: Output Phase
 *
 * Diff two buffers and produce minimal ANSI output.
 *
 * Debug: Set INKX_DEBUG_OUTPUT=1 to log diff changes and ANSI sequences.
 */

import {
  type Cell,
  type CellAttrs,
  type Color,
  type Style,
  type TerminalBuffer,
  type UnderlineStyle,
  createMutableCell,
  hasActiveAttrs,
  styleEquals,
} from "../buffer.js"
import type { CellChange } from "./types.js"

const DEBUG_OUTPUT = !!process.env.INKX_DEBUG_OUTPUT

/**
 * Map underline style to SGR 4:x subparameter.
 */
function underlineStyleToSgr(style: UnderlineStyle | undefined): number | null {
  switch (style) {
    case false:
      return 0 // SGR 4:0 = no underline
    case "single":
      return 1 // SGR 4:1 = single underline
    case "double":
      return 2 // SGR 4:2 = double underline
    case "curly":
      return 3 // SGR 4:3 = curly underline
    case "dotted":
      return 4 // SGR 4:4 = dotted underline
    case "dashed":
      return 5 // SGR 4:5 = dashed underline
    default:
      return null // Use simple SGR 4 or no underline
  }
}

/**
 * Diff two buffers and produce minimal ANSI output.
 *
 * @param prev Previous buffer (null on first render)
 * @param next Current buffer
 * @param mode Render mode: fullscreen or inline
 * @returns ANSI escape sequence string
 */
export function outputPhase(
  prev: TerminalBuffer | null,
  next: TerminalBuffer,
  mode: "fullscreen" | "inline" = "fullscreen",
): string {
  // First render: output entire buffer
  if (!prev) {
    return bufferToAnsi(next, mode)
  }

  // Diff and emit only changes
  const changes = diffBuffers(prev, next)

  if (DEBUG_OUTPUT) {
    // eslint-disable-next-line no-console
    console.error(`[INKX_DEBUG_OUTPUT] diffBuffers: ${changes.length} changes`)
    // Log first few changes
    for (const change of changes.slice(0, 10)) {
      // eslint-disable-next-line no-console
      console.error(`  (${change.x},${change.y}): "${change.cell.char}"`)
    }
    if (changes.length > 10) {
      // eslint-disable-next-line no-console
      console.error(`  ... and ${changes.length - 10} more`)
    }
  }

  if (changes.length === 0) {
    return "" // No changes
  }

  // For inline mode, pass the previous content height so changesToAnsi knows
  // where the cursor currently sits (at the bottom of the previous render).
  const prevContentHeight = mode === "inline" ? findLastContentLine(prev) : 0
  const nextContentHeight = mode === "inline" ? findLastContentLine(next) : 0

  return changesToAnsi(changes, mode, prevContentHeight, nextContentHeight)
}

/**
 * Check if a line has any non-space content.
 */
function lineHasContent(buffer: TerminalBuffer, y: number): boolean {
  for (let x = 0; x < buffer.width; x++) {
    const ch = buffer.getCellChar(x, y)
    if (ch !== " " && ch !== "") {
      return true
    }
  }
  return false
}

/**
 * Find the last line with content in the buffer.
 */
function findLastContentLine(buffer: TerminalBuffer): number {
  for (let y = buffer.height - 1; y >= 0; y--) {
    if (lineHasContent(buffer, y)) {
      return y
    }
  }
  return 0 // At least render first line
}

/**
 * Convert entire buffer to ANSI string.
 */
function bufferToAnsi(
  buffer: TerminalBuffer,
  mode: "fullscreen" | "inline" = "fullscreen",
): string {
  let output = ""
  let currentStyle: Style | null = null

  // For inline mode, only render up to the last line with content
  const maxLine =
    mode === "inline" ? findLastContentLine(buffer) : buffer.height - 1

  // Move cursor to start position based on mode
  if (mode === "fullscreen") {
    // Fullscreen: Move cursor to home position (top-left)
    output += "\x1b[H"
  } else {
    // Inline: Hide cursor, start from current position
    output += "\x1b[?25l"
  }

  // Reusable objects to avoid per-cell allocation in the inner loop
  const cell = createMutableCell()
  const cellStyle: Style = {
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {},
  }

  for (let y = 0; y <= maxLine; y++) {
    // Move to start of line
    if (y > 0 || mode === "inline") {
      output += "\r"
    }

    // Render the line content
    for (let x = 0; x < buffer.width; x++) {
      buffer.readCellInto(x, y, cell)

      // Skip continuation cells
      if (cell.continuation) continue

      // Build style from cell and check if changed.
      // readCellInto mutates cell.attrs in place, so we must snapshot attrs
      // only when the style actually changes (which is rare -- most adjacent
      // cells share the same style). This avoids per-cell object allocation.
      cellStyle.fg = cell.fg
      cellStyle.bg = cell.bg
      cellStyle.underlineColor = cell.underlineColor
      cellStyle.attrs = cell.attrs
      if (!styleEquals(currentStyle, cellStyle)) {
        // Snapshot: copy attrs so currentStyle isn't invalidated by next readCellInto
        const saved: Style = {
          fg: cell.fg,
          bg: cell.bg,
          underlineColor: cell.underlineColor,
          attrs: { ...cell.attrs },
        }
        output += styleToAnsi(saved)
        currentStyle = saved
      }

      output += cell.char
    }

    // Clear to end of line (removes any leftover content)
    output += "\x1b[K"

    // Move to next line (except for last line)
    if (y < maxLine) {
      // Reset style before newline to prevent background color bleeding
      if (
        currentStyle &&
        (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))
      ) {
        output += "\x1b[0m"
        currentStyle = null
      }
      output += "\n"
    }
  }

  // Reset style at end
  output += "\x1b[0m"

  return output
}

// ============================================================================
// Pre-allocated diff pool
// ============================================================================

/**
 * Create a fresh CellChange with empty cell data.
 * Used to populate the pre-allocated pool.
 */
function createEmptyCellChange(): CellChange {
  return {
    x: 0,
    y: 0,
    cell: {
      char: " ",
      fg: null,
      bg: null,
      underlineColor: null,
      attrs: {},
      wide: false,
      continuation: false,
    },
  }
}

/** Pre-allocated pool of CellChange objects, reused across frames. */
let diffPool: CellChange[] = []

/** Current pool capacity. */
let diffPoolCapacity = 0

/**
 * Ensure the diff pool has at least `capacity` entries.
 * Grows the pool if needed; never shrinks.
 */
function ensureDiffPoolCapacity(capacity: number): void {
  if (capacity <= diffPoolCapacity) return
  for (let i = diffPoolCapacity; i < capacity; i++) {
    diffPool.push(createEmptyCellChange())
  }
  diffPoolCapacity = capacity
}

/**
 * Write cell data from a buffer into a pre-allocated CellChange entry.
 * Uses readCellInto for zero-allocation reads.
 */
function writeCellChange(
  change: CellChange,
  x: number,
  y: number,
  buffer: TerminalBuffer,
): void {
  change.x = x
  change.y = y
  buffer.readCellInto(x, y, change.cell)
}

/**
 * Write empty cell data into a pre-allocated CellChange entry.
 * Used for shrink regions where cells need to be cleared.
 */
function writeEmptyCellChange(change: CellChange, x: number, y: number): void {
  change.x = x
  change.y = y
  const cell = change.cell
  cell.char = " "
  cell.fg = null
  cell.bg = null
  cell.underlineColor = null
  // Reset attrs fields
  const attrs = cell.attrs
  attrs.bold = undefined
  attrs.dim = undefined
  attrs.italic = undefined
  attrs.underline = undefined
  attrs.underlineStyle = undefined
  attrs.blink = undefined
  attrs.inverse = undefined
  attrs.hidden = undefined
  attrs.strikethrough = undefined
  cell.wide = false
  cell.continuation = false
}

/**
 * Diff two buffers and return list of changes.
 *
 * Optimization: Uses a pre-allocated pool of CellChange objects to avoid
 * allocating new objects per changed cell. Uses _readCellInto for
 * zero-allocation cell reads. The pool grows as needed but is reused
 * between frames.
 */
function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): CellChange[] {
  // Ensure pool is large enough for worst case (all cells changed)
  const maxChanges =
    Math.max(prev.width, next.width) * Math.max(prev.height, next.height)
  ensureDiffPoolCapacity(maxChanges)

  let changeCount = 0

  // Dimension mismatch means we need to re-render everything visible
  const height = Math.min(prev.height, next.height)
  const width = Math.min(prev.width, next.width)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Use buffer's optimized cellEquals which compares packed metadata first
      if (!next.cellEquals(x, y, prev)) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }

  // Handle size growth: add all cells in new areas
  if (next.width > prev.width) {
    for (let y = 0; y < next.height; y++) {
      for (let x = prev.width; x < next.width; x++) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }
  if (next.height > prev.height) {
    for (let y = prev.height; y < next.height; y++) {
      for (let x = 0; x < next.width; x++) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }

  // Handle size shrink: clear cells in old-but-not-new areas
  if (prev.width > next.width) {
    for (let y = 0; y < height; y++) {
      for (let x = next.width; x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount]!, x, y)
        changeCount++
      }
    }
  }
  if (prev.height > next.height) {
    for (let y = next.height; y < prev.height; y++) {
      for (let x = 0; x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount]!, x, y)
        changeCount++
      }
    }
  }

  // Return a slice view of the pool (no allocation for the array itself
  // when there are no changes; otherwise one array allocation for the slice)
  if (changeCount === 0) return []
  return diffPool.slice(0, changeCount)
}

/**
 * Convert cell changes to optimized ANSI output.
 *
 * @param changes List of cell changes to render
 * @param mode Render mode: fullscreen or inline
 * @param prevContentLine Last content line of the previous buffer (inline mode only).
 *   This is the row where the cursor currently sits after the previous render.
 * @param nextContentLine Last content line of the next buffer (inline mode only).
 *   After rendering, the cursor will be positioned at this row.
 */
function changesToAnsi(
  changes: CellChange[],
  mode: "fullscreen" | "inline" = "fullscreen",
  prevContentLine = 0,
  nextContentLine = 0,
): string {
  if (changes.length === 0) return ""

  // Sort by position for optimal cursor movement
  changes.sort((a, b) => a.y - b.y || a.x - b.x)

  let output = ""
  let currentStyle: Style | null = null

  if (mode === "inline") {
    // Inline mode: move cursor to start of the render region.
    // The cursor is currently at prevContentLine (the last content row of
    // the previous render). We need to move up to row 0 to start rendering.

    // Hide cursor
    output += "\x1b[?25l"

    // Move up from the cursor's current position (prevContentLine) to row 0
    if (prevContentLine > 0) {
      output += `\x1b[${prevContentLine}A`
    }

    // Move to start of line
    output += "\r"

    // Track current line for multi-line support
    let currentY = 0

    // Apply changes
    for (const { x, y, cell } of changes) {
      // Skip continuation cells
      if (cell.continuation) continue

      // Move to correct line if needed
      while (currentY < y) {
        output += "\n"
        currentY++
      }

      // Move to correct column
      output += `\x1b[${x + 1}G`

      // Update style if changed
      const cellStyle: Style = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: cell.attrs,
      }
      if (!styleEquals(currentStyle, cellStyle)) {
        output += styleToAnsi(cellStyle)
        currentStyle = cellStyle
      }

      // Write character
      output += cell.char
    }

    // After rendering, move cursor to nextContentLine so the next diff
    // knows where the cursor is. The cursor is currently at currentY.
    if (currentY < nextContentLine) {
      output += `\x1b[${nextContentLine - currentY}B`
    }
  } else {
    // Fullscreen mode: use absolute positioning
    let cursorX = -1
    let cursorY = -1

    for (const { x, y, cell } of changes) {
      // Skip continuation cells
      if (cell.continuation) continue

      // Move cursor if needed (cursor must be exactly at target position)
      if (y !== cursorY || x !== cursorX) {
        // Use \r\n optimization only if cursor is initialized AND we're moving
        // to the next line at column 0. Don't use it when cursorY is -1
        // (uninitialized) because that would incorrectly emit a newline at start.
        // Bug km-x7ih: This was causing the first row to appear at the bottom.
        if (cursorY >= 0 && y === cursorY + 1 && x === 0) {
          // Next line at column 0, use newline (more efficient)
          // Reset style before newline to prevent background color bleeding
          if (
            currentStyle &&
            (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))
          ) {
            output += "\x1b[0m"
            currentStyle = null
          }
          output += "\r\n"
        } else {
          // Absolute position (1-indexed)
          output += `\x1b[${y + 1};${x + 1}H`
        }
      }

      // Update style if changed
      const cellStyle: Style = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: cell.attrs,
      }
      if (!styleEquals(currentStyle, cellStyle)) {
        output += styleToAnsi(cellStyle)
        currentStyle = cellStyle
      }

      // Write character
      output += cell.char
      cursorX = x + (cell.wide ? 2 : 1)
      cursorY = y
    }
  }

  // Reset style at end
  if (currentStyle) {
    output += "\x1b[0m"
  }

  return output
}

/**
 * Convert style to ANSI escape sequence.
 *
 * Emits SGR codes including:
 * - Basic colors (30-37, 40-47)
 * - 256-color (38;5;N, 48;5;N)
 * - True color (38;2;r;g;b, 48;2;r;g;b)
 * - Underline styles (4:x where x = 0-5)
 * - Underline color (58;5;N or 58;2;r;g;b)
 * - Inverse is applied last by swapping fg/bg in the output
 */
function styleToAnsi(style: Style): string {
  // Handle inverse by swapping colors
  let fg = style.fg
  let bg = style.bg
  if (style.attrs.inverse) {
    ;[fg, bg] = [bg, fg]
  }

  const codes: number[] = [0] // Reset first

  // Foreground color
  if (fg !== null) {
    const fgCode = colorToAnsiFg(fg)
    if (fgCode) codes.push(...fgCode)
  }

  // Background color
  if (bg !== null) {
    const bgCode = colorToAnsiBg(bg)
    if (bgCode) codes.push(...bgCode)
  }

  // Attributes
  if (style.attrs.bold) codes.push(1)
  if (style.attrs.dim) codes.push(2)
  if (style.attrs.italic) codes.push(3)

  // Underline: use SGR 4:x if style specified, otherwise simple SGR 4
  const underlineStyle = style.attrs.underlineStyle
  const sgrSubparam = underlineStyleToSgr(underlineStyle)
  if (sgrSubparam !== null && sgrSubparam !== 0) {
    // Use colon-separated format for underline style: 4:x
    // Note: We can't use codes.push here because 4:x is a single parameter
    // We'll append it separately after the semicolon-joined codes
  } else if (style.attrs.underline) {
    codes.push(4) // Simple underline
  }

  // Note: inverse was handled above by swapping colors, don't emit SGR 7
  if (style.attrs.strikethrough) codes.push(9)

  // Build the escape sequence
  let result = `\x1b[${codes.join(";")}`

  // Append underline style if needed (uses colon separator)
  if (sgrSubparam !== null && sgrSubparam !== 0) {
    result += `;4:${sgrSubparam}`
  }

  // Append underline color if specified (SGR 58)
  if (style.underlineColor !== null && style.underlineColor !== undefined) {
    const ulColorCode = colorToUnderlineColor(style.underlineColor)
    if (ulColorCode) {
      result += `;${ulColorCode}`
    }
  }

  result += "m"
  return result
}

/**
 * Convert color to underline color SGR 58 code string.
 * Returns a string like "58;5;N" or "58;2;r;g;b"
 */
function colorToUnderlineColor(color: Color): string | null {
  if (color === null) return null

  if (typeof color === "number") {
    // 256-color
    return `58;5;${color}`
  }

  // True color
  return `58;2;${color.r};${color.g};${color.b}`
}

/**
 * Convert color to ANSI foreground codes.
 */
function colorToAnsiFg(color: Color): number[] | null {
  if (color === null) return null

  if (typeof color === "number") {
    // 256-color
    return [38, 5, color]
  }

  // True color
  return [38, 2, color.r, color.g, color.b]
}

/**
 * Convert color to ANSI background codes.
 */
function colorToAnsiBg(color: Color): number[] | null {
  if (color === null) return null

  if (typeof color === "number") {
    // 256-color
    return [48, 5, color]
  }

  // True color
  return [48, 2, color.r, color.g, color.b]
}
