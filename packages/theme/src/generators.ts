/**
 * Palette generators — produce a ColorScheme from various inputs.
 *
 * All generators return a complete ColorScheme (22 fields).
 */

import { hexToOklch, oklchToHex, brighten, darken, blend, relativeLuminance } from "@silvery/color"
import { importBase16 as importBase16Internal } from "./import/base16"
import { getSchemeByName } from "./schemes/index"
import type { ColorScheme, HueName } from "@silvery/ansi"

// ============================================================================
// Luminance
// ============================================================================

function isDarkColor(hex: string): boolean {
  const L = relativeLuminance(hex)
  return L === null ? true : L < 0.5
}

// ============================================================================
// Accent Generation
// ============================================================================

/**
 * Target hues for each accent slot, in OKLCH degrees.
 * OKLCH hues differ from HSL — red ≈ 29, green ≈ 142, blue ≈ 264. Calibrated
 * per Ottosson's reference ramps for perceptually-uniform accent generation.
 */
const targetHues: Record<HueName, number> = {
  red: 29,
  orange: 55,
  yellow: 90,
  green: 142,
  teal: 195,
  blue: 240,
  purple: 305,
  pink: 350,
}

/** Find which hue slot the primary color best matches by OKLCH hue angle proximity. */
export function assignPrimaryToSlot(primary: string): HueName {
  const o = hexToOklch(primary)
  if (!o) return "blue"
  const h = o.H
  const slots: [number, number, HueName][] = [
    [0, 15, "red"],
    [15, 42, "orange"],
    [42, 75, "yellow"],
    [75, 170, "green"],
    [170, 210, "teal"],
    [210, 275, "blue"],
    [275, 330, "purple"],
    [330, 360, "pink"],
  ]
  for (const [lo, hi, name] of slots) {
    if (h >= lo && h < hi) return name
  }
  // Fallback: red band wraps around 0 — anything >345 or <15 is red.
  return "red"
}

/** Generate 8 accent hues from a primary, placing it in its natural slot. */
function generateAccentsFromPrimary(primary: string): Record<HueName, string> {
  const o = hexToOklch(primary)
  if (!o) {
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
  const slot = assignPrimaryToSlot(primary)
  const result = {} as Record<HueName, string>
  for (const [name, targetH] of Object.entries(targetHues) as [HueName, number][]) {
    // Hue rotation in OKLCH preserves L + C so all accents have equal
    // perceived lightness and colorfulness — the defining property of a
    // visually-balanced accent ramp.
    result[name] = name === slot ? primary : oklchToHex({ L: o.L, C: o.C, H: targetH })
  }
  return result
}

// ============================================================================
// fromBase16 — Base16 YAML → ColorScheme
// ============================================================================

/**
 * Generate a ColorScheme from a Base16 YAML scheme.
 *
 * Maps base00–base0F to ANSI palette colors, derives special colors.
 */
export function fromBase16(yamlOrJson: string): ColorScheme {
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
 * Generate a full ColorScheme from 1-3 hex colors.
 *
 * At minimum, provide `background` or `primary`. Missing colors are
 * generated via surface ramp (from bg) and hue rotation (from primary).
 */
export function fromColors(opts: FromColorsOptions): ColorScheme {
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
    primary: opts.primary,
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
// fromPreset — Look up a built-in ColorScheme by name
// ============================================================================

/**
 * Look up a built-in palette by name.
 *
 * @returns The ColorScheme, or undefined if not found.
 */
export function fromPreset(name: string): ColorScheme | undefined {
  return getSchemeByName(name)
}

// ============================================================================
// ThemePalette → ColorScheme conversion (migration helper)
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
 * Convert an old ThemePalette to a ColorScheme.
 *
 * Mapping:
 *   black = crust, red/green/yellow/blue = direct, magenta = purple,
 *   cyan = teal, white = subtext, brightBlack = surface,
 *   brightRed = orange, bright{green,yellow,blue,cyan} = brighten(normal),
 *   brightMagenta = pink, brightWhite = text,
 *   foreground = text, background = base,
 *   cursor = text/base, selection = overlay/text.
 */
export function themePaletteToColorScheme(p: OldThemePalette): ColorScheme {
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
