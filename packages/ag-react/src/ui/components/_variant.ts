/**
 * Variant — shared primitive for Sterling-variant-bearing components.
 *
 * The `variant` axis is Sterling's status vocabulary + a component-layer
 * `destructive` intent alias. See hub/silvery/design/v10-terminal/design-system.md
 * §"Intent vs role" and sterling-preflight.md D1 — `destructive` lives at the
 * component layer (not the Theme) to prevent palette sprawl.
 *
 * Consumers: Button, Alert, Banner, InlineAlert (and Badge/Toast, which have
 * their own legacy-compatible variants on top of this surface).
 *
 * All helpers return Sterling flat tokens (`$fg-error`, `$bg-warning-subtle`,
 * etc.) — the tokens are populated by `@silvery/design` and resolved by the
 * theme at render time.
 *
 * Renamed from `_tone.ts` 2026-04-25 per the Option-B prop-naming decision
 * (`variant` matches Material/shadcn/Chakra/Radix industry default, reads
 * naturally for both status and intent components, satisfies the asymmetric-
 * surprise principle better than the Polaris `tone` term).
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Canonical variant axis — 5 Sterling status roles plus the `destructive`
 * component-layer intent alias. `accent` is the default "primary" emphasis.
 *
 * Components MAY narrow this union to a component-specific subset:
 *   - Status components (Alert, Banner, Toast, Callout, InlineAlert):
 *     `"info" | "success" | "warning" | "error"`
 *   - Action components (Button, Link): `"default" | "primary" | "destructive"`
 *
 * The full `Variant` union is the superset for components that span both
 * vocabularies (legacy compatibility surface).
 */
export type Variant = "accent" | "error" | "warning" | "success" | "info" | "destructive"

/** @deprecated Use `Variant`. Retained one cycle for external compatibility. */
export type ToneKey = Variant

// =============================================================================
// Resolver
// =============================================================================

/**
 * `destructive` aliases to `error` per D1 — the Theme has no `destructive`
 * field. This resolver lives at the component layer so apps can write
 * `variant="destructive"` for action-intent components and `variant="error"`
 * for status components, both hitting the same pixels by default.
 */
function resolveRole(variant: Variant): "accent" | "error" | "warning" | "success" | "info" {
  return variant === "destructive" ? "error" : variant
}

/**
 * Variant → Sterling flat-token mapping for fills (button backgrounds, filled
 * alert surfaces). Returns an object because callers usually need the paired
 * foreground, hover, and active tokens together — grouping them here keeps
 * the mapping DRY across components.
 */
export interface VariantFillTokens {
  /** Background fill (`$bg-<role>`). */
  bg: string
  /** Foreground on the filled background (`$fg-on-<role>`). */
  fgOn: string
  /** Hover-state fill (`$bg-<role>-hover`). */
  bgHover: string
  /** Active/pressed-state fill (`$bg-<role>-active`). */
  bgActive: string
}

/** @deprecated Use `VariantFillTokens`. Retained one cycle. */
export type ToneFillTokens = VariantFillTokens

/**
 * Get the full fill-token set for a variant. Used by `<Button>` and `<Alert>`
 * where the surface is filled with the variant color and foreground text sits
 * on top.
 */
export function variantFillTokens(variant: Variant): VariantFillTokens {
  const role = resolveRole(variant)
  return {
    bg: `$bg-${role}`,
    fgOn: `$fg-on-${role}`,
    bgHover: `$bg-${role}-hover`,
    bgActive: `$bg-${role}-active`,
  }
}

/** @deprecated Use `variantFillTokens`. Retained one cycle. */
export const toneFillTokens = variantFillTokens

/**
 * Get the foreground-only token for a variant. Used by `<InlineAlert>` where
 * only the text color carries the variant (no bg fill).
 */
export function variantFgToken(variant: Variant): string {
  const role = resolveRole(variant)
  return `$fg-${role}`
}

/** @deprecated Use `variantFgToken`. */
export const toneFgToken = variantFgToken

/**
 * Get the subtle-surface token pair for a variant. Used by `<Banner>` where
 * the surface is tinted (not filled) so content stays legible without the
 * high-contrast "on-role" fg token.
 */
export interface VariantSubtleTokens {
  /** Tinted surface (`$bg-<role>-subtle`). */
  bg: string
  /** Foreground that reads well on the tinted surface (`$fg-<role>`). */
  fg: string
}

/** @deprecated Use `VariantSubtleTokens`. */
export type ToneSubtleTokens = VariantSubtleTokens

export function variantSubtleTokens(variant: Variant): VariantSubtleTokens {
  const role = resolveRole(variant)
  return {
    bg: `$bg-${role}-subtle`,
    fg: `$fg-${role}`,
  }
}

/** @deprecated Use `variantSubtleTokens`. */
export const toneSubtleTokens = variantSubtleTokens

/**
 * Single-character ASCII glyph conventionally associated with each variant.
 * Shared with Toast's existing mapping so Alert-family components render
 * consistent icons without each component inventing its own set.
 */
export const VARIANT_ICONS: Record<Variant, string> = {
  accent: "*",
  error: "x",
  destructive: "x",
  warning: "!",
  success: "+",
  info: "i",
}

/** @deprecated Use `VARIANT_ICONS`. */
export const TONE_ICONS = VARIANT_ICONS

export function variantIcon(variant: Variant): string {
  return VARIANT_ICONS[variant]
}

/** @deprecated Use `variantIcon`. */
export const toneIcon = variantIcon
