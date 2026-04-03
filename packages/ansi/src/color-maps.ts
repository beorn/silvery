/**
 * ANSI color maps and RGB-to-ANSI quantization.
 *
 * Provides named color maps (MODIFIERS, FG_COLORS, BG_COLORS) and
 * functions to generate SGR codes from RGB values at any color level.
 *
 * @see https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
 */

import type { ColorLevel } from "./types"

// =============================================================================
// SGR Code Constants
// =============================================================================

/** Modifier SGR codes: open -> close */
export const MODIFIERS: Record<string, [number, number]> = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],
  overline: [53, 55],
}

/** Foreground color name -> ANSI SGR code */
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

/** Background color name -> ANSI SGR code */
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
// Color Quantization (truecolor -> 256 -> 16)
// =============================================================================

/** Standard ANSI 16 color RGB values for nearest-color matching.
 * Uses xterm-256 standard values for consistent mapping (matches chalk/ansi-styles). */
export const ANSI_16_COLORS: Array<[number, number, number]> = [
  [0, 0, 0], // 0: black
  [128, 0, 0], // 1: red
  [0, 128, 0], // 2: green
  [128, 128, 0], // 3: yellow/brown
  [0, 0, 128], // 4: blue
  [128, 0, 128], // 5: magenta
  [0, 128, 128], // 6: cyan
  [192, 192, 192], // 7: white
  [128, 128, 128], // 8: bright black (gray)
  [255, 0, 0], // 9: bright red
  [0, 255, 0], // 10: bright green
  [255, 255, 0], // 11: bright yellow
  [0, 0, 255], // 12: bright blue
  [255, 0, 255], // 13: bright magenta
  [0, 255, 255], // 14: bright cyan
  [255, 255, 255], // 15: bright white
]

/** Find nearest ANSI 16 color index for an RGB value. */
export function nearestAnsi16(r: number, g: number, b: number): number {
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

/** Convert RGB to 256-color index (using the 6x6x6 color cube). */
export function rgbToAnsi256(r: number, g: number, b: number): number {
  // Check if it's a grayscale (r === g === b)
  if (r === g && g === b) {
    if (r < 8) return 16
    if (r > 248) return 231
    return Math.round(((r - 8) / 247) * 24) + 232
  }
  // Map to 6x6x6 cube
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
