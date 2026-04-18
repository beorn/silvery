/**
 * Moonfly palette — dark charcoal theme with pastel accents.
 * Source: https://github.com/bluz71/vim-moonfly-colors
 */

import type { ColorScheme } from "../types"
import { brighten } from "../color"

/** Moonfly — dark charcoal theme. */
export const moonfly: ColorScheme = {
  name: "moonfly",
  dark: true,
  black: "#121212",
  red: "#FF5D5D",
  green: "#8CC85F",
  yellow: "#E3C78A",
  blue: "#80A0FF",
  magenta: "#AE81FF",
  cyan: "#79DAC8",
  white: "#808080",
  brightBlack: "#1C1C1C",
  brightRed: "#DE935F",
  brightGreen: brighten("#8CC85F", 0.15),
  brightYellow: brighten("#E3C78A", 0.15),
  brightBlue: brighten("#80A0FF", 0.15),
  brightMagenta: "#FF5189",
  brightCyan: brighten("#79DAC8", 0.15),
  brightWhite: "#C6C6C6",
  foreground: "#C6C6C6",
  background: "#080808",
  cursorColor: "#C6C6C6",
  cursorText: "#080808",
  selectionBackground: "#323437",
  selectionForeground: "#C6C6C6",
}
