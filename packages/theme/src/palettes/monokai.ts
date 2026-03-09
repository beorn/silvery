/**
 * Monokai palettes — the iconic syntax highlighting theme.
 * Classic source: Sublime Text default (Wimer Hazenberg, 2006)
 * Pro source: https://monokai.pro/ (default "Pro" filter)
 */

import type { ColorPalette } from "../types"
import { brighten } from "../color"

/** Monokai Classic — the original Sublime Text Monokai colors. */
export const monokai: ColorPalette = {
  name: "monokai",
  dark: true,
  black: "#1a1a1a", // darker than bg
  red: "#F92672", // keywords/pink-red
  green: "#A6E22E", // functions
  yellow: "#E6DB74", // strings
  blue: "#66D9EF", // classic Monokai has no distinct blue; cyan doubles
  magenta: "#AE81FF", // numbers/constants
  cyan: "#66D9EF", // types/builtins (cyan)
  white: "#a59f85", // muted text (between comments and fg)
  brightBlack: "#3e3d32", // line highlight
  brightRed: "#FD971F", // parameters/constants
  brightGreen: brighten("#A6E22E", 0.15),
  brightYellow: brighten("#E6DB74", 0.15),
  brightBlue: brighten("#66D9EF", 0.15),
  brightMagenta: "#F92672", // classic Monokai pink == red
  brightCyan: brighten("#66D9EF", 0.15),
  brightWhite: "#F8F8F2", // foreground
  foreground: "#F8F8F2", // foreground
  background: "#272822", // classic Monokai background
  cursorColor: "#F8F8F2", // foreground
  cursorText: "#272822", // classic Monokai background
  selectionBackground: "#75715E", // comments
  selectionForeground: "#F8F8F2", // foreground
}

/** Monokai Pro — the modern, refined Monokai with balanced colors. */
export const monokaiPro: ColorPalette = {
  name: "monokai-pro",
  dark: true,
  black: "#221f22", // darker than base
  red: "#ff6188", // keywords
  green: "#a9dc76", // functions
  yellow: "#ffd866", // strings/types
  blue: "#78dce8", // Pro shares cyan as blue
  magenta: "#ab9df2", // decorative/numbers
  cyan: "#78dce8", // cyan — support/builtins
  white: "#939293", // secondary text
  brightBlack: "#403e41", // raised surfaces
  brightRed: "#fc9867", // constants/parameters
  brightGreen: brighten("#a9dc76", 0.15),
  brightYellow: brighten("#ffd866", 0.15),
  brightBlue: brighten("#78dce8", 0.15),
  brightMagenta: "#ff6188", // Pro pink == red
  brightCyan: brighten("#78dce8", 0.15),
  brightWhite: "#fcfcfa", // foreground
  foreground: "#fcfcfa", // foreground
  background: "#2d2a2e", // editor background
  cursorColor: "#fcfcfa", // foreground
  cursorText: "#2d2a2e", // editor background
  selectionBackground: "#727072", // borders/muted chrome
  selectionForeground: "#fcfcfa", // foreground
}
