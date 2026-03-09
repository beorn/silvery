/**
 * Palette generators — produce a ColorPalette from various inputs.
 *
 * All generators return a complete ColorPalette (22 fields).
 */

import { hexToRgb, hexToHsl, hslToHex, brighten, darken, blend } from "./color"
import { importBase16 as importBase16Internal } from "./import/base16"
import { getPaletteByName } from "./palettes/index"
import type { ColorPalette, HueName } from "./types"

// ============================================================================
// Luminance
// ============================================================================

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.5
  return (rgb[0] + rgb[1] + rgb[2]) / (255 * 3)
}

function isDarkColor(hex: string): boolean {
  return luminance(hex) < 0.5
}

// ============================================================================
// Accent Generation
// ============================================================================

/** Target hues for each accent slot. */
const targetHues: Record<HueName, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  teal: 180,
  blue: 220,
  purple: 280,
  pink: 330,
}

/** Find which hue slot the primary color best matches by hue angle proximity. */
export function assignPrimaryToSlot(primary: string): HueName {
  const hsl = hexToHsl(primary)
  if (!hsl) return "blue"
  const h = hsl[0]
  const slots: [number, number, HueName][] = [
    [0, 15, "red"],
    [15, 45, "orange"],
    [45, 75, "yellow"],
    [75, 165, "green"],
    [165, 200, "teal"],
    [200, 260, "blue"],
    [260, 310, "purple"],
    [310, 345, "pink"],
    [345, 360, "red"],
  ]
  for (const [lo, hi, name] of slots) {
    if (h >= lo && h < hi) return name
  }
  return "blue"
}

/** Generate 8 accent hues from a primary, placing it in its natural slot. */
function generateAccentsFromPrimary(primary: string): Record<HueName, string> {
  const hsl = hexToHsl(primary)
  if (!hsl) {
    return {
      red: "#BF616A",
      orange: "#D08770",
      yellow: "#EBCB8B",
      green: "#A3BE8C",
      teal: "#88C0D0",
      blue: "#5E81AC",
      purple: "#B48EAD",
      pink: "#D4879C",
    }
  }
  const [, s, l] = hsl
  const slot = assignPrimaryToSlot(primary)
  const result = {} as Record<HueName, string>
  for (const [name, targetH] of Object.entries(targetHues) as [HueName, number][]) {
    result[name] = name === slot ? primary : hslToHex(targetH, s, l)
  }
  return result
}

// ============================================================================
// fromBase16 — Base16 YAML → ColorPalette
// ============================================================================

/**
 * Generate a ColorPalette from a Base16 YAML scheme.
 *
 * Maps base00–base0F to ANSI palette colors, derives special colors.
 */
export function fromBase16(yamlOrJson: string): ColorPalette {
  return importBase16Internal(yamlOrJson)
}

// ============================================================================
// fromColors — Generate full palette from 1-3 hex colors
// ============================================================================

interface FromColorsOptions {
  /** Background color (infers dark/light). */
  background?: string
  /** Foreground/text color. Generated if omitted. */
  foreground?: string
  /** Primary accent color. Generated if omitted. */
  primary?: string
  /** Force dark mode. */
  dark?: boolean
  /** Theme name. */
  name?: string
}

/**
 * Generate a full ColorPalette from 1-3 hex colors.
 *
 * At minimum, provide `background` or `primary`. Missing colors are
 * generated via surface ramp (from bg) and hue rotation (from primary).
 */
export function fromColors(opts: FromColorsOptions): ColorPalette {
  const dark = opts.dark ?? (opts.background ? isDarkColor(opts.background) : true)
  const step = dark ? brighten : darken

  // Generate background if not provided
  const bg = opts.background ?? (dark ? "#2E3440" : "#FFFFFF")
  const fg = opts.foreground ?? step(bg, 0.85)

  // Generate accents from primary or defaults
  const accents = opts.primary
    ? generateAccentsFromPrimary(opts.primary)
    : {
        red: "#BF616A",
        orange: "#D08770",
        yellow: "#EBCB8B",
        green: "#A3BE8C",
        teal: "#88C0D0",
        blue: "#5E81AC",
        purple: "#B48EAD",
        pink: "#D4879C",
      }

  // Surface ramp for grayscale ANSI colors
  const black = dark ? darken(bg, 0.05) : darken(bg, 0.1)
  const white = dark ? blend(fg, bg, 0.3) : blend(bg, fg, 0.3)
  const brightBlack = step(bg, 0.15)
  const brightWhite = dark ? fg : brighten(fg, 0.1)

  return {
    name: opts.name ?? (dark ? "generated-dark" : "generated-light"),
    dark,
    black,
    red: accents.red,
    green: accents.green,
    yellow: accents.yellow,
    blue: accents.blue,
    magenta: accents.purple,
    cyan: accents.teal,
    white,
    brightBlack,
    brightRed: accents.orange,
    brightGreen: brighten(accents.green, 0.15),
    brightYellow: brighten(accents.yellow, 0.15),
    brightBlue: brighten(accents.blue, 0.15),
    brightMagenta: accents.pink,
    brightCyan: brighten(accents.teal, 0.15),
    brightWhite,
    foreground: fg,
    background: bg,
    cursorColor: fg,
    cursorText: bg,
    selectionBackground: blend(bg, accents.blue, 0.3),
    selectionForeground: fg,
  }
}

// ============================================================================
// fromPreset — Look up a built-in ColorPalette by name
// ============================================================================

/**
 * Look up a built-in palette by name.
 *
 * @returns The ColorPalette, or undefined if not found.
 */
export function fromPreset(name: string): ColorPalette | undefined {
  return getPaletteByName(name)
}

// ============================================================================
// ThemePalette → ColorPalette conversion (migration helper)
// ============================================================================

/** Old ThemePalette shape for migration. */
interface OldThemePalette {
  name: string
  dark: boolean
  crust: string
  base: string
  surface: string
  overlay: string
  subtext: string
  text: string
  red: string
  orange: string
  yellow: string
  green: string
  teal: string
  blue: string
  purple: string
  pink: string
}

/**
 * Convert an old ThemePalette to a ColorPalette.
 *
 * Mapping:
 *   black = crust, red/green/yellow/blue = direct, magenta = purple,
 *   cyan = teal, white = subtext, brightBlack = surface,
 *   brightRed = orange, bright{green,yellow,blue,cyan} = brighten(normal),
 *   brightMagenta = pink, brightWhite = text,
 *   foreground = text, background = base,
 *   cursor = text/base, selection = overlay/text.
 */
export function themePaletteToColorPalette(p: OldThemePalette): ColorPalette {
  return {
    name: p.name,
    dark: p.dark,
    black: p.crust,
    red: p.red,
    green: p.green,
    yellow: p.yellow,
    blue: p.blue,
    magenta: p.purple,
    cyan: p.teal,
    white: p.subtext,
    brightBlack: p.surface,
    brightRed: p.orange,
    brightGreen: brighten(p.green, 0.15),
    brightYellow: brighten(p.yellow, 0.15),
    brightBlue: brighten(p.blue, 0.15),
    brightMagenta: p.pink,
    brightCyan: brighten(p.teal, 0.15),
    brightWhite: p.text,
    foreground: p.text,
    background: p.base,
    cursorColor: p.text,
    cursorText: p.base,
    selectionBackground: p.overlay,
    selectionForeground: p.text,
  }
}
