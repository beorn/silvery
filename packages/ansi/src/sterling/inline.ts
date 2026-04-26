/**
 * Sterling flat-token inlining — merges Sterling flat tokens onto a Theme.
 *
 * Invoked implicitly by `deriveTheme`, `loadTheme`, and `deriveAnsi16Theme`
 * so every Theme `@silvery/ansi` produces has Sterling flat tokens baked in.
 * Callers do not need to call this directly.
 *
 * Behavior:
 *   - Preserves every existing Theme field unchanged
 *   - Writes Sterling flat tokens (`bg-accent`, `fg-on-accent`, `border-focus`, …)
 *     only when the key isn't already present as a string (so author pins /
 *     palette-provided values win)
 *   - Not frozen (theme overlays mutate in a few callers)
 *
 * A ColorScheme can be supplied for full fidelity. When omitted, Sterling
 * derives from a ColorScheme reconstructed from the theme's own palette —
 * lossy for ANSI slot colors but sufficient for Sterling's 6-slot surface.
 *
 * Exported from `@silvery/ansi` for advanced users who author Theme objects
 * by hand and want to ensure the flat tokens are populated; for scheme →
 * Theme construction `deriveTheme`/`loadTheme` handle this automatically.
 */

import { blend } from "@silvery/color"
import type { ColorScheme, Theme } from "../theme/types.ts"
import { deriveRoles } from "./derive.ts"
import type { FlatToken } from "./types.ts"

/**
 * A Theme with Sterling flat tokens layered on. Every shipped Theme in
 * @silvery/theme (builtin schemes + detect* wrappers) is inlined. Kept as a
 * local type alias; the public barrel does not re-export this shape because
 * `Theme` already accepts Sterling keys via index signature.
 */
export type InlinedTheme = Theme & { [K in FlatToken]: string }

/**
 * Build a ColorScheme-shaped input from a Theme when the original
 * scheme isn't available (hand-crafted themes, picker round-trips).
 *
 * Reads legacy single-hex hints that the legacy `deriveTheme` path still
 * emits (`theme.primary`, `theme.accent`, `theme.cursorbg`, …) via bracket
 * access. Selection / inverse / link aliases were dropped in 0.21.0 — pulls
 * those from Sterling's nested role objects (`theme.selected.bg`,
 * `theme.inverse.bg`, `theme.link.fg`).
 */
