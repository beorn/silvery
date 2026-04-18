/**
 * Dracula palette — dark theme with vibrant accents.
 */

import type { ColorScheme } from "../types"
import { brighten } from "../color"

/** Dracula — vibrant dark theme. */
export const dracula: ColorScheme = {
  name: "dracula",
  dark: true,
  black: "#21222C",
  red: "#FF5555",
  green: "#50FA7B",
  yellow: "#F1FA8C",
  blue: "#BD93F9",
  magenta: "#BD93F9",
  cyan: "#8BE9FD",
  white: "#6272A4",
  brightBlack: "#44475A",
  brightRed: "#FFB86C",
  brightGreen: brighten("#50FA7B", 0.15),
  brightYellow: brighten("#F1FA8C", 0.15),
  brightBlue: brighten("#BD93F9", 0.15),
  brightMagenta: "#FF79C6",
  brightCyan: brighten("#8BE9FD", 0.15),
  brightWhite: "#F8F8F2",
  foreground: "#F8F8F2",
  background: "#282A36",
  cursorColor: "#F8F8F2",
  cursorText: "#282A36",
  selectionBackground: "#6272A4",
  selectionForeground: "#F8F8F2",
}
