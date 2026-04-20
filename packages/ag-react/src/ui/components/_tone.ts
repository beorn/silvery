/**
 * Tone — shared primitive for Sterling-tone-bearing components.
 *
 * The `tone` axis is Sterling's status vocabulary + a component-layer
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
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Canonical tone axis — 5 Sterling status roles plus the `destructive`
 * component-layer intent alias. `accent` is the default "primary" emphasis.
 */
export type ToneKey = "accent" | "error" | "warning" | "success" | "info" | "destructive"

// =============================================================================
// Resolver
// =============================================================================

/**
 * `destructive` aliases to `error` per D1 — the Theme has no `destructive`
 * field. This resolver lives at the component layer so apps can write
 * `tone="destructive"` for action-intent components and `tone="error"` for
 * status components, both hitting the same pixels by default.
 */
function resolveRole(tone: ToneKey): "accent" | "error" | "warning" | "success" | "info" {
  return tone === "destructive" ? "error" : tone
}

/**
 * Tone → Sterling flat-token mapping for fills (button backgrounds, filled
 * alert surfaces). Returns an object because callers usually need the paired
 * foreground, hover, and active tokens together — grouping them here keeps
 * the mapping DRY across components.
 */
export interface ToneFillTokens {
  /** Background fill (`$bg-<role>`). */
  bg: string
  /** Foreground on the filled background (`$fg-on-<role>`). */
  fgOn: string
  /** Hover-state fill (`$bg-<role>-hover`). */
  bgHover: string
  /** Active/pressed-state fill (`$bg-<role>-active`). */
  bgActive: string
}

/**
 * Get the full fill-token set for a tone. Used by `<Button>` and `<Alert>`
 * where the surface is filled with the tone color and foreground text sits
 * on top.
 */
export function toneFillTokens(tone: ToneKey): ToneFillTokens {
  const role = resolveRole(tone)
  return {
    bg: `$bg-${role}`,
    fgOn: `$fg-on-${role}`,
    bgHover: `$bg-${role}-hover`,
    bgActive: `$bg-${role}-active`,
  }
}

/**
 * Get the foreground-only token for a tone. Used by `<InlineAlert>` where
 * only the text color carries the tone (no bg fill).
 */
export function toneFgToken(tone: ToneKey): string {
  const role = resolveRole(tone)
  return `$fg-${role}`
}

/**
 * Get the subtle-surface token pair for a tone. Used by `<Banner>` where
 * the surface is tinted (not filled) so content stays legible without the
 * high-contrast "on-role" fg token.
 */
export interface ToneSubtleTokens {
  /** Tinted surface (`$bg-<role>-subtle`). */
  bg: string
  /** Foreground that reads well on the tinted surface (`$fg-<role>`). */
  fg: string
}

export function toneSubtleTokens(tone: ToneKey): ToneSubtleTokens {
  const role = resolveRole(tone)
  return {
    bg: `$bg-${role}-subtle`,
    fg: `$fg-${role}`,
  }
}

/**
 * Single-character ASCII glyph conventionally associated with each tone.
 * Shared with Toast's existing mapping so Alert-family components render
 * consistent icons without each component inventing its own set.
 */
export const TONE_ICONS: Record<ToneKey, string> = {
  accent: "*",
  error: "x",
  destructive: "x",
  warning: "!",
  success: "+",
  info: "i",
}

export function toneIcon(tone: ToneKey): string {
  return TONE_ICONS[tone]
}
