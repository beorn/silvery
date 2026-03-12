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
 */

import { spawnSync } from "child_process"
import type { ColorLevel } from "./types"

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
 * Known CI environments that may not support colors well.
 */
const CI_ENVS = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "JENKINS_URL",
  "BUILDKITE",
  "CIRCLECI",
  "TRAVIS",
]

/**
 * Detect color level supported by terminal.
 * Returns null if no color support.
 *
 * Checks (in order):
 * 1. NO_COLOR env var - forces no color
 * 2. FORCE_COLOR env var - forces color level
 * 3. COLORTERM=truecolor - truecolor support
 * 4. TERM patterns - detect from terminal type
 * 5. CI detection - basic colors in CI
 */
export function detectColor(stdout: NodeJS.WriteStream): ColorLevel | null {
  // NO_COLOR takes precedence (see https://no-color.org/)
  if (process.env.NO_COLOR !== undefined) {
    return null
  }

  // FORCE_COLOR overrides detection
  const forceColor = process.env.FORCE_COLOR
  if (forceColor !== undefined) {
    if (forceColor === "0" || forceColor === "false") return null
    if (forceColor === "1") return "basic"
    if (forceColor === "2") return "256"
    if (forceColor === "3") return "truecolor"
    // Any other truthy value defaults to basic
    return "basic"
  }

  // Non-TTY without FORCE_COLOR - no colors
  if (!stdout.isTTY) {
    return null
  }

  // Dumb terminal
  if (process.env.TERM === "dumb") {
    return null
  }

  // COLORTERM=truecolor indicates 24-bit support
  const colorTerm = process.env.COLORTERM
  if (colorTerm === "truecolor" || colorTerm === "24bit") {
    return "truecolor"
  }

  // Check TERM for color hints
  const term = process.env.TERM ?? ""

  // Known truecolor terminals
  if (
    term.includes("truecolor") ||
    term.includes("24bit") ||
    term.includes("xterm-ghostty") ||
    term.includes("xterm-kitty") ||
    term.includes("wezterm")
  ) {
    return "truecolor"
  }

  // 256-color terminals
  if (term.includes("256color") || term.includes("256")) {
    return "256"
  }

  // Modern macOS terminals typically support truecolor
  const termProgram = process.env.TERM_PROGRAM
  if (termProgram === "iTerm.app" || termProgram === "Apple_Terminal") {
    return termProgram === "iTerm.app" ? "truecolor" : "256"
  }

  // Ghostty, WezTerm, Kitty via TERM_PROGRAM
  if (termProgram === "Ghostty" || termProgram === "WezTerm") {
    return "truecolor"
  }

  // Kitty via env var
  if (process.env.KITTY_WINDOW_ID) {
    return "truecolor"
  }

  // xterm-color variants get basic colors
  if (term.includes("xterm") || term.includes("color") || term.includes("ansi")) {
    return "basic"
  }

  // CI environments usually support basic colors
  if (CI_ENVS.some((env) => process.env[env] !== undefined)) {
    return "basic"
  }

  // Windows Terminal (modern)
  if (process.env.WT_SESSION) {
    return "truecolor"
  }

  // Default: basic colors if TTY
  return "basic"
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
  /** Color support level */
  colorLevel: "none" | "basic" | "256" | "truecolor"
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
 * Cached result of macOS dark mode detection.
 * Computed lazily on first access to avoid spawnSync at module load time.
 */
let cachedMacOSDarkMode: boolean | undefined

/**
 * Check if macOS is in dark mode by reading the system appearance preference.
 * Uses `defaults read -g AppleInterfaceStyle` — returns "Dark" when dark mode
 * is active, exits non-zero when light mode. ~2ms via spawnSync.
 *
 * Result is cached after first call to avoid repeated process spawns.
 */
function detectMacOSDarkMode(): boolean {
  if (cachedMacOSDarkMode !== undefined) return cachedMacOSDarkMode

  try {
    const result = spawnSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
      encoding: "utf-8",
      timeout: 500,
    })
    cachedMacOSDarkMode = result.stdout?.trim() === "Dark"
  } catch {
    cachedMacOSDarkMode = false
  }

  return cachedMacOSDarkMode
}

/** Detect terminal capabilities from environment variables.
 * Synchronous. Minimal I/O: may run `defaults` on macOS for Apple_Terminal.
 */
export function detectTerminalCaps(): TerminalCaps {
  const program = process.env.TERM_PROGRAM ?? ""
  const term = process.env.TERM ?? ""
  const colorTerm = process.env.COLORTERM ?? ""
  const noColor = process.env.NO_COLOR !== undefined

  const isAppleTerminal = program === "Apple_Terminal"

  let colorLevel: TerminalCaps["colorLevel"] = "none"
  if (!noColor) {
    if (isAppleTerminal) {
      colorLevel = "256"
    } else if (colorTerm === "truecolor" || colorTerm === "24bit") {
      colorLevel = "truecolor"
    } else if (term.includes("256color")) {
      colorLevel = "256"
    } else if (process.stdout?.isTTY) {
      colorLevel = "basic"
    }
  }

  const isKitty = term === "xterm-kitty"
  const isITerm = program === "iTerm.app"
  const isGhostty = program === "ghostty"
  const isWezTerm = program === "WezTerm"
  const isAlacritty = program === "Alacritty"
  const isFoot = term === "foot" || term === "foot-extra"
  const isModern = isKitty || isITerm || isGhostty || isWezTerm || isFoot

  // Kitty v0.40+ supports OSC 66 text sizing
  let isKittyWithTextSizing = false
  if (isKitty) {
    const version = process.env.TERM_PROGRAM_VERSION ?? ""
    const parts = version.split(".")
    const major = Number(parts[0]) || 0
    const minor = Number(parts[1]) || 0
    isKittyWithTextSizing = major > 0 || (major === 0 && minor >= 40)
  }

  let darkBackground = !isAppleTerminal
  const colorFgBg = process.env.COLORFGBG
  if (colorFgBg) {
    const parts = colorFgBg.split(";")
    const bg = parseInt(parts[parts.length - 1] ?? "", 10)
    if (!isNaN(bg)) {
      darkBackground = bg < 7
    }
  } else if (isAppleTerminal) {
    darkBackground = detectMacOSDarkMode()
  }

  let nerdfont = isModern || isAlacritty
  const nfEnv = process.env.NERDFONT
  if (nfEnv === "0" || nfEnv === "false") nerdfont = false
  else if (nfEnv === "1" || nfEnv === "true") nerdfont = true

  const underlineExtensions = isModern || isAlacritty

  return {
    program,
    term,
    colorLevel,
    kittyKeyboard: isKitty || isGhostty || isWezTerm || isFoot,
    kittyGraphics: isKitty || isGhostty,
    sixel: isFoot || isWezTerm,
    osc52: isModern || isAlacritty,
    hyperlinks: isModern || isAlacritty,
    notifications: isITerm || isKitty,
    bracketedPaste: true,
    mouse: true,
    syncOutput: isModern || isAlacritty,
    unicode: true,
    underlineStyles: underlineExtensions,
    underlineColor: underlineExtensions,
    textEmojiWide: !isAppleTerminal,
    textSizingSupported: isKittyWithTextSizing || isGhostty,
    darkBackground,
    nerdfont,
  }
}
