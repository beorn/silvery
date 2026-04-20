/**
 * ContrastAudit — WCAG contrast audit pane.
 *
 * Feature 2/5 of the full storybook. Replaces the middle pane when toggled
 * via `c` from the bottom bar. Shows for the active scheme:
 *
 *   • Every role pair that matters (`fg`/`bg`, `fgOn`/`bg`, `border.focus`/`bg`,
 *     `muted.fg`/`surface.default`, `fg`/`surface.subtle`, etc.)
 *   • For each pair: contrast ratio + AA / AAA pass/fail
 *   • Which tokens were auto-lifted by Sterling's guardrails (from
 *     derivationTrace step.liftedFrom) — pre-lift vs post-lift ratios
 *   • A summary footer — "N/M pass AA · K auto-lifted"
 *
 * The pane itself is rendered in bold colors from the theme — so at a glance
 * users can scan a light scheme where lifts actually happen (catppuccin-latte,
 * gruvbox-light) versus a dark scheme where the base derivation already passes.
 */

import React, { useMemo } from "react"
import { Box, Text, Muted, Divider, Strong, Small } from "silvery"
import type { SterlingTheme } from "@silvery/theme"
import { checkContrast } from "@silvery/color"

interface PairSpec {
  readonly label: string
  readonly fgPath: string
  readonly bgPath: string
  readonly fg: string
  readonly bg: string
}

/**
 * Build the list of role pairs to audit. Covers the core text/surface
 * combinations plus on-fill pairs for each status role.
 */
function buildPairs(theme: SterlingTheme): PairSpec[] {
  const pairs: PairSpec[] = []

  // Base text on surfaces — the canvas contrast.
  pairs.push({
    label: "fg on surface",
    fgPath: "muted.fg",
    bgPath: "surface.default",
    fg: theme.muted.fg,
    bg: theme.surface.default,
  })
  pairs.push({
    label: "accent on surface",
    fgPath: "accent.fg",
    bgPath: "surface.default",
    fg: theme.accent.fg,
    bg: theme.surface.default,
  })
  pairs.push({
    label: "border.focus on surface",
    fgPath: "border.focus",
    bgPath: "surface.default",
    fg: theme.border.focus,
    bg: theme.surface.default,
  })

  // On-fill pairs — `fgOn` was specifically picked for contrast against bg.
  const filled = ["accent", "info", "success", "warning", "error"] as const
  for (const role of filled) {
    const r = theme[role] as { bg: string; fgOn: string; fg: string }
    pairs.push({
      label: `fgOn/${role}`,
      fgPath: `${role}.fgOn`,
      bgPath: `${role}.bg`,
      fg: r.fgOn,
      bg: r.bg,
    })
    // Text role on surface — status colors used as text callout.
    pairs.push({
      label: `${role}.fg on surface`,
      fgPath: `${role}.fg`,
      bgPath: "surface.default",
      fg: r.fg,
      bg: theme.surface.default,
    })
  }

  // Muted surface stack.
  pairs.push({
    label: "fg on subtle",
    fgPath: "muted.fg",
    bgPath: "surface.subtle",
    fg: theme.muted.fg,
    bg: theme.surface.subtle,
  })

  return pairs
}

/** Short pass/fail indicator. */
function Verdict({ aa, aaa }: { aa: boolean; aaa: boolean }): React.ReactElement {
  if (aaa) return <Text color="$success">AAA</Text>
  if (aa) return <Text color="$info">AA </Text>
  return <Text color="$error">×  </Text>
}

export interface ContrastAuditProps {
  theme: SterlingTheme
  schemeName: string
}

/**
 * Contrast audit pane. Takes the full width of the middle pane when active.
 */
export function ContrastAudit({ theme, schemeName }: ContrastAuditProps): React.ReactElement {
  const pairs = useMemo(() => buildPairs(theme), [theme])

  const rows = useMemo(() => {
    return pairs.map((p) => {
      const r = checkContrast(p.fg, p.bg)
      return { pair: p, ratio: r?.ratio ?? 0, aa: r?.aa ?? false, aaa: r?.aaa ?? false }
    })
  }, [pairs])

  const passAa = rows.filter((r) => r.aa).length
  const passAaa = rows.filter((r) => r.aaa).length

  // Auto-lifts come from derivationTrace. Only show lifted tokens where the
  // bg we'd audit against matches the role's own bg (fgOn pairs).
  const lifted = useMemo(() => {
    const trace = theme.derivationTrace ?? []
    return trace.filter((s) => s.liftedFrom)
  }, [theme])

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="$warning"
      overflow="scroll"
    >
      <Box paddingX={1} gap={1}>
        <Text bold color="$warning">
          CONTRAST AUDIT
        </Text>
        <Muted>·</Muted>
        <Muted>{schemeName}</Muted>
        <Muted>·</Muted>
        <Muted>{theme.mode}</Muted>
        <Muted>·</Muted>
        <Text color="$success">
          {passAa}/{rows.length} AA
        </Text>
        <Muted>·</Muted>
        <Text color={passAaa === rows.length ? "$success" : "$muted"}>
          {passAaa}/{rows.length} AAA
        </Text>
        {lifted.length > 0 ? (
          <>
            <Muted>·</Muted>
            <Text color="$warning">{lifted.length} auto-lifted</Text>
          </>
        ) : null}
      </Box>
      <Divider />
      <Box flexDirection="column" paddingX={1}>
        <Box gap={1}>
          <Muted>pair</Muted>
          <Box flexGrow={1} />
          <Muted>ratio</Muted>
          <Muted>  </Muted>
          <Muted>verdict</Muted>
        </Box>
        <Divider />
        {rows.map((row) => {
          const { pair: p } = row
          return (
            <Box key={`${p.fgPath}|${p.bgPath}`} gap={1}>
              <Text color={p.fg}>██</Text>
              <Text color={p.bg}>██</Text>
              <Text bold={row.aa === false} color={row.aa ? undefined : "$error"}>
                {p.label}
              </Text>
              <Box flexGrow={1} />
              <Text bold>{row.ratio.toFixed(2)}:1</Text>
              <Text>  </Text>
              <Verdict aa={row.aa} aaa={row.aaa} />
            </Box>
          )
        })}

        {lifted.length > 0 ? (
          <>
            <Box marginTop={1}>
              <Strong>Auto-lifted for WCAG AA</Strong>
            </Box>
            <Divider />
            {lifted.map((step) => (
              <Box key={step.token} flexDirection="column" gap={0}>
                <Box gap={1}>
                  <Text color="$warning">⚠</Text>
                  <Text bold>{step.token}</Text>
                </Box>
                <Box gap={1} paddingX={2}>
                  <Muted>pre</Muted>
                  <Text color={step.liftedFrom ?? "#888"}>██</Text>
                  <Text>{step.liftedFrom}</Text>
                  <Muted>→ post</Muted>
                  <Text color={step.output}>██</Text>
                  <Text bold>{step.output}</Text>
                </Box>
              </Box>
            ))}
          </>
        ) : (
          <Box marginTop={1}>
            <Small>
              <Muted>No auto-lifts required — this scheme derived with full AA compliance.</Muted>
            </Small>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          <Small>
            <Muted>
              WCAG 2.1: AA ≥ 4.5:1 for normal text · AAA ≥ 7:1. Sterling auto-lifts failing{" "}
              tokens via OKLCH L-shifts (contrast: "auto-lift"). Light schemes like{" "}
              catppuccin-latte and gruvbox-light are where lifts typically show up.
            </Muted>
          </Small>
        </Box>
      </Box>
    </Box>
  )
}
