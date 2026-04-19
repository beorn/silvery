/**
 * Type-safe theme token strings.
 *
 * `ThemeToken` is the union of every known `$token` string. Using `TextColor`
 * in a component API gives autocomplete for tokens while still accepting
 * arbitrary hex strings via the `(string & {})` tail (Tailwind trick —
 * preserves the literal union for IDE suggestions while falling back to
 * `string` for runtime-computed values).
 *
 * App-specific custom tokens (`"$priority-p0"`, `"$app-brand"`) are
 * represented by the template literal `` `$${string}` `` tail — still
 * type-safe (must start with `$`) but open-ended.
 *
 * @module
 */

import type { HueName } from "./types.ts"

/** Standard Theme tokens (Primer-aligned + brand family). */
export type StandardThemeToken =
  // Root pair
  | "$fg"
  | "$bg"
  // Surfaces — fg + bg pairs
  | "$surface"
  | "$bg-surface"
  | "$popover"
  | "$bg-popover"
  | "$inverse"
  | "$bg-inverse"
  // Muted + disabled
  | "$muted"
  | "$fg-muted"
  | "$mutedbg"
  | "$bg-muted"
  | "$disabledfg"
  | "$fg-disabled"
  // Cursor + selection
  | "$cursor"
  | "$fg-cursor"
  | "$cursorbg"
  | "$bg-cursor"
  | "$selection"
  | "$fg-selected"
  | "$selectionbg"
  | "$bg-selected"
  // Accents + their fg
  | "$primary"
  | "$primaryfg"
  | "$fg-on-primary"
  | "$secondary"
  | "$secondaryfg"
  | "$fg-on-secondary"
  | "$accent"
  | "$accentfg"
  | "$fg-on-accent"
  // Semantic states
  | "$error"
  | "$errorfg"
  | "$fg-on-error"
  | "$warning"
  | "$warningfg"
  | "$fg-on-warning"
  | "$success"
  | "$successfg"
  | "$fg-on-success"
  | "$info"
  | "$infofg"
  | "$fg-on-info"
  // Borders + links
  | "$border"
  | "$inputborder"
  | "$border-input"
  | "$focusborder"
  | "$border-focus"
  | "$link"
  // State variants — hover/active lightness shifts (dark: +L, light: -L)
  | "$primary-hover"
  | "$primary-active"
  | "$accent-hover"
  | "$accent-active"
  | "$fg-hover"
  | "$fg-active"
  | "$bg-selected-hover"
  | "$bg-surface-hover"

/** Categorical color ring — harmonious hues for tagging / chart series / categories. */
export type ColorRingToken = `$${HueName}` // $red, $orange, $yellow, $green, $teal, $blue, $purple, $pink

/** Brand tokens (Apple system-color model) — app identity anchor. */
export type BrandToken =
  | "$brand"
  | "$brand-hover"
  | "$brand-active"

/** Raw ANSI palette slots. */
export type PaletteToken =
  `$color${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`

/** Every known token shipped by silvery — useful for `switch` exhaustiveness. */
export type KnownThemeToken = StandardThemeToken | ColorRingToken | BrandToken | PaletteToken

/**
 * Any `$token` string — known or app-specific. Template literal narrows to
 * strings starting with `$` so typos like `"primary"` (missing `$`) fail at
 * compile time.
 */
export type ThemeToken = KnownThemeToken | `$${string}`

/**
 * A color value accepted by `<Text color=…>`, `<Box backgroundColor=…>`, etc.
 *
 * Accepts: any ThemeToken, "inherit", "currentColor", or a raw hex/ANSI name.
 * The `(string & {})` tail preserves autocomplete for tokens while still
 * accepting any runtime-computed string value.
 */
export type TextColor = ThemeToken | "inherit" | "currentColor" | (string & {})

/**
 * Cascade keywords — accepted alongside tokens + hex.
 *   "inherit"      — use nearest ancestor's computed color
 *   "currentColor" — resolves to the container text's current color
 */
export type ColorKeyword = "inherit" | "currentColor"

// =============================================================================
// Typography Variants
// =============================================================================

/**
 * Built-in variant names — the standard typography presets shipped by silvery.
 * These are the default keys in `Theme.variants`.
 */
export type VariantName =
  | "h1"
  | "h2"
  | "h3"
  | "body"
  | "body-muted"
  | "fine-print"
  | "strong"
  | "em"
  | "link"
  | "key"
  | "code"
  | "kbd"

/**
 * Any variant name — built-in or app-defined. The `(string & {})` tail is the
 * Tailwind trick: preserves IDE autocomplete for the literal union while still
 * accepting any runtime string value.
 */
export type KnownVariant = VariantName | (string & {})

/**
 * Runtime constant — the 12 built-in variant names shipped by silvery.
 *
 * Used in dev warnings when an unknown variant is looked up in Text.tsx:
 * ```
 * Warning: Unknown variant "h11". Known variants: h1, h2, h3, …
 * ```
 *
 * Mirrors `VariantName` exactly — update both when variants change.
 */
export const KNOWN_VARIANTS: readonly VariantName[] = [
  "h1",
  "h2",
  "h3",
  "body",
  "body-muted",
  "fine-print",
  "strong",
  "em",
  "link",
  "key",
  "code",
  "kbd",
] as const
