/**
 * Monochrome theme — per-token SGR attrs for terminals without color.
 *
 * When color is unavailable (NO_COLOR env, TERM=dumb, SILVERY_COLOR=mono,
 * OSC-queried ColorLevel="mono"), silvery apps stay hierarchical via per-token
 * SGR attrs: bold for emphasis, dim for muted, inverse for `$bg-selected` and
 * `$bg-inverse`, italic for info, underline for `$fg-link`.
 *
 * This is Option B from the design spec — state-colored content gets genuine
 * distinguishability without color (not just "stripped"). Error, warning, and
 * success remain visually distinct via attrs combinations.
 *
 * Universally-supported SGR subset: bold, dim, italic, underline, inverse,
 * strikethrough. Any other attr is ignored by the renderer at mono tier.
 *
 * @module
 */

import type { Theme } from "./types.ts"

/** SGR attrs recognized by the monochrome theme system. Universally-supported subset. */
export type MonoAttr = "bold" | "dim" | "italic" | "underline" | "inverse" | "strikethrough"

/**
 * Per-token SGR attrs for monochrome rendering.
 *
 * Keyed by Theme token name. Tokens not in this map have no attrs (default
 * rendering). Callers apply these attrs at paint time when color tier is none.
 *
 * The key space is legacy `keyof Theme` UNION the Sterling flat token strings
 * (`"fg-muted"`, `"border-focus"`, `"bg-surface-default"`, …). Both are
 * first-class entries so `$fg-muted` in a `<Text color=…>` resolves via a
 * single direct lookup — no alias table required.
 */
export type MonochromeAttrs = Partial<Record<keyof Theme | string, readonly MonoAttr[]>>

/**
 * Default monochrome attrs — Polaris-aligned mapping from the design spec.
 *
 * The philosophy: every *semantic* token that would normally carry color gets an
 * attrs set that preserves its hierarchy rank and state semantics. Example:
 * error (danger) is bold+inverse so it *grabs* attention even without red;
 * warning is bold to stand out but not as aggressively; info is italic to
 * indicate auxiliary information.
 *
 * Structural surfaces (bg/mutedbg/surfacebg/popoverbg) have no attrs — they
 * represent background planes that monochrome terminals can't vary anyway.
 */
export const DEFAULT_MONO_ATTRS: MonochromeAttrs = {
  // Structural — no attrs (background planes, container chrome)
  bg: [],
  mutedbg: [],
  surfacebg: [],
  popoverbg: [],
  border: [],
  cursorbg: [],

  // Text hierarchy
  fg: [], // default body text — no attrs
  muted: ["dim"], // secondary info
  disabledfg: ["dim"], // clearly inactive
  surface: [],
  popover: [],

  // Brand / accent emphasis
  primary: ["bold"], // brand emphasis
  secondary: ["bold"], // secondary emphasis
  accent: ["italic", "bold"], // complement — italic+bold for distinct rank below primary

  // States — distinguishable combinations
  error: ["bold", "inverse"], // danger: loudest
  warning: ["bold"], // caution
  success: ["bold"], // positive confirmation
  info: ["italic"], // auxiliary info

  // On-fill text (contrast against accent/state bg)
  primaryfg: [],
  secondaryfg: [],
  accentfg: [],
  errorfg: ["inverse"],
  warningfg: [],
  successfg: [],
  infofg: [],

  // Interactive chrome
  focusborder: ["bold"],
  inputborder: [],

  // Cursor
  cursor: [],

  // Sterling flat tokens — paired with their legacy-attr equivalents so that
  // `$fg-muted`, `$border-focus`, `$bg-selected`, etc. resolve to the same
  // mono attrs as their legacy counterparts without an alias table. Extending
  // the map keeps the resolution path a single direct lookup.
  "fg-muted": ["dim"],
  "bg-muted": [],
  "fg-accent": ["italic", "bold"],
  "bg-accent": [],
  "fg-on-accent": [],
  "border-accent": [],
  "fg-accent-hover": ["italic", "bold"],
  "bg-accent-hover": [],
  "fg-accent-active": ["italic", "bold"],
  "bg-accent-active": [],
  "fg-info": ["italic"],
  "bg-info": [],
  "fg-on-info": [],
  "bg-info-hover": [],
  "bg-info-active": [],
  "fg-success": ["bold"],
  "bg-success": [],
  "fg-on-success": [],
  "bg-success-hover": [],
  "bg-success-active": [],
  "fg-warning": ["bold"],
  "bg-warning": [],
  "fg-on-warning": [],
  "bg-warning-hover": [],
  "bg-warning-active": [],
  "fg-error": ["bold", "inverse"],
  "bg-error": [],
  "fg-on-error": ["inverse"],
  "bg-error-hover": [],
  "bg-error-active": [],
  "bg-surface-default": [],
  "bg-surface-subtle": [],
  "bg-surface-raised": [],
  "bg-surface-overlay": [],
  "bg-surface-hover": [],
  "border-default": [],
  "border-focus": ["bold"],
  "border-muted": [],
  "fg-cursor": [],
  "bg-cursor": [],
  // Sterling flat tokens for selection / inverse / link (replaced legacy
  // `selection` / `selectionbg` / `inverse` / `inversebg` / `link` keys in
  // 0.21.0 — sterling-purge-legacy-tokens).
  "bg-selected": ["inverse"],
  "fg-on-selected": [],
  "bg-selected-hover": ["inverse"],
  "bg-inverse": ["inverse"],
  "fg-on-inverse": [],
  "fg-link": ["underline"],
}

