/**
 * Modus palettes — GNU Emacs themes conforming to WCAG AAA contrast.
 * Source: https://github.com/protesilaos/modus-themes
 */

import type { ColorPalette } from "../types";
import { brighten } from "../color";

/** Modus Vivendi — elegant dark theme with maximum legibility. */
export const modusVivendi: ColorPalette = {
  name: "modus-vivendi",
  dark: true,
  black: "#000000",
  red: "#FF5F59",
  green: "#44BC44",
  yellow: "#D0BC00",
  blue: "#2FAFFF",
  magenta: "#B6A0FF",
  cyan: "#00D3D0",
  white: "#989898",
  brightBlack: "#1E1E1E",
  brightRed: "#FEC43F",
  brightGreen: brighten("#44BC44", 0.15),
  brightYellow: brighten("#D0BC00", 0.15),
  brightBlue: brighten("#2FAFFF", 0.15),
  brightMagenta: "#FEACD0",
  brightCyan: brighten("#00D3D0", 0.15),
  brightWhite: "#FFFFFF",
  foreground: "#FFFFFF",
  background: "#000000",
  cursorColor: "#FFFFFF",
  cursorText: "#000000",
  selectionBackground: "#535353",
  selectionForeground: "#FFFFFF",
};

/** Modus Operandi — elegant light theme with maximum legibility. */
export const modusOperandi: ColorPalette = {
  name: "modus-operandi",
  dark: false,
  black: "#E0E0E0",
  red: "#A60000",
  green: "#006800",
  yellow: "#6F5500",
  blue: "#0031A9",
  magenta: "#531AB6",
  cyan: "#005E8B",
  white: "#595959",
  brightBlack: "#F2F2F2",
  brightRed: "#884900",
  brightGreen: brighten("#006800", 0.15),
  brightYellow: brighten("#6F5500", 0.15),
  brightBlue: brighten("#0031A9", 0.15),
  brightMagenta: "#721045",
  brightCyan: brighten("#005E8B", 0.15),
  brightWhite: "#000000",
  foreground: "#000000",
  background: "#FFFFFF",
  cursorColor: "#000000",
  cursorText: "#FFFFFF",
  selectionBackground: "#9F9F9F",
  selectionForeground: "#000000",
};
