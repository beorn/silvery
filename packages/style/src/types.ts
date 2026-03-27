/**
 * Type definitions for @silvery/style.
 */

import type { ColorLevel } from "@silvery/ansi"

/** Options for createStyle(). */
export interface StyleOptions {
  /** Color level override. Auto-detected from terminal if omitted. */
  level?: ColorLevel | null
  /** Theme object for $token resolution. Any object with string-valued properties works. */
  theme?: ThemeLike
}

/**
 * Minimal theme interface — any object with string properties.
 * Compatible with @silvery/theme's Theme type without depending on it.
 */
export interface ThemeLike {
  [key: string]: string | string[] | undefined
  palette?: string[]
}

/** A callable style chain — call with a string to apply styles, access properties to chain. */
export interface Style {
  (text: string): string
  (strings: TemplateStringsArray, ...values: unknown[]): string

  // Modifiers
  readonly bold: Style
  readonly dim: Style
  readonly italic: Style
  readonly underline: Style
  readonly inverse: Style
  readonly hidden: Style
  readonly strikethrough: Style

  // Foreground colors
  readonly black: Style
  readonly red: Style
  readonly green: Style
  readonly yellow: Style
  readonly blue: Style
  readonly magenta: Style
  readonly cyan: Style
  readonly white: Style
  readonly gray: Style
  readonly grey: Style
  readonly blackBright: Style
  readonly redBright: Style
  readonly greenBright: Style
  readonly yellowBright: Style
  readonly blueBright: Style
  readonly magentaBright: Style
  readonly cyanBright: Style
  readonly whiteBright: Style

  // Background colors
  readonly bgBlack: Style
  readonly bgRed: Style
  readonly bgGreen: Style
  readonly bgYellow: Style
  readonly bgBlue: Style
  readonly bgMagenta: Style
  readonly bgCyan: Style
  readonly bgWhite: Style
  readonly bgBlackBright: Style
  readonly bgRedBright: Style
  readonly bgGreenBright: Style
  readonly bgYellowBright: Style
  readonly bgBlueBright: Style
  readonly bgMagentaBright: Style
  readonly bgCyanBright: Style
  readonly bgWhiteBright: Style

  // Color methods
  hex(color: string): Style
  rgb(r: number, g: number, b: number): Style
  bgHex(color: string): Style
  bgRgb(r: number, g: number, b: number): Style
  ansi256(code: number): Style
  bgAnsi256(code: number): Style

  // Theme tokens (when theme is provided)
  readonly primary: Style
  readonly secondary: Style
  readonly accent: Style
  readonly error: Style
  readonly warning: Style
  readonly success: Style
  readonly info: Style
  readonly muted: Style
  readonly link: Style
  readonly border: Style
  readonly surface: Style

  /** Resolve a $token or color name to its hex/ANSI value. */
  resolve(token: string): string | undefined
}
