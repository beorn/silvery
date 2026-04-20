/**
 * @silvery/theme — Color scheme catalog for silvery.
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
 * import { catppuccinMocha } from "@silvery/theme"
 * import { deriveTheme } from "@silvery/ansi"
 *
 * const theme = deriveTheme(catppuccinMocha)
 * ```
 *
 * @packageDocumentation
 */

// Core types (ColorScheme lives here; Theme lives in @silvery/ansi)
export type { ColorScheme } from "@silvery/ansi"
export { COLOR_SCHEME_FIELDS } from "@silvery/ansi"

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

// CSS variables export
export { themeToCSSVars } from "./css"

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

// Sterling — silvery's canonical design system.
// See packages/theme/src/sterling/ and hub/silvery/design/v10-terminal/design-system.md.
//
// Sterling flat tokens (`bg-accent`, `fg-on-accent`, `border-focus`, …) are
// baked into every shipped Theme at construction (see ./schemes/index.ts).
// Consumers read flat keys directly off the Theme — no explicit augment call
// is needed or available.
export { sterling } from "./sterling/index"
export {
  deriveTheme as sterlingDeriveTheme,
  deriveRoles as sterlingDeriveRoles,
  populateFlat as sterlingPopulateFlat,
  defaultScheme as sterlingDefaultScheme,
  STERLING_FLAT_TOKENS,
  WCAG_AA,
  autoLift as sterlingAutoLift,
  checkAA as sterlingCheckAA,
  ContrastError as SterlingContrastError,
} from "./sterling/index"
export type {
  AccentRole,
  BorderRole,
  ContrastMode as SterlingContrastMode,
  ContrastViolation as SterlingContrastViolation,
  CursorRole,
  DeepPartial as SterlingDeepPartial,
  DerivationStep as SterlingDerivationStep,
  DerivationTrace as SterlingDerivationTrace,
  DeriveOptions as SterlingDeriveOptions,
  DesignSystem,
  FlatToken as SterlingFlatToken,
  FlatTokens as SterlingFlatTokens,
  InteractiveRole,
  MutedRole,
  Roles as SterlingRoles,
  StatePair,
  SurfaceRole,
  Theme as SterlingTheme,
  ThemeShape,
} from "./sterling/index"

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
