/**
 * Type definitions for the style system.
 */

import type { ColorLevel } from "../types.ts"
import type { TerminalCaps } from "../detection.ts"

/**
 * Structural subset of {@link TerminalCaps} the extended-underline methods on
 * {@link Style} actually read. Declared here so test fixtures can synthesize
 * underline-specific caps without constructing a full profile. Prefer passing
 * `term.caps` / `createTerminalProfile().caps` in production code.
 *
 * Post km-silvery.caps-restructure (Phase 7, 2026-04-23): TerminalCaps.
 * underlineStyles became `readonly UnderlineStyle[]` (was `boolean`). The
 * Style implementation only needs a boolean gate ("does any extended style
 * work?") so this shape stays boolean — callers project from the array at
 * construction: `{ underlineStyles: caps.underlineStyles.length > 0 }`.
 */
export interface UnderlineCaps {
  readonly underlineStyles: boolean
  readonly underlineColor: boolean
}

/** Options for createStyle(). */
export interface StyleOptions {
  /**
   * Color tier override. Auto-detected from terminal if omitted.
   *
   * Accepts the canonical {@link ColorLevel} (`"mono" | "ansi16" | "256" | "truecolor"`).
   * `null` is accepted as a compat alias for `"mono"` — prior to
   * km-silvery.terminal-profile-plateau the no-color case was spelt `null`.
   */
  level?: ColorLevel | null
  /** Theme object for $token resolution. Any object with string-valued properties works. */
  theme?: ThemeLike | object
  /**
   * Underline capabilities. Drives the extended-underline methods on the
   * returned {@link Style}. When absent, `createStyle` auto-detects via the
   * same `createTerminalProfile()` call it uses for {@link level}, so
   * casual consumers typically don't pass this. Pass explicit caps when:
   * - Tests want deterministic fixtures (`{ underlineStyles: false }`)
   * - A Term is in scope (`caps: term.caps`)
   * - Running on a non-Node target where auto-detect can't work
   *
   * Added in km-silvery.underline-on-style (Phase 6 of the unicode plateau,
   * 2026-04-23) when the bare `curlyUnderline()` exports were folded into
   * `Style` methods. Previously, every call threaded caps per-invocation.
   */
  caps?: UnderlineCaps
}

/**
 * Minimal theme interface for token resolution. Two forms:
 * - Concrete types (Theme from @silvery/theme) — no index signature needed
 * - Inline objects in tests/config — use `as ThemeLike` or `satisfies ThemeLike`
 *
 * The `resolveThemeColor` function accepts `object` to avoid the TS index
 * signature constraint. Internal code casts to Record<string, unknown>.
 */
export interface ThemeLike {
  palette?: string[]
}

/** A callable style chain — call with a string to apply styles, access properties to chain. */
export interface Style {
  (): string
  (text: string): string
  (...args: unknown[]): string
  (strings: TemplateStringsArray, ...values: unknown[]): string

  // Modifiers
  readonly reset: Style
  readonly bold: Style
  readonly dim: Style
  readonly italic: Style
  readonly underline: Style
  readonly overline: Style
  readonly inverse: Style
  readonly hidden: Style
  readonly strikethrough: Style
  readonly visible: Style

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

  // Extended underline (terminators — call with text, not chainable).
  // Post km-silvery.underline-on-style (Phase 6, 2026-04-23): these replace
  // the bare `curlyUnderline()` etc. exports from `@silvery/ansi`. Each
  // falls back to standard SGR 4 when the style's caps lack
  // `underlineStyles` / `underlineColor` — same graceful-degradation
  // contract the retired helpers used.
  curlyUnderline(text: string): string
  dottedUnderline(text: string): string
  dashedUnderline(text: string): string
  doubleUnderline(text: string): string
  underlineColor(r: number, g: number, b: number, text: string): string
  styledUnderline(
    style: import("../types.ts").UnderlineStyle,
    rgb: import("../types.ts").RGB,
    text: string,
  ): string

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

  /**
   * Mutable color level — chalk-compatible.
   * Setting this changes the color level for ALL subsequent calls on this instance.
   * Chalk levels: 0 = none, 1 = basic (16), 2 = 256, 3 = truecolor.
   */
  level: number
}
