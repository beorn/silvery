/**
 * Ayu palettes — warm, modern theme in three variants.
 * Source: https://github.com/ayu-theme/ayu-colors
 * Reference: https://github.com/Shatur/neovim-ayu
 */

import type { ColorPalette } from "../types";
import { brighten } from "../color";

/** Ayu Dark — deep dark variant with warm accents. */
export const ayuDark: ColorPalette = {
  name: "ayu-dark",
  dark: true,
  black: "#05070A",
  red: "#D95757",
  green: "#AAD94C",
  yellow: "#E6B450",
  blue: "#59C2FF",
  magenta: "#D2A6FF",
  cyan: "#95E6CB",
  white: "#636A72",
  brightBlack: "#11151C",
  brightRed: "#F29668",
  brightGreen: brighten("#AAD94C", 0.15),
  brightYellow: brighten("#E6B450", 0.15),
  brightBlue: brighten("#59C2FF", 0.15),
  brightMagenta: "#F07178",
  brightCyan: brighten("#95E6CB", 0.15),
  brightWhite: "#BFBDB6",
  foreground: "#BFBDB6",
  background: "#0B0E14",
  cursorColor: "#BFBDB6",
  cursorText: "#0B0E14",
  selectionBackground: "#565B66",
  selectionForeground: "#BFBDB6",
};

/** Ayu Mirage — balanced dark variant with softer contrast. */
export const ayuMirage: ColorPalette = {
  name: "ayu-mirage",
  dark: true,
  black: "#101521",
  red: "#FF6666",
  green: "#D5FF80",
  yellow: "#FFCC66",
  blue: "#73D0FF",
  magenta: "#DFBFFF",
  cyan: "#95E6CB",
  white: "#6C7A8B",
  brightBlack: "#171B24",
  brightRed: "#F29E74",
  brightGreen: brighten("#D5FF80", 0.15),
  brightYellow: brighten("#FFCC66", 0.15),
  brightBlue: brighten("#73D0FF", 0.15),
  brightMagenta: "#F28779",
  brightCyan: brighten("#95E6CB", 0.15),
  brightWhite: "#CCCAC2",
  foreground: "#CCCAC2",
  background: "#1F2430",
  cursorColor: "#CCCAC2",
  cursorText: "#1F2430",
  selectionBackground: "#707A8C",
  selectionForeground: "#CCCAC2",
};

/** Ayu Light — clean light variant. */
export const ayuLight: ColorPalette = {
  name: "ayu-light",
  dark: false,
  black: "#E7EAED",
  red: "#E65050",
  green: "#86B300",
  yellow: "#FFAA33",
  blue: "#399EE6",
  magenta: "#A37ACC",
  cyan: "#4CBF99",
  white: "#ABADB1",
  brightBlack: "#F3F4F5",
  brightRed: "#ED9366",
  brightGreen: brighten("#86B300", 0.15),
  brightYellow: brighten("#FFAA33", 0.15),
  brightBlue: brighten("#399EE6", 0.15),
  brightMagenta: "#F07171",
  brightCyan: brighten("#4CBF99", 0.15),
  brightWhite: "#5C6166",
  foreground: "#5C6166",
  background: "#F8F9FA",
  cursorColor: "#5C6166",
  cursorText: "#F8F9FA",
  selectionBackground: "#8A9199",
  selectionForeground: "#5C6166",
};
