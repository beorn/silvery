/**
 * @silvery/color — Pure color math utilities.
 *
 * Hex/RGB/HSL conversion, blending, contrast checking (WCAG 2.1).
 * Zero dependencies.
 *
 * @example
 * ```ts
 * import { hexToRgb, blend, checkContrast } from "@silvery/color"
 *
 * hexToRgb("#ff0")        // → [255, 255, 0]
 * blend("#000", "#fff", 0.5) // → "#808080"
 * checkContrast("#fff", "#000") // → { ratio: 21, aa: true, aaa: true }
 * ```
 *
 * @module
 */

// Types
export type { HSL, ContrastResult } from "./types.ts"

// Color math — hex/RGB/HSL conversion, blending, lightness
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
} from "./color.ts"

// Contrast checking and enforcement (WCAG 2.1)
export { checkContrast, ensureContrast } from "./contrast.ts"
