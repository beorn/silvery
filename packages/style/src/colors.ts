/**
 * Color utilities — hex parsing, named color map, color quantization.
 *
 * ANSI-specific maps and quantization functions live in @silvery/ansi
 * and are re-exported here for backwards compatibility.
 */

import type { ColorLevel } from "@silvery/ansi"
import { hexToRgb } from "@silvery/color"

// Re-export so existing consumers (style barrel, ag-term, etc.) keep working.
export { hexToRgb }

// Re-export ANSI primitives from @silvery/ansi (canonical location)
export { MODIFIERS, FG_COLORS, BG_COLORS, fgFromRgb, bgFromRgb } from "@silvery/ansi"
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
