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

// React integration
export { ThemeProvider, useTheme } from "./ThemeContext"
export type { ThemeProviderProps } from "./ThemeContext"

// Core types
export type { Theme, ColorScheme, HueName, AnsiPrimary, AnsiColorName } from "./types"
export { COLOR_SCHEME_FIELDS } from "./types"

// Derivation
export { deriveTheme } from "./derive"
export type { ThemeAdjustment } from "./derive"

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
} from "./color"
export type { HSL } from "./color"

// Token resolution
export { resolveThemeColor } from "./resolve"

// ANSI 16 theme generation
export { generateTheme } from "./generate"

// Builder API
export { createTheme, quickTheme, presetTheme } from "./builder"

// Palette generators
export { fromBase16, fromColors, fromPreset } from "./generators"

// Active theme state (side-effectful)
export {
  setActiveTheme,
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
export { checkContrast, ensureContrast } from "./contrast"
export type { ContrastResult } from "./contrast"

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
