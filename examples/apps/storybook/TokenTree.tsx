/**
 * TokenTree — right pane.
 *
 * Reads a Sterling Theme (nested roles + flat keys + derivationTrace) and
 * renders a collapsible tree of role groups. Each leaf is a TokenChip showing
 * the nested path, hex swatch, and hex value.
 *
 * Opening a token (Enter) surfaces the derivation rule in the DerivationPanel
 * slot underneath the tree.
 */

import React, { useMemo } from "react"
import { Box, Text, Muted, Divider, Small } from "silvery"
import type { Theme as SterlingTheme } from "@silvery/design"
import { TokenChip } from "./shared/TokenChip.tsx"

/** A flat list of tokens in display order. Drives keyboard navigation. */
export interface FlatTokenEntry {
  /** Nested path (e.g. "accent.hover.bg" or "surface.raised"). */
  path: string
  /** Hex value. */
  hex: string
  /** Group header this token belongs to — used for rendering dividers. */
  group: string
  /** Display label for this token row — usually the leaf segment. */
  label: string
}

/** Flatten a Sterling Theme into display-ordered leaves for the tree. */
export function flattenTokens(theme: SterlingTheme): FlatTokenEntry[] {
  const out: FlatTokenEntry[] = []

  // Interactive / status roles. `accent` is link-like — state variants carry
  // both fg + bg. Status roles (info/success/warning/error) are surface-only
  // at state — hover/active expose `bg` but not `fg` (post prune; see
  // commit bfc017a5 — fg.hover for status tokens had no semantic meaning
  // and produced illegible derivations at high-L seeds).
  const interactive = ["accent", "info", "success", "warning", "error"] as const
  for (const role of interactive) {
    const r = theme[role] as {
      fg: string
      bg: string
      fgOn: string
      hover: { fg?: string; bg: string }
      active: { fg?: string; bg: string }
      border?: string
    }
    out.push({ group: role, path: `${role}.fg`, hex: r.fg, label: "fg" })
    out.push({ group: role, path: `${role}.bg`, hex: r.bg, label: "bg" })
    out.push({ group: role, path: `${role}.fgOn`, hex: r.fgOn, label: "fgOn" })
    if (r.border) {
      out.push({ group: role, path: `${role}.border`, hex: r.border, label: "border" })
    }
    // Only accent emits fg.hover / fg.active after the prune.
    if (r.hover.fg) {
      out.push({ group: role, path: `${role}.hover.fg`, hex: r.hover.fg, label: "hover.fg" })
    }
    out.push({ group: role, path: `${role}.hover.bg`, hex: r.hover.bg, label: "hover.bg" })
    if (r.active.fg) {
      out.push({ group: role, path: `${role}.active.fg`, hex: r.active.fg, label: "active.fg" })
    }
    out.push({ group: role, path: `${role}.active.bg`, hex: r.active.bg, label: "active.bg" })
  }

  // Muted (fg + bg only)
  out.push({ group: "muted", path: "muted.fg", hex: theme.muted.fg, label: "fg" })
  out.push({ group: "muted", path: "muted.bg", hex: theme.muted.bg, label: "bg" })

  // Surface
  out.push({
    group: "surface",
    path: "surface.default",
    hex: theme.surface.default,
    label: "default",
  })
  out.push({ group: "surface", path: "surface.subtle", hex: theme.surface.subtle, label: "subtle" })
  out.push({ group: "surface", path: "surface.raised", hex: theme.surface.raised, label: "raised" })
  out.push({
    group: "surface",
    path: "surface.overlay",
    hex: theme.surface.overlay,
    label: "overlay",
  })
  out.push({ group: "surface", path: "surface.hover", hex: theme.surface.hover, label: "hover" })

  // Border
  out.push({ group: "border", path: "border.default", hex: theme.border.default, label: "default" })
  out.push({ group: "border", path: "border.focus", hex: theme.border.focus, label: "focus" })
  out.push({ group: "border", path: "border.muted", hex: theme.border.muted, label: "muted" })

  // Cursor
  out.push({ group: "cursor", path: "cursor.fg", hex: theme.cursor.fg, label: "fg" })
  out.push({ group: "cursor", path: "cursor.bg", hex: theme.cursor.bg, label: "bg" })

  return out
}

export interface TokenTreeProps {
  theme: SterlingTheme
  /** Currently cursor-highlighted token index (in flat list). */
  cursorIndex: number
  /** Currently opened token (for derivation panel). null if none. */
  openedPath: string | null
  focused: boolean
  /** Called with the total flat-length so the parent can clamp navigation. */
  onFlatLengthChange?: (n: number) => void
}

export function TokenTree({
  theme,
  cursorIndex,
  openedPath,
  focused,
}: TokenTreeProps): React.ReactElement {
  const tokens = useMemo(() => flattenTokens(theme), [theme])

  // Group tokens for render. Keep insertion order stable.
  const groups = useMemo(() => {
    const g = new Map<string, FlatTokenEntry[]>()
    for (const t of tokens) {
      if (!g.has(t.group)) g.set(t.group, [])
      g.get(t.group)!.push(t)
    }
    return g
  }, [tokens])

  return (
    <Box
      flexDirection="column"
      width={32}
      borderStyle="single"
      borderColor={focused ? "$fg-accent" : "$border-default"}
      overflow="scroll"
      overflowIndicator
    >
      <Box paddingX={1} gap={1}>
        <Text bold color="$fg-accent">
          TOKENS
        </Text>
        <Muted>{tokens.length}</Muted>
      </Box>
      <Divider />
      <Box flexDirection="column" paddingX={1}>
        {Array.from(groups.entries()).map(([groupName, list]) => (
          <Box key={groupName} flexDirection="column" gap={0}>
            <Box>
              <Text bold color="$fg-info">
                ▼ {groupName}
              </Text>
            </Box>
            {list.map((t) => {
              const globalIdx = tokens.indexOf(t)
              return (
                <TokenChip
                  key={t.path}
                  path={t.path}
                  label={t.label}
                  hex={t.hex}
                  selected={focused && globalIdx === cursorIndex}
                  opened={openedPath === t.path}
                />
              )
            })}
            <Small>
              <Muted> </Muted>
            </Small>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
