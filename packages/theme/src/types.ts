/**
 * Core type definitions for the swatch theme system.
 *
 * Two-layer architecture:
 *   Layer 1: ColorPalette — 22 terminal colors (what palette generators produce)
 *   Layer 2: Theme — 33 semantic tokens (what UI apps consume)
 *
 * Pipeline: Palette generators → ColorPalette (22) → deriveTheme() → Theme (33)
 */

// ============================================================================
// ColorPalette — The 22-Color Terminal Standard
// ============================================================================

/**
 * The 22-color format every modern terminal emulator uses
 * (Ghostty, Kitty, Alacritty, iTerm2, WezTerm).
 *
 * 16 ANSI palette colors + 6 special colors = universal pivot format.
 * All fields are required hex strings (#RRGGBB).
 */
export interface ColorPalette {
  name?: string
  dark?: boolean

  // ── 16 ANSI palette ────────────────────────────────────────────
  /** ANSI 0 — normal black */
  black: string
  /** ANSI 1 — normal red */
  red: string
  /** ANSI 2 — normal green */
  green: string
  /** ANSI 3 — normal yellow */
  yellow: string
  /** ANSI 4 — normal blue */
  blue: string
  /** ANSI 5 — normal magenta */
  magenta: string
  /** ANSI 6 — normal cyan */
  cyan: string
  /** ANSI 7 — normal white */
  white: string
  /** ANSI 8 — bright black */
  brightBlack: string
  /** ANSI 9 — bright red */
  brightRed: string
  /** ANSI 10 — bright green */
  brightGreen: string
  /** ANSI 11 — bright yellow */
  brightYellow: string
  /** ANSI 12 — bright blue */
  brightBlue: string
  /** ANSI 13 — bright magenta */
  brightMagenta: string
  /** ANSI 14 — bright cyan */
  brightCyan: string
  /** ANSI 15 — bright white */
  brightWhite: string

  // ── 6 special colors ────────────────────────────────────────────
  /** Default text color */
  foreground: string
  /** Default background color */
  background: string
  /** Cursor block/line color */
  cursorColor: string
  /** Text rendered under the cursor */
  cursorText: string
  /** Background color of selected text */
  selectionBackground: string
  /** Text color of selected text */
  selectionForeground: string
}

/** All 22 color field names on ColorPalette. */
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

/** Name of one of the 16 ANSI palette colors. */
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

// ============================================================================
// Theme — 33 Semantic Tokens for UI Consumption
// ============================================================================

/**
 * Semantic color token map (33 tokens + palette).
 *
 * Follows shadcn-style pairing: `$name` (area bg) + `$namefg` (text on area).
 * Components reference tokens with a `$` prefix (e.g. `color="$primary"`).
 * All property names are lowercase, no hyphens, no camelCase.
 */
export interface Theme {
  /** Human-readable theme name */
  name: string

  // ── 14 pairs (area + text-on-area) ──────────────────────────────
  /** Default background */
  bg: string
  /** Default text */
  fg: string
  /** Elevated content area background */
  surface: string
  /** Text on elevated surface */
  surfacefg: string
  /** Floating content background (popover, dropdown) */
  popover: string
  /** Text on floating content */
  popoverfg: string
  /** Muted area background (hover state) */
  muted: string
  /** Secondary/muted text (~70% contrast) */
  mutedfg: string
  /** Brand accent area */
  primary: string
  /** Text on primary accent area */
  primaryfg: string
  /** Alternate accent area */
  secondary: string
  /** Text on secondary accent area */
  secondaryfg: string
  /** Attention/pop accent area */
  accent: string
  /** Text on accent area */
  accentfg: string
  /** Error/destructive area */
  error: string
  /** Text on error area */
  errorfg: string
  /** Warning/caution area */
  warning: string
  /** Text on warning area */
  warningfg: string
  /** Success/positive area */
  success: string
  /** Text on success area */
  successfg: string
  /** Neutral info area */
  info: string
  /** Text on info area */
  infofg: string
  /** Selected items background */
  selection: string
  /** Text on selected items */
  selectionfg: string
  /** Chrome area (status/title bar) */
  inverse: string
  /** Text on chrome area */
  inversefg: string
  /** Cursor color */
  cursor: string
  /** Text under cursor */
  cursorfg: string

  // ── 5 standalone tokens ─────────────────────────────────────────
  /** Structural dividers, borders */
  border: string
  /** Interactive control borders (inputs, buttons) */
  inputborder: string
  /** Focus border (always blue) */
  focusborder: string
  /** Hyperlinks */
  link: string
  /** Disabled/placeholder text (~50% contrast) */
  disabledfg: string

  // ── 16 palette passthrough ──────────────────────────────────────
  /** 16 ANSI colors ($color0–$color15) */
  palette: string[]
}

/** Supported primary colors for ANSI 16 theme generation. */
export type AnsiPrimary = "yellow" | "cyan" | "magenta" | "green" | "red" | "blue" | "white"

/** Accent hue name — the 8 hue names for palette generators. */
export type HueName = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink"
