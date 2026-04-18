/**
 * Gruvbox palettes — retro groove color scheme.
 */

import type { ColorScheme } from "../types"
import { brighten } from "../color"

/** Gruvbox Dark — warm retro dark theme. */
export const gruvboxDark: ColorScheme = {
  name: "gruvbox-dark",
  dark: true,
  black: "#1D2021",
  red: "#FB4934",
  green: "#B8BB26",
  yellow: "#FABD2F",
  blue: "#83A598",
  magenta: "#D3869B",
  cyan: "#8EC07C",
  white: "#BDAE93",
  brightBlack: "#3C3836",
  brightRed: "#FE8019",
  brightGreen: brighten("#B8BB26", 0.15),
  brightYellow: brighten("#FABD2F", 0.15),
  brightBlue: brighten("#83A598", 0.15),
  brightMagenta: "#D3869B",
  brightCyan: brighten("#8EC07C", 0.15),
  brightWhite: "#EBDBB2",
  foreground: "#EBDBB2",
  background: "#282828",
  cursorColor: "#EBDBB2",
  cursorText: "#282828",
  selectionBackground: "#665C54",
  selectionForeground: "#EBDBB2",
}

/** Gruvbox Light — warm retro light theme. */
export const gruvboxLight: ColorScheme = {
  name: "gruvbox-light",
  dark: false,
  black: "#F9F5D7",
  red: "#CC241D",
  green: "#98971A",
  yellow: "#D79921",
  blue: "#458588",
  magenta: "#B16286",
  cyan: "#689D6A",
  white: "#665C54",
  brightBlack: "#EBDBB2",
  brightRed: "#D65D0E",
  brightGreen: brighten("#98971A", 0.15),
  brightYellow: brighten("#D79921", 0.15),
  brightBlue: brighten("#458588", 0.15),
  brightMagenta: "#B16286",
  brightCyan: brighten("#689D6A", 0.15),
  brightWhite: "#3C3836",
  foreground: "#3C3836",
  background: "#FBF1C7",
  cursorColor: "#3C3836",
  cursorText: "#FBF1C7",
  selectionBackground: "#A89984",
  selectionForeground: "#3C3836",
}
