/**
 * `@silvery/theme/sterling` subpath — re-export from `@silvery/ansi`.
 *
 * Sterling (silvery's canonical design system) lives in `@silvery/ansi` so
 * `deriveTheme`, `loadTheme`, and shipped Theme constants automatically bake
 * its flat tokens. This subpath exists for backward compatibility — prefer
 * importing from `@silvery/ansi` directly.
 */

export {
  sterling,
  defineDesignSystem,
  sterlingDeriveTheme as deriveTheme,
  sterlingDeriveRoles as deriveRoles,
  sterlingMergePartial as mergePartial,
  STERLING_FLAT_TOKENS,
  PUBLIC_TOKENS,
  FAMILY_ORDER,
  groupTokensByFamily,
  sterlingDefaultScheme as defaultScheme,
  WCAG_AA,
  sterlingAutoLift as autoLift,
  sterlingCheckAA as checkAA,
  SterlingContrastError as ContrastError,
  bakeFlat,
  defaultFlattenRule,
} from "@silvery/ansi"

export type {
  AccentRole,
  BackdropRole,
  BorderRole,
  SterlingContrastMode as ContrastMode,
  SterlingContrastViolation as ContrastViolation,
  CursorRole,
  SterlingDeepPartial as DeepPartial,
  SterlingDerivationStep as DerivationStep,
  SterlingDerivationTrace as DerivationTrace,
  SterlingDeriveOptions as DeriveOptions,
  DesignSystem,
  FlatToken,
  FlatTokens,
  FlattenRule,
  MutedRole,
  SterlingRoles as Roles,
  StatePair,
  SurfaceRole,
  SterlingTheme as Theme,
  ThemeShape,
  ColorScheme,
  TokenManifestEntry,
} from "@silvery/ansi"
