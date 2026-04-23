/**
 * Default palettes and themes — shipped with @silvery/ansi.
 */

import type { ColorScheme, Theme } from "./types.ts"
import { deriveAnsi16Theme } from "./derive.ts"

export const defaultDarkScheme: ColorScheme = {
  name: "default-dark",
  dark: true,
  black: "#2e3440",
  red: "#bf616a",
  green: "#a3be8c",
  yellow: "#ebcb8b",
  blue: "#81a1c1",
  magenta: "#b48ead",
  cyan: "#88c0d0",
  white: "#d8dee9",
  brightBlack: "#4c566a",
  brightRed: "#bf616a",
  brightGreen: "#a3be8c",
  brightYellow: "#ebcb8b",
  brightBlue: "#81a1c1",
  brightMagenta: "#b48ead",
  brightCyan: "#8fbcbb",
  brightWhite: "#eceff4",
  foreground: "#d8dee9",
  background: "#2e3440",
  cursorColor: "#d8dee9",
  cursorText: "#2e3440",
  selectionBackground: "#434c5e",
  selectionForeground: "#d8dee9",
}

export const defaultLightScheme: ColorScheme = {
  name: "default-light",
  dark: false,
  black: "#5c6370",
  red: "#d20f39",
  green: "#40a02b",
  yellow: "#df8e1d",
  blue: "#1e66f5",
  magenta: "#8839ef",
  cyan: "#179299",
  white: "#dce0e8",
  brightBlack: "#6c7086",
  brightRed: "#d20f39",
  brightGreen: "#40a02b",
  brightYellow: "#df8e1d",
  brightBlue: "#1e66f5",
  brightMagenta: "#8839ef",
  brightCyan: "#179299",
  brightWhite: "#eff1f5",
  foreground: "#4c4f69",
  background: "#eff1f5",
  cursorColor: "#dc8a78",
  cursorText: "#eff1f5",
  selectionBackground: "#ccd0da",
  selectionForeground: "#4c4f69",
}

/**
 * Dark ANSI 16 theme — hex-valued, derived from the default dark scheme.
 *
 * All token values are hex strings. Terminal rendering quantizes hex to
 * 4-bit ANSI codes at paint time when colorLevel === "ansi16".
 */
export const ansi16DarkTheme: Theme = deriveAnsi16Theme(defaultDarkScheme)

/**
 * Light ANSI 16 theme — hex-valued, derived from the default light scheme.
 *
 * All token values are hex strings. Terminal rendering quantizes hex to
 * 4-bit ANSI codes at paint time when colorLevel === "ansi16".
 */
export const ansi16LightTheme: Theme = deriveAnsi16Theme(defaultLightScheme)
