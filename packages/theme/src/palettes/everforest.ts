/**
 * Everforest palettes — a green-toned comfortable color scheme.
 * Source: https://github.com/sainnhe/everforest (medium background variants)
 */

import type { ColorPalette } from "../types"
import { brighten } from "../color"

/** Everforest Dark — warm green-based dark theme (medium background). */
export const everforestDark: ColorPalette = {
  name: "everforest-dark",
  dark: true,
  black: "#232a2e", // bg_dim
  red: "#e67e80",
  green: "#a7c080",
  yellow: "#dbbc7f",
  blue: "#7fbbb3",
  magenta: "#d699b6",
  cyan: "#83c092", // aqua
  white: "#859289", // grey1
  brightBlack: "#343f44", // bg1
  brightRed: "#e69875",
  brightGreen: brighten("#a7c080", 0.15),
  brightYellow: brighten("#dbbc7f", 0.15),
  brightBlue: brighten("#7fbbb3", 0.15),
  brightMagenta: "#e67e80", // everforest has no distinct pink; reuse red
  brightCyan: brighten("#83c092", 0.15),
  brightWhite: "#d3c6aa", // fg
  foreground: "#d3c6aa", // fg
  background: "#2d353b", // bg0
  cursorColor: "#d3c6aa", // fg
  cursorText: "#2d353b", // bg0
  selectionBackground: "#4f585e", // bg4
  selectionForeground: "#d3c6aa", // fg
}

/** Everforest Light — warm green-based light theme (medium background). */
export const everforestLight: ColorPalette = {
  name: "everforest-light",
  dark: false,
  black: "#efebd4", // bg_dim
  red: "#f85552",
  green: "#8da101",
  yellow: "#dfa000",
  blue: "#3a94c5",
  magenta: "#df69ba",
  cyan: "#35a77c", // aqua
  white: "#939f91", // grey1
  brightBlack: "#f4f0d9", // bg1
  brightRed: "#f57d26",
  brightGreen: brighten("#8da101", 0.15),
  brightYellow: brighten("#dfa000", 0.15),
  brightBlue: brighten("#3a94c5", 0.15),
  brightMagenta: "#f85552", // everforest has no distinct pink; reuse red
  brightCyan: brighten("#35a77c", 0.15),
  brightWhite: "#5c6a72", // fg
  foreground: "#5c6a72", // fg
  background: "#fdf6e3", // bg0
  cursorColor: "#5c6a72", // fg
  cursorText: "#fdf6e3", // bg0
  selectionBackground: "#e0dcc7", // bg4
  selectionForeground: "#5c6a72", // fg
}
