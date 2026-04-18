/**
 * Auto-generate themes — create a complete Theme from a single primary color.
 *
 * Uses HSL color manipulation to derive complementary and analogous colors
 * for the full palette from one input color.
 */

import { hexToHsl, hslToHex, blend } from "./color"
import { fromColors } from "./generators"
import { deriveTheme } from "./derive"
import type { Theme } from "./types"

/**
 * Generate a complete Theme from a single primary color.
 *
 * Derives a full ColorScheme using HSL color manipulation:
 * - Background/foreground from lightness inversion
 * - Complementary and analogous accent colors from hue rotation
 * - Surface ramp from background blending
 * - Status colors (error, warning, success, info) from standard hue positions
 *
 * @param primaryColor - A hex color string (e.g. "#5E81AC")
 * @param mode - "dark" or "light" theme mode
 * @returns A complete Theme with all 33 semantic tokens
 *
 * @example
 * ```typescript
 * const theme = autoGenerateTheme("#5E81AC", "dark")
 * // Generates a full dark theme with blue as the primary accent
 *
 * const light = autoGenerateTheme("#E06C75", "light")
 * // Generates a full light theme with red/rose as the primary accent
 * ```
 */
export function autoGenerateTheme(primaryColor: string, mode: "dark" | "light"): Theme {
  const hsl = hexToHsl(primaryColor)
  if (!hsl) {
    // Fallback: use default colors if input is not valid hex
    const palette = fromColors({ dark: mode === "dark" })
    return deriveTheme(palette)
  }

  const [h, s] = hsl
  const dark = mode === "dark"

  // Generate background and foreground based on mode
  const bgL = dark ? 0.12 : 0.97
  const fgL = dark ? 0.87 : 0.13
  // Use low saturation for bg/fg to keep them neutral
  const bgS = Math.min(s, 0.15)
  const bg = hslToHex(h, bgS, bgL)
  const fg = hslToHex(h, bgS * 0.5, fgL)

  // Generate accent colors from hue rotations
  // Standard hue positions for semantic colors
  const redHue = 0
  const yellowHue = 45
  const greenHue = 130
  const cyanHue = 185
  const blueHue = 220
  const magentaHue = 300

  // Use the primary's saturation and adjust lightness for the mode
  const accentL = dark ? 0.65 : 0.45
  const accentS = Math.max(s, 0.5) // Ensure accents are reasonably saturated

  const red = hslToHex(redHue, accentS, accentL)
  const green = hslToHex(greenHue, accentS, accentL)
  const yellow = hslToHex(yellowHue, accentS, accentL)
  const blue = hslToHex(blueHue, accentS, accentL)
  const magenta = hslToHex(magentaHue, accentS, accentL)
  const cyan = hslToHex(cyanHue, accentS, accentL)

  // Bright variants: increase lightness slightly
  const brightOffset = dark ? 0.1 : -0.1
  const brightL = accentL + brightOffset
  const brightRed = hslToHex(30, accentS, brightL) // orange-ish
  const brightGreen = hslToHex(greenHue, accentS, brightL)
  const brightYellow = hslToHex(yellowHue, accentS, brightL)
  const brightBlue = hslToHex(blueHue, accentS, brightL)
  const brightMagenta = hslToHex(330, accentS, brightL) // pink-ish
  const brightCyan = hslToHex(cyanHue, accentS, brightL)

  // Surface colors from background
  const black = dark ? hslToHex(h, bgS, bgL * 0.7) : hslToHex(h, bgS, bgL * 0.92)
  const white = dark ? hslToHex(h, bgS * 0.3, 0.6) : hslToHex(h, bgS * 0.3, 0.35)
  const brightBlack = dark ? hslToHex(h, bgS, bgL + 0.08) : hslToHex(h, bgS, bgL - 0.08)
  const brightWhite = dark ? fg : hslToHex(h, bgS * 0.5, fgL - 0.05)

  const palette = {
    name: `generated-${mode}`,
    dark,
    primary: primaryColor,
    black,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,
    brightBlack,
    brightRed,
    brightGreen,
    brightYellow,
    brightBlue,
    brightMagenta,
    brightCyan,
    brightWhite,
    foreground: fg,
    background: bg,
    cursorColor: fg,
    cursorText: bg,
    selectionBackground: blend(bg, primaryColor, 0.3),
    selectionForeground: fg,
  }

  // Primary seed is on the palette — deriveTheme() uses it directly,
  // ensuring contrast and deriving secondary/accent consistently.
  return deriveTheme(palette)
}
