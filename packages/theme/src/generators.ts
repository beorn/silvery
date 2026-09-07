/**
 * Palette generators — produce a ColorScheme from various inputs.
 *
 * All generators return a complete ColorScheme (22 fields).
 */

import { brighten } from "@silvery/color"
import { importBase16 as importBase16Internal } from "./import/base16"
import { getSchemeByName } from "./schemes/index"
import type { ColorScheme } from "@silvery/ansi"

// ANSI owns color generation. Re-export its bindings so public imports share
// one implementation rather than preserving a parity-prone copy here.
export { fromColors, assignPrimaryToSlot } from "@silvery/ansi"

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
