/**
 * ANSI escape code constants for extended terminal features.
 *
 * @see https://sw.kovidgoyal.net/kitty/underlines/
 * @see https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
 */

// =============================================================================
// Extended Underline Styles (ISO 8613-6 / ECMA-48)
// =============================================================================

/**
 * Extended underline style codes.
 * Uses colon-separated parameters (ISO 8613-6): \x1b[4:Nm
 */
export const UNDERLINE_CODES = {
  /** No underline */
  none: "\x1b[4:0m",
  /** Standard single underline */
  single: "\x1b[4:1m",
  /** Double underline (two parallel lines) */
  double: "\x1b[4:2m",
  /** Curly/wavy underline (spell check style) */
  curly: "\x1b[4:3m",
  /** Dotted underline */
  dotted: "\x1b[4:4m",
  /** Dashed underline */
  dashed: "\x1b[4:5m",
  /** Reset extended underline (same as none) */
  reset: "\x1b[4:0m",
} as const;

// =============================================================================
// Standard Underline (Fallback)
// =============================================================================

/** Standard underline on (SGR 4) - works on all terminals */
export const UNDERLINE_STANDARD = "\x1b[4m";

/** Standard underline off (SGR 24) */
export const UNDERLINE_RESET_STANDARD = "\x1b[24m";

// =============================================================================
// Underline Color (SGR 58/59)
// =============================================================================

/**
 * Reset underline color to default (SGR 59)
 */
export const UNDERLINE_COLOR_RESET = "\x1b[59m";

/**
 * Build underline color escape code for RGB values.
 * Format: \x1b[58:2::r:g:bm (SGR 58 with RGB color space)
 */
export function buildUnderlineColorCode(r: number, g: number, b: number): string {
  return `\x1b[58:2::${r}:${g}:${b}m`;
}

// =============================================================================
// Hyperlinks (OSC 8)
// =============================================================================

/** OSC 8 hyperlink start sequence */
export const HYPERLINK_START = "\x1b]8;;";

/** OSC 8 hyperlink end sequence (ST - String Terminator) */
export const HYPERLINK_END = "\x1b\\";

/**
 * Build a hyperlink escape sequence.
 * Format: \x1b]8;;<url>\x1b\\ <text> \x1b]8;;\x1b\\
 */
export function buildHyperlink(text: string, url: string): string {
  return `${HYPERLINK_START}${url}${HYPERLINK_END}${text}${HYPERLINK_START}${HYPERLINK_END}`;
}
