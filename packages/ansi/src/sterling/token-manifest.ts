/**
 * Sterling token manifest — single source of truth for documentation,
 * storybook TokenTree labels, contract tests, and tier-fallback notes.
 *
 * Every public flat token has exactly one `TokenManifestEntry` here. The
 * test in `tests/sterling/token-manifest.test.ts` enforces lockstep with
 * `STERLING_FLAT_TOKENS` (same length, same set).
 *
 * Why a manifest, not a code-generated table:
 *   - `purpose` and `derivation` are HUMAN sentences — not derivable
 *     from the type system. Putting them in code lets storybook,
 *     gen-token-docs, and contract tests all read the same prose.
 *   - Keeps documentation in lockstep with code (CI drift check fails
 *     any PR that changes flat tokens without updating the manifest).
 *
 * Convention:
 *   - `family` matches the role-tree key (`accent`, `info`, `surface`, …)
 *     plus four pseudo-families for tokens that don't live on a role:
 *     `default` (the canvas pair), `backdrop` (modal scrim), `link`
 *     (hyperlink fg), `disabled` (the new neutral family).
 *   - `axis` reads "channel" + optional "-state"  (`bg`, `fg-on`,
 *     `bg-hover`). It's not the suffix of the flat key — it's the
 *     SHAPE of the token in the role family.
 *   - `path` follows the dot-form on the nested theme
 *     (`accent.hover.bg`). For standalone tokens it's `null`.
 */

import type { FlatToken } from "./types.ts"

export interface TokenManifestEntry {
  /** Flat hyphen key as it appears on a Theme (`theme["bg-accent-hover"]`). */
  readonly flat: FlatToken
  /** Nested role path on the Theme tree (`accent.hover.bg`). `null` when
   * the token is not part of a role object (`bg-backdrop`, `fg-default`). */
  readonly path: string | null
  /** Role family (e.g. `accent`, `info`, `surface`). Pseudo-families:
   * `default` (canvas), `backdrop` (modal scrim). */
  readonly family: string
  /** Channel + state shape (e.g. `bg-hover`, `fg`, `fg-on`). */
  readonly axis: string
  /** One-sentence purpose suitable for docs. */
  readonly purpose: string
  /** Plain-text derivation rule — what's blended/lifted/picked. */
  readonly derivation: string
  /** Contrast guarantee against `bg-surface-default`. */
  readonly contrast: string
  /** Tier-fallback note for ANSI16 / mono. */
  readonly tierNotes: string
}

const AA = "AA 4.5:1"
const LARGE = "AA-Large 3:1"
const FAINT = "FAINT 1.5:1"
const NA = "—"

