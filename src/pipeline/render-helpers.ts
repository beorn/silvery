/**
 * Render Helpers - Pure utility functions for content rendering.
 *
 * Contains:
 * - Color parsing (parseColor)
 * - Border character definitions (getBorderChars)
 * - Style extraction (getTextStyle)
 * - Text width utilities (getTextWidth)
 *
 * Re-exports layout helpers from helpers.ts:
 * - getPadding, getBorderSize
 */

import type { Color, Style, UnderlineStyle } from "../buffer.js"
import { getActiveTheme, resolveThemeColor } from "themex"
import type { BoxProps, TextProps } from "../types.js"
import { displayWidthAnsi } from "../unicode.js"
import type { BorderChars, PipelineContext } from "./types.js"

// Re-export shared layout helpers
export { getBorderSize, getPadding } from "./helpers.js"

// ============================================================================
// Color Parsing
// ============================================================================

// Named colors map to 256-color indices (hoisted to module scope to avoid per-call allocation)
const namedColors: Record<string, number> = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  gray: 8,
  grey: 8,
  blackBright: 8,
  redBright: 9,
  greenBright: 10,
  yellowBright: 11,
  blueBright: 12,
  magentaBright: 13,
  cyanBright: 14,
  whiteBright: 15,
}

/**
 * Parse color string to Color type.
 * Supports: $token (theme), named colors, hex (#rgb, #rrggbb), rgb(r,g,b)
 */
export function parseColor(color: string): Color {
  // Resolve $token colors against the active theme
  if (color.startsWith("$")) {
    const resolved = resolveThemeColor(color, getActiveTheme())
    if (resolved && resolved !== color) return parseColor(resolved)
    return null
  }

  if (color in namedColors) {
    return namedColors[color as keyof typeof namedColors]!
  }

  // Hex color
  if (color.startsWith("#")) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0]! + hex[0]!, 16)
      const g = Number.parseInt(hex[1]! + hex[1]!, 16)
      const b = Number.parseInt(hex[2]! + hex[2]!, 16)
      return { r, g, b }
    }
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16)
      const g = Number.parseInt(hex.slice(2, 4), 16)
      const b = Number.parseInt(hex.slice(4, 6), 16)
      return { r, g, b }
    }
  }

  // rgb(r,g,b)
  const rgbMatch = color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (rgbMatch) {
    return {
      r: Number.parseInt(rgbMatch[1]!, 10),
      g: Number.parseInt(rgbMatch[2]!, 10),
      b: Number.parseInt(rgbMatch[3]!, 10),
    }
  }

  return null
}

// ============================================================================
// Border Characters
// ============================================================================

/**
 * Border character sets by style. Hoisted to module scope to avoid
 * re-allocating 7 objects on every call.
 */
const borders: Record<NonNullable<BoxProps["borderStyle"]>, BorderChars> = {
  single: {
    topLeft: "\u250c",
    topRight: "\u2510",
    bottomLeft: "\u2514",
    bottomRight: "\u2518",
    horizontal: "\u2500",
    vertical: "\u2502",
  },
  double: {
    topLeft: "\u2554",
    topRight: "\u2557",
    bottomLeft: "\u255a",
    bottomRight: "\u255d",
    horizontal: "\u2550",
    vertical: "\u2551",
  },
  round: {
    topLeft: "\u256d",
    topRight: "\u256e",
    bottomLeft: "\u2570",
    bottomRight: "\u256f",
    horizontal: "\u2500",
    vertical: "\u2502",
  },
  bold: {
    topLeft: "\u250f",
    topRight: "\u2513",
    bottomLeft: "\u2517",
    bottomRight: "\u251b",
    horizontal: "\u2501",
    vertical: "\u2503",
  },
  singleDouble: {
    topLeft: "\u2553",
    topRight: "\u2556",
    bottomLeft: "\u2559",
    bottomRight: "\u255c",
    horizontal: "\u2500",
    vertical: "\u2551",
  },
  doubleSingle: {
    topLeft: "\u2552",
    topRight: "\u2555",
    bottomLeft: "\u2558",
    bottomRight: "\u255b",
    horizontal: "\u2550",
    vertical: "\u2502",
  },
  classic: {
    topLeft: "+",
    topRight: "+",
    bottomLeft: "+",
    bottomRight: "+",
    horizontal: "-",
    vertical: "|",
  },
}

/**
 * Get border characters for a style.
 */
export function getBorderChars(style: BoxProps["borderStyle"]): BorderChars {
  return borders[style ?? "single"]
}

// ============================================================================
// Style Extraction
// ============================================================================

/**
 * Get text style from props.
 */
export function getTextStyle(props: TextProps): Style {
  // Determine underline style: underlineStyle takes precedence over underline boolean
  let underlineStyle: UnderlineStyle | undefined
  if (props.underlineStyle !== undefined) {
    underlineStyle = props.underlineStyle
  } else if (props.underline) {
    underlineStyle = "single"
  }

  return {
    fg: props.color ? parseColor(props.color) : null,
    bg: props.backgroundColor ? parseColor(props.backgroundColor) : null,
    underlineColor: props.underlineColor ? parseColor(props.underlineColor) : null,
    attrs: {
      bold: props.bold,
      dim: props.dim || props.dimColor, // dimColor is Ink compatibility alias
      italic: props.italic,
      underline: props.underline || !!underlineStyle,
      underlineStyle,
      strikethrough: props.strikethrough,
      inverse: props.inverse,
    },
  }
}

// ============================================================================
// Text Width Utilities
// ============================================================================

/**
 * Get text display width (accounting for wide characters and ANSI codes).
 * Uses ANSI-aware width calculation to handle styled text.
 *
 * When a PipelineContext is provided, uses the context's measurer for
 * terminal-capability-aware width calculation. Falls back to the module-level
 * displayWidthAnsi (which reads the scoped measurer or default).
 */
export function getTextWidth(text: string, ctx?: PipelineContext): number {
  if (ctx) return ctx.measurer.displayWidthAnsi(text)
  return displayWidthAnsi(text)
}
