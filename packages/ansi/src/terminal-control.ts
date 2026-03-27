/**
 * ANSI terminal control helpers.
 *
 * Pure string-returning functions for terminal control sequences.
 * No side effects, no stdout writes -- consumers compose and write.
 *
 * Covers: screen management, cursor control, scroll regions,
 * mouse tracking, keyboard protocols, and bracketed paste.
 *
 * @see https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */

// =============================================================================
// Base Constants
// =============================================================================

/** Escape character (0x1B) */
const ESC = "\x1b"

/** Control Sequence Introducer: ESC [ */
const CSI = `${ESC}[`

/** Operating System Command: ESC ] */
const OSC = `${ESC}]`

/** Bell character (0x07) -- used as string terminator in OSC sequences */
const BEL = "\x07"

// =============================================================================
// Screen
// =============================================================================

/**
 * Enter the alternate screen buffer (DEC private mode 1049).
 * The alternate screen preserves the main scrollback buffer.
 */
export function enterAltScreen(): string {
  return `${CSI}?1049h`
}

/**
 * Leave the alternate screen buffer and restore the main screen.
 */
export function leaveAltScreen(): string {
  return `${CSI}?1049l`
}

/**
 * Clear the entire screen (ED 2 -- Erase in Display, all).
 */
export function clearScreen(): string {
  return `${CSI}2J`
}

/**
 * Clear the current line (EL 2 -- Erase in Line, entire line).
 */
export function clearLine(): string {
  return `${CSI}2K`
}

// =============================================================================
// Cursor
// =============================================================================

/**
 * Move cursor to an absolute position.
 * Uses 0-indexed row/col; converts to 1-indexed CUP (Cursor Position).
 */
export function cursorTo(row: number, col: number): string {
  return `${CSI}${row + 1};${col + 1}H`
}

/**
 * Move cursor to the home position (top-left, row 0, col 0).
 */
export function cursorHome(): string {
  return `${CSI}H`
}

/**
 * Hide the cursor (DEC private mode 25, reset).
 */
export function cursorHide(): string {
  return `${CSI}?25l`
}

/**
 * Show the cursor (DEC private mode 25, set).
 */
export function cursorShow(): string {
  return `${CSI}?25h`
}

/**
 * Set cursor style via DECSCUSR (DEC Set Cursor Style).
 *
 * | Style       | Code | Description              |
 * | ----------- | ---- | ------------------------ |
 * | block       | 2    | Steady block             |
 * | underline   | 4    | Steady underline         |
 * | beam        | 6    | Steady bar (vertical)    |
 *
 * Steady variants are used (even codes). Blinking would be odd codes.
 * Supported by: xterm, Ghostty, Kitty, WezTerm, iTerm2, Alacritty, foot.
 */
export function cursorStyle(style: "block" | "underline" | "beam"): string {
  const code = style === "block" ? 2 : style === "underline" ? 4 : 6
  return `${CSI}${code} q`
}

// =============================================================================
// Terminal
// =============================================================================

/**
 * Set the terminal window title using OSC 2 (window title only).
 * Does not affect icon title. Widely supported.
 */
export function setTitle(title: string): string {
  return `${OSC}2;${title}${BEL}`
}

/**
 * Enable mouse tracking.
 *
 * Enables three modes for full mouse support:
 * - 1000: Basic button press/release reporting
 * - 1002: Button-event tracking (drag events)
 * - 1006: SGR extended coordinates (supports >223 columns)
 */
export function enableMouse(): string {
  return `${CSI}?1000h${CSI}?1002h${CSI}?1006h`
}

/**
 * Disable mouse tracking.
 *
 * Disables in reverse order of enabling.
 */
export function disableMouse(): string {
  return `${CSI}?1006l${CSI}?1002l${CSI}?1000l`
}

/**
 * Enable bracketed paste mode (DEC private mode 2004).
 * Terminal wraps pasted text with markers so the app can distinguish
 * paste from typed input.
 */
export function enableBracketedPaste(): string {
  return `${CSI}?2004h`
}

/**
 * Disable bracketed paste mode.
 */
export function disableBracketedPaste(): string {
  return `${CSI}?2004l`
}

/**
 * Enable synchronized update mode (DEC private mode 2026).
 * Tells the terminal to batch output and paint atomically, preventing tearing.
 * Supported by: Ghostty, Kitty, WezTerm, iTerm2, Foot, Alacritty 0.14+, tmux 3.2+.
 * Terminals that don't support it safely ignore this sequence.
 */
export function enableSyncUpdate(): string {
  return `${CSI}?2026h`
}

/**
 * Disable synchronized update mode.
 * Sending this when not in sync mode is a harmless no-op.
 */
export function disableSyncUpdate(): string {
  return `${CSI}?2026l`
}

// =============================================================================
// Scroll
// =============================================================================

/**
 * Set the terminal scroll region (DECSTBM -- DEC Set Top and Bottom Margins).
 * Uses 0-indexed top/bottom; converts to 1-indexed for the terminal.
 *
 * Supported by most modern terminals: xterm, iTerm2, Kitty, Ghostty, WezTerm, etc.
 */
export function setScrollRegion(top: number, bottom: number): string {
  return `${CSI}${top + 1};${bottom + 1}r`
}

/**
 * Reset the scroll region to the full terminal height.
 */
export function resetScrollRegion(): string {
  return `${CSI}r`
}

/**
 * Scroll content up by N lines within the current scroll region (SU).
 * New blank lines appear at the bottom.
 */
export function scrollUp(n: number): string {
  if (n <= 0) return ""
  return `${CSI}${n}S`
}

/**
 * Scroll content down by N lines within the current scroll region (SD).
 * New blank lines appear at the top.
 */
export function scrollDown(n: number): string {
  if (n <= 0) return ""
  return `${CSI}${n}T`
}

// =============================================================================
// Keyboard
// =============================================================================

/**
 * Enable the Kitty keyboard protocol (push mode).
 *
 * Sends CSI > flags u to opt into the specified modes.
 * Supported by: Ghostty, Kitty, WezTerm, foot. Ignored by unsupported terminals.
 *
 * Flags are a bitfield:
 *
 * | Flag | Bit | Description                               |
 * | ---- | --- | ----------------------------------------- |
 * | 1    | 0   | Disambiguate escape codes                 |
 * | 2    | 1   | Report event types (press/repeat/release)  |
 * | 4    | 2   | Report alternate keys                     |
 * | 8    | 3   | Report all keys as escape codes           |
 * | 16   | 4   | Report associated text                    |
 *
 * @param flags Bitfield of Kitty keyboard flags
 */
export function enableKittyKeyboard(flags: number): string {
  return `${CSI}>${flags}u`
}

/**
 * Disable the Kitty keyboard protocol (pop mode stack).
 * Sends CSI < u to restore the previous keyboard mode.
 */
export function disableKittyKeyboard(): string {
  return `${CSI}<u`
}
