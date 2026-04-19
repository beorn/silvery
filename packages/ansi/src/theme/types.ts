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

export interface Theme {
  name: string
  // ── Root pair ────────────────────────────────────────────────────
  bg: string
  fg: string
  // ── Surface pairs ────────────────────────────────────────────────
  muted: string
  mutedbg: string
  surface: string
  surfacebg: string
  popover: string
  popoverbg: string
  inverse: string
  inversebg: string
  // ── Cursor + selection ───────────────────────────────────────────
  cursor: string
  cursorbg: string
  selection: string
  selectionbg: string
  // ── Accents ──────────────────────────────────────────────────────
  primary: string
  primaryfg: string
  secondary: string
  secondaryfg: string
  accent: string
  accentfg: string
  // ── Semantic states ──────────────────────────────────────────────
  error: string
  errorfg: string
  warning: string
  warningfg: string
  success: string
  successfg: string
  info: string
  infofg: string
  // ── Borders + links ──────────────────────────────────────────────
  border: string
  inputborder: string
  focusborder: string
  link: string
  disabledfg: string
  palette: string[]

  // Brand anchor (Apple system-color model) — THE app's identity. Auto-derives
  // from scheme.primary; apps override via <ThemeProvider tokens={{ brand: "#…" }}>.
  brand: string
  /** Kebab key for $brand-hover. Hover lightness shift (+0.04L OKLCH). */
  "brand-hover": string
  /** Kebab key for $brand-active. Active lightness shift (+0.08L OKLCH). */
  "brand-active": string

  // State variants — hover (+0.04L) and active (+0.08L) shifts from base in OKLCH.
  // Direction: dark themes brighten, light themes darken.
  // Access via $primary-hover, $primary-active, $accent-hover, etc. in JSX.
  /** Kebab key for $primary-hover. */
  "primary-hover": string
  /** Kebab key for $primary-active. */
  "primary-active": string
  /** Kebab key for $accent-hover. */
  "accent-hover": string
  /** Kebab key for $accent-active. */
  "accent-active": string
  /** Kebab key for $fg-hover. */
  "fg-hover": string
  /** Kebab key for $fg-active. */
  "fg-active": string
  /** Kebab key for $bg-selected-hover. */
  "bg-selected-hover": string
  /** Kebab key for $bg-surface-hover. */
  "bg-surface-hover": string

  // Categorical color ring — 8 harmonious hues for tags, chart series, calendar
  // categories, priority levels, any color that's CATEGORICAL, not stateful.
  // ensureContrast-adjusted against bg. Use $red, $orange, …, $pink in JSX.
  //
  // Distinguish from:
  //   - $color0..$color15           — raw terminal ANSI (user's theme verbatim)
  //   - $error/$warning/$success    — semantic state (communicates meaning)
  //   - $brand                      — app identity anchor (one color)
  red: string
  orange: string
  yellow: string
  green: string
  teal: string
  blue: string
  purple: string
  pink: string

  /**
   * Named typography variants — resolved by `<Text variant="h1">`.
   *
   * Each variant is a bundle of visual defaults (color, bold, italic, dim,
   * underlineStyle). Caller props always win over variant values — the variant
   * is the *default*, not an override.
   *
   * Apps extend variants via:
   * ```tsx
   * <ThemeProvider tokens={{ variants: { hero: { color: "$brand", bold: true } } }}>
   * ```
   */
  variants: Record<string, Variant>
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
