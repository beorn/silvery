/**
 * TextFrame — Unified interface for a rectangular area of styled terminal text.
 *
 * Used by App, RunHandle, term.screen, term.scrollback — one shape everywhere.
 * Provides plain text, ANSI-styled text, per-line access, cell-level queries,
 * and text search.
 *
 * @packageDocumentation
 */

// ============================================================================
// RGB Color
// ============================================================================

/**
 * RGB color value (0-255 per channel).
 */
export interface RGB {
  r: number
  g: number
  b: number
}

// ============================================================================
// FrameCell
// ============================================================================

/**
 * A single cell in a TextFrame with resolved styling.
 *
 * Colors are resolved to RGB (or null for default/inherit).
 * Attributes are flattened booleans for easy testing.
 */
export interface FrameCell {
  /** The character/grapheme in this cell */
  readonly char: string
  /** Resolved foreground color, or null for default */
  readonly fg: RGB | null
  /** Resolved background color, or null for default */
  readonly bg: RGB | null
  /** Bold attribute */
  readonly bold: boolean
  /** Dim/faint attribute */
  readonly dim: boolean
  /** Italic attribute */
  readonly italic: boolean
  /** Underline — false if none, or the underline style */
  readonly underline: boolean | UnderlineStyle
  /** Strikethrough attribute */
  readonly strikethrough: boolean
  /** Inverse/reverse video attribute */
  readonly inverse: boolean
  /** Blink attribute */
  readonly blink: boolean
  /** Hidden/invisible attribute */
  readonly hidden: boolean
  /** True if this is a wide character (CJK, emoji) */
  readonly wide: boolean
  /** True if this cell is the continuation of a wide character */
  readonly continuation: boolean
  /** OSC 8 hyperlink URL, or null if none */
  readonly hyperlink: string | null
}

// Re-use UnderlineStyle from types.ts
import type { UnderlineStyle } from "./types"

// ============================================================================
// TextFrame
// ============================================================================

/**
 * Unified interface for a rectangular area of styled terminal text.
 *
 * Implemented by App, RunHandle, and terminal views (screen, scrollback).
 * Provides consistent access to text content, styling, and cell-level data.
 */
export interface TextFrame {
  /** Plain text content (no ANSI codes). Lines separated by newlines. */
  readonly text: string
  /** Text with ANSI styling escape codes. */
  readonly ansi: string
  /** Per-line plain text array (no ANSI codes). */
  readonly lines: string[]
  /** Frame width in terminal columns. */
  readonly width: number
  /** Frame height in terminal rows. */
  readonly height: number
  /** Get the cell at the given column and row. */
  cell(col: number, row: number): FrameCell
  /** Check whether the plain text contains the given substring. */
  containsText(text: string): boolean
}