/**
 * Produce per-token monochrome attrs from a base Theme.
 *
 * Currently returns `DEFAULT_MONO_ATTRS` — a canonical mapping. Passed the
 * theme to allow per-theme overrides in the future (e.g., a palette that
 * prefers `underline` for accents over `italic`). The argument is reserved.
 */
export function deriveMonochromeTheme(theme: Theme): MonochromeAttrs {
  void theme
  return DEFAULT_MONO_ATTRS
}

/**
 * Resolve attrs for a specific Theme token. Returns `[]` if the token has no
 * mapped attrs (meaning: render with default attrs).
 */
export function monoAttrsFor(theme: Theme, token: keyof Theme): readonly MonoAttr[] {
  const attrs = deriveMonochromeTheme(theme)
  return attrs[token] ?? []
}

/**
 * Resolve mono-attrs from a color *string* — the high-level entry point
 * consumed by the render pipeline.
 *
 * Accepts strings like `"$primary"`, `"$fg-muted"`, `"$border-focus"`. Strips
 * the `$` prefix and looks the name up directly against `DEFAULT_MONO_ATTRS`,
 * which carries both legacy keys (`muted`, `surfacebg`, `focusborder`, …) AND
 * Sterling flat tokens (`fg-muted`, `bg-surface-default`, `border-focus`, …)
 * as first-class entries. Returns `undefined` for non-token strings (hex,
 * rgb(), named ANSI colors) — callers should treat this as "no attrs".
 *
 * A secondary no-hyphen fallback (`$surface-bg` → `surfacebg`) keeps the
 * legacy hyphenated-compound form working for callers that still emit that
 * shape.
 *
 * @param color    The color string (e.g. `"$primary"`, `"#ff0000"`, `"red"`)
 * @param theme    Active theme (reserved for per-theme overrides)
 * @returns        Array of mono-attrs for the token, or `undefined` if not a
 *                 recognized token.
 */
export function monoAttrsForColorString(
  color: string,
  theme: Theme,
): readonly MonoAttr[] | undefined {
  if (!color.startsWith("$")) return undefined
  const name = color.slice(1)
  const attrs = deriveMonochromeTheme(theme)
  // Direct lookup — covers Sterling flat keys AND legacy names.
  const direct = attrs[name as keyof Theme]
  if (direct !== undefined) return direct
  // No-hyphen fallback for compound legacy names (`$surface-bg` → `surfacebg`).
  const noHyphen = name.replace(/-/g, "")
  if (noHyphen !== name) {
    const stripped = attrs[noHyphen as keyof Theme]
    if (stripped !== undefined) return stripped
  }
  return undefined
}