export const PUBLIC_TOKENS: readonly TokenManifestEntry[] = [
  // ── Surface ──────────────────────────────────────────────────────────────
  {
    flat: "bg-surface-default",
    path: "surface.default",
    family: "surface",
    axis: "bg",
    purpose: "The canvas — body bg of every screen. Same value as `bg-default`.",
    derivation: "= scheme.background, verbatim.",
    contrast: NA,
    tierNotes: "Stable across all tiers (truecolor → ansi16 → mono).",
  },
  {
    flat: "bg-surface-subtle",
    path: "surface.subtle",
    family: "surface",
    axis: "bg",
    purpose: "Subtle elevation tier — sidebars, secondary regions.",
    derivation: "blend(bg, fg, 0.03); auto-lifted to keep fg AA-readable.",
    contrast: NA,
    tierNotes:
      "Often collapses to surface.default in ANSI16 — renderer compensates with non-color cues.",
  },
  {
    flat: "bg-surface-raised",
    path: "surface.raised",
    family: "surface",
    axis: "bg",
    purpose: "Raised elevation — cards, panels above the canvas.",
    derivation: "blend(bg, fg, 0.10); auto-lifted to keep fg AA-readable.",
    contrast: NA,
    tierNotes: "May collapse to subtle in low-tier modes.",
  },
  {
    flat: "bg-surface-overlay",
    path: "surface.overlay",
    family: "surface",
    axis: "bg",
    purpose: "Overlay surface — popovers, tooltips, menus (NOT modal backdrop).",
    derivation: "blend(bg, fg, 0.12); auto-lifted to keep fg AA-readable.",
    contrast: NA,
    tierNotes: "Distinct from `bg-backdrop` (the modal scrim).",
  },
  {
    flat: "bg-surface-hover",
    path: "surface.hover",
    family: "surface",
    axis: "bg-hover",
    purpose: "Hover wash for surfaces (default-row hover, etc.).",
    derivation: "blend(bg, fg, 0.10); auto-lifted to keep fg AA-readable.",
    contrast: NA,
    tierNotes: "Renderer may fall back to inverse cue in ansi16.",
  },

  // ── Border ───────────────────────────────────────────────────────────────
  {
    flat: "border-default",
    path: "border.default",
    family: "border",
    axis: "border",
    purpose: "Default rule line, card borders, separators.",
    derivation: "blend(bg, fg, 0.18); auto-lifted to ≥3:1 vs bg.",
    contrast: LARGE,
    tierNotes: "May collapse with border-focus in ansi16; renderer can use bold/double-line.",
  },
  {
    flat: "border-focus",
    path: "border.focus",
    family: "border",
    axis: "border",
    purpose: "Focus ring color (active input, focused button).",
    derivation: "= accent.bg, ensure-AA against bg.",
    contrast: AA,
    tierNotes: "Distinct from border-default in ≥80/84 palettes at ansi16.",
  },
  {
    flat: "border-muted",
    path: "border.muted",
    family: "border",
    axis: "border",
    purpose: "Faint structural divider — backgrounded sections, less emphasis.",
    derivation: "blend(bg, fg, 0.10); lifted to ≥1.5:1.",
    contrast: FAINT,
    tierNotes: "Faintest border tier; intentionally low contrast.",
  },

  // ── Cursor ───────────────────────────────────────────────────────────────
  {
    flat: "fg-cursor",
    path: "cursor.fg",
    family: "cursor",
    axis: "fg",
    purpose: "Text color drawn ON cursor.bg (the cursor cell text).",
    derivation: "= scheme.cursorText, lifted to AA against (repaired) cursor.bg.",
    contrast: AA,
    tierNotes: "Tier-stable — cursor visibility cares about ΔE not L.",
  },
  {
    flat: "bg-cursor",
    path: "cursor.bg",
    family: "cursor",
    axis: "bg",
    purpose: "Cursor cell background — the blink target.",
    derivation: "= scheme.cursorColor, repaired to ΔE ≥ 0.15 vs bg-surface-default.",
    contrast: NA,
    tierNotes: "ΔE-repaired so it stays visible after quantization.",
  },

  // ── Muted ────────────────────────────────────────────────────────────────
  {
    flat: "fg-muted",
    path: "muted.fg",
    family: "muted",
    axis: "fg",
    purpose: "Deemphasized text — captions, secondary metadata.",
    derivation: "blend(fg, bg, 0.4); ≥3:1 against bg-muted.",
    contrast: LARGE,
    tierNotes: "Stable in ansi16 (uses bright-black slot).",
  },
  {
    flat: "bg-muted",
    path: "muted.bg",
    family: "muted",
    axis: "bg",
    purpose: "Code blocks, kbd chips, deemphasized fills.",
    derivation: "blend(bg, fg, 0.08).",
    contrast: NA,
    tierNotes: "May collapse with surface-subtle in ansi16.",
  },

  // ── Accent ───────────────────────────────────────────────────────────────
  {
    flat: "fg-accent",
    path: "accent.fg",
    family: "accent",
    axis: "fg",
    purpose: "Brand-derived accent text (selected items, primary indicators).",
    derivation: "= scheme.primary; lifted to AA against bg.",
    contrast: AA,
    tierNotes: "Maps to scheme.brightBlue / scheme.blue in ansi16.",
  },
  {
    flat: "bg-accent",
    path: "accent.bg",
    family: "accent",
    axis: "bg",
    purpose: "Accent fill — primary buttons, selected surface.",
    derivation: "= scheme.primary, ensure-AA-readable for fgOn.",
    contrast: NA,
    tierNotes: "Renderer keeps a coloured cell at every tier.",
  },
  {
    flat: "fg-on-accent",
    path: "accent.fgOn",
    family: "accent",
    axis: "fg-on",
    purpose: "Foreground when drawing text ON `bg-accent` (button labels).",
    derivation: "contrast-pick(scheme.fg / scheme.bg / black / white) for AA on bg-accent.",
    contrast: AA,
    tierNotes: "Pre-quantization pick; rare ansi16 misses caught by collision test.",
  },
  {
    flat: "fg-accent-hover",
    path: "accent.hover.fg",
    family: "accent",
    axis: "fg-hover",
    purpose: "Hover text color for link-like accent elements.",
    derivation: "OKLCH ±0.04L on accent.fg (sign tracks scheme dark/light).",
    contrast: AA,
    tierNotes: "Often collapses to fg-accent in ansi16.",
  },
  {
    flat: "bg-accent-hover",
    path: "accent.hover.bg",
    family: "accent",
    axis: "bg-hover",
    purpose: "Hover fill for accent surfaces.",
    derivation: "OKLCH ±0.04L on accent.bg.",
    contrast: NA,
    tierNotes: "Often collapses to bg-accent in ansi16.",
  },
  {
    flat: "fg-accent-active",
    path: "accent.active.fg",
    family: "accent",
    axis: "fg-active",
    purpose: "Pressed/active text color for accent elements.",
    derivation: "OKLCH ±0.08L on accent.fg.",
    contrast: AA,
    tierNotes: "Collapses to fg-accent in low tiers.",
  },
  {
    flat: "bg-accent-active",
    path: "accent.active.bg",
    family: "accent",
    axis: "bg-active",
    purpose: "Pressed/active fill for accent surfaces.",
    derivation: "OKLCH ±0.08L on accent.bg.",
    contrast: NA,
    tierNotes: "Collapses to bg-accent in low tiers.",
  },
  {
    flat: "border-accent",
    path: "accent.border",
    family: "accent",
    axis: "border",
    purpose: "Accent-tinted border (focus rings, primary cards).",
    derivation: "= accent.bg, ensure-AA against bg.",
    contrast: AA,
    tierNotes: "Same value as border-focus.",
  },

  // ── Info / Success / Warning / Error (status family — same shape) ───────
  ...(["info", "success", "warning", "error"] as const).flatMap<TokenManifestEntry>((role) => [
    {
      flat: `fg-${role}` as FlatToken,
      path: `${role}.fg`,
      family: role,
      axis: "fg",
      purpose: `${capitalize(role)} status text.`,
      derivation: seedRule(role),
      contrast: AA,
      tierNotes: "Seeds from the matching ANSI palette slot.",
    },
    {
      flat: `bg-${role}` as FlatToken,
      path: `${role}.bg`,
      family: role,
      axis: "bg",
      purpose: `${capitalize(role)} fill — alerts, badges.`,
      derivation: seedRule(role),
      contrast: NA,
      tierNotes: "Distinct from siblings in ALL 84 palettes (collision test).",
    },
    {
      flat: `fg-on-${role}` as FlatToken,
      path: `${role}.fgOn`,
      family: role,
      axis: "fg-on",
      purpose: `Foreground when drawing text ON \`bg-${role}\`.`,
      derivation: "contrast-pick(scheme.fg / scheme.bg / black / white) for AA on bg.",
      contrast: AA,
      tierNotes: "Pre-quantization pick.",
    },
    {
      flat: `bg-${role}-hover` as FlatToken,
      path: `${role}.hover.bg`,
      family: role,
      axis: "bg-hover",
      purpose: `Hover fill for ${role} surfaces.`,
      derivation: `OKLCH ±0.04L on bg-${role}.`,
      contrast: NA,
      tierNotes: "Often collapses with bg in ansi16.",
    },
    {
      flat: `bg-${role}-active` as FlatToken,
      path: `${role}.active.bg`,
      family: role,
      axis: "bg-active",
      purpose: `Pressed/active fill for ${role} surfaces.`,
      derivation: `OKLCH ±0.08L on bg-${role}.`,
      contrast: NA,
      tierNotes: "Collapses to bg in low tiers.",
    },
  ]),

  // ── Selected ─────────────────────────────────────────────────────────────
  {
    flat: "bg-selected",
    path: "selected.bg",
    family: "selected",
    axis: "bg",
    purpose: "Cursor row / mouse-selection / search-match highlight surface.",
    derivation: "= scheme.selectionBackground; ΔL-repaired to ≥0.08 vs bg.",
    contrast: NA,
    tierNotes: "ΔL-repaired so the selection bar stays visible after quantization.",
  },
  {
    flat: "fg-on-selected",
    path: "selected.fgOn",
    family: "selected",
    axis: "fg-on",
    purpose: "Text drawn on the selection bar.",
    derivation: "= scheme.selectionForeground; lifted to AA on bg-selected.",
    contrast: AA,
    tierNotes: "Pre-quantization pick.",
  },
  {
    flat: "bg-selected-hover",
    path: "selected.hover.bg",
    family: "selected",
    axis: "bg-hover",
    purpose: "Hover variant of the selection bar (SelectList row hover).",
    derivation: "OKLCH +0.04L on bg-selected.",
    contrast: NA,
    tierNotes: "Often collapses to bg-selected in ansi16.",
  },

  // ── Inverse ──────────────────────────────────────────────────────────────
  {
    flat: "bg-inverse",
    path: "inverse.bg",
    family: "inverse",
    axis: "bg",
    purpose: "Inverse-band surface — status bar, modal chrome.",
    derivation: "blend(bg, fg, 0.85) (heavily fg-tinted bg).",
    contrast: NA,
    tierNotes: "Stable; high-contrast band.",
  },
  {
    flat: "fg-on-inverse",
    path: "inverse.fgOn",
    family: "inverse",
    axis: "fg-on",
    purpose: "Text on the inverse band.",
    derivation: "contrast-pick for AA on bg-inverse.",
    contrast: AA,
    tierNotes: "Pre-quantization pick.",
  },

  // ── Link ─────────────────────────────────────────────────────────────────
  {
    flat: "fg-link",
    path: "link.fg",
    family: "link",
    axis: "fg",
    purpose: "Hyperlink text color (distinct from accent).",
    derivation: "= scheme.brightBlue (dark mode) / scheme.blue (light); ensure-AA on bg.",
    contrast: AA,
    tierNotes: "Apps that want link === accent can pin `link.fg` to `$fg-accent`.",
  },

  // ── Disabled (neutral family — sourced from base interface tokens) ──────
  {
    flat: "fg-disabled",
    path: "disabled.fg",
    family: "disabled",
    axis: "fg",
    purpose: "Text on disabled controls — read-only inputs, inactive items.",
    derivation: "composite(fg @ 0.38, bg-surface-default); clamped to ≥3:1.",
    contrast: LARGE,
    tierNotes: "Neutral hue (sourced from fg, not status); rarely collapses.",
  },
  {
    flat: "bg-disabled",
    path: "disabled.bg",
    family: "disabled",
    axis: "bg",
    purpose: "Disabled control surface — disabled buttons, inactive chips.",
    derivation: "composite(border-default @ 0.12, bg-surface-default).",
    contrast: NA,
    tierNotes: "Faint surface; renderer may fall back to italic on text.",
  },
  {
    flat: "border-disabled",
    path: "disabled.border",
    family: "disabled",
    axis: "border",
    purpose: "Disabled control border — read-only input frames.",
    derivation: "composite(border-default @ 0.24, bg-surface-default).",
    contrast: FAINT,
    tierNotes: "Sits between border-muted and border-default; subtle.",
  },

  // ── Backdrop (standalone token) ──────────────────────────────────────────
  {
    flat: "bg-backdrop",
    path: null,
    family: "backdrop",
    axis: "bg",
    purpose: "Modal/dialog scrim — the dimming layer drawn BEHIND a modal.",
    derivation: "composite(black @ 0.40, bg-default); baked solid for TUI.",
    contrast: NA,
    tierNotes:
      "May collapse to bg-default on pure-black themes; renderer adds dim/border fallback.",
  },

  // ── Default (canvas, explicit) ──────────────────────────────────────────
  {
    flat: "fg-default",
    path: null,
    family: "default",
    axis: "fg",
    purpose: "Unstyled body text — explicit alias for `theme.fg`.",
    derivation: "= scheme.foreground; lifted to AA against bg.",
    contrast: AA,
    tierNotes: "Stable across all tiers.",
  },
  {
    flat: "bg-default",
    path: null,
    family: "default",
    axis: "bg",
    purpose: "Unstyled canvas — explicit alias for `theme.bg`.",
    derivation: "= scheme.background, verbatim.",
    contrast: NA,
    tierNotes: "Stable across all tiers.",
  },
]

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function seedRule(role: "info" | "success" | "warning" | "error"): string {
  switch (role) {
    case "info":
      return "scheme.primary (info mirrors accent's seed)."
    case "success":
      return "scheme.green."
    case "warning":
      return "scheme.yellow."
    case "error":
      return "scheme.red."
  }
}

/** Group a manifest by family — convenience for doc generation. */
export function groupTokensByFamily(): Map<string, readonly TokenManifestEntry[]> {
  const out = new Map<string, TokenManifestEntry[]>()
  for (const entry of PUBLIC_TOKENS) {
    let bucket = out.get(entry.family)
    if (!bucket) {
      bucket = []
      out.set(entry.family, bucket)
    }
    bucket.push(entry)
  }
  return out as Map<string, readonly TokenManifestEntry[]>
}

/** Family display order for docs (canonical, not insertion order). */
export const FAMILY_ORDER: readonly string[] = [
  "default",
  "surface",
  "border",
  "muted",
  "accent",
  "info",
  "success",
  "warning",
  "error",
  "selected",
  "inverse",
  "link",
  "cursor",
  "disabled",
  "backdrop",
]
