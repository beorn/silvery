/**
 * Sterling — silvery's canonical design system.
 *
 * Sterling lives in `@silvery/design`, depending only on color math.
 * ANSI constructors consume `inlineSterlingTokens` here so every shipped
 * Theme retains its flat tokens (`$bg-accent`, `$border-default`, …).
 *
 * @example
 * ```ts
 * import { sterling } from "@silvery/design"
 *
 * const theme = sterling.defaults("dark")
 * theme["bg-accent"]                    // "#88C0D0"
 * theme["bg-accent-hover"]              // OKLCH +0.04L on accent.bg
 *
 * // Sterling entry point for custom DesignSystems
 * const custom = sterling.deriveFromScheme(myScheme)
 * ```
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
  DisabledRole,
  FlatToken,
  FlatTokens,
  /** @deprecated Use `StatusRole`. */
  InteractiveRole,
  MutedRole,
  Roles,
  StatePair,
  StatusRole,
  SurfaceRole,
  Theme,
  ThemeShape,
} from "./types.ts"

export { sterling } from "./sterling.ts"
export { defineDesignSystem } from "./define.ts"
export { deriveTheme, deriveRoles, mergePartial } from "./derive.ts"
export { inlineSterlingTokens } from "./inline.ts"
export type { InlinedTheme } from "./inline.ts"
export { STERLING_FLAT_TOKENS } from "./flat-tokens.ts"
export { PUBLIC_TOKENS, FAMILY_ORDER, groupTokensByFamily } from "./token-manifest.ts"
export type { TokenManifestEntry } from "./token-manifest.ts"
export { defaultScheme } from "./defaults.ts"
export { WCAG_AA, autoLift, checkAA, ContrastError, type ContrastViolation } from "./contrast.ts"

// Re-export the generic flat-projection helper for Sterling users who want
// it directly (e.g. to bake their own one-off Theme). This is the same
// function `defineDesignSystem({ flatten: true })` applies under the hood.
export { bakeFlat, defaultFlattenRule } from "../flatten.ts"
export type { FlattenRule } from "../flatten.ts"
