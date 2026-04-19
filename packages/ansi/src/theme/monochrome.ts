/**
 * Monochrome theme — per-token SGR attrs for terminals without color.
 *
 * When color is unavailable (NO_COLOR env, TERM=dumb, SILVERY_COLOR=mono,
 * OSC-queried ColorLevel="none"), silvery apps stay hierarchical via per-token
 * SGR attrs: bold for emphasis, dim for muted, inverse for selection, italic
 * for info, underline for links.
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
 */
export type MonochromeAttrs = Partial<Record<keyof Theme, readonly MonoAttr[]>>

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
  inverse: ["inverse"],

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
  link: ["underline"], // hyperlinks: underlined even in mono
  focusborder: ["bold"],
  inputborder: [],

  // Selection / cursor — explicit inverse so they're visible
  selection: [],
  selectionbg: ["inverse"],
  cursor: [],
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
 * Primer-style alias table for mono-attr resolution. Mirrors the alias table
 * in `style/style.ts:PRIMER_ALIASES` — kept local to avoid a cross-package
 * import cycle.
 *
 * Maps the Primer-style compound token names (hyphens stripped) to the
 * canonical Theme keys that `DEFAULT_MONO_ATTRS` is keyed by. This lets
 * `$fg-muted`, `$bg-selected`, `$border-focus`, etc. resolve to the same attrs
 * set as their legacy counterparts.
 */
const PRIMER_ALIASES_FOR_MONO: Record<string, keyof Theme> = {
  fgmuted: "muted",
  fgdisabled: "disabledfg",
  fgcursor: "cursor",
  fgselected: "selection",
  fginverse: "inverse",
  fgonsurface: "surface",
  fgonpopover: "popover",
  fgonprimary: "primaryfg",
  fgonsecondary: "secondaryfg",
  fgonaccent: "accentfg",
  fgonerror: "errorfg",
  fgonwarning: "warningfg",
  fgonsuccess: "successfg",
  fgoninfo: "infofg",
  bgmuted: "mutedbg",
  bgsurface: "surfacebg",
  bgpopover: "popoverbg",
  bginverse: "inversebg",
  bgselected: "selectionbg",
  bgcursor: "cursorbg",
  borderfocus: "focusborder",
  borderinput: "inputborder",
}

/**
 * Resolve mono-attrs from a color *string* — the high-level entry point
 * consumed by the render pipeline.
 *
 * Accepts strings like `"$primary"`, `"$fg-muted"`, `"$border-focus"`. Strips
 * the `$` prefix and hyphens, tries direct Theme key lookup, then falls back
 * to the Primer alias table. Returns `undefined` for non-token strings (hex,
 * rgb(), named ANSI colors) — callers should treat this as "no attrs".
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
  const raw = color.slice(1).replace(/-/g, "")
  const attrs = deriveMonochromeTheme(theme)
  // Direct key (legacy names: muted, surfacebg, focusborder, primary, …)
  const direct = attrs[raw as keyof Theme]
  if (direct !== undefined) return direct
  // Primer aliases (fg-muted, bg-surface, border-focus, …)
  const aliased = PRIMER_ALIASES_FOR_MONO[raw]
  if (aliased) {
    const v = attrs[aliased]
    if (v !== undefined) return v
  }
  return undefined
}
