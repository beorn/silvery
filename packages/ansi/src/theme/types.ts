/**
 * Core type definitions for the theme system.
 *
 * Two-layer architecture:
 *   Layer 1: ColorPalette — 22 terminal colors (what palette generators produce)
 *   Layer 2: Theme — 33 semantic tokens (what UI apps consume)
 *
 * Pipeline: Palette generators → ColorPalette (22) → deriveTheme() → Theme (33)
 */

export interface ColorPalette {
  name?: string
  dark?: boolean
  primary?: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
  foreground: string
  background: string
  cursorColor: string
  cursorText: string
  selectionBackground: string
  selectionForeground: string
}

export const COLOR_PALETTE_FIELDS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
  "foreground",
  "background",
  "cursorColor",
  "cursorText",
  "selectionBackground",
  "selectionForeground",
] as const

export type AnsiColorName =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "brightBlack"
  | "brightRed"
  | "brightGreen"
  | "brightYellow"
  | "brightBlue"
  | "brightMagenta"
  | "brightCyan"
  | "brightWhite"

export interface Theme {
  name: string
  bg: string
  fg: string
  muted: string
  mutedbg: string
  surface: string
  surfacebg: string
  popover: string
  popoverbg: string
  inverse: string
  inversebg: string
  cursor: string
  cursorbg: string
  selection: string
  selectionbg: string
  primary: string
  primaryfg: string
  secondary: string
  secondaryfg: string
  accent: string
  accentfg: string
  error: string
  errorfg: string
  warning: string
  warningfg: string
  success: string
  successfg: string
  info: string
  infofg: string
  border: string
  inputborder: string
  focusborder: string
  link: string
  disabledfg: string
  palette: string[]
}

export type AnsiPrimary = "yellow" | "cyan" | "magenta" | "green" | "red" | "blue" | "white"
export type HueName = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink"
