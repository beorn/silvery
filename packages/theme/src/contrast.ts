/**
 * WCAG 2.1 contrast checking — compute contrast ratios between colors.
 *
 * Uses the relative luminance formula from WCAG 2.1 to calculate
 * contrast ratios and check AA/AAA compliance levels.
 */

import { hexToRgb } from "./color"

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
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  )
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

  // Round to 2 decimal places for practical use
  const roundedRatio = Math.round(ratio * 100) / 100

  return {
    ratio: roundedRatio,
    aa: roundedRatio >= 4.5,
    aaa: roundedRatio >= 7,
  }
}
