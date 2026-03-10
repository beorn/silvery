/**
 * Snazzy palette — elegant dark theme with vivid colors.
 * Source: https://github.com/sindresorhus/hyper-snazzy
 */

import type { ColorPalette } from "../types";
import { brighten } from "../color";

/** Snazzy — clean dark theme by Sindre Sorhus. */
export const snazzy: ColorPalette = {
  name: "snazzy",
  dark: true,
  black: "#222430", // border color (deepest)
  red: "#ff5c57",
  green: "#5af78e",
  yellow: "#f3f99d",
  blue: "#57c7ff",
  magenta: "#b267e6", // interpolated purple (between magenta and blue)
  cyan: "#9aedfe", // cyan
  white: "#97979b", // cursor/secondary text
  brightBlack: "#34353e", // slightly raised (interpolated)
  brightRed: "#ff9f43", // snazzy bright orange (warm interpolation)
  brightGreen: brighten("#5af78e", 0.15),
  brightYellow: brighten("#f3f99d", 0.15),
  brightBlue: brighten("#57c7ff", 0.15),
  brightMagenta: "#ff6ac1", // magenta
  brightCyan: brighten("#9aedfe", 0.15),
  brightWhite: "#eff0eb", // foreground
  foreground: "#eff0eb", // foreground
  background: "#282a36", // background
  cursorColor: "#eff0eb", // foreground
  cursorText: "#282a36", // background
  selectionBackground: "#686868", // light black / muted chrome
  selectionForeground: "#eff0eb", // foreground
};
