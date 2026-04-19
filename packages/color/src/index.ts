/**
 * @silvery/color — Pure color math utilities.
 *
 * OKLCH-native internals with hex-in / hex-out public signatures. OKLCH is
 * perceptually uniform (CSS Color Module 4), so blends, lightness shifts, and
 * hue rotations look correct regardless of starting color.
 *
 * @example
 * ```ts
 * import { blend, brighten, checkContrast, oklch, toHex } from "@silvery/color"
 *
 * blend("#000", "#fff", 0.5)       // OKLCH midpoint (not muddy RGB gray)
 * brighten("#0050A0", 0.1)         // +0.1 OKLCH lightness, same hue
 * checkContrast("#fff", "#000")    // { ratio: 21, aa: true, aaa: true }
 *
 * // Drop into OKLCH directly:
 * const c = oklch("#FF5500")!      // { L, C, H }
 * toHex({ L: c.L, C: c.C, H: (c.H + 30) % 360 })  // 30° hue shift
 * ```
 *
 * @module
 */

// Types
export type { HSL, ContrastResult } from "./types.ts"
export type { OKLCH } from "./oklch.ts"

// Color math — OKLCH-native, hex public API
export {
  hexToRgb,
  rgbToHex,
  blend,
  mixSrgb,
  brighten,
  darken,
  saturate,
  channelLuminance,
  relativeLuminance,
  contrastFg,
  rgbToHsl,
  hslToHex,
  hexToHsl,
  desaturate,
  complement,
  oklch,
  toHex,
  colorDistance,
} from "./color.ts"

// OKLCH primitives — for callers doing their own color math
export {
  hexToOklch,
  oklchToHex,
  lerpOklch,
  lerpOklabHex,
  lerpHue,
  deltaE,
  srgbToLinear,
  linearToSrgb,
  linearRgbToOklab,
  oklabToLinearRgb,
} from "./oklch.ts"

// Contrast checking and enforcement (WCAG 2.1)
export { checkContrast, ensureContrast } from "./contrast.ts"
