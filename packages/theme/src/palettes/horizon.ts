/**
 * Horizon palette — beautifully warm theme.
 * Source: https://github.com/jolaleye/horizon-theme-vscode
 */

import type { ColorPalette } from "../types";
import { brighten } from "../color";

/** Horizon — warm dark variant with vivid accents. */
export const horizon: ColorPalette = {
  name: "horizon",
  dark: true,
  black: "#16161C",
  red: "#E95678",
  green: "#29D398",
  yellow: "#FAC29A",
  blue: "#26BBD9",
  magenta: "#B877DB",
  cyan: "#59E1E3",
  white: "#6C6F93",
  brightBlack: "#232530",
  brightRed: "#FAB795",
  brightGreen: brighten("#29D398", 0.15),
  brightYellow: brighten("#FAC29A", 0.15),
  brightBlue: brighten("#26BBD9", 0.15),
  brightMagenta: "#EE64AC",
  brightCyan: brighten("#59E1E3", 0.15),
  brightWhite: "#D5D8DA",
  foreground: "#D5D8DA",
  background: "#1C1E26",
  cursorColor: "#D5D8DA",
  cursorText: "#1C1E26",
  selectionBackground: "#2E303E",
  selectionForeground: "#D5D8DA",
};
