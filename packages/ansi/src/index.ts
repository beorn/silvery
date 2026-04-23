/**
 * @silvery/ansi — Everything terminal.
 *
 * Unified package for terminal styling, ANSI primitives, color detection,
 * theme derivation, and terminal control sequences.
 *
 * @example
 * ```ts
 * // Pre-configured global — zero config
 * import { style } from "@silvery/ansi"
 * style.bold.red("error")
 * style.primary("deploy")
 *
 * // Create your own
 * import { createStyle, createPlainStyle } from "@silvery/ansi"
 * const s = createStyle({ theme })
 *
 * // Terminal control
 * import { enterAltScreen, cursorTo, enableMouse } from "@silvery/ansi"
 *
 * // Theme derivation
 * import { deriveTheme, detectTheme } from "@silvery/ansi"
 * ```
 *
 * @module
 */

// =============================================================================
// Types
// =============================================================================

export type { ColorLevel, RGB, AnsiColorName, Color, UnderlineStyle, TerminalCaps } from "./types"
export type { TerminalEmulator } from "./emulator"

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
// Caps + Emulator defaults. Full caps/color detection is owned by
// {@link ./profile} (`createTerminalProfile` / `probeTerminalProfile`) — these
// are just the headless/unknown fallbacks used by the profile factory.
//
// Post km-silvery.plateau-delete-legacy-shims (H6 /big review 2026-04-23):
// `detectColor` and `detectTerminalCaps` are removed — every consumer now
// routes through the profile factory instead.
//
// Post km-silvery.plateau-finishing (2026-04-23): the file formerly known as
// `detection.ts` was split into `caps.ts` + `emulator.ts` — its narrow-probe
// docstring was the last vestige of a design that disappeared in the unicode
// plateau; the filename didn't match what readers looking for `TerminalCaps`
// expected.
// =============================================================================

export { defaultCaps } from "./caps"
export { defaultEmulator } from "./emulator"

// =============================================================================
// Terminal Profile — single source of truth for terminal detection.
// =============================================================================

export {
  createTerminalProfile,
  probeTerminalProfile,
  defaultProfile,
  detectColorFromEnv,
  detectTerminalProfileFromEnv,
} from "./profile"
export type {
  TerminalProfile,
  ColorProvenance,
  TerminalProfileStdout,
  TerminalProfileStdin,
  CreateTerminalProfileOptions,
  ProbeTerminalProfileOptions,
} from "./profile"

// =============================================================================
// SGR Codes
// =============================================================================

export { fgColorCode, bgColorCode } from "./sgr-codes"

// =============================================================================
// Utilities
// =============================================================================

export {
  ANSI_REGEX,
  stripAnsi,
  displayLength,
  warnOnce,
  _resetWarnOnceForTesting,
} from "./utils"

// =============================================================================
// Color Maps & Quantization
// =============================================================================

export {
  MODIFIERS,
  FG_COLORS,
  BG_COLORS,
  ANSI_16_COLORS,
  ANSI16_SLOT_HEX,
  nearestAnsi16,
  rgbToAnsi256,
  ansi256ToHex,
  fgFromRgb,
  bgFromRgb,
  quantizeHex,
  pickColorLevel,
} from "./color-maps"

// =============================================================================
// Flat Projection (generic — any nested-hex DesignSystem Theme)
// =============================================================================

export { bakeFlat, defaultFlattenRule } from "./flatten"
export type { FlattenRule } from "./flatten"

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
// Kitty Graphics Protocol — cell-sized overlay placements
// =============================================================================

export {
  BACKDROP_SCRIM_IMAGE_ID,
  BACKDROP_PLACEMENT_X_STRIDE,
  backdropPlacementId,
  buildScrimPixels,
  kittyUploadScrimImage,
  kittyPlaceAt,
  kittyDeletePlacement,
  kittyDeleteAllScrimPlacements,
  cupTo,
  CURSOR_SAVE,
  CURSOR_RESTORE,
} from "./kitty-graphics"

// =============================================================================
// Extended Underline — removed in Phase 6 of the unicode plateau (2026-04-23).
//
// The bare `curlyUnderline()` / `dottedUnderline()` / `dashedUnderline()` /
// `doubleUnderline()` / `underlineColor()` / `styledUnderline()` /
// `underline()` exports were folded into methods on `Style` (the object
// returned by `createStyle(caps)`). Caps now flow through the style
// factory instead of being threaded per-call — one dependency injection
// point per styling consumer.
//
// Migration:
//   Before:  curlyUnderline("misspelled", caps)
//   After:   style.curlyUnderline("misspelled")   // style = createStyle({ caps })
//
// `UnderlineCaps` (the structural pick of TerminalCaps both APIs use) is
// re-exported alongside `StyleOptions` below.
// =============================================================================

