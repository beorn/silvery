/**
 * Sterling augment — merge Sterling flat tokens onto a legacy Theme.
 *
 * Phase 2b glue: Sterling is additive; legacy Theme fields stay; components
 * consume flat Sterling tokens (`$fg-on-accent`, `$bg-surface-subtle`, etc.)
 * via direct lookup on the Theme object. The nested Sterling role form is
 * intentionally NOT merged in this phase — legacy already uses those root
 * keys as hex strings (`theme.accent: string`). Nested access arrives in
 * Phase 2d when the legacy string form is removed.
 *
 * Flat Sterling keys (`bg-accent`, `fg-on-error`, `border-focus`, …) have
 * hyphens and never collide with legacy kebab keys (`primary-hover`,
 * `fg-hover`, …) or legacy concat keys (`surfacebg`, `primaryfg`).
 *
 * `augmentWithSterlingFlat(theme, scheme?)` returns a NEW object containing:
 *   - every legacy Theme field (unchanged)
 *   - every Sterling flat token, populated from Sterling's derivation
 *
 * The returned object is NOT frozen (legacy consumers expect mutability in
 * a few corners). Sterling's own freeze semantics arrive with Phase 2d.
 *
 * See hub/silvery/design/v10-terminal/design-system.md and
 * hub/silvery/design/v10-terminal/sterling-preflight.md (D4).
 */

import type { ColorScheme, Theme as LegacyTheme } from "@silvery/ansi"
import { deriveRoles } from "./derive.ts"
import { STERLING_FLAT_TOKENS } from "./flatten.ts"
import type { FlatToken } from "./types.ts"

/**
 * Legacy Theme + Sterling flat tokens on the same object.
 *
 * Type is a string-index intersection — every FlatToken key resolves to a
 * string. Components do `theme["bg-surface-subtle"]` and TypeScript catches
 * typos via the FlatToken string-literal union.
 */
export type UnifiedTheme = LegacyTheme & { [K in FlatToken]: string }

/**
 * Build a ColorScheme-shaped input from a legacy Theme when the original
 * scheme isn't available (e.g. hand-crafted themes, theme picker round-trips).
 *
 * The reconstruction is lossy for ANSI slot colors but fine for Sterling's
 * derivation surface — Sterling derivation only depends on 6 slots:
 * foreground, background, primary, red, yellow, green. The rest fall back
 * to best-effort blends.
 */
function schemeFromLegacy(theme: LegacyTheme): ColorScheme {
  const palette = theme.palette ?? []
  return {
    name: theme.name,
    dark: isDark(theme.bg),
    primary: theme.primary,
    black: palette[0] ?? "#000000",
    red: palette[1] ?? theme.error,
    green: palette[2] ?? theme.success,
    yellow: palette[3] ?? theme.warning,
    blue: palette[4] ?? theme.primary,
    magenta: palette[5] ?? theme.accent,
    cyan: palette[6] ?? theme.info,
    white: palette[7] ?? theme.fg,
    brightBlack: palette[8] ?? theme.muted,
    brightRed: palette[9] ?? theme.error,
    brightGreen: palette[10] ?? theme.success,
    brightYellow: palette[11] ?? theme.warning,
    brightBlue: palette[12] ?? theme.primary,
    brightMagenta: palette[13] ?? theme.accent,
    brightCyan: palette[14] ?? theme.info,
    brightWhite: palette[15] ?? theme.fg,
    foreground: theme.fg,
    background: theme.bg,
    cursorColor: theme.cursorbg,
    cursorText: theme.cursor,
    selectionBackground: theme.selectionbg,
    selectionForeground: theme.selection,
  }
}

/**
 * Quick-and-dirty luminance test — matches @silvery/color's relativeLuminance
 * threshold (0.5). Avoids pulling @silvery/color in just for one boolean.
 */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return true
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  // Rec. 709 luma approximation (sufficient for this threshold).
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luma < 0.5
}

/**
 * Merge Sterling flat tokens onto a legacy Theme.
 *
 * When `scheme` is provided, Sterling derives directly from it (full fidelity).
 * When omitted, Sterling derives from a ColorScheme reconstructed from the
 * theme itself — good enough for runtime augmentation of hand-authored themes.
 */
export function augmentWithSterlingFlat(theme: LegacyTheme, scheme?: ColorScheme): UnifiedTheme {
  const src = scheme ?? schemeFromLegacy(theme)
  const { roles } = deriveRoles(src, { contrast: "auto-lift" })

  const out: Record<string, unknown> = { ...theme }

  // Write a flat token only if the legacy theme doesn't already own that key.
  // Prevents accidental mutation of legacy-defined flat kebab keys (e.g.
  // `bg-surface-hover`, `accent-hover`) whose derivation rules may differ
  // slightly from Sterling's. Phase 2d will unify these.
  const setIfAbsent = (key: string, value: string): void => {
    if (!(key in out) || typeof out[key] !== "string") {
      out[key] = value
    }
  }

  // Populate flat tokens — mirrors populateFlat() but writes onto an
  // existing object WITHOUT overwriting the legacy string-valued role keys
  // (accent / info / success / warning / error / muted / surface / border /
  // cursor) which still hold hex strings in the legacy form.

  // Accent — link-like interactive text: both fg and bg state variants
  const accent = roles.accent
  if (accent) {
    setIfAbsent("fg-accent", accent.fg)
    setIfAbsent("bg-accent", accent.bg)
    setIfAbsent("fg-on-accent", accent.fgOn)
    for (const state of ["hover", "active"] as const) {
      const s = accent[state]
      if (!s) continue
      setIfAbsent(`fg-accent-${state}`, s.fg)
      setIfAbsent(`bg-accent-${state}`, s.bg)
    }
  }

  // Status roles — only bg state variants (text doesn't hover)
  for (const role of ["info", "success", "warning", "error"] as const) {
    const r = roles[role]
    if (!r) continue
    setIfAbsent(`fg-${role}`, r.fg)
    setIfAbsent(`bg-${role}`, r.bg)
    setIfAbsent(`fg-on-${role}`, r.fgOn)
    for (const state of ["hover", "active"] as const) {
      const s = (r as { hover?: { bg: string }; active?: { bg: string } })[state]
      if (!s) continue
      setIfAbsent(`bg-${role}-${state}`, s.bg)
    }
  }

  // Accent border
  if (roles.accent && "border" in roles.accent) {
    setIfAbsent("border-accent", roles.accent.border)
  }

  // Surface levels
  const surf = roles.surface
  if (surf) {
    setIfAbsent("bg-surface-default", surf.default)
    setIfAbsent("bg-surface-subtle", surf.subtle)
    setIfAbsent("bg-surface-raised", surf.raised)
    setIfAbsent("bg-surface-overlay", surf.overlay)
    setIfAbsent("bg-surface-hover", surf.hover)
  }

  const b = roles.border
  if (b) {
    setIfAbsent("border-default", b.default)
    setIfAbsent("border-focus", b.focus)
    setIfAbsent("border-muted", b.muted)
  }

  const c = roles.cursor
  if (c) {
    setIfAbsent("fg-cursor", c.fg)
    setIfAbsent("bg-cursor", c.bg)
  }

  const m = roles.muted
  if (m) {
    setIfAbsent("fg-muted", m.fg)
    setIfAbsent("bg-muted", m.bg)
  }

  return out as unknown as UnifiedTheme
}

/** All Sterling flat tokens — re-exported for audits and tests. */
export { STERLING_FLAT_TOKENS }
