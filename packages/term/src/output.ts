/**
 * ANSI output constants and terminal control utilities.
 *
 * NOTE: Buffer rendering is handled by pipeline/output-phase.ts.
 * This file contains only terminal control sequences and constants.
 */

import { hostname } from "node:os"

// ============================================================================
// ANSI Escape Codes
// ============================================================================

const ESC = "\x1b"
const CSI = `${ESC}[`

// Cursor control
const CURSOR_HIDE = `${CSI}?25l`
const CURSOR_SHOW = `${CSI}?25h`
const CURSOR_HOME = `${CSI}H`

// Synchronized Update Mode (DEC private mode 2026)
// Tells the terminal to batch output and paint atomically, preventing tearing.
// Supported by: Ghostty, Kitty, WezTerm, iTerm2, Foot, Alacritty 0.14+, tmux 3.2+
// Terminals that don't support it safely ignore these sequences.
const SYNC_BEGIN = `${CSI}?2026h`
const SYNC_END = `${CSI}?2026l`

// Style reset
const RESET = `${CSI}0m`

// SGR (Select Graphic Rendition) codes
const SGR = {
  // Attributes
  bold: 1,
  dim: 2,
  italic: 3,
  underline: 4,
  blink: 5,
  inverse: 7,
  hidden: 8,
  strikethrough: 9,

  // Attribute resets
  boldOff: 22, // Also resets dim
  italicOff: 23,
  underlineOff: 24,
  blinkOff: 25,
  inverseOff: 27,
  hiddenOff: 28,
  strikethroughOff: 29,

  // Colors (foreground)
  fgDefault: 39,
  fgBlack: 30,
  fgRed: 31,
  fgGreen: 32,
  fgYellow: 33,
  fgBlue: 34,
  fgMagenta: 35,
  fgCyan: 36,
  fgWhite: 37,
  fgBrightBlack: 90,
  fgBrightRed: 91,
  fgBrightGreen: 92,
  fgBrightYellow: 93,
  fgBrightBlue: 94,
  fgBrightMagenta: 95,
  fgBrightCyan: 96,
  fgBrightWhite: 97,

  // Colors (background)
  bgDefault: 49,
  bgBlack: 40,
  bgRed: 41,
  bgGreen: 42,
  bgYellow: 43,
  bgBlue: 44,
  bgMagenta: 45,
  bgCyan: 46,
  bgWhite: 47,
  bgBrightBlack: 100,
  bgBrightRed: 101,
  bgBrightGreen: 102,
  bgBrightYellow: 103,
  bgBrightBlue: 104,
  bgBrightMagenta: 105,
  bgBrightCyan: 106,
  bgBrightWhite: 107,
} as const

// ============================================================================
// Cursor Movement
// ============================================================================

/**
 * Generate ANSI sequence to move cursor to position.
 * Terminal positions are 1-indexed.
 */
function moveCursor(x: number, y: number): string {
  return `${CSI}${y + 1};${x + 1}H`
}

/**
 * Generate ANSI sequence to move cursor up N lines.
 */
function cursorUp(n: number): string {
  if (n <= 0) return ""
  if (n === 1) return `${CSI}A`
  return `${CSI}${n}A`
}

/**
 * Generate ANSI sequence to move cursor down N lines.
 */
function cursorDown(n: number): string {
  if (n <= 0) return ""
  if (n === 1) return `${CSI}B`
  return `${CSI}${n}B`
}

/**
 * Generate ANSI sequence to move cursor right N columns.
 */
function cursorRight(n: number): string {
  if (n <= 0) return ""
  if (n === 1) return `${CSI}C`
  return `${CSI}${n}C`
}

/**
 * Generate ANSI sequence to move cursor left N columns.
 */
function cursorLeft(n: number): string {
  if (n <= 0) return ""
  if (n === 1) return `${CSI}D`
  return `${CSI}${n}D`
}

/**
 * Generate ANSI sequence to move cursor to column.
 */
function cursorToColumn(x: number): string {
  return `${CSI}${x + 1}G`
}

// ============================================================================
// Cursor Shape (DECSCUSR)
// ============================================================================

/**
 * Terminal cursor shape. Combined with blink parameter in setCursorStyle().
 */
export type CursorShape = "block" | "underline" | "bar"

