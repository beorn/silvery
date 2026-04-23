/**
 * Extended underline style functions.
 *
 * Provides curly, dotted, dashed, and double underline styles
 * with graceful fallback to standard underline on unsupported terminals.
 *
 * Post km-silvery.unicode-plateau Phase 1 (2026-04-23): capability gating
 * reads `caps.underlineStyles` / `caps.underlineColor` — a `TerminalCaps`
 * field populated by {@link createTerminalProfile}. Every helper accepts
 * an optional `caps` argument; when omitted, a lazily-cached
 * `createTerminalProfile()` fills in the ambient value so casual callers
 * (`curlyUnderline("misspelled")`) still work one-shot. Explicit caps wins
 * over the ambient fallback — tests + cross-target code pass their own.
 */

import {
  UNDERLINE_CODES,
  UNDERLINE_COLOR_RESET,
  UNDERLINE_STANDARD,
  UNDERLINE_RESET_STANDARD,
  buildUnderlineColorCode,
} from "./constants"
import { createTerminalProfile } from "./profile"
import type { TerminalCaps } from "./detection"
import type { UnderlineStyle, RGB } from "./types"

// Standard underline ANSI codes (replaces chalk.underline)
const UNDERLINE_OPEN = "\x1b[4m"
const UNDERLINE_CLOSE = "\x1b[24m"

/**
 * Structural subset of {@link TerminalCaps} the underline helpers actually
 * look at. Declared as its own type so callers can synthesize test fixtures
 * without pulling in the full caps surface.
 */
export type UnderlineCaps = Pick<TerminalCaps, "underlineStyles" | "underlineColor">

// Lazy-cache the ambient profile so `curlyUnderline("x")` without caps doesn't
// re-probe env on every call. One cache per process — profile.ts itself
// memoizes expensive sub-probes (macOS defaults read) and the env snapshot
// doesn't change within a process lifetime.
let _ambientCaps: UnderlineCaps | undefined

function ambientCaps(): UnderlineCaps {
  if (_ambientCaps === undefined) {
    const { caps } = createTerminalProfile()
    _ambientCaps = {
      underlineStyles: caps.underlineStyles,
      underlineColor: caps.underlineColor,
    }
  }
  return _ambientCaps
}

/**
 * Reset the ambient caps cache. Test-only hook — call between tests that
 * mutate `process.env` to force the next helper call to re-probe.
 */
export function _resetAmbientCapsForTesting(): void {
  _ambientCaps = undefined
}

// =============================================================================
// Extended Underline Functions
// =============================================================================

/**
 * Apply an extended underline style to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @param style - Underline style (default: "single")
 * @param caps - Terminal capabilities (default: ambient profile)
 * @returns Styled text with ANSI codes
 */
export function underline(
  text: string,
  style: UnderlineStyle = "single",
  caps?: UnderlineCaps,
): string {
  if (!(caps ?? ambientCaps()).underlineStyles || style === "single") {
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
 * @param caps - Terminal capabilities (default: ambient profile)
 * @returns Styled text with curly underline
 *
 * @example
 * ```ts
 * import { curlyUnderline } from '@silvery/ansi';
 *
 * console.log(curlyUnderline('misspelled'));
 * ```
 */
export function curlyUnderline(text: string, caps?: UnderlineCaps): string {
  return underline(text, "curly", caps)
}

/**
 * Apply dotted underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @param caps - Terminal capabilities (default: ambient profile)
 * @returns Styled text with dotted underline
 */
export function dottedUnderline(text: string, caps?: UnderlineCaps): string {
  return underline(text, "dotted", caps)
}

/**
 * Apply dashed underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @param caps - Terminal capabilities (default: ambient profile)
 * @returns Styled text with dashed underline
 */
export function dashedUnderline(text: string, caps?: UnderlineCaps): string {
  return underline(text, "dashed", caps)
}

/**
 * Apply double underline to text.
 * Falls back to regular underline on unsupported terminals.
 *
 * @param text - Text to underline
 * @param caps - Terminal capabilities (default: ambient profile)
 * @returns Styled text with double underline
 */
export function doubleUnderline(text: string, caps?: UnderlineCaps): string {
  return underline(text, "double", caps)
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
 * @param caps - Terminal capabilities (default: ambient profile)
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
export function underlineColor(
  r: number,
  g: number,
  b: number,
  text: string,
  caps?: UnderlineCaps,
): string {
  if (!(caps ?? ambientCaps()).underlineColor) {
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
 * @param caps - Terminal capabilities (default: ambient profile)
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
export function styledUnderline(
  style: UnderlineStyle,
  rgb: RGB,
  text: string,
  caps?: UnderlineCaps,
): string {
  const c = caps ?? ambientCaps()
  if (!c.underlineStyles) {
    return `${UNDERLINE_OPEN}${text}${UNDERLINE_CLOSE}`
  }

  const [r, g, b] = rgb
  const styleCode = UNDERLINE_CODES[style]

  if (!c.underlineColor) {
    // Terminal gates style but not color (rare — usually paired in caps).
    // Emit style-only.
    return `${styleCode}${text}${UNDERLINE_CODES.reset}`
  }

  const colorCode = buildUnderlineColorCode(r, g, b)
  return `${styleCode}${colorCode}${text}${UNDERLINE_CODES.reset}${UNDERLINE_COLOR_RESET}`
}
