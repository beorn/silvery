/**
 * Sterling built-in defaults — no input required. Returns a light or dark
 * Theme from a neutral baseline scheme (derived from Nord for dark, Catppuccin
 * Latte for light — the same defaults the existing builtinThemes use).
 */

import type { ColorScheme } from "../scheme.ts"

/**
 * A hand-tuned neutral dark scheme — not a copy of any catalog palette, but
 * close to Nord/Dracula territory. Used only when the caller asks for a
 * "raw default" (no scheme at all).
 */
const darkBaseline: ColorScheme = {
  name: "sterling-dark",
  dark: true,
  primary: "#7FB4CA",
  black: "#1E1E2E",
  red: "#E06C75",
  green: "#98C379",
  yellow: "#E5C07B",
  blue: "#61AFEF",
  magenta: "#C678DD",
  cyan: "#56B6C2",
  white: "#ABB2BF",
  brightBlack: "#5C6370",
  brightRed: "#E06C75",
  brightGreen: "#98C379",
  brightYellow: "#E5C07B",
  brightBlue: "#61AFEF",
  brightMagenta: "#C678DD",
  brightCyan: "#56B6C2",
  brightWhite: "#FFFFFF",
  foreground: "#E4E4E7",
  background: "#16181D",
  cursorColor: "#E4E4E7",
  cursorText: "#16181D",
  selectionBackground: "#3E4452",
  selectionForeground: "#E4E4E7",
}

const lightBaseline: ColorScheme = {
  name: "sterling-light",
  dark: false,
  primary: "#1F6FEB",
  black: "#24292F",
  red: "#CF222E",
  green: "#1A7F37",
  yellow: "#9A6700",
  blue: "#0969DA",
  magenta: "#8250DF",
  cyan: "#1B7C83",
  white: "#6E7781",
  brightBlack: "#57606A",
  brightRed: "#A40E26",
  brightGreen: "#2DA44E",
  brightYellow: "#BF8700",
  brightBlue: "#218BFF",
  brightMagenta: "#A475F9",
  brightCyan: "#3192AA",
  brightWhite: "#8C959F",
  foreground: "#1F2328",
  background: "#FFFFFF",
  cursorColor: "#1F2328",
  cursorText: "#FFFFFF",
  selectionBackground: "#DDF4FF",
  selectionForeground: "#1F2328",
}

export function defaultScheme(mode: "light" | "dark" = "dark"): ColorScheme {
  return mode === "dark" ? darkBaseline : lightBaseline
}
