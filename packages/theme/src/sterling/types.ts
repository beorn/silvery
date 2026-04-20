/**
 * Sterling — silvery's canonical design system.
 *
 * This module defines the type-level surface:
 *   - `Theme` — the output of derivation, an intersection of `FlatTokens & Roles`.
 *     Double-populated: `theme.accent.bg` and `theme["bg-accent"]` reference the
 *     SAME string (D4: no Proxy).
 *   - `DesignSystem` — the contract every design-token system implements.
 *   - `FlatToken` — string-literal union of all ~50 flat hyphen keys.
 *   - `ColorScheme` — re-exported from `@silvery/ansi` (D5: unchanged).
 *
 * Sterling is additive relative to the legacy `Theme` in @silvery/ansi —
 * consumers keep working through Phase 2c. Nothing here deletes.
 *
 * @see `hub/silvery/design/v10-terminal/design-system.md` — canonical spec
 * @see `hub/silvery/design/v10-terminal/sterling-preflight.md` — D1-D6
 */

export type { ColorScheme, FlattenRule } from "@silvery/ansi"

// ── Role / State / Surface primitives ──────────────────────────────────────

/**
 * Surface-only state pair: only `bg` varies by state. Used by the status
 * roles (`info`, `success`, `warning`, `error`) where state variants are
 * meaningful only for surfaces (filled bg), never for text.
 *
 * Text tokens on status roles don't hover — `fg-error` is a status color,
 * not an interactive link. Keeping `fg.hover` / `fg.active` on those roles
 * invited algorithmic over-generation that produced illegible results
 * (e.g. catppuccin-frappe `warning.active.fg` collapsing to `#FFFFFF`).
 */
export interface BgStatePair {
  readonly bg: string
}

/**
 * Interactive (link-like) state pair: both `fg` and `bg` vary by state.
 * Used by `accent` — the canonical interactive-text role.
 */
export interface StatePair {
  readonly fg: string
  readonly bg: string
}

/**
 * A status role — fg, bg, and `fgOn` (text color to draw when rendering ON
 * a filled bg of this role). State variants apply to SURFACE (bg) only;
 * text-color state variants are reserved for link-like roles (`accent`).
 */
export interface InteractiveRole {
  /** Foreground hex — use for text/icon in this role. */
  readonly fg: string
  /** Background hex — use as fill for emphasis. */
  readonly bg: string
  /** Foreground to use when drawing ON `bg` (contrast-picked). */
  readonly fgOn: string
  /** Hover state — surface only (adaptive ±L shift on bg). */
  readonly hover: BgStatePair
  /** Active (pressed) state — surface only (adaptive ±L shift on bg). */
  readonly active: BgStatePair
}

/**
 * Accent — the canonical link-like interactive-text role. Has everything
 * `InteractiveRole` does PLUS a focus-ring border AND `fg.hover` /
 * `fg.active` text-color state variants (link hover treatments).
 */
export interface AccentRole {
  /** Foreground hex — use for text/icon in accent. */
  readonly fg: string
  /** Background hex — use as fill for emphasis. */
  readonly bg: string
  /** Foreground to use when drawing ON `bg` (contrast-picked). */
  readonly fgOn: string
  /** Border color for focus rings using this accent. */
  readonly border: string
  /** Hover state — both fg (link hover) and bg (surface hover). */
  readonly hover: StatePair
  /** Active (pressed) state — both fg and bg. */
  readonly active: StatePair
}

/** Surface hierarchy — `default` is the canvas, subtle/raised/overlay stack upward. */
export interface SurfaceRole {
  readonly default: string
  readonly subtle: string
  readonly raised: string
  readonly overlay: string
  readonly hover: string
}

/** Border roles — `focus` is the focus-ring color; `default` is normal rule line. */
export interface BorderRole {
  readonly default: string
  readonly focus: string
  readonly muted: string
}

/** Cursor colors. */
export interface CursorRole {
  readonly fg: string
  readonly bg: string
}

/** Muted role — lower-emphasis text/bg for deemphasized content. */
export interface MutedRole {
  readonly fg: string
  readonly bg: string
}

// ── Roles (the nested form) ────────────────────────────────────────────────

