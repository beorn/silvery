/**
 * Backdrop fade — core color helpers.
 *
 * This module owns the buffer-cell adapter (`colorToHex`), hex↔rgb
 * conversion (`rgbToHex`, `hexToRgb`), hex normalization (`normalizeHex`),
 * and the structural `HexColor` type alias. Math ops that have an upstream
 * equivalent (`mixSrgb`, `deemphasize`) are imported from `@silvery/color`
 * directly. The local polarity-aware variant lives in `./color-shim.ts`.
 *
 * @see ./color-shim.ts for `deemphasizeOklchToward` (deletion-pending).
 * @see ./plan.ts for the full backdrop color model.
 */

import { ansi256ToRgb, isDefaultBg, type Color } from "../../buffer"

/**
 * Template-literal brand for a canonical 6-digit lowercase hex color.
 *
 * Values of this type have passed through `normalizeHex`, so they are
 * guaranteed to match `/^#[0-9a-f]{6}$/`. Downstream math helpers
 * (`mixSrgb`, `deemphasizeOklch*`) accept plain `string` for upstream
 * compatibility; within the backdrop module we prefer `HexColor` on
 * normalized inputs so TypeScript flags accidental un-normalized passthrough.
 */
export type HexColor = `#${string}`

/** Convert a buffer Color to a `#rrggbb` hex string, or null if unresolvable. */
export function colorToHex(color: Color): HexColor | null {
  if (color === null) return null
  if (typeof color === "number") {
    const rgb = ansi256ToRgb(color)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
  }
  if (isDefaultBg(color)) return null
  return rgbToHex(color.r, color.g, color.b)
}

export function rgbToHex(r: number, g: number, b: number): HexColor {
  const clamp = (n: number): string => {
    const v = Math.max(0, Math.min(255, Math.round(n)))
    return v.toString(16).padStart(2, "0")
  }
  return `#${clamp(r)}${clamp(g)}${clamp(b)}` as HexColor
}

/**
 * Parse `#rrggbb` or `#rgb` (any case, with or without leading `#`) into
 * `{ r, g, b }`. Returns null when the input is not a hex color.
 *
 * Strict character-class validation — `parseInt("0g", 16)` returns `0`
 * silently, which would accept malformed hex values. Regex guard rejects
 * anything outside `[0-9a-f]` regardless of case.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null
  let s = hex.trim().toLowerCase()
  if (s.startsWith("#")) s = s.slice(1)
  if (s.length === 3) {
    if (!/^[0-9a-f]{3}$/.test(s)) return null
    s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!
  } else if (!/^[0-9a-f]{6}$/.test(s)) {
    return null
  }
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  }
}

/**
 * Normalize any permissible hex input to a canonical `#rrggbb` lowercase
 * string. Handles `#abc` → `#aabbcc` expansion, case folding, optional
 * leading `#`, and surrounding whitespace. Returns null when the input is
 * not a hex color.
 *
 * Applied by `buildPlan` to every user-provided color option
 * (`defaultBg`, `defaultFg`, `scrimColor`) exactly once so downstream
 * comparisons (`scrim === defaultBg`, etc.) work regardless of input
 * casing or shorthand.
 */
export function normalizeHex(hex: string | null | undefined): HexColor | null {
  if (hex === null || hex === undefined) return null
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}
