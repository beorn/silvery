/**
 * ANSI string utilities.
 *
 * This module can be imported separately via `@silvery/ansi/utils`
 * for projects that only need ANSI stripping without chalk.
 */

import stringWidth from "string-width"

// =============================================================================
// ANSI Regex Pattern
// =============================================================================

/**
 * ANSI escape code pattern for stripping.
 *
 * Matches:
 * - ESC CSI SGR sequences: \x1b[31m, \x1b[4:3m, \x1b[38:2::255:100:0m
 * - C1 CSI SGR sequences: \x9b31m, \x9b4:3m
 * - ESC OSC 8 hyperlinks (BEL-terminated): \x1b]8;;<url>\x07
 * - ESC OSC 8 hyperlinks (ST-terminated): \x1b]8;;<url>\x1b\\
 * - C1 OSC 8 hyperlinks (BEL-terminated): \x9d8;;<url>\x07
 * - C1 OSC 8 hyperlinks (ST-terminated): \x9d8;;<url>\x1b\\
 * - C1 OSC 8 hyperlinks (C1 ST-terminated): \x9d8;;<url>\x9c
 */
export const ANSI_REGEX =
  /\x1b\[[0-9;:]*m|\x9b[0-9;:]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)|\x9d8;;[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Strip all ANSI escape codes from a string.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Clean string with all ANSI codes removed
 *
 * @example
 * ```ts
 * stripAnsi('\x1b[31mred\x1b[0m') // 'red'
 * stripAnsi('\x1b[4:3mwavy\x1b[4:0m') // 'wavy'
 * ```
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "")
}

/**
 * Get the display width of a string, excluding ANSI escape codes.
 * Correctly handles CJK characters, emoji, and other wide characters.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Number of terminal columns the text will occupy
 *
 * @example
 * ```ts
 * displayLength('\x1b[31mhello\x1b[0m') // 5
 * displayLength('hello') // 5
 * displayLength('한글') // 4 (2 chars × 2 cells each)
 * ```
 */
export function displayLength(text: string): number {
  return stringWidth(stripAnsi(text))
}