/**
 * The nested, programmatic form of a Theme. All leaf values are hex strings.
 * Reached via `theme.accent.bg`, `theme.surface.raised`, etc.
 */
export interface Roles {
  readonly accent: AccentRole
  readonly info: InteractiveRole
  readonly success: InteractiveRole
  readonly warning: InteractiveRole
  readonly error: InteractiveRole
  readonly muted: MutedRole
  readonly surface: SurfaceRole
  readonly border: BorderRole
  readonly cursor: CursorRole
}

// ── Flat form (the user-facing string-keyed surface) ───────────────────────

/**
 * Every flat hyphen-key that Sterling emits. String-literal union so that
 * `theme["bg-accent"]` is type-checked and typos fail the compile.
 *
 * Grammar: `prefix-role[-state]` or `prefix-on-role` or `prefix-role-kind[-state]`.
 * (See design-system.md §"Flattening rule".)
 */
export type FlatToken =
  // Surface
  | "bg-surface-default"
  | "bg-surface-subtle"
  | "bg-surface-raised"
  | "bg-surface-overlay"
  | "bg-surface-hover"
  // Border
  | "border-default"
  | "border-focus"
  | "border-muted"
  // Cursor
  | "fg-cursor"
  | "bg-cursor"
  // Muted (status-text — no state variants)
  | "fg-muted"
  | "bg-muted"
  // Accent — link-like interactive text, keeps fg.hover + fg.active
  | "fg-accent"
  | "bg-accent"
  | "fg-on-accent"
  | "fg-accent-hover"
  | "bg-accent-hover"
  | "fg-accent-active"
  | "bg-accent-active"
  | "border-accent"
  // Info — status role; bg-state only (text doesn't hover)
  | "fg-info"
  | "bg-info"
  | "fg-on-info"
  | "bg-info-hover"
  | "bg-info-active"
  // Success — status role; bg-state only
  | "fg-success"
  | "bg-success"
  | "fg-on-success"
  | "bg-success-hover"
  | "bg-success-active"
  // Warning — status role; bg-state only
  | "fg-warning"
  | "bg-warning"
  | "fg-on-warning"
  | "bg-warning-hover"
  | "bg-warning-active"
  // Error — status role; bg-state only
  | "fg-error"
  | "bg-error"
  | "fg-on-error"
  | "bg-error-hover"
  | "bg-error-active"

/** The flat projection — every FlatToken maps to a hex string. */
export type FlatTokens = {
  readonly [K in FlatToken]: string
}

// ── Derivation trace (opt-in) ──────────────────────────────────────────────

/**
 * Per-token record of HOW a token was derived. Populated only when the
 * derivation is called with `{ trace: true }`. Used by the Sterling
 * storybook to visualize derivation rules.
 */
export interface DerivationStep {
  /** Token path (e.g. `"accent.hover.bg"` or flat `"bg-accent-hover"`). */
  readonly token: string
  /** Human-readable rule name (e.g. `"OKLCH +0.04L on accent.bg"`). */
  readonly rule: string
  /** Input hex(es) the rule operated on. */
  readonly inputs: readonly string[]
  /** Output hex. */
  readonly output: string
  /** If auto-lift adjusted this token, the original value before adjustment. */
  readonly liftedFrom?: string
  /** If pinned by scheme author, true. */
  readonly pinned?: boolean
}

export type DerivationTrace = readonly DerivationStep[]

// ── The Theme ──────────────────────────────────────────────────────────────

/**
 * The canonical Sterling Theme — double-populated intersection of
 * `FlatTokens & Roles`. Every leaf value exists at TWO paths:
 *   - Nested:  `theme.accent.hover.bg`
 *   - Flat:    `theme["bg-accent-hover"]`
 *
 * Both paths reference the same string (not copies). The object is frozen
 * after derivation (see `flatten.ts`).
 *
 * Non-token metadata lives alongside:
 *   - `name` — scheme display name (if derived from a named scheme)
 *   - `mode` — light/dark
 *   - `derivationTrace` — optional; present only when `{ trace: true }` was passed
 */
export type Theme = FlatTokens &
  Roles & {
    readonly name?: string
    readonly mode: "light" | "dark"
    readonly derivationTrace?: DerivationTrace
  }

// ── ThemeShape metadata ────────────────────────────────────────────────────

