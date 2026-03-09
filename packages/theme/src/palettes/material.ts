/**
 * Material Theme palettes — material design-inspired editor theme.
 * Source: https://github.com/kaicataldo/material.vim (material.vim)
 * Reference: https://material-theme.com/docs/reference/color-palette/
 */

import type { ColorPalette } from "../types"
import { brighten } from "../color"

/** Material Darker — the deep dark Material variant. */
export const materialDark: ColorPalette = {
  name: "material-dark",
  dark: true,
  black: "#171717", // line_highlight (deepest)
  red: "#ff5370",
  green: "#c3e88d",
  yellow: "#ffcb6b",
  blue: "#82aaff",
  magenta: "#c792ea",
  cyan: "#89ddff", // cyan
  white: "#545454", // comments
  brightBlack: "#2c2c2c", // selection
  brightRed: "#f78c6c",
  brightGreen: brighten("#c3e88d", 0.15),
  brightYellow: brighten("#ffcb6b", 0.15),
  brightBlue: brighten("#82aaff", 0.15),
  brightMagenta: "#f07178",
  brightCyan: brighten("#89ddff", 0.15),
  brightWhite: "#eeffff", // foreground
  foreground: "#eeffff", // foreground
  background: "#212121", // background
  cursorColor: "#eeffff", // foreground
  cursorText: "#212121", // background
  selectionBackground: "#424242", // guides/line_numbers
  selectionForeground: "#eeffff", // foreground
}

/** Material Lighter — the light Material variant. */
export const materialLight: ColorPalette = {
  name: "material-light",
  dark: false,
  black: "#ecf0f1", // line_highlight
  red: "#e53935",
  green: "#91b859",
  yellow: "#ffb62c",
  blue: "#6182b8",
  magenta: "#7c4dff",
  cyan: "#39adb5", // cyan
  white: "#90a4ae", // comments/fg
  brightBlack: "#ebf4f3", // selection
  brightRed: "#f76d47",
  brightGreen: brighten("#91b859", 0.15),
  brightYellow: brighten("#ffb62c", 0.15),
  brightBlue: brighten("#6182b8", 0.15),
  brightMagenta: "#ff5370",
  brightCyan: brighten("#39adb5", 0.15),
  brightWhite: "#546E7A", // foreground (darker than comments for light theme)
  foreground: "#546E7A", // foreground (darker than comments for light theme)
  background: "#fafafa", // background
  cursorColor: "#546E7A", // foreground
  cursorText: "#fafafa", // background
  selectionBackground: "#cfd8dc", // line_numbers
  selectionForeground: "#546E7A", // foreground
}