const CURSOR_SHAPE_CODES: Record<CursorShape, { blink: number; steady: number }> = {
  block: { blink: 1, steady: 2 },
  underline: { blink: 3, steady: 4 },
  bar: { blink: 5, steady: 6 },
}

/**
 * Set the terminal cursor shape via DECSCUSR (CSI Ps SP q).
 *
 * Supported by: xterm, Ghostty, Kitty, WezTerm, iTerm2, Alacritty, foot.
 * Terminals that don't support it safely ignore the sequence.
 *
 * @param shape - "block", "underline", or "bar"
 * @param blink - Whether the cursor should blink (default: false)
 */
export function setCursorStyle(shape: CursorShape, blink = false): string {
  const code = blink ? CURSOR_SHAPE_CODES[shape].blink : CURSOR_SHAPE_CODES[shape].steady
  return `${CSI}${code} q`
}

/**
 * Reset the terminal cursor style to the terminal's default (DECSCUSR 0).
 */
export function resetCursorStyle(): string {
  return `${CSI}0 q`
}

// ============================================================================
// Terminal Control
// ============================================================================

/**
 * Enter alternate screen buffer, clear screen, and hide cursor.
 * Cursor is hidden by default - applications must explicitly show it for text input.
 *
 * The clear screen (\x1b[2J) and cursor home (\x1b[H) are essential after entering
 * the alternate buffer to ensure a clean slate. Without this, the terminal may have
 * leftover content from previous sessions that causes rendering artifacts like
 * content appearing at wrong Y positions (bug km-x7ih).
 */
export function enterAlternateScreen(): string {
  return `${CSI}?1049h${CSI}2J${CURSOR_HOME}${CURSOR_HIDE}`
}

/**
 * Leave alternate screen buffer and restore cursor.
 * Includes SYNC_END as a safety belt — ensures synchronized update mode is
 * reset even if the process was interrupted mid-render. Sending SYNC_END
 * when not in sync mode is a harmless no-op.
 */
export function leaveAlternateScreen(): string {
  return `${SYNC_END}${CURSOR_SHOW}${CSI}?1049l`
}

/**
 * Enable mouse tracking.
 */
export function enableMouse(): string {
  // 1003: any-event tracking (all mouse motion — clicks, drags, and hover)
  // 1006: SGR encoding (decimal coordinates, no 223-column limit)
  // 1003 supersedes 1000 (click) and 1002 (button-event), so we only need these two.
  return `${CSI}?1003h${CSI}?1006h`
}

/**
 * Disable mouse tracking.
 */
export function disableMouse(): string {
  return `${CSI}?1006l${CSI}?1003l`
}

/**
 * Kitty keyboard protocol flags (bitfield).
 *
 * | Flag | Bit | Description                                    |
 * | ---- | --- | ---------------------------------------------- |
 * | 1    | 0   | Disambiguate escape codes                      |
 * | 2    | 1   | Report event types (press/repeat/release)      |
 * | 4    | 2   | Report alternate keys                          |
 * | 8    | 3   | Report all keys as escape codes                |
 * | 16   | 4   | Report associated text                         |
 */
export const KittyFlags = {
  DISAMBIGUATE: 1,
  REPORT_EVENTS: 2,
  REPORT_ALTERNATE: 4,
  REPORT_ALL_KEYS: 8,
  REPORT_TEXT: 16,
} as const

/**
 * Enable Kitty keyboard protocol (push mode).
 * Sends CSI > flags u to opt into the specified modes.
 * Default flags=1 (disambiguate only) for maximum compatibility.
 * Supported: Ghostty, Kitty, WezTerm, foot. Ignored by unsupported terminals.
 *
 * @param flags Bitfield of KittyFlags (default: DISAMBIGUATE)
 */
export function enableKittyKeyboard(flags: number = KittyFlags.DISAMBIGUATE): string {
  return `${CSI}>${flags}u`
}

/**
 * Query Kitty keyboard protocol support.
 * Sends CSI ? u — terminal responds with CSI ? flags u if supported.
 * Parse the response to detect which flags the terminal supports.
 */
export function queryKittyKeyboard(): string {
  return `${CSI}?u`
}

/**
 * Disable Kitty keyboard protocol (pop mode stack).
 * Sends CSI < u to restore previous keyboard mode.
 */
export function disableKittyKeyboard(): string {
  return `${CSI}<u`
}

// ============================================================================
// Terminal Notifications
// ============================================================================

