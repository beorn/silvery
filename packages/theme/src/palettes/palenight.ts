/**
 * Palenight palette — Material Palenight variant.
 * Source: https://github.com/kaicataldo/material.vim (palenight style)
 * Reference: https://github.com/JonathanSpeek/palenight-iterm2
 */

import type { ColorPalette } from "../types";
import { brighten } from "../color";

/** Palenight — the soft, purple-tinted Material dark variant. */
export const palenight: ColorPalette = {
  name: "palenight",
  dark: true,
  black: "#1c1f2b", // line_highlight (deepest)
  red: "#f07178",
  green: "#c3e88d",
  yellow: "#ffcb6b",
  blue: "#82aaff",
  magenta: "#c792ea",
  cyan: "#89ddff", // cyan
  white: "#676e95", // comments
  brightBlack: "#343b51", // selection
  brightRed: "#f78c6c",
  brightGreen: brighten("#c3e88d", 0.15),
  brightYellow: brighten("#ffcb6b", 0.15),
  brightBlue: brighten("#82aaff", 0.15),
  brightMagenta: "#ff5370",
  brightCyan: brighten("#89ddff", 0.15),
  brightWhite: "#a6accd", // foreground
  foreground: "#a6accd", // foreground
  background: "#292d3e", // background
  cursorColor: "#a6accd", // foreground
  cursorText: "#292d3e", // background
  selectionBackground: "#4e5579", // guides/invisibles
  selectionForeground: "#a6accd", // foreground
};
