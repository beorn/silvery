/**
 * Nightfly palette — dark midnight-blue theme with neon accents.
 * Source: https://github.com/bluz71/vim-nightfly-colors
 */

import type { ColorPalette } from "../types"
import { brighten } from "../color"

/** Nightfly — midnight-blue dark theme. */
export const nightfly: ColorPalette = {
  name: "nightfly",
  dark: true,
  black: "#081E2F",
  red: "#FC514E",
  green: "#A1CD5E",
  yellow: "#E3D18A",
  blue: "#82AAFF",
  magenta: "#C792EA",
  cyan: "#7FDBCA",
  white: "#7C8F8F",
  brightBlack: "#0E293F",
  brightRed: "#F78C6C",
  brightGreen: brighten("#A1CD5E", 0.15),
  brightYellow: brighten("#E3D18A", 0.15),
  brightBlue: brighten("#82AAFF", 0.15),
  brightMagenta: "#FF5874",
  brightCyan: brighten("#7FDBCA", 0.15),
  brightWhite: "#C3CCDC",
  foreground: "#C3CCDC",
  background: "#011627",
  cursorColor: "#C3CCDC",
  cursorText: "#011627",
  selectionBackground: "#2C3043",
  selectionForeground: "#C3CCDC",
}