// =============================================================================
// Hyperlink Functions
// =============================================================================

export { hyperlink } from "./hyperlink"

// =============================================================================
// Style — Theme-aware chalk replacement
// =============================================================================

export { createStyle, createPlainStyle, style, resolveThemeColor } from "./style/style"
export { createMixedStyle } from "./style/mixed-proxy"
export { THEME_TOKEN_DEFAULTS } from "./style/colors"
export type { Style, StyleOptions, ThemeLike, UnderlineCaps } from "./style/types"

// =============================================================================
// Theme Derivation
// =============================================================================

export { deriveTheme, deriveAnsi16Theme, loadTheme } from "./theme/derive"
export type { ThemeAdjustment, LoadThemeOptions } from "./theme/derive"
export { deriveFields, DEFAULT_VARIANTS } from "./theme/derived"
export type {
  DeriveFieldsInput,
  DeriveFieldsAnsi16Input,
  DeriveFieldsTruecolorInput,
  DerivedFields,
} from "./theme/derived"
export {
  deriveMonochromeTheme,
  monoAttrsFor,
  monoAttrsForColorString,
  DEFAULT_MONO_ATTRS,
} from "./theme/monochrome"
export type { MonoAttr, MonochromeAttrs } from "./theme/monochrome"
export { fingerprintMatch, fingerprintCandidates } from "./theme/fingerprint"
export type { FingerprintMatch, FingerprintOptions } from "./theme/fingerprint"
export { detectScheme, detectSchemeTheme } from "./theme/orchestrator"
export type {
  DetectSchemeResult,
  DetectSchemeOptions,
  DetectSource,
  SlotSource,
} from "./theme/orchestrator"
export type { ActiveScheme } from "./theme/types"
export type {
  ThemeToken,
  StandardThemeToken,
  ColorRingToken,
  BrandToken,
  PaletteToken,
  KnownThemeToken,
  TextColor,
  ColorKeyword,
} from "./theme/tokens"
export { defineTokens, resolveCustomToken, CustomTokenError } from "./theme/custom"
export type {
  DeriveTokenDef,
  BrandTokenDef,
  CustomTokenDef,
  CustomTokenRegistry,
} from "./theme/custom"
export {
  validateThemeInvariants,
  formatViolations,
  ThemeInvariantError,
  AA_RATIO,
  LARGE_RATIO,
  FAINT_RATIO,
  SELECTION_DELTA_L,
  CURSOR_DELTA_E,
} from "./theme/invariants"
export type { InvariantViolation, InvariantResult, InvariantOptions } from "./theme/invariants"
export {
  ansi16DarkTheme,
  ansi16LightTheme,
  defaultDarkScheme,
  defaultLightScheme,
} from "./theme/default-schemes"
export type { ColorScheme, Theme, Variant, AnsiPrimary, HueName } from "./theme/types"
export type { AnsiColorName as PaletteColorName } from "./theme/types"
export { COLOR_SCHEME_FIELDS } from "./theme/types"
export type { VariantName, KnownVariant } from "./theme/tokens"
export { KNOWN_VARIANTS } from "./theme/tokens"

// =============================================================================
// Theme Detection (async, OSC-based)
// =============================================================================

export { probeColors, detectTerminalScheme, detectTheme } from "./theme/detect"
export type { DetectedScheme, DetectThemeOptions } from "./theme/detect"

// =============================================================================
// OSC Protocol — Terminal color queries
// =============================================================================

export {
  queryPaletteColor,
  queryMultiplePaletteColors,
  setPaletteColor,
  parsePaletteResponse,
} from "./osc-palette"

export {
  queryForegroundColor,
  queryBackgroundColor,
  queryCursorColor,
  setForegroundColor,
  setBackgroundColor,
  setCursorColor,
  resetForegroundColor,
  resetBackgroundColor,
  resetCursorColor,
  detectColorScheme,
} from "./osc-colors"

// =============================================================================
// Color Scheme Detection (Mode 2031)
// =============================================================================

export {
  createBgModeDetector,
  parseBgModeResponse,
  ENABLE_BG_MODE_REPORTING,
  DISABLE_BG_MODE_REPORTING,
} from "./color-scheme"
export type { BgModeDetector, BgModeDetectorOptions, BgMode } from "./color-scheme"

// =============================================================================
// Palette Generation (scheme-independent — no built-in lookup)
// =============================================================================

export { fromColors, assignPrimaryToSlot } from "./theme/generators"
export { autoGenerateTheme } from "./theme/auto-generate"
export { generateTheme } from "./theme/generate"
