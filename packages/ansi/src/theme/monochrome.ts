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
import { resolveThemeColor } from "../style/style.ts"

/** SGR attrs recognized by the monochrome theme system. Universally-supported subset. */
export type MonoAttr = "bold" | "dim" | "italic" | "underline" | "inverse" | "strikethrough"

/**
 * Per-token SGR attrs for monochrome rendering.
 *
 * Keyed by Theme token name. Tokens not in this map have no attrs (default
 * rendering). Callers apply these attrs at paint time when color tier is none.
 *
 * The key space is canonical Sterling flat tokens plus the root `fg` / `bg`
 * pair. Each is a direct lookup; retired spellings never receive a mono-mode
 * fallback.
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
 * Structural surfaces (`bg`, `bg-muted`, `bg-surface-*`) have no attrs — they
 * represent background planes that monochrome terminals can't vary anyway.
 */
export const DEFAULT_MONO_ATTRS: MonochromeAttrs = {
  // Root text hierarchy
  fg: [], // default body text — no attrs
  bg: [], // default canvas — no attrs

  // Canonical flat tokens resolve through one direct lookup.
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
  "bg-inverse-hover": ["inverse"],
  "fg-on-inverse-muted": ["dim"],
  "fg-link": ["underline"],
  "fg-link-hover": ["underline"],
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
 * Accepts canonical strings like `"$fg-accent"`, `"$fg-muted"`, and
 * `"$border-focus"`. Retired names first pass through the shared resolver so
 * they fail with its specific replacement rather than silently losing mono
 * emphasis. Non-token strings (hex, rgb(), ANSI names) return `undefined`.
 *
 * @param color    The color string (e.g. `"$fg-accent"`, `"#ff0000"`, `"red"`)
 * @param theme    Active theme (reserved for per-theme overrides)
 * @returns        Array of mono-attrs for the token, or `undefined` if not a
 *                 recognized token.
 */
export function monoAttrsForColorString(
  color: string,
  theme: Theme,
): readonly MonoAttr[] | undefined {
  if (!color.startsWith("$")) return undefined
  // Shared resolver is the single authority for loud legacy-token refusal.
  resolveThemeColor(color, theme)
  const name = color.slice(1)
  const attrs = deriveMonochromeTheme(theme)
  // Direct lookup — canonical keys only.
  const direct = attrs[name as keyof Theme]
  if (direct !== undefined) return direct
  return undefined
}
