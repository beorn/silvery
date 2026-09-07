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
import { DEFAULT_COLOR_LEVEL, getActiveTheme, type ActiveColorLevel } from "./state"
import { resolveThemeColor } from "@silvery/ansi"
import { monoAttrsForColorString, type MonoAttr } from "@silvery/ansi"
import { builtInBorderPreset } from "@silvery/ag"
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
 *
 * `colorLevel` is the tier of the render this call belongs to — pass
 * `ctx?.colorLevel`. It is an argument rather than module state because a
 * process can render to several terminals with different color support at
 * once; see `state.ts`. Omitted means {@link DEFAULT_COLOR_LEVEL}.
 */
export function parseColor(
  color: string,
  colorLevel: ActiveColorLevel = DEFAULT_COLOR_LEVEL,
): Color {
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
      const c1 = parseColor(args[0]!, colorLevel)
      const c2 = parseColor(args[1]!, colorLevel)
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

  // Future: slash notation for background opacity (e.g. "$fg-link/10") is not yet supported.
  // It would require richer return types to carry opacity alongside the base color.

  // Resolve $token colors against the active theme
  if (color.startsWith("$")) {
    // At monochrome tier, strip all token-resolved colors. Hierarchy is carried
    // by per-token SGR attrs (see getTextStyle → monoAttrsForColorString). The
    // output phase sees `null` and emits SGR 39/49 (terminal default), never
    // an RGB sequence.
    if (colorLevel === "mono") return null
    const resolved = resolveThemeColor(color, getActiveTheme())
    if (resolved && resolved !== color) return parseColor(resolved, colorLevel)
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
  return builtInBorderPreset(style)
}

// ============================================================================
// Style Extraction
// ============================================================================

/**
 * Collect monochrome attrs from a color string (`"$fg-accent"` → `["italic", "bold"]`).
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
export function getTextStyle(
  props: TextProps,
  colorLevel: ActiveColorLevel = DEFAULT_COLOR_LEVEL,
): Style {
  // Determine underline style. Precedence:
  //   1. `underlineStyle` (deprecated, explicit)
  //   2. `underline: "curly" | "double" | ...` (string form of the unified prop)
  //   3. `underline: true` → "single"
  //   4. `underline: false` / undefined → no underline
  let underlineStyle: UnderlineStyle | undefined
  if (props.underlineStyle !== undefined) {
    underlineStyle = props.underlineStyle
  } else if (typeof props.underline === "string") {
    underlineStyle = props.underline
  } else if (props.underline === true) {
    underlineStyle = "single"
  }

  // Start with the user-specified attrs.
  let bold = props.bold
  let dim = props.internal_dim
  let italic = props.italic
  let underline = !!props.underline || !!underlineStyle
  let strikethrough = props.strikethrough
  let inverse = props.inverse
  const overline = !!props.overline

  // Monochrome tier: inject per-token SGR attrs from DEFAULT_MONO_ATTRS. Colors
  // are stripped by parseColor (returns null for $tokens at mono tier). The
  // attrs carry the hierarchy: $fg-accent → italic+bold, $fg-muted → dim,
  // $fg-error → bold+inverse, $fg-link → underline, etc. User-supplied attrs
  // always OR-in.
  if (colorLevel === "mono") {
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
    fg: props.color ? parseColor(props.color, colorLevel) : null,
    bg: props.backgroundColor ? parseColor(props.backgroundColor, colorLevel) : null,
    underlineColor: props.underlineColor ? parseColor(props.underlineColor, colorLevel) : null,
    attrs: {
      bold,
      dim,
      italic,
      underline,
      underlineStyle,
      overline,
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
