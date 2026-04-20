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
export { defineDesignSystem } from "./define.ts"
export { deriveTheme, deriveRoles, mergePartial } from "./derive.ts"
export { STERLING_FLAT_TOKENS } from "./flat-tokens.ts"
export { defaultScheme } from "./defaults.ts"
export { WCAG_AA, autoLift, checkAA, ContrastError, type ContrastViolation } from "./contrast.ts"

// Re-export the generic flat-projection helper for Sterling users who want
// it directly (e.g. to bake their own one-off Theme). This is the same
// function `defineDesignSystem({ flatten: true })` applies under the hood.
export { bakeFlat, defaultFlattenRule } from "@silvery/ansi"
export type { FlattenRule } from "@silvery/ansi"
