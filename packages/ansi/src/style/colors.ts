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
