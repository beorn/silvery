/**
 * Color manipulation utilities.
 *
 * Re-exports from @silvery/color — the canonical implementation.
 * This module exists to preserve @silvery/theme's public API.
 */

export {
  hexToRgb,
  rgbToHex,
  blend,
  brighten,
  darken,
  contrastFg,
  rgbToHsl,
  hslToHex,
  hexToHsl,
  desaturate,
  complement,
} from "@silvery/color"
export type { HSL } from "@silvery/color"
