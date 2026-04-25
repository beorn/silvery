/**
 * Sterling — silvery's canonical design system.
 *
 * Sterling lives in `@silvery/ansi` because `deriveTheme`, `loadTheme`, and
 * every shipped Theme constant need to inline its flat tokens
 * (`$bg-accent`, `$bg-surface-overlay`, `$border-default`, …). Keeping it
 * in a separate package left a two-shape gap — themes from `@silvery/ansi`
 * missed flat tokens — which caused the "31/32 empty bg tokens on fallback"
 * regression.
 *
 * @example
 * ```ts
 * import { sterling, deriveTheme } from "@silvery/ansi"
 * import { nord } from "@silvery/theme"
 *
 * const theme = deriveTheme(nord)       // Sterling flat tokens inlined
 * theme["bg-accent"]                    // "#88C0D0"
 * theme["bg-accent-hover"]              // OKLCH +0.04L on accent.bg
 *
 * // Sterling entry point for custom DesignSystems
 * const custom = sterling.deriveFromScheme(nord)
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
export { defaultScheme } from "./defaults.ts"
export { WCAG_AA, autoLift, checkAA, ContrastError, type ContrastViolation } from "./contrast.ts"

// Re-export the generic flat-projection helper for Sterling users who want
// it directly (e.g. to bake their own one-off Theme). This is the same
// function `defineDesignSystem({ flatten: true })` applies under the hood.
export { bakeFlat, defaultFlattenRule } from "../flatten.ts"
export type { FlattenRule } from "../flatten.ts"
