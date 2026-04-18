/**
 * Tokyo Night palette — a clean dark theme inspired by Tokyo city lights.
 */

import type { ColorScheme } from "../types"
import { brighten } from "../color"

/** Tokyo Night — the default dark variant. */
export const tokyoNight: ColorScheme = {
  name: "tokyo-night",
  dark: true,
  black: "#1A1B26",
  red: "#F7768E",
  green: "#9ECE6A",
  yellow: "#E0AF68",
  blue: "#7AA2F7",
  magenta: "#BB9AF7",
  cyan: "#73DACA",
  white: "#A9B1D6",
  brightBlack: "#292E42",
  brightRed: "#FF9E64",
  brightGreen: brighten("#9ECE6A", 0.15),
  brightYellow: brighten("#E0AF68", 0.15),
  brightBlue: brighten("#7AA2F7", 0.15),
  brightMagenta: "#FF007C",
  brightCyan: brighten("#73DACA", 0.15),
  brightWhite: "#C0CAF5",
  foreground: "#C0CAF5",
  background: "#24283B",
  cursorColor: "#C0CAF5",
  cursorText: "#24283B",
  selectionBackground: "#545C7E",
  selectionForeground: "#C0CAF5",
}

/** Tokyo Night Storm — slightly lighter background. */
export const tokyoNightStorm: ColorScheme = {
  name: "tokyo-night-storm",
  dark: true,
  black: "#1F2335",
  red: "#F7768E",
  green: "#9ECE6A",
  yellow: "#E0AF68",
  blue: "#7AA2F7",
  magenta: "#BB9AF7",
  cyan: "#73DACA",
  white: "#A9B1D6",
  brightBlack: "#292E42",
  brightRed: "#FF9E64",
  brightGreen: brighten("#9ECE6A", 0.15),
  brightYellow: brighten("#E0AF68", 0.15),
  brightBlue: brighten("#7AA2F7", 0.15),
  brightMagenta: "#FF007C",
  brightCyan: brighten("#73DACA", 0.15),
  brightWhite: "#C0CAF5",
  foreground: "#C0CAF5",
  background: "#24283B",
  cursorColor: "#C0CAF5",
  cursorText: "#24283B",
  selectionBackground: "#545C7E",
  selectionForeground: "#C0CAF5",
}

/** Tokyo Night Day — the light variant. */
export const tokyoNightDay: ColorScheme = {
  name: "tokyo-night-day",
  dark: false,
  black: "#E1E2E7",
  red: "#F52A65",
  green: "#587539",
  yellow: "#8C6C3E",
  blue: "#2E7DE9",
  magenta: "#9854F1",
  cyan: "#118C74",
  white: "#6172B0",
  brightBlack: "#C4C5CB",
  brightRed: "#B15C00",
  brightGreen: brighten("#587539", 0.15),
  brightYellow: brighten("#8C6C3E", 0.15),
  brightBlue: brighten("#2E7DE9", 0.15),
  brightMagenta: "#F52A65",
  brightCyan: brighten("#118C74", 0.15),
  brightWhite: "#3760BF",
  foreground: "#3760BF",
  background: "#D5D6DB",
  cursorColor: "#3760BF",
  cursorText: "#D5D6DB",
  selectionBackground: "#9699A3",
  selectionForeground: "#3760BF",
}
