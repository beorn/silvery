/**
 * @silvery/ansi — Terminal ANSI utilities.
 *
 * Color detection, SGR codes, NO_COLOR/FORCE_COLOR support,
 * terminal capability detection, and ANSI string helpers.
 *
 * @module
 */

// =============================================================================
// Types
// =============================================================================

export type { ColorLevel, RGB, AnsiColorName, Color, UnderlineStyle, TerminalCaps } from "./types"

// =============================================================================
// Constants
// =============================================================================

export {
  UNDERLINE_CODES,
  UNDERLINE_STANDARD,
  UNDERLINE_RESET_STANDARD,
  UNDERLINE_COLOR_RESET,
  buildUnderlineColorCode,
  HYPERLINK_START,
  HYPERLINK_END,
  buildHyperlink,
} from "./constants"

// =============================================================================
// Detection
// =============================================================================

export {
  detectCursor,
  detectInput,
  detectColor,
  detectUnicode,
  detectExtendedUnderline,
  detectTerminalCaps,
  defaultCaps,
} from "./detection"

// =============================================================================
// SGR Codes
// =============================================================================

export { fgColorCode, bgColorCode } from "./sgr-codes"

// =============================================================================
// Utilities
// =============================================================================

export { ANSI_REGEX, stripAnsi, displayLength } from "./utils"
