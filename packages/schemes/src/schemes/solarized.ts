/**
 * Solarized palettes — precision colors for machines and people.
 */

import type { ColorScheme } from "@silvery/ansi"
import { brighten } from "@silvery/color"

/** Solarized Dark — Ethan Schoonover's classic dark variant. */
export const solarizedDark: ColorScheme = {
  name: "solarized-dark",
  dark: true,
  black: "#002B36",
  red: "#DC322F",
  green: "#859900",
  yellow: "#B58900",
  blue: "#268BD2",
  magenta: "#6C71C4",
  cyan: "#2AA198",
  white: "#839496",
  brightBlack: "#586E75",
  brightRed: "#CB4B16",
  brightGreen: brighten("#859900", 0.15),
  brightYellow: brighten("#B58900", 0.15),
  brightBlue: brighten("#268BD2", 0.15),
  brightMagenta: "#D33682",
  brightCyan: brighten("#2AA198", 0.15),
  brightWhite: "#FDF6E3",
  foreground: "#FDF6E3",
  background: "#073642",
  cursorColor: "#FDF6E3",
  cursorText: "#073642",
  selectionBackground: "#657B83",
  selectionForeground: "#FDF6E3",
}

/** Solarized Light — Ethan Schoonover's classic light variant. */
export const solarizedLight: ColorScheme = {
  name: "solarized-light",
  dark: false,
  black: "#FDF6E3",
  red: "#DC322F",
  green: "#859900",
  yellow: "#B58900",
  blue: "#268BD2",
  magenta: "#6C71C4",
  cyan: "#2AA198",
  white: "#657B83",
  brightBlack: "#DDD6C1",
  brightRed: "#CB4B16",
  brightGreen: brighten("#859900", 0.15),
  brightYellow: brighten("#B58900", 0.15),
  brightBlue: brighten("#268BD2", 0.15),
  brightMagenta: "#D33682",
  brightCyan: brighten("#2AA198", 0.15),
  brightWhite: "#073642",
  foreground: "#073642",
  background: "#EEE8D5",
  cursorColor: "#073642",
  cursorText: "#EEE8D5",
  selectionBackground: "#93A1A1",
  selectionForeground: "#073642",
}
