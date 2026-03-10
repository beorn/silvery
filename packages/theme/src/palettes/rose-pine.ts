/**
 * Rosé Pine palettes — all natural pine, faux fur and a bit of soho vibes.
 */

import type { ColorPalette } from "../types";
import { brighten } from "../color";

/** Rosé Pine — the main dark variant. */
export const rosePine: ColorPalette = {
  name: "rose-pine",
  dark: true,
  black: "#191724",
  red: "#EB6F92",
  green: "#31748F",
  yellow: "#F6C177",
  blue: "#3E8FB0",
  magenta: "#C4A7E7",
  cyan: "#9CCFD8",
  white: "#908CAA",
  brightBlack: "#26233A",
  brightRed: "#EA9A97",
  brightGreen: brighten("#31748F", 0.15),
  brightYellow: brighten("#F6C177", 0.15),
  brightBlue: brighten("#3E8FB0", 0.15),
  brightMagenta: "#EBBCBA",
  brightCyan: brighten("#9CCFD8", 0.15),
  brightWhite: "#E0DEF4",
  foreground: "#E0DEF4",
  background: "#1F1D2E",
  cursorColor: "#E0DEF4",
  cursorText: "#1F1D2E",
  selectionBackground: "#6E6A86",
  selectionForeground: "#E0DEF4",
};

/** Rosé Pine Moon — slightly lighter dark variant. */
export const rosePineMoon: ColorPalette = {
  name: "rose-pine-moon",
  dark: true,
  black: "#232136",
  red: "#EB6F92",
  green: "#3E8FB0",
  yellow: "#F6C177",
  blue: "#3E8FB0",
  magenta: "#C4A7E7",
  cyan: "#9CCFD8",
  white: "#908CAA",
  brightBlack: "#393552",
  brightRed: "#EA9A97",
  brightGreen: brighten("#3E8FB0", 0.15),
  brightYellow: brighten("#F6C177", 0.15),
  brightBlue: brighten("#3E8FB0", 0.15),
  brightMagenta: "#EA9A97",
  brightCyan: brighten("#9CCFD8", 0.15),
  brightWhite: "#E0DEF4",
  foreground: "#E0DEF4",
  background: "#2A273F",
  cursorColor: "#E0DEF4",
  cursorText: "#2A273F",
  selectionBackground: "#6E6A86",
  selectionForeground: "#E0DEF4",
};

/** Rosé Pine Dawn — the light variant. */
export const rosePineDawn: ColorPalette = {
  name: "rose-pine-dawn",
  dark: false,
  black: "#FAF4ED",
  red: "#B4637A",
  green: "#286983",
  yellow: "#EA9D34",
  blue: "#286983",
  magenta: "#907AA9",
  cyan: "#56949F",
  white: "#797593",
  brightBlack: "#F2E9E1",
  brightRed: "#D7827E",
  brightGreen: brighten("#286983", 0.15),
  brightYellow: brighten("#EA9D34", 0.15),
  brightBlue: brighten("#286983", 0.15),
  brightMagenta: "#D7827E",
  brightCyan: brighten("#56949F", 0.15),
  brightWhite: "#575279",
  foreground: "#575279",
  background: "#FFFAF3",
  cursorColor: "#575279",
  cursorText: "#FFFAF3",
  selectionBackground: "#9893A5",
  selectionForeground: "#575279",
};
