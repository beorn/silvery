/**
 * One Dark palette — Atom's iconic dark theme.
 */

import type { ColorScheme } from "@silvery/ansi"
import { brighten } from "@silvery/color"

/** One Dark — the classic Atom editor theme. */
export const oneDark: ColorScheme = {
  name: "one-dark",
  dark: true,
  black: "#21252B",
  red: "#E06C75",
  green: "#98C379",
  yellow: "#E5C07B",
  blue: "#61AFEF",
  magenta: "#C678DD",
  cyan: "#56B6C2",
  white: "#ABB2BF",
  brightBlack: "#2C313A",
  brightRed: "#D19A66",
  brightGreen: brighten("#98C379", 0.15),
  brightYellow: brighten("#E5C07B", 0.15),
  brightBlue: brighten("#61AFEF", 0.15),
  brightMagenta: "#E06C75",
  brightCyan: brighten("#56B6C2", 0.15),
  brightWhite: "#ABB2BF",
  foreground: "#ABB2BF",
  background: "#282C34",
  cursorColor: "#ABB2BF",
  cursorText: "#282C34",
  selectionBackground: "#5C6370",
  selectionForeground: "#ABB2BF",
}
