/**
 * Color manipulation utilities.
 *
 * Operates in OKLCH for perceptual uniformity — hue rotations look right,
 * lightness changes feel linear, chroma is preserved. sRGB hex is the
 * serialization format; everything else happens in OKLCH.
 *
 * Public API stays hex-in, hex-out — callers never see OKLCH unless they
 * opt in via `oklch()` / `toHex()`. For non-hex input (ANSI names like
 * `"red"`), operations pass through unchanged so accidental misuse is
 * visible without crashing styled output.
 */

import type { HSL } from "./types.ts"
import type { OKLCH } from "./oklch.ts"
import { hexToOklch, oklchToHex, lerpOklch, lerpOklabHex, deltaE as oklchDeltaE } from "./oklch.ts"

// ============================================================================
// Hex ↔ RGB Parsing
// ============================================================================

/** Parse #rrggbb or #rgb to [r, g, b]. Returns null for invalid input. */
export function hexToRgb(hex: string): [number, number, number] | null {
  if (hex[0] !== "#") return null
  const h = hex.slice(1)
  if (h.length === 3) {
    return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)]
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  return null
}

/** Convert [r, g, b] (0-255) to hex string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`.toUpperCase()
}

// ============================================================================
// OKLCH entry points (convenience aliases)
// ============================================================================

/** Parse a hex color into OKLCH. Returns null for non-hex input. */
export function oklch(hex: string): OKLCH | null {
  return hexToOklch(hex)
}

/** Serialize OKLCH → hex. Gamut-maps by reducing chroma if out-of-sRGB. */
export function toHex(c: OKLCH): string {
  return oklchToHex(c)
}

// ============================================================================
// Color Manipulation — OKLCH-native
// ============================================================================

/**
 * Blend two hex colors in OKLab space. t=0 returns a, t=1 returns b.
 * Perceptually-uniform midpoints (unlike naive RGB blending which produces
 * muddy halfway colors).
 *
 * Interpolation is done in OKLab (rectangular a/b), not OKLCH (polar). This
 * matches CSS Color Module 4's default interpolation space and avoids hue-arc
 * weirdness when one endpoint is near-neutral (its hue is effectively
 * undefined). For explicit hue-rotation blending, use `lerpOklch` directly.
 *
 * For non-hex inputs (ANSI names), returns `a` unchanged.
 */
export function blend(a: string, b: string, t: number): string {
  return lerpOklabHex(a, b, t) ?? a
}

/**
 * Brighten a hex color by raising OKLCH lightness. amount=0.1 adds 0.1 to L
 * (perceptually linear — 10% brighter looks 10% brighter regardless of hue).
 *
 * For non-hex inputs, returns the color unchanged.
 */
export function brighten(color: string, amount: number): string {
  const o = hexToOklch(color)
  if (!o) return color
  return oklchToHex({ L: Math.min(1, o.L + amount), C: o.C, H: o.H })
}

/**
 * Darken a hex color by lowering OKLCH lightness. amount=0.1 subtracts 0.1 from L.
 *
 * For non-hex inputs, returns the color unchanged.
 */
export function darken(color: string, amount: number): string {
  const o = hexToOklch(color)
  if (!o) return color
  return oklchToHex({ L: Math.max(0, o.L - amount), C: o.C, H: o.H })
}

/**
 * Saturate a hex color by raising OKLCH chroma. amount=0.05 adds 0.05 to C.
 * Gamut mapping in `toHex` clamps impossible chroma back to the sRGB-visible max.
 *
 * For non-hex inputs, returns the color unchanged.
 */
export function saturate(color: string, amount: number): string {
  const o = hexToOklch(color)
  if (!o) return color
  return oklchToHex({ L: o.L, C: Math.max(0, o.C + amount), H: o.H })
}

/**
 * Desaturate a hex color by lowering OKLCH chroma. amount=0.4 reduces C by 40%
 * (relative — consistent with the original HSL-based contract). For a flat
 * subtraction, use `saturate(color, -amount)`.
 *
 * For non-hex inputs, returns the color unchanged.
 */
export function desaturate(color: string, amount: number): string {
  const o = hexToOklch(color)
  if (!o) return color
  return oklchToHex({ L: o.L, C: Math.max(0, o.C * (1 - amount)), H: o.H })
}

/**
 * Get the complementary color (180° hue rotation) in OKLCH. Preserves L + C,
 * so the complement has the same perceived brightness and colorfulness.
 *
 * For non-hex inputs, returns the color unchanged.
 */
export function complement(color: string): string {
  const o = hexToOklch(color)
  if (!o) return color
  return oklchToHex({ L: o.L, C: o.C, H: (o.H + 180) % 360 })
}

/** Perceptual color distance (ΔE) between two hex colors, in OKLCH. */
export function colorDistance(a: string, b: string): number | null {
  const oa = hexToOklch(a)
  const ob = hexToOklch(b)
  if (!oa || !ob) return null
  return oklchDeltaE(oa, ob)
}

// ============================================================================
// Luminance (WCAG 2.1)
// ============================================================================

/**
 * Linearize an sRGB channel value (0-255) for WCAG 2.1 luminance.
 * Kept for WCAG contrast checking — OKLCH uses its own linearization.
 */
export function channelLuminance(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/**
 * Compute relative luminance of a hex color per WCAG 2.1.
 * Returns a value between 0 (darkest) and 1 (lightest), or null for invalid input.
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  )
}

/**
 * Pick black or white text for readability on the given background.
 * Uses WCAG 2.1 relative luminance.
 */
export function contrastFg(bg: string): "#000000" | "#FFFFFF" {
  const luminance = relativeLuminance(bg)
  if (luminance === null) return "#FFFFFF" // default to white for non-hex
  return luminance > 0.179 ? "#000000" : "#FFFFFF"
}

// ============================================================================
// HSL Utilities — kept for serialization compatibility (HSL is NOT the color math engine)
// ============================================================================

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255)
}

export function hexToHsl(hex: string): HSL | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToHsl(rgb[0], rgb[1], rgb[2])
}
