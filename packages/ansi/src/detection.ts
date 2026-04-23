/**
 * Terminal capability detection.
 *
 * Detects:
 * - Cursor control (can reposition cursor)
 * - Input capability (can read raw keystrokes)
 * - Color level (basic, 256, truecolor)
 * - Unicode support (can render unicode symbols)
 * - Extended underline support (curly, dotted, etc)
 * - Terminal capabilities profile (TerminalCaps)
 *
 * Env-aware color/caps detection now lives in {@link ./profile}. The
 * `detectColor()` / `detectTerminalCaps()` exports here are thin shims that
 * call into the profile module, preserving the public API.
 *
 * Phase 3 of `km-silvery.terminal-profile-plateau` — see `createTerminalProfile`.
 */

import { detectColorFromEnv, detectTerminalCapsFromEnv } from "./profile"
import type { ColorTier } from "./types"

// =============================================================================
// Cursor Detection
// =============================================================================

/**
 * Detect if terminal supports cursor control (repositioning).
 * Returns false for dumb terminals and piped output.
 */
export function detectCursor(stdout: NodeJS.WriteStream): boolean {
  // Not a TTY - no cursor control
  if (!stdout.isTTY) return false

  // Dumb terminal - no cursor control
  if (process.env.TERM === "dumb") return false

  return true
}

// =============================================================================
// Input Detection
// =============================================================================

/**
 * Detect if terminal can read raw keystrokes.
 * Requires stdin to be a TTY with raw mode support.
 */
export function detectInput(stdin: NodeJS.ReadStream): boolean {
  // Not a TTY - no raw input
  if (!stdin.isTTY) return false

  // Check if setRawMode is available
  return typeof stdin.setRawMode === "function"
}

// =============================================================================
// Color Detection
// =============================================================================

/**
 * Detect the color tier supported by the terminal.
 *
 * Returns a 4-state {@link ColorTier}. See {@link createTerminalProfile} for
 * the canonical entry point; this is a shim kept for backward compatibility.
 *
 * Checks (in order):
 * 1. NO_COLOR env var — forces mono
 * 2. FORCE_COLOR env var — forces color tier
 * 3. COLORTERM=truecolor — truecolor support
 * 4. TERM / TERM_PROGRAM / KITTY_WINDOW_ID / WT_SESSION — modern terminals
 * 5. CI detection — basic colors in CI
 */
export function detectColor(stdout: NodeJS.WriteStream): ColorTier {
  return detectColorFromEnv(
    process.env as Record<string, string | undefined>,
    stdout,
  )
}

// =============================================================================
// Unicode Detection
// =============================================================================

/**
 * Detect if terminal can render unicode symbols.
 * Based on TERM, locale, and known terminal apps.
 */
export function detectUnicode(): boolean {
  // CI environments - often UTF-8 capable but be conservative
  if (process.env.CI) {
    // GitHub Actions is UTF-8
    if (process.env.GITHUB_ACTIONS) return true
    // Other CI - check LANG
  }

  // Check locale for UTF-8
  const lang = process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_CTYPE ?? ""
  if (lang.toLowerCase().includes("utf-8") || lang.toLowerCase().includes("utf8")) {
    return true
  }

  // Windows Terminal
  if (process.env.WT_SESSION) {
    return true
  }

  // Modern terminal programs
  const termProgram = process.env.TERM_PROGRAM ?? ""
  if (["iTerm.app", "Ghostty", "WezTerm", "Apple_Terminal"].includes(termProgram)) {
    return true
  }

  // Kitty
  if (process.env.KITTY_WINDOW_ID) {
    return true
  }

  // Check TERM for modern terminals
  const term = process.env.TERM ?? ""
  if (
    term.includes("xterm") ||
    term.includes("rxvt") ||
    term.includes("screen") ||
    term.includes("tmux")
  ) {
    return true
  }

  // Default: assume no unicode for safety
  return false
}

// =============================================================================
// Extended Underline Detection
// =============================================================================

/**
 * Known terminals with extended underline support.
 */
const EXTENDED_UNDERLINE_TERMS = ["xterm-ghostty", "xterm-kitty", "wezterm", "xterm-256color"]

/**
 * Known terminal programs with extended underline support.
 */