/** BEL character — basic terminal bell/notification */
export const BEL = "\x07"

/** iTerm2 notification (OSC 9) */
export function notifyITerm2(message: string): string {
  return `${ESC}]9;${message}${BEL}`
}

/** Kitty notification (OSC 99) with optional title */
export function notifyKitty(message: string, opts?: { title?: string }): string {
  const params = opts?.title ? `;t=t;${opts.title}` : ""
  return `${ESC}]99;i=1:d=0${params};${message}${ESC}\\`
}

/**
 * Send a terminal notification using the best available method.
 *
 * Auto-detects terminal type via TERM_PROGRAM / TERM env vars:
 * - iTerm2 → OSC 9
 * - Kitty → OSC 99
 * - Others → BEL (audible/visual bell)
 */
export function notify(stdout: NodeJS.WriteStream, message: string, opts?: { title?: string }): void {
  const termProgram = process.env.TERM_PROGRAM ?? ""
  const term = process.env.TERM ?? ""

  if (termProgram === "iTerm.app") {
    stdout.write(notifyITerm2(message))
  } else if (term === "xterm-kitty") {
    stdout.write(notifyKitty(message, opts))
  } else {
    stdout.write(BEL)
  }
}

// ============================================================================
// Window Title (OSC 0/2)
// ============================================================================

/**
 * Set the terminal window title using OSC 2 (window title only).
 * Does not affect icon title (tab name in some terminals).
 * Widely supported: xterm, Ghostty, iTerm2, Kitty, WezTerm, Alacritty, foot.
 */
export function setWindowTitle(stdout: NodeJS.WriteStream, title: string): void {
  stdout.write(`${ESC}]2;${title}${BEL}`)
}

/**
 * Set both the window title and icon title using OSC 0.
 * Some terminals treat OSC 0 as equivalent to OSC 2; others also change the
 * dock/taskbar icon name.
 */
export function setWindowAndIconTitle(stdout: NodeJS.WriteStream, title: string): void {
  stdout.write(`${ESC}]0;${title}${BEL}`)
}

/**
 * Reset the terminal window title by sending an empty OSC 2 sequence.
 * The terminal typically reverts to its default title (shell command, etc.).
 */
export function resetWindowTitle(stdout: NodeJS.WriteStream): void {
  stdout.write(`${ESC}]2;${BEL}`)
}

// ============================================================================
// Directory Reporting
// ============================================================================

/** Report current working directory to the terminal via OSC 7.
 * Used by terminals (iTerm2, Ghostty, WezTerm) for tab/split directory inheritance.
 */
export function reportDirectory(stdout: NodeJS.WriteStream, path: string): void {
  // OSC 7 format: ESC ] 7 ; file://hostname/path BEL
  const host = hostname()
  const encoded = encodeURI(path).replace(/#/g, "%23")
  stdout.write(`${ESC}]7;file://${host}${encoded}${BEL}`)
}

// ============================================================================
// Mouse Cursor Shape (OSC 22)
// ============================================================================

/**
 * Mouse cursor shape names for OSC 22.
 *
 * Uses X11/CSS cursor names. Supported by: Ghostty, Kitty (>=0.33), foot,
 * WezTerm (partial). Terminals that don't support OSC 22 safely ignore it.
 */
export type MouseCursorShape = "default" | "text" | "pointer" | "crosshair" | "move" | "not-allowed" | "wait" | "help"

/**
 * Generate OSC 22 sequence to set the mouse cursor shape.
 *
 * @param shape - X11/CSS cursor name
 * @returns ANSI escape sequence string
 */
export function setMouseCursorShape(shape: MouseCursorShape): string {
  return `${ESC}]22;${shape}${BEL}`
}

/**
 * Generate OSC 22 sequence to reset mouse cursor to default.
 *
 * @returns ANSI escape sequence string
 */
export function resetMouseCursorShape(): string {
  return `${ESC}]22;default${BEL}`
}

// ============================================================================
// Export Constants
// ============================================================================

export const ANSI = {
  ESC,
  CSI,
  CURSOR_HIDE,
  CURSOR_SHOW,
  CURSOR_HOME,
  SYNC_BEGIN,
  SYNC_END,
  RESET,
  SGR,
  moveCursor,
  cursorUp,
  cursorDown,
  cursorLeft,
  cursorRight,
  cursorToColumn,
} as const
