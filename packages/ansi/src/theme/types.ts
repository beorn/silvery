/**
 * Core type definitions for the theme system.
 *
 * Two-layer architecture:
 *   Layer 1: ColorScheme — 22 terminal colors (what schemes expose; auto-detectable)
 *   Layer 2: Theme — ~33 semantic tokens (what UI apps consume)
 *
 * Pipeline: Scheme catalog → ColorScheme (22) → deriveTheme() → Theme (33)
 */

export interface ColorScheme {
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

export const COLOR_SCHEME_FIELDS = [
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

/**
 * `Theme` is Sterling's `Theme` (silvery 0.19.0 — Sterling is THE Theme).
 *
 * The shape: nested roles (`accent`, `muted`, `surface`, `border`, `cursor`,
 * `selected`, `inverse`, `link`, plus the status roles `info`/`success`/
 * `warning`/`error`) AND flat hyphen-keys (`bg-accent`, `fg-on-error`,
 * `border-focus`, …) on the same object. See `sterling/types.ts` for the
 * full type definition.
 *
 * Legacy single-hex role aliases (`theme.primary`, `theme.muted`,
 * `theme.accent` as strings, `theme.primaryfg`, `theme.errorfg`, …) are no
 * longer part of the type. They're emitted at runtime by the legacy
 * `deriveTheme` paths during the 0.19.x window for consumers that haven't
 * migrated; they will be removed in 0.20.0.
 */
export type { Theme } from "../sterling/types.ts"

/**
 * Metadata describing how the active color scheme was determined.
 *
 * Returned by `detectScheme()` and surfaced at runtime via `useActiveScheme()`.
 * Lets apps log how the theme was detected ("catppuccin-mocha at 87% confidence via
 * fingerprint") or render a debug badge without re-running detection.
 *
 * @example
 * ```tsx
 * const scheme = useActiveScheme()
 * if (scheme?.source === "fingerprint") {
 *   console.log(`detected ${scheme.matchedName} at ${Math.round((scheme.confidence ?? 0) * 100)}%`)
 * }
 * ```
 */
export interface ActiveScheme {
  /** Scheme name pulled from Theme.name or the override. */
  name: string
  /** How the active theme was determined. */
  source: "probe" | "fingerprint" | "fallback" | "override"
  /** Confidence [0,1] — only meaningful for "fingerprint" source. */
  confidence?: number
  /** Catalog scheme name matched (only for "fingerprint" source). */
  matchedName?: string
}

export type AnsiPrimary = "yellow" | "cyan" | "magenta" | "green" | "red" | "blue" | "white"
export type HueName = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink"

/**
 * A typography variant — a named bundle of visual properties that can be
 * applied to a Text component via `variant="h1"`. The variant acts as a
 * *default*: caller props always win over variant values.
 *
 * Color values follow the same syntax as `TextColor` — `$token` strings,
 * hex values, ANSI names, or any string accepted by the color system.
 */
export interface Variant {
  color?: string
  backgroundColor?: string
  bold?: boolean
  italic?: boolean
  dim?: boolean
  underlineStyle?: "single" | "double" | "curly" | "dotted" | "dashed"
}