const EXTENDED_UNDERLINE_PROGRAMS = ["Ghostty", "iTerm.app", "WezTerm"]

/**
 * Detect if terminal supports extended underline styles.
 * (curly, dotted, dashed, double)
 *
 * Extended underlines use SGR 4:x (style) and SGR 58;2;r;g;b (color).
 * These are NOT supported by Terminal.app, which misinterprets them
 * as background colors causing visual artifacts.
 */
export function detectExtendedUnderline(): boolean {
  const term = process.env.TERM ?? ""
  const termProgram = process.env.TERM_PROGRAM ?? ""

  // Apple Terminal doesn't support extended underlines - check FIRST
  // because it often sets TERM=xterm-256color which would otherwise match
  if (termProgram === "Apple_Terminal") {
    return false
  }

  // Check TERM variable for known modern terminals
  if (EXTENDED_UNDERLINE_TERMS.some((t) => term.includes(t))) {
    return true
  }

  // Check TERM_PROGRAM for known terminal applications
  if (EXTENDED_UNDERLINE_PROGRAMS.some((p) => termProgram.includes(p))) {
    return true
  }

  // Kitty sets KITTY_WINDOW_ID
  if (process.env.KITTY_WINDOW_ID) {
    return true
  }

  // Default to false for unknown terminals
  return false
}

// =============================================================================
// Terminal Capabilities Profile
// =============================================================================

export interface TerminalCaps {
  /** Terminal program name (from TERM_PROGRAM) */
  program: string
  /** TERM value */
  term: string
  /** Color support tier. See {@link ColorTier}. */
  colorLevel: ColorTier
  /** Kitty keyboard protocol supported */
  kittyKeyboard: boolean
  /** Kitty graphics protocol (inline images) */
  kittyGraphics: boolean
  /** Sixel graphics supported */
  sixel: boolean
  /** OSC 52 clipboard */
  osc52: boolean
  /** OSC 8 hyperlinks */
  hyperlinks: boolean
  /** OSC 9/99 notifications */
  notifications: boolean
  /** Bracketed paste mode */
  bracketedPaste: boolean
  /** SGR mouse tracking */
  mouse: boolean
  /** Synchronized output (DEC 2026) */
  syncOutput: boolean
  /** Unicode/emoji support */
  unicode: boolean
  /** SGR 4:x underline style subparameters (curly, dotted, dashed) */
  underlineStyles: boolean
  /** SGR 58 underline color */
  underlineColor: boolean
  /** Text-presentation emoji (⚠, ☑, ⭐) rendered as 2-wide.
   * Modern terminals (Ghostty, iTerm, Kitty) render these at emoji width (2 cells).
   * Terminal.app renders them at text width (1 cell). */
  textEmojiWide: boolean
  /** OSC 66 text sizing protocol likely supported (Kitty 0.40+, Ghostty) */
  textSizingSupported: boolean
  /** Heuristic: likely dark background (for theme selection) */
  darkBackground: boolean
  /** Heuristic: likely has Nerd Font installed (for icon selection) */
  nerdfont: boolean
}

/**
 * Default capabilities (assumes modern terminal with full support).
 */
export function defaultCaps(): TerminalCaps {
  return {
    program: "",
    term: "",
    colorLevel: "truecolor",
    kittyKeyboard: false,
    kittyGraphics: false,
    sixel: false,
    osc52: false,
    hyperlinks: false,
    notifications: false,
    bracketedPaste: true,
    mouse: true,
    syncOutput: false,
    unicode: true,
    underlineStyles: true,
    underlineColor: true,
    textEmojiWide: true,
    textSizingSupported: false,
    darkBackground: true,
    nerdfont: false,
  }
}

/**
 * Detect terminal capabilities from environment variables.
 *
 * Shim for backward compatibility — the real logic lives in
 * {@link createTerminalProfile}. Synchronous. Minimal I/O: may run `defaults`
 * on macOS for Apple_Terminal dark-mode detection (cached).
 */
export function detectTerminalCaps(): TerminalCaps {
  const env = process.env as Record<string, string | undefined>
  const stdout = (process.stdout ?? { isTTY: false }) as NodeJS.WriteStream
  return detectTerminalCapsFromEnv(env, stdout)
}
