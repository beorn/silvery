/**
 * ANSI-slot theme generator.
 *
 * This builds a ColorScheme seed and delegates to the canonical Sterling
 * factory. The generated Theme remains hex-valued; terminal color level is
 * applied only by rendering.
 */

import { ANSI16_SLOT_HEX } from "../color-maps.ts"
import type { AnsiPrimary, ColorScheme, Theme } from "./types.ts"
import { deriveTheme } from "./derive.ts"

function slot(name: string): string {
  const value = ANSI16_SLOT_HEX[name]
  if (value === undefined) {
    throw new Error(
      `ANSI16 theme generation: missing canonical hex for slot ${JSON.stringify(name)}`,
    )
  }
  return value
}

/** Build the complete canonical input; semantic roles belong to Sterling. */
export function generatedAnsi16Scheme(primary: AnsiPrimary, dark: boolean): ColorScheme {
  const primaryHex = slot(primary)
  return {
    name: `${dark ? "dark" : "light"}-${primary}`,
    dark,
    primary: primaryHex,
    black: slot("black"),
    red: slot("red"),
    green: slot("green"),
    yellow: slot("yellow"),
    blue: slot("blue"),
    magenta: slot("magenta"),
    cyan: slot("cyan"),
    white: slot("white"),
    brightBlack: slot("blackBright"),
    brightRed: slot("redBright"),
    brightGreen: slot("greenBright"),
    brightYellow: slot("yellowBright"),
    brightBlue: slot("blueBright"),
    brightMagenta: slot("magentaBright"),
    brightCyan: slot("cyanBright"),
    brightWhite: slot("whiteBright"),
    foreground: slot(dark ? "whiteBright" : "black"),
    background: slot(dark ? "black" : "white"),
    cursorColor: primaryHex,
    cursorText: slot(dark ? "black" : "whiteBright"),
    selectionBackground: primaryHex,
    selectionForeground: slot(dark ? "black" : "whiteBright"),
  }
}

/** Generate a frozen canonical Theme from a standard ANSI16 seed. */
export function generateTheme(primary: AnsiPrimary, dark: boolean): Theme {
  return deriveTheme(generatedAnsi16Scheme(primary, dark))
}
