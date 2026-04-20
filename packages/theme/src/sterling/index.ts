/**
 * Sterling — silvery's canonical design system.
 *
 * @example
 * ```ts
 * import { sterling, nord } from "@silvery/theme"
 *
 * const theme = sterling.deriveFromScheme(nord)
 * theme.accent.bg              // "#88C0D0"
 * theme["bg-accent"]           // "#88C0D0" — same reference
 * theme["bg-accent-hover"]     // OKLCH +0.04L on accent.bg
 * ```
 *
 * Phase 2a: lives under @silvery/theme/sterling. Will move to @silvery/design
 * in Phase 3b.
 */

export type {
  AccentRole,
  BorderRole,
  ColorScheme,
  ContrastMode,
  CursorRole,
  DeepPartial,
  DerivationStep,
  DerivationTrace,
  DeriveOptions,
  DesignSystem,
  FlatToken,
  FlatTokens,
  InteractiveRole,
  MutedRole,
  Roles,
  StatePair,
  SurfaceRole,
  Theme,
  ThemeShape,
} from "./types.ts"

export { sterling } from "./sterling.ts"
export { deriveTheme, deriveRoles, mergePartial } from "./derive.ts"
export { populateFlat, STERLING_FLAT_TOKENS } from "./flatten.ts"
export { defaultScheme } from "./defaults.ts"
export { WCAG_AA, autoLift, checkAA, ContrastError, type ContrastViolation } from "./contrast.ts"
