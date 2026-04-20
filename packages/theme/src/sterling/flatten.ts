/**
 * Sterling flatten — writes flat hyphen-key projections onto the same object
 * as the nested role form. Per D4: no Proxy. Same string reference at both
 * paths. Freeze at end.
 *
 * Flattening rule (deterministic):
 *   theme.{role}.{kind}            → {kind}-{role}
 *   theme.{role}.{kind}.{state}    → {kind}-{role}-{state}
 *   theme.{role}.{state}.{kind}    → {kind}-{role}-{state}      (same)
 *   theme.{role}.fgOn              → fg-on-{role}
 *
 * Plus a few specials:
 *   theme.surface.{level}          → bg-surface-{level}
 *   theme.border.{kind}            → border-{kind}
 *   theme.cursor.{kind}            → {kind}-cursor
 *   theme.muted.{kind}             → {kind}-muted
 *   theme.accent.border            → border-accent
 */

import type { Theme, FlatToken } from "./types.ts"

/**
 * Roles that get state variants. Split by which keys vary:
 *   - `accent` is link-like: both fg AND bg vary (fg.hover / fg.active +
 *     bg.hover / bg.active).
 *   - `info | success | warning | error` are status roles: only SURFACE
 *     (bg) varies; text doesn't hover.
 */
const STATUS_ROLES = ["info", "success", "warning", "error"] as const
const STATES = ["hover", "active"] as const

/**
 * Populate flat keys onto `theme` in-place. Returns the same object, frozen.
 *
 * The input should be the nested form (Omit<Theme, keyof FlatTokens>).
 * After this runs, the object is a full Theme (FlatTokens & Roles).
 */
export function populateFlat(theme: any): Theme {
  // Accent — link-like: emit both fg and bg state variants + border
  const accent = theme.accent
  if (accent) {
    theme["fg-accent"] = accent.fg
    theme["bg-accent"] = accent.bg
    theme["fg-on-accent"] = accent.fgOn
    for (const state of STATES) {
      const s = accent[state]
      if (!s) continue
      theme[`fg-accent-${state}`] = s.fg
      theme[`bg-accent-${state}`] = s.bg
    }
    if (accent.border) theme["border-accent"] = accent.border
  }

  // Status roles — emit fg, bg, fgOn + bg.{hover,active} ONLY (no fg state)
  for (const role of STATUS_ROLES) {
    const r = theme[role]
    if (!r) continue
    theme[`fg-${role}`] = r.fg
    theme[`bg-${role}`] = r.bg
    theme[`fg-on-${role}`] = r.fgOn
    for (const state of STATES) {
      const s = r[state]
      if (!s) continue
      theme[`bg-${role}-${state}`] = s.bg
    }
  }

  // Surface
  const surf = theme.surface
  if (surf) {
    theme["bg-surface-default"] = surf.default
    theme["bg-surface-subtle"] = surf.subtle
    theme["bg-surface-raised"] = surf.raised
    theme["bg-surface-overlay"] = surf.overlay
    theme["bg-surface-hover"] = surf.hover
  }

  // Border
  const b = theme.border
  if (b) {
    theme["border-default"] = b.default
    theme["border-focus"] = b.focus
    theme["border-muted"] = b.muted
  }

  // Cursor
  const c = theme.cursor
  if (c) {
    theme["fg-cursor"] = c.fg
    theme["bg-cursor"] = c.bg
  }

  // Muted
  const m = theme.muted
  if (m) {
    theme["fg-muted"] = m.fg
    theme["bg-muted"] = m.bg
  }

  // Freeze: make immutability explicit. We also freeze the nested role
  // objects so `theme.accent.hover.bg = "..."` fails loudly.
  freezeDeep(theme)
  return theme as Theme
}

function freezeDeep(o: any): void {
  if (o === null || typeof o !== "object") return
  Object.freeze(o)
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v && typeof v === "object" && !Object.isFrozen(v)) freezeDeep(v)
  }
}

/** The complete list of FlatToken strings Sterling emits. Mirrors the type in `types.ts`. */
export const STERLING_FLAT_TOKENS: readonly FlatToken[] = [
  // Surface
  "bg-surface-default",
  "bg-surface-subtle",
  "bg-surface-raised",
  "bg-surface-overlay",
  "bg-surface-hover",
  // Border
  "border-default",
  "border-focus",
  "border-muted",
  // Cursor
  "fg-cursor",
  "bg-cursor",
  // Muted
  "fg-muted",
  "bg-muted",
  // Accent — link-like interactive text, keeps fg state variants
  "fg-accent",
  "bg-accent",
  "fg-on-accent",
  "fg-accent-hover",
  "bg-accent-hover",
  "fg-accent-active",
  "bg-accent-active",
  "border-accent",
  // Info — status role; bg state only
  "fg-info",
  "bg-info",
  "fg-on-info",
  "bg-info-hover",
  "bg-info-active",
  // Success — status role; bg state only
  "fg-success",
  "bg-success",
  "fg-on-success",
  "bg-success-hover",
  "bg-success-active",
  // Warning — status role; bg state only
  "fg-warning",
  "bg-warning",
  "fg-on-warning",
  "bg-warning-hover",
  "bg-warning-active",
  // Error — status role; bg state only
  "fg-error",
  "bg-error",
  "fg-on-error",
  "bg-error-hover",
  "bg-error-active",
]
