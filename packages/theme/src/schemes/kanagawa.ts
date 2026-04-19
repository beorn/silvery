/**
 * Kanagawa palettes — inspired by Katsushika Hokusai's famous paintings.
 * Source: https://github.com/rebelot/kanagawa.nvim (palette.lua)
 */

import type { ColorScheme } from "@silvery/ansi"
import { brighten } from "@silvery/color"

/** Kanagawa Wave — the default dark variant, inspired by "The Great Wave off Kanagawa". */
export const kanagawaWave: ColorScheme = {
  name: "kanagawa-wave",
  dark: true,
  black: "#16161D", // sumiInk0
  red: "#C34043", // autumnRed
  green: "#98BB6C", // springGreen
  yellow: "#E6C384", // carpYellow
  blue: "#7E9CD8", // crystalBlue
  magenta: "#957FB8", // oniViolet
  cyan: "#6A9589", // waveAqua1
  white: "#727169", // fujiGray
  brightBlack: "#2A2A37", // sumiInk4
  brightRed: "#FFA066", // surimiOrange
  brightGreen: brighten("#98BB6C", 0.15),
  brightYellow: brighten("#E6C384", 0.15),
  brightBlue: brighten("#7E9CD8", 0.15),
  brightMagenta: "#D27E99", // sakuraPink
  brightCyan: brighten("#6A9589", 0.15),
  brightWhite: "#DCD7BA", // fujiWhite
  foreground: "#DCD7BA", // fujiWhite
  background: "#1F1F28", // sumiInk3
  cursorColor: "#DCD7BA", // fujiWhite
  cursorText: "#1F1F28", // sumiInk3
  selectionBackground: "#54546D", // sumiInk6
  selectionForeground: "#DCD7BA", // fujiWhite
}

/** Kanagawa Dragon — a muted, earthy dark variant. */
export const kanagawaDragon: ColorScheme = {
  name: "kanagawa-dragon",
  dark: true,
  black: "#0d0c0c", // dragonBlack0
  red: "#c4746e", // dragonRed
  green: "#87a987", // dragonGreen
  yellow: "#c4b28a", // dragonYellow
  blue: "#8ba4b0", // dragonBlue2
  magenta: "#8992a7", // dragonViolet
  cyan: "#8ea4a2", // dragonAqua
  white: "#737c73", // dragonAsh
  brightBlack: "#282727", // dragonBlack4
  brightRed: "#b6927b", // dragonOrange
  brightGreen: brighten("#87a987", 0.15),
  brightYellow: brighten("#c4b28a", 0.15),
  brightBlue: brighten("#8ba4b0", 0.15),
  brightMagenta: "#a292a3", // dragonPink
  brightCyan: brighten("#8ea4a2", 0.15),
  brightWhite: "#c5c9c5", // dragonWhite
  foreground: "#c5c9c5", // dragonWhite
  background: "#181616", // dragonBlack3
  cursorColor: "#c5c9c5", // dragonWhite
  cursorText: "#181616", // dragonBlack3
  selectionBackground: "#625e5a", // dragonBlack6
  selectionForeground: "#c5c9c5", // dragonWhite
}

/** Kanagawa Lotus — the light variant, inspired by lotus flowers. */
export const kanagawaLotus: ColorScheme = {
  name: "kanagawa-lotus",
  dark: false,
  black: "#e5ddb0", // lotusWhite2
  red: "#c84053", // lotusRed
  green: "#6f894e", // lotusGreen
  yellow: "#de9800", // lotusYellow3
  blue: "#4d699b", // lotusBlue4
  magenta: "#624c83", // lotusViolet4
  cyan: "#597b75", // lotusAqua
  white: "#716e61", // lotusGray2
  brightBlack: "#dcd5ac", // lotusWhite1
  brightRed: "#cc6d00", // lotusOrange
  brightGreen: brighten("#6f894e", 0.15),
  brightYellow: brighten("#de9800", 0.15),
  brightBlue: brighten("#4d699b", 0.15),
  brightMagenta: "#b35b79", // lotusPink
  brightCyan: brighten("#597b75", 0.15),
  brightWhite: "#545464", // lotusInk1
  foreground: "#545464", // lotusInk1
  background: "#f2ecbc", // lotusWhite3
  cursorColor: "#545464", // lotusInk1
  cursorText: "#f2ecbc", // lotusWhite3
  selectionBackground: "#8a8980", // lotusGray3
  selectionForeground: "#545464", // lotusInk1
}
