/**
 * Color utilities — hex parsing, named color map, color quantization.
 *
 * Handles conversion between hex, RGB, and ANSI color codes,
 * plus degradation from truecolor → 256 → 16 for basic terminals.
 */

import type { ColorLevel } from "@silvery/ansi"
import { hexToRgb } from "@silvery/color"

// Re-export so existing consumers (style barrel, ag-term, etc.) keep working.
export { hexToRgb }

// =============================================================================
// SGR Code Constants
// =============================================================================

/** Modifier SGR codes: open → close */
export const MODIFIERS: Record<string, [number, number]> = {
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],
}

/** Foreground color name → ANSI SGR code */
export const FG_COLORS: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  blackBright: 90,
  gray: 90,
  grey: 90,
  redBright: 91,
  greenBright: 92,
  yellowBright: 93,
  blueBright: 94,
  magentaBright: 95,
  cyanBright: 96,
  whiteBright: 97,
}

/** Background color name → ANSI SGR code */
export const BG_COLORS: Record<string, number> = {
  bgBlack: 40,
  bgRed: 41,
  bgGreen: 42,
  bgYellow: 43,
  bgBlue: 44,
  bgMagenta: 45,
  bgCyan: 46,
  bgWhite: 47,
  bgBlackBright: 100,
  bgGray: 100,
  bgGrey: 100,
  bgRedBright: 101,
  bgGreenBright: 102,
  bgYellowBright: 103,
  bgBlueBright: 104,
  bgMagentaBright: 105,
  bgCyanBright: 106,
  bgWhiteBright: 107,
}

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

// =============================================================================
// Color Quantization (truecolor → 256 → 16)
// =============================================================================

/** Standard ANSI 16 color RGB values for nearest-color matching. */
const ANSI_16_COLORS: Array<[number, number, number]> = [
  [0, 0, 0], // 0: black
  [170, 0, 0], // 1: red
  [0, 170, 0], // 2: green
  [170, 85, 0], // 3: yellow/brown
  [0, 0, 170], // 4: blue
  [170, 0, 170], // 5: magenta
  [0, 170, 170], // 6: cyan
  [170, 170, 170], // 7: white
  [85, 85, 85], // 8: bright black (gray)
  [255, 85, 85], // 9: bright red
  [85, 255, 85], // 10: bright green
  [255, 255, 85], // 11: bright yellow
  [85, 85, 255], // 12: bright blue
  [255, 85, 255], // 13: bright magenta
  [85, 255, 255], // 14: bright cyan
  [255, 255, 255], // 15: bright white
]

/** Find nearest ANSI 16 color index for an RGB value. */
function nearestAnsi16(r: number, g: number, b: number): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < 16; i++) {
    const [cr, cg, cb] = ANSI_16_COLORS[i]!
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  return bestIdx
}

/** Convert RGB to 256-color index (using the 6×6×6 color cube). */
function rgbToAnsi256(r: number, g: number, b: number): number {
  // Check if it's a grayscale (r ≈ g ≈ b)
  if (r === g && g === b) {
    if (r < 8) return 16
    if (r > 248) return 231
    return Math.round(((r - 8) / 247) * 24) + 232
  }
  // Map to 6×6×6 cube
  const ri = Math.round((r / 255) * 5)
  const gi = Math.round((g / 255) * 5)
  const bi = Math.round((b / 255) * 5)
  return 16 + 36 * ri + 6 * gi + bi
}

/**
 * Generate SGR foreground code for an RGB color at the given color level.
 * Returns the SGR parameter string (e.g., "31" or "38;5;196" or "38;2;255;0;0").
 */
export function fgFromRgb(r: number, g: number, b: number, level: ColorLevel): string {
  if (level === "truecolor") return `38;2;${r};${g};${b}`
  if (level === "256") return `38;5;${rgbToAnsi256(r, g, b)}`
  // basic: map to ANSI 16
  const idx = nearestAnsi16(r, g, b)
  return idx < 8 ? `${30 + idx}` : `${82 + idx}` // 90-97 for bright
}

/**
 * Generate SGR background code for an RGB color at the given color level.
 */
export function bgFromRgb(r: number, g: number, b: number, level: ColorLevel): string {
  if (level === "truecolor") return `48;2;${r};${g};${b}`
  if (level === "256") return `48;5;${rgbToAnsi256(r, g, b)}`
  const idx = nearestAnsi16(r, g, b)
  return idx < 8 ? `${40 + idx}` : `${92 + idx}` // 100-107 for bright
}
