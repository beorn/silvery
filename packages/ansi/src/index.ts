/**
 * @silvery/ansi — Terminal ANSI utilities.
 *
 * Color detection, SGR codes, NO_COLOR/FORCE_COLOR support,
 * terminal capability detection, ANSI string helpers,
 * color maps, quantization, terminal control sequences,
 * extended underlines, and hyperlinks.
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

// =============================================================================
// Color Maps & Quantization
// =============================================================================

export {
  MODIFIERS,
  FG_COLORS,
  BG_COLORS,
  ANSI_16_COLORS,
  nearestAnsi16,
  rgbToAnsi256,
  fgFromRgb,
  bgFromRgb,
} from "./color-maps"

// =============================================================================
// Terminal Control Sequences
// =============================================================================

export {
  enterAltScreen,
  leaveAltScreen,
  clearScreen,
  clearLine,
  cursorTo,
  cursorHome,
  cursorHide,
  cursorShow,
  cursorStyle,
  setTitle,
  enableMouse,
  disableMouse,
  enableBracketedPaste,
  disableBracketedPaste,
  enableSyncUpdate,
  disableSyncUpdate,
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  enableKittyKeyboard,
  disableKittyKeyboard,
} from "./terminal-control"

// =============================================================================
// Extended Underline Functions
// =============================================================================

export {
  underline,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
} from "./underline-ext"

// =============================================================================
// Hyperlink Functions
// =============================================================================

export { hyperlink } from "./hyperlink"