function schemeFromTheme(theme: Theme): ColorScheme {
  const palette = theme.palette ?? []
  // Bracket-read legacy single-hex hints — primary / accent / cursor still
  // emit at runtime on every Theme produced by `deriveTheme`. Sterling-only
  // themes (hand-authored, no `deriveTheme` pass) fall back to nested roles.
  const legacy = theme as unknown as Record<string, string | undefined>
  const primary = legacy["primary"]
  const accent = legacy["accent"]
  const errorHex =
    (typeof legacy["error"] === "string" ? legacy["error"] : theme.error?.fg) ?? "#000000"
  const successHex =
    (typeof legacy["success"] === "string" ? legacy["success"] : theme.success?.fg) ?? "#000000"
  const warningHex =
    (typeof legacy["warning"] === "string" ? legacy["warning"] : theme.warning?.fg) ?? "#000000"
  const infoHex =
    (typeof legacy["info"] === "string" ? legacy["info"] : theme.info?.fg) ?? "#000000"
  const accentHex = accent ?? theme.accent?.fg ?? primary ?? "#000000"
  const primaryHex = primary ?? theme.accent?.fg ?? "#000000"
  const mutedHex =
    (typeof legacy["muted"] === "string" ? legacy["muted"] : theme.muted?.fg) ?? "#888888"
  const cursorBg = legacy["cursorbg"] ?? theme.cursor?.bg ?? theme.bg
  const cursorFg = legacy["cursor"] ?? theme.cursor?.fg ?? theme.fg
  // Selection comes from Sterling's nested `selected` role only (legacy
  // `selectionbg` / `selection` aliases removed in 0.21.0).
  const selectionBg = theme.selected?.bg ?? theme.bg
  const selectionFg = theme.selected?.fgOn ?? theme.fg
  return {
    name: theme.name,
    dark: isDark(theme.bg),
    primary: primaryHex,
    black: palette[0] ?? "#000000",
    red: palette[1] ?? errorHex,
    green: palette[2] ?? successHex,
    yellow: palette[3] ?? warningHex,
    blue: palette[4] ?? primaryHex,
    magenta: palette[5] ?? accentHex,
    cyan: palette[6] ?? infoHex,
    white: palette[7] ?? theme.fg,
    brightBlack: palette[8] ?? mutedHex,
    brightRed: palette[9] ?? errorHex,
    brightGreen: palette[10] ?? successHex,
    brightYellow: palette[11] ?? warningHex,
    brightBlue: palette[12] ?? primaryHex,
    brightMagenta: palette[13] ?? accentHex,
    brightCyan: palette[14] ?? infoHex,
    brightWhite: palette[15] ?? theme.fg,
    foreground: theme.fg,
    background: theme.bg,
    cursorColor: cursorBg,
    cursorText: cursorFg,
    selectionBackground: selectionBg,
    selectionForeground: selectionFg,
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
 * Write Sterling flat tokens onto a Theme and return the augmented object.
 * Sets a key only when it's not already a string on the theme (so author
 * pins / palette-provided values win).
 *
 * When `scheme` is provided, Sterling derives directly from it (full fidelity).
 * Otherwise a scheme is reconstructed from the theme's palette (lossy on ANSI
 * slots but fine for Sterling's derivation surface).
 */
export function inlineSterlingTokens(theme: Theme, scheme?: ColorScheme): InlinedTheme {
  const src = scheme ?? schemeFromTheme(theme)
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

  // Surface levels — Sterling owns the surface ramp. We OVERWRITE rather than
  // setIfAbsent because the legacy `theme/derived.ts` emits a stop-gap
  // `bg-surface-hover` (= applyShift(surfacebg, 0.04)) that pre-dates Sterling
  // and bypasses the contrast guardrails — leaving it in place would leak a
  // sub-AA bg through to apps even when Sterling's adaptive lift produced an
  // AA-passing surface. Other surface levels are not emitted by legacy at all,
  // so the overwrite is functionally identical to setIfAbsent for them.
  const surf = roles.surface
  if (surf) {
    out["bg-surface-default"] = surf.default
    out["bg-surface-subtle"] = surf.subtle
    out["bg-surface-raised"] = surf.raised
    out["bg-surface-overlay"] = surf.overlay
    out["bg-surface-hover"] = surf.hover
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

  const sel = roles.selected
  if (sel) {
    setIfAbsent("bg-selected", sel.bg)
    setIfAbsent("fg-on-selected", sel.fgOn)
    setIfAbsent("bg-selected-hover", sel.hover.bg)
  }

  const inv = roles.inverse
  if (inv) {
    setIfAbsent("bg-inverse", inv.bg)
    setIfAbsent("fg-on-inverse", inv.fgOn)
  }

  const lnk = roles.link
  if (lnk) {
    setIfAbsent("fg-link", lnk.fg)
  }

  const dis = roles.disabled
  if (dis) {
    setIfAbsent("fg-disabled", dis.fg)
    setIfAbsent("bg-disabled", dis.bg)
    setIfAbsent("border-disabled", dis.border)
  }

  // Root pair — `fg` / `bg` are exposed at the top level for `$fg` / `$bg`
  // JSX consumers. They mirror `scheme.foreground` / `scheme.background`
  // (`bg` is also the same value as `bg-surface-default`). Setting via
  // setIfAbsent so any pre-populated value (legacy derive, hand-crafted theme)
  // wins.
  setIfAbsent("fg", src.foreground)
  setIfAbsent("bg", src.background)

  // Public default tokens — explicit flat aliases for the unstyled canvas.
  // Same values as `theme.fg` / `theme.bg`, exposed so consumers can write
  // `$fg-default` / `$bg-default` without reaching for `theme.fg` directly.
  setIfAbsent("fg-default", src.foreground)
  setIfAbsent("bg-default", src.background)

  // Backdrop — modal/dialog scrim. Composite-derived from canvas bg with a
  // 40 % toward-black push, baked solid (TUI has no alpha; web target can
  // emit the actual rgba layer separately). Distinct from `bg-surface-overlay`
  // (which is the popover/tooltip CARD bg). Per design-system.md
  // §"Backdrop derivation".
  setIfAbsent("bg-backdrop", blend(src.background, "#000000", 0.4))

  return out as unknown as InlinedTheme
}
