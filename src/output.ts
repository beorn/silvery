/**
 * ANSI output constants and terminal control utilities.
 *
 * NOTE: Buffer rendering is handled by pipeline/output-phase.ts.
 * This file contains only terminal control sequences and constants.
 */

// ============================================================================
// ANSI Escape Codes
// ============================================================================

const ESC = "\x1b"
const CSI = `${ESC}[`

// Cursor control
const CURSOR_HIDE = `${CSI}?25l`
const CURSOR_SHOW = `${CSI}?25h`
const CURSOR_HOME = `${CSI}H`

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
 */
export function leaveAlternateScreen(): string {
  return `${CURSOR_SHOW}${CSI}?1049l`
}

/**
 * Enable mouse tracking.
 */
export function enableMouse(): string {
  return `${CSI}?1000h${CSI}?1002h${CSI}?1006h`
}

/**
 * Disable mouse tracking.
 */
export function disableMouse(): string {
  return `${CSI}?1006l${CSI}?1002l${CSI}?1000l`
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
  RESET,
  SGR,
  moveCursor,
  cursorUp,
  cursorDown,
  cursorLeft,
  cursorRight,
  cursorToColumn,
} as const
