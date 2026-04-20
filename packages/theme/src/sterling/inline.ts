/**
 * Sterling flat-token inlining — internal helper that merges Sterling flat
 * tokens onto a legacy Theme. Replaces the removed public `augmentWithSterlingFlat`.
 *
 * Public consumers don't call this directly. It's invoked implicitly at theme
 * construction by:
 *   - packages/theme/src/schemes/index.ts  (every shipped default theme)
 *   - packages/ag-term/src/pipeline/state.ts  (pipeline fallback theme)
 *
 * Behavior mirrors the old `augmentWithSterlingFlat` exactly:
 *   - Preserves every legacy Theme field unchanged
 *   - Writes Sterling flat tokens (`bg-accent`, `fg-on-accent`, `border-focus`, …)
 *     only when the key isn't already present as a string
 *   - Not frozen (legacy consumers expect mutability in a few corners)
 *
 * A ColorScheme can be supplied for full fidelity. When omitted, Sterling
 * derives from a ColorScheme reconstructed from the theme's own palette —
 * lossy for ANSI slot colors but sufficient for Sterling's 6-slot surface.
 *
 * This file is NOT exported from the `@silvery/theme` barrel.
 */

import type { ColorScheme, Theme as LegacyTheme } from "@silvery/ansi"
import { deriveRoles } from "./derive.ts"
import type { FlatToken } from "./types.ts"

/**
 * Legacy Theme + Sterling flat tokens on the same object. Kept as a local
 * type alias; the public barrel no longer re-exports this shape.
 */
export type InlinedTheme = LegacyTheme & { [K in FlatToken]: string }

/**
 * Build a ColorScheme-shaped input from a legacy Theme when the original
 * scheme isn't available (hand-crafted themes, picker round-trips).
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
 * Quick luminance check — matches relativeLuminance threshold (0.5). Avoids
 * pulling in @silvery/color for a single boolean.
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
 * Write Sterling flat tokens onto a legacy Theme in-place and return the
 * augmented object. Mirrors the old `augmentWithSterlingFlat` semantics:
 * only sets a key if it's not already a string on the theme.
 *
 * When `scheme` is provided, Sterling derives directly from it (full fidelity).
 * Otherwise a scheme is reconstructed from the theme's palette (lossy on ANSI
 * slots but fine for Sterling's derivation surface).
 */
export function inlineSterlingTokens(theme: LegacyTheme, scheme?: ColorScheme): InlinedTheme {
  const src = scheme ?? schemeFromLegacy(theme)
  const { roles } = deriveRoles(src, { contrast: "auto-lift" })

  const out: Record<string, unknown> = { ...theme }

  const setIfAbsent = (key: string, value: string): void => {
    if (!(key in out) || typeof out[key] !== "string") {
      out[key] = value
    }
  }

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

  return out as unknown as InlinedTheme
}
