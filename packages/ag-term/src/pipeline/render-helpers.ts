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

import { DEFAULT_BG, type Color, type Style, type UnderlineStyle } from "../buffer"
import { getActiveColorLevel, getActiveTheme } from "./state"
import { resolveThemeColor } from "@silvery/ansi"
import { monoAttrsForColorString, type MonoAttr } from "@silvery/ansi"
import type { BoxProps, TextProps } from "@silvery/ag/types"
import { displayWidthAnsi } from "../unicode"
import type { BorderChars, PipelineContext } from "./types"

// Re-export shared layout helpers
export { getBorderSize, getPadding } from "./helpers"

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
 * Blend two RGB colors in sRGB space.
 * Formula: result = c1 * (1 - t) + c2 * t, where t is 0..1.
 * Returns an RGB object with each channel clamped to 0-255.
 */
function blendColors(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return {
    r: Math.round(c1.r * (1 - t) + c2.r * t),
    g: Math.round(c1.g * (1 - t) + c2.g * t),
    b: Math.round(c1.b * (1 - t) + c2.b * t),
  }
}

/**
 * Parse color string to Color type.
 * Supports: mix(c1,c2,amount), $token (theme), named colors, hex (#rgb, #rrggbb), rgb(r,g,b)
 */
export function parseColor(color: string): Color {
  // Inherit: no color — parent's color flows through (like CSS color: inherit).
  // "currentColor" is a CSS synonym — both keywords resolve identically here.
  // For child-cascade purposes, render-phase detects these keywords directly
  // (before parseColor) so the parent's inheritedFg is preserved in children.
  if (color === "inherit" || color === "currentColor") return null

  // Special token: terminal's default background (SGR 49)
  if (color === "$default") return DEFAULT_BG

  // Mix: blend two colors — mix(color1, color2, amount)
  // Amount can be a percentage (e.g. 50%) or a decimal (e.g. 0.5).
  // Both colors are recursively resolved via parseColor (supports theme tokens, hex, named, etc.).
  // Only blends when both colors resolve to RGB objects; returns null if either is null or an ANSI index.
  if (color.startsWith("mix(") && color.endsWith(")")) {
    const inner = color.slice(4, -1)
    // Split on commas, but respect nested parentheses (e.g. rgb(r,g,b) as an argument)
    const args: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "(") depth++
      else if (inner[i] === ")") depth--
      else if (inner[i] === "," && depth === 0) {
        args.push(inner.slice(start, i).trim())
        start = i + 1
      }
    }
    args.push(inner.slice(start).trim())

    if (args.length === 3) {
      const c1 = parseColor(args[0]!)
      const c2 = parseColor(args[1]!)
      const amountStr = args[2]!

      // Parse amount: percentage (e.g. "50%") or decimal (e.g. "0.5")
      let t: number
      if (amountStr.endsWith("%")) {
        t = Number.parseFloat(amountStr.slice(0, -1)) / 100
      } else {
        t = Number.parseFloat(amountStr)
      }

      // Only blend RGB objects; ANSI indices (number) and null cannot be blended
      if (
        c1 !== null &&
        c2 !== null &&
        typeof c1 === "object" &&
        typeof c2 === "object" &&
        !Number.isNaN(t)
      ) {
        return blendColors(c1, c2, Math.max(0, Math.min(1, t)))
      }
      return null
    }
  }

  // Future: slash notation for background opacity (e.g. "$link/10") is not yet supported.
  // It would require richer return types to carry opacity alongside the base color.

  // Resolve $token colors against the active theme
  if (color.startsWith("$")) {
    // At monochrome tier, strip all token-resolved colors. Hierarchy is carried
    // by per-token SGR attrs (see getTextStyle → monoAttrsForColorString). The
    // output phase sees `null` and emits SGR 39/49 (terminal default), never
    // an RGB sequence.
    if (getActiveColorLevel() === "none") return null
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

  // ansi256(N) — 256-color palette index (0-255)
  const ansi256Match = color.match(/^ansi256\s*\(\s*(\d+)\s*\)$/i)
  if (ansi256Match) {
    return Number.parseInt(ansi256Match[1]!, 10)
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
  if (style && typeof style === "object") {
    // Custom border object (Ink compat): map Ink's top/bottom/left/right to
    // silvery's horizontal/vertical format. Supports distinct chars per side.
    const obj = style as Record<string, string>
    const topHorizontal = obj.top ?? obj.horizontal ?? "-"
    const leftVertical = obj.left ?? obj.vertical ?? "|"
    return {
      topLeft: obj.topLeft ?? "+",
      topRight: obj.topRight ?? "+",
      bottomLeft: obj.bottomLeft ?? "+",
      bottomRight: obj.bottomRight ?? "+",
      horizontal: topHorizontal,
      vertical: leftVertical,
      bottomHorizontal: obj.bottom && obj.bottom !== topHorizontal ? obj.bottom : undefined,
      rightVertical: obj.right && obj.right !== leftVertical ? obj.right : undefined,
    }
  }
  return borders[style ?? "single"]
}

// ============================================================================
// Style Extraction
// ============================================================================

/**
 * Collect monochrome attrs from a color string (`"$primary"` → `["bold"]`).
 *
 * At mono tier, `parseColor` strips the color (returns `null`). The hierarchy
 * signal lives in the attrs bag. This helper merges the mapped attrs from
 * `DEFAULT_MONO_ATTRS` into a mutable accumulator. Called per color-carrying
 * prop in `getTextStyle`.
 *
 * No-op when the color is not a `$token` — non-token hex / named colors
 * pass through with no attrs (spec: "apps that hardcoded #FF0000 get nothing").
 */
function collectMonoAttrs(color: string | undefined, into: Set<MonoAttr>): void {
  if (!color) return
  const attrs = monoAttrsForColorString(color, getActiveTheme())
  if (!attrs) return
  for (const a of attrs) into.add(a)
}

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

  // Start with the user-specified attrs.
  let bold = props.bold
  let dim = props.dim || props.dimColor // dimColor is Ink compatibility alias
  let italic = props.italic
  let underline = props.underline || !!underlineStyle
  let strikethrough = props.strikethrough
  let inverse = props.inverse

  // Monochrome tier: inject per-token SGR attrs from DEFAULT_MONO_ATTRS. Colors
  // are stripped by parseColor (returns null for $tokens at mono tier). The
  // attrs carry the hierarchy: $primary → bold, $muted → dim, $error →
  // bold+inverse, $link → underline, etc. User-supplied attrs always OR-in.
  if (getActiveColorLevel() === "none") {
    const monoAttrs = new Set<MonoAttr>()
    collectMonoAttrs(props.color, monoAttrs)
    collectMonoAttrs(props.backgroundColor, monoAttrs)
    if (monoAttrs.has("bold")) bold = true
    if (monoAttrs.has("dim")) dim = true
    if (monoAttrs.has("italic")) italic = true
    if (monoAttrs.has("underline")) {
      underline = true
      if (!underlineStyle) underlineStyle = "single"
    }
    if (monoAttrs.has("strikethrough")) strikethrough = true
    if (monoAttrs.has("inverse")) inverse = true
  }

  return {
    fg: props.color ? parseColor(props.color) : null,
    bg: props.backgroundColor ? parseColor(props.backgroundColor) : null,
    underlineColor: props.underlineColor ? parseColor(props.underlineColor) : null,
    attrs: {
      bold,
      dim,
      italic,
      underline,
      underlineStyle,
      strikethrough,
      inverse,
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
