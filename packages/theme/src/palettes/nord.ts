/**
 * Nord palette — Arctic, north-bluish clean.
 */

import type { ColorPalette } from "../types"
import { brighten } from "../color"

/** Nord — the classic dark arctic theme. */
export const nord: ColorPalette = {
  name: "nord",
  dark: true,
  black: "#2E3440",
  red: "#BF616A",
  green: "#A3BE8C",
  yellow: "#EBCB8B",
  blue: "#5E81AC",
  magenta: "#B48EAD",
  cyan: "#8FBCBB",
  white: "#D8DEE9",
  brightBlack: "#3B4252",
  brightRed: "#D08770",
  brightGreen: brighten("#A3BE8C", 0.15),
  brightYellow: brighten("#EBCB8B", 0.15),
  brightBlue: brighten("#5E81AC", 0.15),
  brightMagenta: "#B48EAD",
  brightCyan: brighten("#8FBCBB", 0.15),
  brightWhite: "#ECEFF4",
  foreground: "#ECEFF4",
  background: "#2E3440",
  cursorColor: "#ECEFF4",
  cursorText: "#2E3440",
  selectionBackground: "#4C566A",
  selectionForeground: "#ECEFF4",
}
