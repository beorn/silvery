/**
 * Type definitions for @silvery/ansi
 */

import type { TerminalCaps } from "./detection"

// =============================================================================
// Color Types
// =============================================================================

/**
 * Color level supported by terminal.
 * - 'basic': 16 colors (SGR 30-37, 40-47)
 * - '256': 256 colors (SGR 38;5;n)
 * - 'truecolor': 16M colors (SGR 38;2;r;g;b)
 */
export type ColorLevel = "basic" | "256" | "truecolor"

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

// =============================================================================
// Style Types
// =============================================================================

/**
 * Style options for term.style() method.
 */
export interface StyleOptions {
  color?: Color
  bgColor?: Color
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
}

// =============================================================================
// Console Types
// =============================================================================

/**
 * Console method names that can be intercepted.
 */
export type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug"

/**
 * Entry captured from console.
 */
export interface ConsoleEntry {
  method: ConsoleMethod
  args: unknown[]
  stream: "stdout" | "stderr"
}

// =============================================================================
// Term Types
// =============================================================================

/**
 * Options for createTerm().
 */
export interface CreateTermOptions {
  stdout?: NodeJS.WriteStream
  stdin?: NodeJS.ReadStream

  // Override auto-detection (for testing or forcing)
  color?: ColorLevel | null // override hasColor()
  unicode?: boolean // override hasUnicode()
  cursor?: boolean // override hasCursor()

  // Terminal capabilities override
  caps?: Partial<TerminalCaps>
}

// Re-export TerminalCaps from detection for convenience
export type { TerminalCaps } from "./detection"

// =============================================================================
// Terminal Emulator Types (duck-types for termless integration)
// =============================================================================

/**
 * A screen region — duck-type matching termless RegionView.
 * Provides text content and line access for assertions.
 */
export interface TermScreen {
  getText(): string
  getLines(): string[]
  containsText?(text: string): boolean
}

/**
 * A terminal emulator backend — duck-type matching termless Terminal.
 * Accepts ANSI output, provides screen/scrollback for inspection.
 *
 * Pass to createTerm() for in-process terminal emulation:
 * ```ts
 * import { createTerminal } from "@termless/core"
 * import { createXtermBackend } from "@termless/xtermjs"
 *
 * const emulator = createTerminal({ backend: createXtermBackend(), cols: 80, rows: 24 })
 * using term = createTerm(emulator)
 * ```
 */
export interface TermEmulator {
  readonly cols: number
  readonly rows: number
  readonly screen: TermScreen
  readonly scrollback: TermScreen
  feed(data: Uint8Array | string): void
  resize(cols: number, rows: number): void
  close(): Promise<void>
}
