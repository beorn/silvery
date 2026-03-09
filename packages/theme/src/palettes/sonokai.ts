/**
 * Sonokai palette — high-contrast vivid theme (Monokai Pro-inspired).
 * Source: https://github.com/sainnhe/sonokai (default style)
 */

import type { ColorPalette } from "../types"
import { brighten } from "../color"

/** Sonokai — vivid dark theme with Monokai-inspired accents. */
export const sonokai: ColorPalette = {
  name: "sonokai",
  dark: true,
  black: "#181819",
  red: "#FC5D7C",
  green: "#9ED072",
  yellow: "#E7C664",
  blue: "#76CCE0",
  magenta: "#B39DF3",
  cyan: "#76CCE0",
  white: "#7F8490",
  brightBlack: "#33353F",
  brightRed: "#F39660",
  brightGreen: brighten("#9ED072", 0.15),
  brightYellow: brighten("#E7C664", 0.15),
  brightBlue: brighten("#76CCE0", 0.15),
  brightMagenta: "#FC5D7C",
  brightCyan: brighten("#76CCE0", 0.15),
  brightWhite: "#E2E2E3",
  foreground: "#E2E2E3",
  background: "#2C2E34",
  cursorColor: "#E2E2E3",
  cursorText: "#2C2E34",
  selectionBackground: "#414550",
  selectionForeground: "#E2E2E3",
}
