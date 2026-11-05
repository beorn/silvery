/**
 * Auto-generate themes — create a complete Theme from a single primary color.
 *
 * Uses OKLCH color manipulation to derive complementary and analogous colors
 * for the full palette from one input color. OKLCH preserves perceived
 * lightness and chroma across hue rotations, so accent ramps look balanced.
 */

import { hexToOklch, oklchToHex, blend } from "@silvery/color"
import { fromColors } from "./generators"
import { deriveTheme } from "@silvery/ansi"
import type { Theme } from "@silvery/ansi"

/** Standard OKLCH hue positions for semantic accents (degrees).
 * OKLCH hues differ from HSL: red≈29, orange≈55, yellow≈90, green≈142,
 * teal≈195, blue≈240, purple≈305, pink≈350. Calibrated against Ottosson's
 * reference ramps. */
const HUE = {
  red: 29,
  orangeBright: 55,
  yellow: 90,
  green: 142,
  cyan: 195,
  blue: 240,
  magenta: 310,
  pinkBright: 350,
} as const

/**
 * Generate a complete Theme from a single primary color.
 *
 * Derives a full ColorScheme using OKLCH color manipulation:
 * - Background/foreground from lightness endpoints using the primary's hue
 * - Complementary and analogous accent colors from hue rotation
 * - Surface ramp from bg lightness offsets
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
  const o = hexToOklch(primaryColor)
  if (!o) {
    // Fallback: use default colors if input is not valid hex
    const palette = fromColors({ dark: mode === "dark" })
    return deriveTheme(palette)
  }

  const dark = mode === "dark"

  // Background and foreground — use the primary's hue at low chroma for subtle
  // tinting, OKLCH L endpoints calibrated perceptually.
  const bgL = dark ? 0.22 : 0.96
  const fgL = dark ? 0.9 : 0.2
  const bgC = Math.min(o.C, 0.03) // keep bg chroma low — it's a neutral
  const bg = oklchToHex({ L: bgL, C: bgC, H: o.H })
  const fg = oklchToHex({ L: fgL, C: bgC * 0.5, H: o.H })

  // Accent ring — same L and C as primary, different H. Preserves perceived
  // weight across the ramp so no one color pops more than another.
  const accentL = dark ? 0.72 : 0.52
  const accentC = Math.max(o.C, 0.1) // ensure accents are vivid enough
  const accent = (h: number) => oklchToHex({ L: accentL, C: accentC, H: h })

  const red = accent(HUE.red)
  const green = accent(HUE.green)
  const yellow = accent(HUE.yellow)
  const blue = accent(HUE.blue)
  const magenta = accent(HUE.magenta)
  const cyan = accent(HUE.cyan)

  // Bright variants — shift L by ±0.08 in the appropriate direction.
  const brightL = accentL + (dark ? 0.1 : -0.1)
  const brightAccent = (h: number) => oklchToHex({ L: brightL, C: accentC, H: h })

  const brightRed = brightAccent(HUE.orangeBright)
  const brightGreen = brightAccent(HUE.green)
  const brightYellow = brightAccent(HUE.yellow)
  const brightBlue = brightAccent(HUE.blue)
  const brightMagenta = brightAccent(HUE.pinkBright)
  const brightCyan = brightAccent(HUE.cyan)

  // Surface ramp — neutral grays at the bg's hue
  const black = oklchToHex({ L: dark ? bgL * 0.7 : bgL * 0.92, C: bgC, H: o.H })
  const white = oklchToHex({ L: dark ? 0.6 : 0.35, C: bgC * 0.3, H: o.H })
  const brightBlack = oklchToHex({ L: dark ? bgL + 0.1 : bgL - 0.08, C: bgC, H: o.H })
  const brightWhite = dark ? fg : oklchToHex({ L: fgL - 0.05, C: bgC * 0.5, H: o.H })

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
