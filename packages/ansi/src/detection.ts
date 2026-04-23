/**
 * Narrow-scope terminal probes.
 *
 * Detects:
 * - Cursor control (can reposition cursor)
 * - Input capability (can read raw keystrokes)
 *
 * Broader caps/color/unicode/underline detection is owned by {@link ./profile} —
 * import `createTerminalProfile()` (sync) or `probeTerminalProfile()` (async
 * with theme) for the canonical single-source-of-truth entry point. Every
 * TerminalCaps field is resolved there; consumers read `caps.unicode`,
 * `caps.underlineStyles`, `caps.textEmojiWide`, etc. directly.
 *
 * Post km-silvery.unicode-plateau Phase 1: `detectUnicode()` and
 * `detectExtendedUnderline()` are retired — their logic moved into
 * {@link ./profile#detectTerminalCapsFromEnv} so the profile is the one and
 * only env reader.
 *
 * Post km-silvery.plateau-delete-legacy-shims (H6 /big review 2026-04-23):
 * the `detectColor()` and `detectTerminalCaps()` shims are gone — every
 * call site that asked "what's the color tier?" or "what's the full caps?"
 * now routes through the profile factory instead.
 */

import type { ColorTier } from "./types"

// =============================================================================
// Cursor Detection — removed unicode-plateau Phase 3.
//
// `detectCursor(stdout)` used to live here. Its "isTTY + !dumb" signal is
// now a TerminalCaps field — callers read `createTerminalProfile({stdout}).caps.cursor`
// or `term.caps.cursor`. This drops the last env read outside the profile
// factory in `@silvery/ansi`.
// =============================================================================

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
// Color Detection — removed H6 of /big review 2026-04-23.
// Unicode + Extended Underline Detection — removed unicode-plateau Phase 1.
//
// Historic helpers `detectColor(stdout)`, `detectUnicode()`, and
// `detectExtendedUnderline()` used to live here. Every one of them re-read
// `process.env` outside the profile factory, breaking the "one detection,
// one profile" invariant. Call sites now use:
//
//   `createTerminalProfile({ stdout }).colorTier`        // color tier
//   `createTerminalProfile().caps.unicode`               // unicode
//   `createTerminalProfile().caps.underlineStyles`       // extended underline
//
// The profile factory handles the full NO_COLOR > FORCE_COLOR > auto chain,
// the UTF-8 locale / CI / modern-terminal fan-out, and the isModern/isAlacritty
// rules for extended underline — all from a single env read.
// =============================================================================

// =============================================================================
// Terminal Capabilities Profile
// =============================================================================

export interface TerminalCaps {
  /** Terminal program name (from TERM_PROGRAM) */
  program: string
  /** Terminal program version string (from TERM_PROGRAM_VERSION). Empty when
   * the host doesn't advertise a version. Together with `program`, forms the
   * `program@version` fingerprint used as the probe-cache key in
   * `@silvery/ag-term/text-sizing`. See km-silvery.unicode-plateau Phase 2. */
  version: string
  /** TERM value */
  term: string
  /** Can the host reposition the cursor? True when the output stream is a
   * TTY and `TERM` is not `"dumb"`. Absorbed from the standalone
   * `detectCursor()` helper in unicode-plateau Phase 3. */
  cursor: boolean
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
    version: "",
    term: "",
    cursor: false,
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

// `detectTerminalCaps()` was removed in H6 of the /big review 2026-04-23.
// Callers that want a full caps probe now use:
//   `createTerminalProfile().caps`   // sync, env-based auto-detect
//   `await probeTerminalProfile().caps`  // async, bundles theme too
// Both entry points are exported from `@silvery/ansi` and re-exported
// through `@silvery/ag-term` and `@silvery/ag-react`.
