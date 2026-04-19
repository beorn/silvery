/**
 * @silvery/theme — Universal color themes for any platform.
 *
 * Two-layer architecture:
 *   Layer 1: ColorScheme (22 terminal colors — universal pivot format)
 *   Layer 2: Theme (33 semantic tokens — what UI apps consume)
 *
 * Pipeline: Palette generators → ColorScheme → deriveTheme() → Theme
 *
 * @example
 * ```typescript
 * import { createTheme, catppuccinMocha, resolveThemeColor } from "@silvery/theme"
 *
 * const theme = createTheme().preset('catppuccin-mocha').build()
 * const color = resolveThemeColor("$primary", theme) // → "#F9E2AF"
 * ```
 *
 * @packageDocumentation
 */

// React integration — ThemeContext + useTheme hook
// Note: ThemeProvider is in @silvery/ag-react (the full provider with AgNode tree integration).
// This module re-exports the raw React context + hook only; the provider component
// was removed in R1 (km-silvery.theme-v3-r1-one-provider).
export { ThemeContext, useTheme } from "./ThemeContext"

// Core types
export type { Theme, ColorScheme, HueName, AnsiPrimary, AnsiColorName } from "@silvery/ansi"
export { COLOR_SCHEME_FIELDS } from "@silvery/ansi"

// Derivation
export { deriveTheme } from "@silvery/ansi"
export type { ThemeAdjustment } from "@silvery/ansi"

// Color utilities
export {
  blend,
  brighten,
  darken,
  contrastFg,
  desaturate,
  complement,
  hexToRgb,
  rgbToHex,
  hexToHsl,
  hslToHex,
  rgbToHsl,
  hexToOklch,
  oklchToHex,
} from "@silvery/color"
export type { HSL, OKLCH } from "@silvery/color"

// Token resolution
export { resolveThemeColor } from "@silvery/ansi"

// ANSI 16 theme generation
export { generateTheme } from "./generate"

// Builder API
export { createTheme, quickTheme, presetTheme } from "./builder"

// Palette generators
export { fromBase16, fromColors, fromPreset } from "./generators"

// Active theme state (side-effectful). Theme flows via pushContextTheme/
// popContextTheme during render-phase tree walks; getActiveTheme reads the
// stack with ansi16DarkTheme as fallback. setActiveTheme was removed in R2
// (no-op after AgNode cascade; use ThemeProvider from @silvery/ag-react).
export {
  getActiveTheme,
  pushContextTheme,
  popContextTheme,
  setActiveColorLevel,
  getActiveColorLevel,
} from "./state"
export type { ActiveColorLevel } from "./state"

// Validation
export { validateColorScheme } from "./validate"
export type { ValidationResult } from "./validate"
export { validateTheme, THEME_TOKEN_KEYS } from "./validate-theme"
export type { ThemeValidationResult } from "./validate-theme"

// Contrast checking and enforcement
export { checkContrast, ensureContrast } from "@silvery/color"
export type { ContrastResult } from "@silvery/color"

// Token aliasing
export { resolveAliases, resolveTokenAlias } from "./alias"

// CSS variables export
export { themeToCSSVars } from "./css"

// Auto-generate themes from a single color
export { autoGenerateTheme } from "./auto-generate"

// Base16 import/export
export { importBase16 } from "./import/base16"
export { exportBase16 } from "./export/base16"
export type { Base16Scheme } from "./import/types"

// Terminal detection
export { detectTerminalScheme, detectTheme } from "./detect"
export type { DetectedScheme, DetectThemeOptions } from "./detect"

// Built-in themes (pre-derived)
export {
  ansi16DarkTheme,
  ansi16LightTheme,
  defaultDarkTheme,
  defaultLightTheme,
  builtinThemes,
  getThemeByName,
} from "./schemes/index"

// Built-in schemes (84 color schemes — see packages/theme/src/schemes/)
export {
  builtinPalettes,
  getSchemeByName,
  catppuccinMocha,
  catppuccinFrappe,
  catppuccinMacchiato,
  catppuccinLatte,
  nord,
  dracula,
  oneDark,
  solarizedDark,
  solarizedLight,
  gruvboxDark,
  gruvboxLight,
  tokyoNight,
  tokyoNightStorm,
  tokyoNightDay,
  rosePine,
  rosePineMoon,
  rosePineDawn,
  kanagawaWave,
  kanagawaDragon,
  kanagawaLotus,
  everforestDark,
  everforestLight,
  nightfox,
  dawnfox,
  monokai,
  monokaiPro,
  snazzy,
  materialDark,
  materialLight,
  palenight,
  ayuDark,
  ayuMirage,
  ayuLight,
  horizon,
  moonfly,
  nightfly,
  oxocarbonDark,
  oxocarbonLight,
  sonokai,
  edgeDark,
  edgeLight,
  modusVivendi,
  modusOperandi,
} from "./schemes/index"
