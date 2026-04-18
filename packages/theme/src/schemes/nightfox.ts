/**
 * Nightfox palettes — rich, vibrant themes for Neovim.
 * Source: https://github.com/EdenEast/nightfox.nvim
 */

import type { ColorScheme } from "../types"
import { brighten } from "../color"

/** Nightfox — dark blue-toned variant. */
export const nightfox: ColorScheme = {
  name: "nightfox",
  dark: true,
  black: "#131A24",
  red: "#C94F6D",
  green: "#81B29A",
  yellow: "#DBC074",
  blue: "#719CD6",
  magenta: "#9D79D6",
  cyan: "#63CDCF",
  white: "#71839B",
  brightBlack: "#212E3F",
  brightRed: "#F4A261",
  brightGreen: brighten("#81B29A", 0.15),
  brightYellow: brighten("#DBC074", 0.15),
  brightBlue: brighten("#719CD6", 0.15),
  brightMagenta: "#D67AD2",
  brightCyan: brighten("#63CDCF", 0.15),
  brightWhite: "#CDCECF",
  foreground: "#CDCECF",
  background: "#192330",
  cursorColor: "#CDCECF",
  cursorText: "#192330",
  selectionBackground: "#39506D",
  selectionForeground: "#CDCECF",
}

/** Dawnfox — warm light variant inspired by Rose Pine Dawn. */
export const dawnfox: ColorScheme = {
  name: "dawnfox",
  dark: false,
  black: "#EBE5DF",
  red: "#B4637A",
  green: "#618774",
  yellow: "#EA9D34",
  blue: "#286983",
  magenta: "#907AA9",
  cyan: "#56949F",
  white: "#A8A3B3",
  brightBlack: "#EBE0DF",
  brightRed: "#D7827E",
  brightGreen: brighten("#618774", 0.15),
  brightYellow: brighten("#EA9D34", 0.15),
  brightBlue: brighten("#286983", 0.15),
  brightMagenta: "#D685AF",
  brightCyan: brighten("#56949F", 0.15),
  brightWhite: "#575279",
  foreground: "#575279",
  background: "#FAF4ED",
  cursorColor: "#575279",
  cursorText: "#FAF4ED",
  selectionBackground: "#BDBFC9",
  selectionForeground: "#575279",
}