/**
 * Metadata describing a DesignSystem's Theme shape — for tooling (docs,
 * storybook, CSS export). Plain data, no functions.
 */
export interface ThemeShape {
  /** The list of FlatTokens this system emits. */
  readonly flatTokens: readonly string[]
  /** The list of role-object keys this system emits (e.g. `["accent", "info", ...]`). */
  readonly roles: readonly string[]
  /** The list of state variants used on interactive roles (e.g. `["hover", "active"]`). */
  readonly states: readonly string[]
}

// ── DesignSystem contract ──────────────────────────────────────────────────

import type { ColorScheme, FlattenRule } from "@silvery/ansi"

/** Contrast enforcement mode for derivation. See D3 in sterling-preflight.md. */
export type ContrastMode =
  /** Throw on WCAG AA failure on core role pairs. Used by catalog tests. */
  | "strict"
  /** Auto-lift failing tokens via OKLCH L shifts. Used for user schemes. */
  | "auto-lift"

/** Options accepted by all derivation entry points. */
export interface DeriveOptions {
  /** Default: `"auto-lift"`. */
  readonly contrast?: ContrastMode
  /** If true, attach `derivationTrace` to the returned Theme. Default: false. */
  readonly trace?: boolean
  /**
   * Per-role token pins. A scheme author can pin specific tokens (e.g.
   * `{ "error.fg": "#bf616a" }`) to skip auto-adjustment. The path syntax is
   * nested-style: `"accent.hover.bg"`, `"error.fg"`. Flat-form pins are
   * also accepted: `{ "bg-accent": "#...", "fg-on-error": "#..." }`.
   */
  readonly pins?: Readonly<Record<string, string>>
  /**
   * Force light/dark inference. By default inferred from
   * `scheme.dark` or WCAG luminance of `scheme.background`.
   */
  readonly mode?: "light" | "dark"
}

/**
 * The `DesignSystem` contract. Sterling is the default implementation; other
 * packages (e.g. `@silvery/design-material`) publish alternatives matching
 * this shape.
 */
export interface DesignSystem {
  /** Display name for tooling (e.g. `"sterling"`). */
  readonly name: string

  /** Metadata about this system's Theme shape. */
  readonly shape: ThemeShape

  /**
   * Whether the framework should auto-apply `bakeFlat` to each derivation's
   * output — projecting hex leaves onto flat hyphen-keys on the same object.
   *
   * - `true` — use {@link defaultFlattenRule} (channel-role-state, Sterling style)
   * - `FlattenRule` — system-specific rule (e.g. Material `onPrimary`)
   * - `false` or omitted — no auto-flatten (system is responsible, or
   *   consumer only uses nested form)
   *
   * Sterling and anything modelled on it should set `flatten: true` —
   * flat-projection-on-same-object is a universal feature of nested
   * hex-leaf POJOs and Sterling users expect `theme["bg-accent"]` access.
   */
  readonly flatten?: boolean | FlattenRule

  /** Return a raw default Theme, no input required. */
  defaults(mode?: "light" | "dark"): Theme

  /**
   * Fill partial theme values with defaults. Useful for hand-curated themes
   * that override a few roles.
   */
  theme(partial?: DeepPartial<Theme>, opts?: DeriveOptions): Theme

  /** Derive from a 22-color terminal scheme — Sterling's primary path. */
  deriveFromScheme(scheme: ColorScheme, opts?: DeriveOptions): Theme

  /** Derive from a single seed color — Material-style. */
  deriveFromColor(color: string, opts?: DeriveOptions & { mode?: "light" | "dark" }): Theme

  /** Derive from a light/dark scheme pair. */
  deriveFromPair(
    light: ColorScheme,
    dark: ColorScheme,
    opts?: DeriveOptions,
  ): {
    light: Theme
    dark: Theme
  }

  /** Derive from a scheme plus a brand-color overlay (F — brand discipline). */
  deriveFromSchemeWithBrand(scheme: ColorScheme, brand: string, opts?: DeriveOptions): Theme
}

/** Utility: recursive `Partial` for nested Theme overrides. */
export type DeepPartial<T> = T extends object
  ? T extends readonly unknown[]
    ? T
    : { [K in keyof T]?: DeepPartial<T[K]> }
  : T
