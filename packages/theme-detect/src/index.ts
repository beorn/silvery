/**
 * @silvery/theme-detect — Framework-agnostic terminal color scheme detection.
 *
 * Extract of Layer 3 from silvery's design system: terminal scheme detection,
 * catalog fingerprinting, and invariant validation. For any TUI/CLI that wants
 * to adopt the user's terminal theme without pulling in all of silvery.
 *
 * Core primitives:
 * - `detectTerminalScheme()` — OSC-probe the terminal for its 22-slot color scheme
 * - `detectTheme()` — detect + derive to a fully-resolved theme
 * - `fingerprintMatch()` — match probed slots against a catalog
 * - `fingerprintCandidates()` — return all plausible matches sorted by ΔE
 * - `validateThemeInvariants()` — WCAG + visibility audit
 * - `deriveTheme()` / `loadTheme()` — produce a Theme from a ColorScheme
 * - `deriveMonochromeTheme()` / `monoAttrsFor()` — per-token attrs for NO_COLOR
 * - `defineTokens()` / `resolveCustomToken()` — app-specific tokens
 *
 * All types (ColorScheme, Theme, BgMode, …) re-exported so consumers don't
 * need to also depend on @silvery/ansi for types.
 *
 * @example
 * ```ts
 * import { detectTerminalScheme, fingerprintMatch } from "@silvery/theme-detect"
 * import { builtinPalettes } from "@silvery/theme/schemes"  // optional catalog
 *
 * const detected = await detectTerminalScheme()
 * if (detected) {
 *   const match = fingerprintMatch(detected.palette, Object.values(builtinPalettes))
 *   console.log(`Terminal scheme: ${match?.scheme.name ?? "custom"}`)
 * }
 * ```
 *
 * @module
 */

// Detection — OSC probing
export {
  detectTerminalScheme,
  detectTheme,
} from "@silvery/ansi"
export type {
  DetectedScheme,
  DetectThemeOptions,
} from "@silvery/ansi"

// Unified orchestrator — one entry point for the whole cascade
export {
  detectScheme,
  detectSchemeTheme,
} from "@silvery/ansi"
export type {
  DetectSchemeResult,
  DetectSchemeOptions,
  DetectSource,
  SlotSource,
} from "@silvery/ansi"

// BgMode — dark/light/unknown detection
export {
  createBgModeDetector,
  parseBgModeResponse,
  ENABLE_BG_MODE_REPORTING,
  DISABLE_BG_MODE_REPORTING,
} from "@silvery/ansi"
export type {
  BgMode,
  BgModeDetector,
  BgModeDetectorOptions,
} from "@silvery/ansi"

// Capability detection — truecolor / 256 / ansi16 / mono
export {
  detectCursor,
  detectInput,
  detectColor,
  detectUnicode,
  detectExtendedUnderline,
  detectTerminalCaps,
  defaultCaps,
} from "@silvery/ansi"
export type { TerminalCaps, ColorLevel } from "@silvery/ansi"

// Scheme catalog primitives
export {
  defaultDarkScheme,
  defaultLightScheme,
  ansi16DarkTheme,
  ansi16LightTheme,
} from "@silvery/ansi"

// Fingerprinting — match probed slots against a catalog
export {
  fingerprintMatch,
  fingerprintCandidates,
} from "@silvery/ansi"
export type {
  FingerprintMatch,
  FingerprintOptions,
} from "@silvery/ansi"

// Theme derivation — ColorScheme → Theme
export {
  deriveTheme,
  loadTheme,
} from "@silvery/ansi"
export type {
  ThemeAdjustment,
  LoadThemeOptions,
} from "@silvery/ansi"

// Invariants — WCAG + visibility validation
export {
  validateThemeInvariants,
  formatViolations,
  ThemeInvariantError,
  AA_RATIO,
  LARGE_RATIO,
  FAINT_RATIO,
  SELECTION_DELTA_L,
  CURSOR_DELTA_E,
} from "@silvery/ansi"
export type {
  InvariantViolation,
  InvariantResult,
  InvariantOptions,
} from "@silvery/ansi"

// Monochrome — per-token SGR attrs for NO_COLOR terminals
export {
  deriveMonochromeTheme,
  monoAttrsFor,
  DEFAULT_MONO_ATTRS,
} from "@silvery/ansi"
export type {
  MonoAttr,
  MonochromeAttrs,
} from "@silvery/ansi"

// Custom tokens — app-specific semantic + brand tokens
export {
  defineTokens,
  resolveCustomToken,
  CustomTokenError,
} from "@silvery/ansi"
export type {
  DeriveTokenDef,
  BrandTokenDef,
  CustomTokenDef,
  CustomTokenRegistry,
} from "@silvery/ansi"

// Types — the 22-slot scheme + derived theme shapes
export type {
  ColorScheme,
  Theme,
  AnsiColorName,
  AnsiPrimary,
  HueName,
} from "@silvery/ansi"
export { COLOR_SCHEME_FIELDS } from "@silvery/ansi"
