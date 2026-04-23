/**
 * Type definitions for @silvery/ansi
 */

// =============================================================================
// Color Types
// =============================================================================

/**
 * The canonical 4-state color tier supported by a terminal.
 *
 * One enum, one spelling — used everywhere a color capability is described
 * (caps, style level, chalk compat, tier quantization, etc.).
 *
 * - `"mono"` — no color (OSC queries disabled, monochrome attribute fallback).
 * - `"ansi16"` — 16-slot palette (SGR 30-37, 90-97 / 40-47, 100-107).
 * - `"256"` — xterm-256 palette (SGR 38;5;n).
 * - `"truecolor"` — 24-bit RGB (SGR 38;2;r;g;b).
 *
 * Prior to km-silvery.terminal-profile-plateau this type went by three
 * different names with three different spellings for the no-color case
 * (`null`, `"none"`, `"mono"`). Canonicalized to `ColorLevel` + `"mono"`.
 */
export type ColorLevel = "mono" | "ansi16" | "256" | "truecolor"

/**
 * RGB color tuple for underline color.
 * Each component is 0-255.
 */
export type RGB = [r: number, g: number, b: number]

/**
 * Standard ANSI color names (the 16 base colors).
 * These map to SGR 30-37 (foreground) and 40-47 (background),
 * plus their bright variants (SGR 90-97, 100-107).
 */
export type AnsiColorName =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "grey"
  | "blackBright"
  | "redBright"
  | "greenBright"
  | "yellowBright"
  | "blueBright"
  | "magentaBright"
  | "cyanBright"
  | "whiteBright"

/**
 * Hex color string pattern.
 * Accepts 3-digit (#rgb) and 6-digit (#rrggbb) hex colors.
 */
type HexColor = `#${string}`

/**
 * RGB function-style color string pattern.
 * Format: rgb(r,g,b) where r, g, b are 0-255.
 */
type RgbColor = `rgb(${string})`

/**
 * Theme token color string pattern.
 * Format: $name — resolved against the active theme at render time.
 * Examples: $primary, $surface, $error, $bg, $fg, $muted
 */
type ThemeToken = `$${string}`

/**
 * Type-safe color value accepted by ansi APIs.
 *
 * Accepts:
 * - ANSI color names: `"red"`, `"cyan"`, `"whiteBright"`, etc.
 * - Hex colors: `"#ff0000"`, `"#f00"`
 * - RGB function: `"rgb(255, 0, 0)"`
 * - Theme tokens: `"$primary"`, `"$error"`, `"$surface"`
 * - Any other string (for forward compatibility with custom color schemes)
 *
 * The union of known literals provides autocompletion in editors while
 * the `string & {}` fallback allows arbitrary color strings.
 */
export type Color = AnsiColorName | HexColor | RgbColor | ThemeToken | (string & {})

// =============================================================================
// Underline Types
// =============================================================================

/**
 * Extended underline styles supported by modern terminals.
 *
 * - `single`: Standard underline (SGR 4:1)
 * - `double`: Two parallel lines (SGR 4:2)
 * - `curly`: Wavy/squiggly line (SGR 4:3) - commonly used for spell check
 * - `dotted`: Dotted line (SGR 4:4)
 * - `dashed`: Dashed line (SGR 4:5)
 */
export type UnderlineStyle = "single" | "double" | "curly" | "dotted" | "dashed"

// Re-export TerminalCaps from detection for convenience
export type { TerminalCaps } from "./detection"
