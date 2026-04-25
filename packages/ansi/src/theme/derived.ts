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

import { brighten, darken } from "@silvery/color"
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
  link: { color: "$fg-link", underlineStyle: "single" },
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
   * Truecolor shift mode: when `dark === true` hover/active brighten;
   * when `dark === false` they darken. Omit (or pass `undefined`) for ANSI16
   * — hover/active fall back to the base color (no OKLCH math on 16-color).
   *
   * Moved inside derived.ts to avoid the cross-chunk closure bug that broke
   * Verify Publishable #111 — tsdown split `shift` callers from their
   * brighten/darken imports.
   */
  dark?: boolean
  /**
   * Legacy: pass `dark` instead. Ignored when `dark` is provided.
   * If present without `dark`, invoked as before. Retained for external
   * callers built against the pre-`dark` API; new code should use `dark`.
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

  // State variants — flat kebab keys, resolved via direct lookup.
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
 * Pass a `shift` function for truecolor hover/active derivation (OKLCH
 * brighten/darken). Omit `shift` for ANSI16 — hover/active fall back to the
 * base color (no intermediate intensities available on 16-color terminals).
 *
 * @example
 * // Truecolor (dark theme)
 * import { brighten, darken } from "@silvery/color"
 * deriveFields({ shift: (hex, a) => brighten(hex, a), primary, ... })
 *
 * @example
 * // ANSI16 — no shift function
 * deriveFields({ primary, accent, fg, selectionbg, surfacebg, ring })
 */
export function deriveFields(input: DeriveFieldsInput): DerivedFields {
  const { dark, shift, primary, accent, fg, selectionbg, surfacebg, ring } = input

  // Priority: explicit `dark` flag (uses local brighten/darken, survives tsdown
  // chunking) → legacy `shift` callback (deprecated) → identity (ANSI16).
  const applyShift =
    dark !== undefined
      ? (color: string, amount: number) => (dark ? brighten(color, amount) : darken(color, amount))
      : (shift ?? ((color: string, _amount: number) => color))

  return {
    // Brand — maps to primary; hover/active use OKLCH shift or passthrough
    brand: primary,
    "brand-hover": applyShift(primary, 0.04),
    "brand-active": applyShift(primary, 0.08),

    // Categorical ring
    ...ring,

    // State variants — OKLCH shift or passthrough (ANSI16)
    "primary-hover": applyShift(primary, 0.04),
    "primary-active": applyShift(primary, 0.08),
    "accent-hover": applyShift(accent, 0.04),
    "accent-active": applyShift(accent, 0.08),
    "fg-hover": applyShift(fg, 0.04),
    "fg-active": applyShift(fg, 0.08),
    "bg-selected-hover": applyShift(selectionbg, 0.04),
    "bg-surface-hover": applyShift(surfacebg, 0.04),

    variants: DEFAULT_VARIANTS,
  }
}
