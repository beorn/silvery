/**
 * Oxocarbon palettes — IBM Carbon Design-inspired theme.
 * Source: https://github.com/nyoom-engineering/oxocarbon.nvim
 */

import type { ColorScheme } from "@silvery/ansi"
import { brighten } from "@silvery/color"

/** Oxocarbon Dark — IBM Carbon-inspired dark variant. */
export const oxocarbonDark: ColorScheme = {
  name: "oxocarbon-dark",
  dark: true,
  black: "#131313",
  red: "#EE5396",
  green: "#42BE65",
  yellow: "#82CFFF",
  blue: "#78A9FF",
  magenta: "#BE95FF",
  cyan: "#08BDBA",
  white: "#5C5C5C",
  brightBlack: "#2A2A2A",
  brightRed: "#FF7EB6",
  brightGreen: brighten("#42BE65", 0.15),
  brightYellow: brighten("#82CFFF", 0.15),
  brightBlue: brighten("#78A9FF", 0.15),
  brightMagenta: "#FF7EB6",
  brightCyan: brighten("#08BDBA", 0.15),
  brightWhite: "#F3F3F3",
  foreground: "#F3F3F3",
  background: "#161616",
  cursorColor: "#F3F3F3",
  cursorText: "#161616",
  selectionBackground: "#404040",
  selectionForeground: "#F3F3F3",
}

/** Oxocarbon Light — IBM Carbon-inspired light variant. */
export const oxocarbonLight: ColorScheme = {
  name: "oxocarbon-light",
  dark: false,
  black: "#F3F3F3",
  red: "#EE5396",
  green: "#42BE65",
  yellow: "#FFAB91",
  blue: "#0F62FE",
  magenta: "#BE95FF",
  cyan: "#08BDBA",
  white: "#90A4AE",
  brightBlack: "#D5D5D5",
  brightRed: "#FF6F00",
  brightGreen: brighten("#42BE65", 0.15),
  brightYellow: brighten("#FFAB91", 0.15),
  brightBlue: brighten("#0F62FE", 0.15),
  brightMagenta: "#FF7EB6",
  brightCyan: brighten("#08BDBA", 0.15),
  brightWhite: "#37474F",
  foreground: "#37474F",
  background: "#FFFFFF",
  cursorColor: "#37474F",
  cursorText: "#FFFFFF",
  selectionBackground: "#525252",
  selectionForeground: "#37474F",
}
