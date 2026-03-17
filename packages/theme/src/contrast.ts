/**
 * WCAG 2.1 contrast checking and enforcement.
 *
 * - checkContrast(): measure the ratio between two colors
 * - ensureContrast(): adjust a color until it meets a target ratio
 *
 * Uses the relative luminance formula from WCAG 2.1.
 */

import { hexToRgb, hexToHsl, hslToHex, contrastFg } from "./color"

/** Result of a contrast check between two colors. */
export interface ContrastResult {
  /** The contrast ratio (1:1 to 21:1), expressed as a single number (e.g. 4.5). */
  ratio: number
  /** Whether the ratio meets WCAG AA for normal text (>= 4.5:1). */
  aa: boolean
  /** Whether the ratio meets WCAG AAA for normal text (>= 7:1). */
  aaa: boolean
}

/**
 * Compute relative luminance of an sRGB color channel value (0-255).
 * Per WCAG 2.1: linearize, then weight by standard coefficients.
 */
function channelLuminance(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/**
 * Compute relative luminance of a hex color.
 * Returns a value between 0 (darkest) and 1 (lightest).
 */
function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2])
}

/**
 * Check contrast ratio between foreground and background colors.
 *
 * Uses the WCAG 2.1 relative luminance formula to compute the contrast
 * ratio and check AA (>= 4.5:1) and AAA (>= 7:1) compliance for normal text.
 *
 * @param fg - Foreground hex color (e.g. "#FFFFFF")
 * @param bg - Background hex color (e.g. "#000000")
 * @returns Contrast ratio and AA/AAA pass/fail, or null if colors are not valid hex
 *
 * @example
 * ```typescript
 * const result = checkContrast("#FFFFFF", "#000000")
 * // { ratio: 21, aa: true, aaa: true }
 *
 * const poor = checkContrast("#777777", "#888888")
 * // { ratio: ~1.3, aa: false, aaa: false }
 * ```
 */
export function checkContrast(fg: string, bg: string): ContrastResult | null {
  const fgLum = relativeLuminance(fg)
  const bgLum = relativeLuminance(bg)
  if (fgLum === null || bgLum === null) return null

  const lighter = Math.max(fgLum, bgLum)
  const darker = Math.min(fgLum, bgLum)
  const ratio = (lighter + 0.05) / (darker + 0.05)

  // Use exact ratio for conformance decisions (WCAG: don't round up).
  // Round for display only.
  const displayRatio = Math.round(ratio * 100) / 100

  return {
    ratio: displayRatio,
    aa: ratio >= 4.5,
    aaa: ratio >= 7,
  }
}

/**
 * Adjust a color's lightness until it meets a minimum contrast ratio
 * against a reference color. Preserves hue and saturation — only
 * lightness is shifted, and only as much as needed.
 *
 * Returns the original color unchanged if it already meets the target.
 *
 * @param color - The color to adjust (hex)
 * @param against - The reference background color (hex)
 * @param minRatio - Minimum contrast ratio to achieve (e.g. 4.5 for AA)
 * @returns Adjusted hex color meeting the target, or original if already OK
 *
 * For impossible targets (e.g. 21:1 against mid-gray), returns the
 * best achievable color (near-black or near-white in the same hue).
 *
 * @example
 * ```typescript
 * // Yellow on white — too low contrast, gets darkened
 * ensureContrast("#FFAB91", "#FFFFFF", 4.5)  // → "#B35600" (darker orange)
 *
 * // Blue on dark bg — already fine, returned unchanged
 * ensureContrast("#5C9FFF", "#1A1A2E", 4.5)  // → "#5C9FFF"
 * ```
 */
export function ensureContrast(color: string, against: string, minRatio: number): string {
  const current = checkContrast(color, against)
  if (!current) return color // non-hex input — return unchanged
  if (current.ratio >= minRatio) return color

  const hsl = hexToHsl(color)
  if (!hsl) return color
  const [h, s] = hsl

  // Light bg → darken (decrease L), dark bg → lighten (increase L)
  const lightBg = contrastFg(against) === "#000000"

  // Binary search for the minimum lightness shift that achieves the target.
  // lo/hi bracket the L range to search within.
  let lo: number, hi: number
  if (lightBg) {
    lo = 0 // maximum darkening
    hi = hsl[2] // current lightness
  } else {
    lo = hsl[2] // current lightness
    hi = 1 // maximum lightening
  }

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const candidate = hslToHex(h, s, mid)
    const r = checkContrast(candidate, against)
    if (!r) break
    if (lightBg) {
      // Lower L = more contrast. Find highest L that still passes.
      if (r.ratio >= minRatio) lo = mid
      else hi = mid
    } else {
      // Higher L = more contrast. Find lowest L that still passes.
      if (r.ratio >= minRatio) hi = mid
      else lo = mid
    }
  }

  return hslToHex(h, s, lightBg ? lo : hi)
}
