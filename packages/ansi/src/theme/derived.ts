/**
 * deriveFields — single helper that fills all derived theme sections.
 *
 * Eliminates 4-way duplication of brand, categorical ring, state-variant, and
 * variants population across:
 *   - derive.ts   (deriveTruecolorTheme + deriveAnsi16Theme)
 *   - default-schemes.ts (ansi16DarkTheme + ansi16LightTheme)
 *   - @silvery/theme/generate.ts   (generateTheme)
 *   - @silvery/theme/schemes/index.ts (ansi16DarkTheme + ansi16LightTheme)
 *
 * Canonical authority: derive.ts truecolor path. ANSI16 paths are aligned to
 * deriveAnsi16Theme output (which is itself the canonical ANSI16 reference).
 */

import type { Theme, Variant } from "./types.ts"

// =============================================================================
// Shared DEFAULT_VARIANTS constant — single source of truth.
// All 4 sites reference this exact object (or a structurally identical copy).
// =============================================================================

/** Default typography variants — token-based, works across any theme. */
export const DEFAULT_VARIANTS: Record<string, Variant> = {
  h1: { color: "$primary", bold: true },
  h2: { color: "$accent", bold: true },
  h3: { bold: true },
  body: {},
  "body-muted": { color: "$muted" },
  "fine-print": { color: "$muted", dim: true },
  strong: { bold: true },
  em: { italic: true },
  link: { color: "$link", underlineStyle: "single" },
  key: { color: "$accent", bold: true },
  code: { backgroundColor: "$mutedbg" },
  kbd: { backgroundColor: "$mutedbg", color: "$accent", bold: true },
}

// =============================================================================
// Input type
// =============================================================================

/**
 * Inputs for `deriveFields`.
 *
 * `shift` controls hover/active lightness derivation:
 *   - Truecolor: pass `(hex, amount) => dark ? brighten(hex, amount) : darken(hex, amount)`
 *   - ANSI16: omit (or pass `undefined`) — hover/active fall back to the base color.
 */
export interface DeriveFieldsInput {
  /**
   * Optional color-shift function. Receives a color value and a positive
   * lightness-shift amount, returns the shifted color.
   *
   * When absent, hover/active state variants equal their base color (correct
   * for ANSI16 where no OKLCH math is possible).
   */
  shift?: (color: string, amount: number) => string
  /** The primary color. */
  primary: string
  /** The accent color. */
  accent: string
  /** The foreground color. */
  fg: string
  /** The selectionbg color — used for bgSelectedHover. */
  selectionbg: string
  /** The surfacebg color — used for bgSurfaceHover. */
  surfacebg: string
  /**
   * Pre-computed categorical ring colors. ANSI16 callers pass named slots;
   * truecolor callers pass ensureContrast-adjusted hex values.
   */
  ring: {
    red: string
    orange: string
    yellow: string
    green: string
    teal: string
    blue: string
    purple: string
    pink: string
  }
}

// Legacy discriminant-union type aliases — retained for any external callers
// that still reference the old named types. Both are now identical to
// DeriveFieldsInput (the `mode` field is no longer read).
// @deprecated Use DeriveFieldsInput directly and pass `shift` instead of `mode`.
export type DeriveFieldsAnsi16Input = DeriveFieldsInput
export type DeriveFieldsTruecolorInput = DeriveFieldsInput

// =============================================================================
// Output type
// =============================================================================

export interface DerivedFields {
  // Brand
  brand: string
  "brand-hover": string
  "brand-active": string

  // Categorical ring (canonical names)
  red: string
  orange: string
  yellow: string
  green: string
  teal: string
  blue: string
  purple: string
  pink: string

  // State variants (flat kebab keys — direct lookup, no PRIMER_ALIASES needed)
  "primary-hover": string
  "primary-active": string
  "accent-hover": string
  "accent-active": string
  "fg-hover": string
  "fg-active": string
  "bg-selected-hover": string
  "bg-surface-hover": string

  // Typography variants
  variants: Theme["variants"]
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Derive the shared "delta" fields common to every theme object:
 * brand tokens, categorical ring, state variants, and typography variants.
 *
 * Truecolor mode: hover = ±0.04L, active = ±0.08L (brighten on dark, darken on light).
 * ANSI16 mode: no lightness shifts possible — hover/active fall back to base color.
 */
export function deriveFields(input: DeriveFieldsInput): DerivedFields {
  if (input.mode === "ansi16") {
    return deriveFieldsAnsi16(input)
  }
  return deriveFieldsTruecolor(input)
}

function deriveFieldsAnsi16(input: DeriveFieldsAnsi16Input): DerivedFields {
  const { primary, accent, fg, selectionbg, surfacebg, ring } = input

  return {
    // Brand — maps to primary; no shifts in ANSI16
    brand: primary,
    "brand-hover": primary,
    "brand-active": primary,

    // Categorical ring
    ...ring,

    // State variants — no OKLCH shifts in ANSI16; fall back to base color
    "primary-hover": primary,
    "primary-active": primary,
    "accent-hover": accent,
    "accent-active": accent,
    "fg-hover": fg,
    "fg-active": fg,
    "bg-selected-hover": selectionbg,
    "bg-surface-hover": surfacebg,

    variants: DEFAULT_VARIANTS,
  }
}

function deriveFieldsTruecolor(input: DeriveFieldsTruecolorInput): DerivedFields {
  const { dark, primary, accent, fg, selectionbg, surfacebg, ring } = input

  // Shift helper — brightens on dark themes, darkens on light themes
  const shift = (hex: string, amount: number): string =>
    dark ? brighten(hex, amount) : darken(hex, amount)

  return {
    // Brand — maps to primary; hover/active shift OKLCH L ±0.04 / ±0.08
    brand: primary,
    "brand-hover": shift(primary, 0.04),
    "brand-active": shift(primary, 0.08),

    // Categorical ring
    ...ring,

    // State variants — OKLCH lightness shift ±0.04 / ±0.08 (flat kebab keys)
    "primary-hover": shift(primary, 0.04),
    "primary-active": shift(primary, 0.08),
    "accent-hover": shift(accent, 0.04),
    "accent-active": shift(accent, 0.08),
    "fg-hover": shift(fg, 0.04),
    "fg-active": shift(fg, 0.08),
    "bg-selected-hover": shift(selectionbg, 0.04),
    "bg-surface-hover": shift(surfacebg, 0.04),

    variants: DEFAULT_VARIANTS,
  }
}
