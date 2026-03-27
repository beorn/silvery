/**
 * Extended underline style functions.
 *
 * Provides curly, dotted, dashed, and double underline styles
 * with graceful fallback to standard underline on unsupported terminals.
 */

import {
  UNDERLINE_CODES,
  UNDERLINE_COLOR_RESET,
  UNDERLINE_STANDARD,
  UNDERLINE_RESET_STANDARD,
  buildUnderlineColorCode,
} from "./constants"
import { detectExtendedUnderline } from "./detection"
import type { UnderlineStyle, RGB } from "./types"

// Standard underline ANSI codes (replaces chalk.underline)
const UNDERLINE_OPEN = "\x1b[4m"
const UNDERLINE_CLOSE = "\x1b[24m"

// =============================================================================
// Extended Underline Functions
// =============================================================================

/**
 * Apply an extended underline style to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @param style - Underline style (default: "single")
 * @returns Styled text with ANSI codes
 */
export function underline(text: string, style: UnderlineStyle = "single"): string {
  if (!detectExtendedUnderline() || style === "single") {
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }

  return `${UNDERLINE_CODES[style]}${text}${UNDERLINE_CODES.reset}`
}

/**
 * Apply curly/wavy underline to text.
 * Commonly used for spell check errors in IDEs.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @returns Styled text with curly underline
 *
 * @example
 * ```ts
 * import { curlyUnderline } from '@silvery/ansi';
 *
 * console.log(curlyUnderline('misspelled'));
 * ```
 */
export function curlyUnderline(text: string): string {
  return underline(text, "curly")
}

/**
 * Apply dotted underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @returns Styled text with dotted underline
 */
export function dottedUnderline(text: string): string {
  return underline(text, "dotted")
}

/**
 * Apply dashed underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @returns Styled text with dashed underline
 */
export function dashedUnderline(text: string): string {
  return underline(text, "dashed")
}

/**
 * Apply double underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @returns Styled text with double underline
 */
export function doubleUnderline(text: string): string {
  return underline(text, "double")
}

// =============================================================================
// Underline Color Functions
// =============================================================================

/**
 * Set underline color independently of text color.
 * On unsupported terminals, the color is ignored but underline still applies.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @param text - Text to style
 * @returns Styled text with colored underline
 *
 * @example
 * ```ts
 * import { underlineColor } from '@silvery/ansi';
 *
 * // Red underline (text color unchanged)
 * console.log(underlineColor(255, 0, 0, 'warning'));
 * ```
 */
export function underlineColor(r: number, g: number, b: number, text: string): string {
  if (!detectExtendedUnderline()) {
    // Fallback: just apply regular underline, ignore color
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }

  const colorCode = buildUnderlineColorCode(r, g, b)
  return `${UNDERLINE_STANDARD}${colorCode}${text}${UNDERLINE_COLOR_RESET}${UNDERLINE_RESET_STANDARD}`
}

/**
 * Combine underline style with underline color.
 *
 * @param style - Underline style ('curly', 'dotted', 'dashed', 'double', 'single')
 * @param rgb - Color as [r, g, b] tuple (0-255 each)
 * @param text - Text to style
 * @returns Styled text with colored underline in specified style
 *
 * @example
 * ```ts
 * import { styledUnderline } from '@silvery/ansi';
 *
 * // Red curly underline (spell-check style)
 * console.log(styledUnderline('curly', [255, 0, 0], 'misspelled'));
 * ```
 */
export function styledUnderline(style: UnderlineStyle, rgb: RGB, text: string): string {
  if (!detectExtendedUnderline()) {
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }

  const [r, g, b] = rgb
  const styleCode = UNDERLINE_CODES[style]
  const colorCode = buildUnderlineColorCode(r, g, b)

  return `${styleCode}${colorCode}${text}${UNDERLINE_CODES.reset}${UNDERLINE_COLOR_RESET}`
}
