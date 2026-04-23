/**
 * Color utilities — ANSI color maps, quantization, and theme token defaults.
 *
 * Re-exports from sibling modules (since we're inside @silvery/ansi now).
 */

import type { ColorLevel } from "../types.ts"
import { hexToRgb } from "@silvery/color"

export { hexToRgb }

// Re-export ANSI primitives from sibling module
export { MODIFIERS, FG_COLORS, BG_COLORS, fgFromRgb, bgFromRgb } from "../color-maps.ts"
export type { ColorLevel }

// =============================================================================
// Theme Token Defaults (fallbacks when no theme is provided)
// =============================================================================

/** Default ANSI codes for theme tokens when no theme object is given. */
export const THEME_TOKEN_DEFAULTS: Record<string, number> = {
  primary: 33, // yellow
  secondary: 36, // cyan
  accent: 35, // magenta
  error: 31, // red
  warning: 33, // yellow
  success: 32, // green
  info: 36, // cyan
  muted: 2, // dim (modifier, not color)
  link: 34, // blue + underline
  border: 90, // gray
  surface: 37, // white
}
