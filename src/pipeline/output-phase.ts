/**
 * Phase 4: Output Phase
 *
 * Diff two buffers and produce minimal ANSI output.
 */

import {
  type CellAttrs,
  type Color,
  type Style,
  type TerminalBuffer,
  type UnderlineStyle,
  styleEquals,
} from "../buffer.js"
import type { CellChange } from "./types.js"

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
 * Check if any text attributes are active.
 */
function hasActiveAttrs(attrs: CellAttrs): boolean {
  return !!(
    attrs.bold ||
    attrs.dim ||
    attrs.italic ||
    attrs.underline ||
    attrs.underlineStyle ||
    attrs.blink ||
    attrs.inverse ||
    attrs.hidden ||
    attrs.strikethrough
  )
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

  if (changes.length === 0) {
    return "" // No changes
  }

  return changesToAnsi(changes, mode)
}

/**
 * Check if a line has any non-space content.
 */
function lineHasContent(buffer: TerminalBuffer, y: number): boolean {
  for (let x = 0; x < buffer.width; x++) {
    const cell = buffer.getCell(x, y)
    if (cell.char !== " " && cell.char !== "") {
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

  for (let y = 0; y <= maxLine; y++) {
    // Move to start of line
    if (y > 0 || mode === "inline") {
      output += "\r"
    }

    // Render the line content
    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.getCell(x, y)

      // Skip continuation cells
      if (cell.continuation) continue

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

/**
 * Diff two buffers and return list of changes.
 *
 * Optimization: Uses buffer's cellEquals method which can do fast
 * packed integer comparison before falling back to full cell comparison.
 */
function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): CellChange[] {
  const changes: CellChange[] = []

  // Dimension mismatch means we need to re-render everything visible
  const height = Math.min(prev.height, next.height)
  const width = Math.min(prev.width, next.width)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Use buffer's optimized cellEquals which compares packed metadata first
      if (!next.cellEquals(x, y, prev)) {
        changes.push({ x, y, cell: next.getCell(x, y) })
      }
    }
  }

  // Handle size changes: add all cells in new areas
  if (next.width > prev.width) {
    for (let y = 0; y < next.height; y++) {
      for (let x = prev.width; x < next.width; x++) {
        changes.push({ x, y, cell: next.getCell(x, y) })
      }
    }
  }
  if (next.height > prev.height) {
    for (let y = prev.height; y < next.height; y++) {
      for (let x = 0; x < next.width; x++) {
        changes.push({ x, y, cell: next.getCell(x, y) })
      }
    }
  }

  return changes
}

/**
 * Convert cell changes to optimized ANSI output.
 */
function changesToAnsi(
  changes: CellChange[],
  mode: "fullscreen" | "inline" = "fullscreen",
): string {
  if (changes.length === 0) return ""

  // Sort by position for optimal cursor movement
  changes.sort((a, b) => a.y - b.y || a.x - b.x)

  let output = ""
  let currentStyle: Style | null = null

  if (mode === "inline") {
    // Inline mode: move cursor to start of the render region
    const maxY = Math.max(...changes.map((c) => c.y))

    // Hide cursor
    output += "\x1b[?25l"

    // Move up to the top line of the render region if we have multiple lines
    if (maxY > 0) {
      output += `\x1b[${maxY}A`
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
