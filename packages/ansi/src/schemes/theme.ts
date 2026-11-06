/**
 * @silvery/ansi/schemes — Color scheme catalog for silvery.
 *
 * 84 built-in color schemes (the "inspiration library") for any platform.
 * Theme derivation and color utilities live in `@silvery/ansi` and `@silvery/color`.
 *
 * Two-layer architecture:
 *   Layer 1: ColorScheme (22 terminal colors — universal pivot format)
 *   Layer 2: Theme (33 semantic tokens — what UI apps consume, via @silvery/ansi deriveTheme)
 *
 * Pipeline: builtinPalettes → deriveTheme() → Theme
 *
 * @example
 * ```typescript
 * import { catppuccinMocha } from "@silvery/ansi/schemes"
 * import { deriveTheme } from "@silvery/ansi"
 *
 * const theme = deriveTheme(catppuccinMocha)
 * ```
 *
 * @packageDocumentation
 */

// Canonical types live in @silvery/color/design.
export type { ColorScheme } from "@silvery/color/design"

// ANSI 16 theme generation (produces Theme from primary color, no ColorScheme needed)
export { generateTheme } from "./generate"

// Palette generators (fromColors, fromPreset, assignPrimaryToSlot also in @silvery/ansi)
export { fromBase16, fromColors, fromPreset, assignPrimaryToSlot } from "./generators"

// Builder API (convenience wrappers that use preset schemes from this package)
export { createTheme, quickTheme, presetTheme } from "./builder"

// Auto-generate (also in @silvery/ansi; kept here for convenience)
export { autoGenerateTheme } from "./auto-generate"

// Validation
export { validateColorScheme } from "./validate"
export type { ValidationResult } from "./validate"
export { validateTheme, THEME_TOKEN_KEYS } from "./validate-theme"
export type { ThemeValidationResult } from "./validate-theme"

// Token aliasing
export { resolveAliases, resolveTokenAlias } from "./alias"

// Base16 import/export
export { importBase16 } from "./import/base16"
export { exportBase16 } from "./export/base16"
export type { Base16Scheme } from "./import/types"

// Built-in themes (pre-derived)
export {
  ansi16DarkTheme,
  ansi16LightTheme,
  defaultDarkTheme,
  defaultLightTheme,
  builtinThemes,
  getThemeByName,
} from "./schemes/index"

// Terminal detection re-exports ANSI's constructors, which populate Sterling
// flat tokens before returning. No additional wrapper transforms their output.
//
// - `probeColors` — OSC 4/10/11 probe → 22-slot ColorScheme (canonical name)
// - `detectTerminalScheme` — legacy alias for `probeColors`
// - `detectTheme` — probe + derive (returns just a Theme, with fallbacks)
// - `detectScheme` / `detectSchemeTheme` — full 4-layer cascade with
//   provenance (override → probe → fingerprint → fallback)
export {
  probeColors,
  detectTerminalScheme,
  detectTheme,
  detectScheme,
  detectSchemeTheme,
} from "./detect"
export type {
  DetectedScheme,
  DetectThemeOptions,
  DetectSchemeOptions,
  DetectSchemeResult,
  DetectSource,
  SlotSource,
} from "./detect"

// Built-in schemes (84 color schemes — see ./schemes/).
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
