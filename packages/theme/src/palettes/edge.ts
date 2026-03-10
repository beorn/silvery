/**
 * Edge palettes — clean, modern theme by sainnhe.
 * Source: https://github.com/sainnhe/edge (default style)
 */

import type { ColorPalette } from "../types";
import { brighten } from "../color";

/** Edge Dark — clean dark variant with balanced accents. */
export const edgeDark: ColorPalette = {
  name: "edge-dark",
  dark: true,
  black: "#202023",
  red: "#EC7279",
  green: "#A0C980",
  yellow: "#DEB974",
  blue: "#6CB6EB",
  magenta: "#D38AEA",
  cyan: "#5DBBC1",
  white: "#758094",
  brightBlack: "#33353F",
  brightRed: "#DEB974",
  brightGreen: brighten("#A0C980", 0.15),
  brightYellow: brighten("#DEB974", 0.15),
  brightBlue: brighten("#6CB6EB", 0.15),
  brightMagenta: "#EC7279",
  brightCyan: brighten("#5DBBC1", 0.15),
  brightWhite: "#C5CDD9",
  foreground: "#C5CDD9",
  background: "#2C2E34",
  cursorColor: "#C5CDD9",
  cursorText: "#2C2E34",
  selectionBackground: "#414550",
  selectionForeground: "#C5CDD9",
};

/** Edge Light — clean, readable light variant. */
export const edgeLight: ColorPalette = {
  name: "edge-light",
  dark: false,
  black: "#DDE2E7",
  red: "#D05858",
  green: "#608E32",
  yellow: "#BE7E05",
  blue: "#5079BE",
  magenta: "#B05CCC",
  cyan: "#3A8B84",
  white: "#8790A0",
  brightBlack: "#EEF1F4",
  brightRed: "#BE7E05",
  brightGreen: brighten("#608E32", 0.15),
  brightYellow: brighten("#BE7E05", 0.15),
  brightBlue: brighten("#5079BE", 0.15),
  brightMagenta: "#D05858",
  brightCyan: brighten("#3A8B84", 0.15),
  brightWhite: "#4B505B",
  foreground: "#4B505B",
  background: "#FAFAFA",
  cursorColor: "#4B505B",
  cursorText: "#FAFAFA",
  selectionBackground: "#DDE2E7",
  selectionForeground: "#4B505B",
};
