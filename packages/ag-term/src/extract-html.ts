/**
 * Extract HTML from a terminal buffer selection range.
 *
 * Converts selected cells to `<pre>` wrapped HTML with inline styles
 * for foreground/background colors and text attributes (bold, italic, etc.).
 *
 * This enables rich clipboard copy: paste into apps that understand
 * text/html (Slack, email, docs) and get styled terminal output.
 *
 * @module
 */

import type { TerminalBuffer, Color, Cell } from "./buffer"
import type { SelectionRange } from "@silvery/headless/selection"

// ============================================================================
// Types
// ============================================================================

interface SpanState {
  fg: string | null
  bg: string | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
}

// ============================================================================
// Helpers
// ============================================================================

/** Standard ANSI 256-color palette (first 16 colors) */
const ANSI_16_COLORS: readonly string[] = [
  "#000000", // 0 black
  "#aa0000", // 1 red
  "#00aa00", // 2 green
  "#aa5500", // 3 yellow
  "#0000aa", // 4 blue
  "#aa00aa", // 5 magenta
  "#00aaaa", // 6 cyan
  "#aaaaaa", // 7 white
  "#555555", // 8 bright black
  "#ff5555", // 9 bright red
  "#55ff55", // 10 bright green
  "#ffff55", // 11 bright yellow
  "#5555ff", // 12 bright blue
  "#ff55ff", // 13 bright magenta
  "#55ffff", // 14 bright cyan
  "#ffffff", // 15 bright white
]

/** Convert a Color to a CSS color string, or null if default. */
function colorToCss(color: Color): string | null {
  if (color === null) return null
  if (typeof color === "object") {
    // Skip DEFAULT_BG sentinel
    if (color.r === -1) return null
    return `rgb(${color.r},${color.g},${color.b})`
  }
  // 256-color index
  if (color < 16) return ANSI_16_COLORS[color] ?? null
  if (color < 232) {
    // 6x6x6 color cube (indices 16-231)
    const idx = color - 16
    const r = Math.floor(idx / 36) * 51
    const g = (Math.floor(idx / 6) % 6) * 51
    const b = (idx % 6) * 51
    return `rgb(${r},${g},${b})`
  }
  // Grayscale ramp (indices 232-255)
  const gray = (color - 232) * 10 + 8
  return `rgb(${gray},${gray},${gray})`
}

/** Escape HTML special characters. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Check if two span states are style-equivalent. */
function sameStyle(a: SpanState, b: SpanState): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough
  )
}

/** Build inline CSS from a SpanState. Returns empty string if no styling needed. */
function spanToCss(state: SpanState): string {
  const parts: string[] = []
  if (state.fg) parts.push(`color:${state.fg}`)
  if (state.bg) parts.push(`background-color:${state.bg}`)
  if (state.bold) parts.push("font-weight:bold")
  if (state.dim) parts.push("opacity:0.5")
  if (state.italic) parts.push("font-style:italic")
  const decorations: string[] = []
  if (state.underline) decorations.push("underline")
  if (state.strikethrough) decorations.push("line-through")
  if (decorations.length > 0) parts.push(`text-decoration:${decorations.join(" ")}`)
  return parts.join(";")
}

/** Extract SpanState from a Cell. */
function cellToSpanState(cell: Cell): SpanState {
  return {
    fg: colorToCss(cell.fg),
    bg: colorToCss(cell.bg),
    bold: cell.attrs.bold ?? false,
    dim: cell.attrs.dim ?? false,
    italic: cell.attrs.italic ?? false,
    underline: cell.attrs.underline ?? false,
    strikethrough: cell.attrs.strikethrough ?? false,
  }
}

const DEFAULT_STATE: SpanState = {
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  strikethrough: false,
}

// ============================================================================
// Normalize Selection Range
// ============================================================================

/** Normalize a selection range to top-left → bottom-right order. */
function normalizeRange(range: SelectionRange): {
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
// Public API
// ============================================================================

/**
 * Extract HTML from a terminal buffer within a selection range.
 *
 * Produces a `<pre>` element with inline styles for colors and text
 * attributes. Adjacent cells with the same style are merged into
 * a single `<span>` to keep the output compact.
 *
 * @param buffer - Terminal buffer to extract from
 * @param range - Selection range (anchor/head coordinates)
 * @returns HTML string wrapped in `<pre>` tags
 */
export function extractHtml(buffer: TerminalBuffer, range: SelectionRange): string {
  const { startRow, startCol, endRow, endCol } = normalizeRange(range)

  const lines: string[] = []

  for (let row = startRow; row <= endRow; row++) {
    const colStart = row === startRow ? startCol : 0
    const colEnd = row === endRow ? endCol : buffer.width - 1

    let lineHtml = ""
    let currentState: SpanState = DEFAULT_STATE
    let currentText = ""

    for (let col = colStart; col <= colEnd; col++) {
      // Skip wide-char continuation cells
      if (buffer.isCellContinuation(col, row)) continue

      const cell = buffer.getCell(col, row)
      const state = cellToSpanState(cell)

      if (!sameStyle(state, currentState)) {
        // Flush previous span
        if (currentText.length > 0) {
          lineHtml += wrapSpan(currentState, currentText)
          currentText = ""
        }
        currentState = state
      }

      currentText += escapeHtml(cell.char)
    }

    // Flush remaining text
    if (currentText.length > 0) {
      lineHtml += wrapSpan(currentState, currentText)
    }

    // Trim trailing whitespace spans (same as extractText behavior)
    lineHtml = lineHtml.replace(/(\s|&nbsp;)+(<\/span>)?$/, "$2")

    lines.push(lineHtml)
  }

  return `<pre style="font-family:monospace">${lines.join("\n")}</pre>`
}

/** Wrap text in a <span> with inline styles, or return bare text if no styling. */
function wrapSpan(state: SpanState, text: string): string {
  const css = spanToCss(state)
  if (css.length === 0) return text
  return `<span style="${css}">${text}</span>`
}
