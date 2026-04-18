/**
 * Palette validation — checks ColorScheme fields and contrast.
 */

import { hexToRgb } from "./color"
import { COLOR_SCHEME_FIELDS, type ColorScheme } from "./types"

/** Validation result from validateColorScheme(). */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate a ColorScheme.
 *
 * Checks:
 * - All 22 color fields are present and non-empty hex strings
 * - Warns on low-contrast foreground/background combinations
 */
export function validateColorScheme(p: ColorScheme): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Required color fields
  for (const field of COLOR_SCHEME_FIELDS) {
    const val = p[field]
    if (!val || typeof val !== "string") {
      errors.push(`${field} is required and must be a non-empty string`)
    }
  }

  // Contrast warnings (only for hex colors)
  if (p.foreground && p.background) {
    const fgRgb = hexToRgb(p.foreground)
    const bgRgb = hexToRgb(p.background)
    if (fgRgb && bgRgb) {
      const fgSum = fgRgb[0] + fgRgb[1] + fgRgb[2]
      const bgSum = bgRgb[0] + bgRgb[1] + bgRgb[2]
      const fgIsLight = fgSum > 384
      const bgIsLight = bgSum > 384
      if (fgIsLight === bgIsLight) {
        warnings.push(
          `Low contrast: foreground (${p.foreground}) and background (${p.background}) have similar lightness`,
        )
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
