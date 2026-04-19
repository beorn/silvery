/**
 * GitHub palettes — GitHub's terminal color schemes.
 */

import type { ColorScheme } from "@silvery/ansi"

/** GitHub Dark — GitHub's dark terminal theme. */
export const githubDark: ColorScheme = {
  name: "github-dark",
  dark: true,
  black: "#000000",
  red: "#f78166",
  green: "#56d364",
  yellow: "#e3b341",
  blue: "#6ca4f8",
  magenta: "#db61a2",
  cyan: "#2b7489",
  white: "#ffffff",
  brightBlack: "#4d4d4d",
  brightRed: "#f78166",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#6ca4f8",
  brightMagenta: "#db61a2",
  brightCyan: "#2b7489",
  brightWhite: "#ffffff",
  foreground: "#8b949e",
  background: "#101216",
  cursorColor: "#c9d1d9",
  cursorText: "#101216",
  selectionBackground: "#3b5070",
  selectionForeground: "#c9d1d9",
}

/** GitHub Light — GitHub's light terminal theme. */
export const githubLight: ColorScheme = {
  name: "github-light",
  dark: false,
  black: "#3e3e3e",
  red: "#970b16",
  green: "#07962a",
  yellow: "#f8eec7",
  blue: "#003e8a",
  magenta: "#e94691",
  cyan: "#89d1ec",
  white: "#ffffff",
  brightBlack: "#666666",
  brightRed: "#de0000",
  brightGreen: "#87d5a2",
  brightYellow: "#f1d007",
  brightBlue: "#2e6cba",
  brightMagenta: "#ffa29f",
  brightCyan: "#1cfafe",
  brightWhite: "#ffffff",
  foreground: "#3e3e3e",
  background: "#f4f4f4",
  cursorColor: "#3f3f3f",
  cursorText: "#f4f4f4",
  selectionBackground: "#a9c1e2",
  selectionForeground: "#3e3e3e",
}
