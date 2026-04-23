/**
 * DerivationPanel — inline panel surfaced below the TokenTree when a token
 * is opened (Enter).
 *
 * Shows:
 *   • Nested path + flat key + hex swatch
 *   • Rule from theme.derivationTrace (Sterling attaches it when derived
 *     with `{ trace: true }`)
 *   • OKLCH (L, C, H) triplet for the output hex
 *   • For each input: its OKLCH triplet + the delta (ΔL / ΔC / ΔH)
 *     from input → output — makes the OKLCH math visible, not guessed at
 *   • If the token was auto-lifted for WCAG AA, the pre-lift value, the
 *     post-lift value, and the contrast-ratio delta against the pairing bg
 *   • At non-truecolor tiers, the quantized hex (what a terminal would
 *     actually emit)
 *
 * Full (feature 1 of 5) — scope extension of the MVP. The MVP showed rule
 * + inputs; the visualizer adds perceptual-space values so users can see
 * why "+0.04L on accent.bg" produces the hover color it does.
 */

import React, { useMemo } from "react"
import { Box, Text, Muted, Divider, Strong, Small } from "silvery"
import type { SterlingTheme, SterlingDerivationStep } from "@silvery/theme"
import { quantizeHex, type ColorLevel } from "@silvery/ansi"
import { hexToOklch, checkContrast, type OKLCH } from "@silvery/color"

/** Convert a nested path like "accent.hover.bg" → flat "bg-accent-hover". */
export function nestedToFlat(path: string): string {
  const parts = path.split(".")
  if (parts.length === 2) {
    const [role, kind] = parts
    if (kind === "fgOn") return `fg-on-${role}`
    if (role === "surface") return `bg-surface-${kind}`
    if (role === "border") return `border-${kind}`
    if (role === "cursor") return `${kind}-cursor`
    if (role === "muted") return `${kind}-muted`
    if (kind === "border") return `border-${role}`
    return `${kind}-${role}`
  }
  if (parts.length === 3) {
    const [role, state, kind] = parts
    return `${kind}-${role}-${state}`
  }
  return path
}

/** Format OKLCH as a compact triplet — e.g. "L 0.78 · C 0.09 · H 220°". */
function fmtOklch(o: OKLCH | null): string {
  if (!o) return "(n/a)"
  return `L ${o.L.toFixed(2)} · C ${o.C.toFixed(2)} · H ${Math.round(o.H)}°`
}

/** Signed number for a delta, e.g. 0.04 → "+0.04". */
function signed(n: number, digits = 2): string {
  const s = n.toFixed(digits)
  return n >= 0 ? `+${s}` : s
}

/** Shortest-arc hue delta in degrees. */
function hueDelta(a: number, b: number): number {
  const d = ((b - a + 540) % 360) - 180
  return d
}

/**
 * Guess a reasonable "pairing background" for the token, used for the
 * contrast delta display when a token was auto-lifted. For an `fg-on-*`
 * token pair with the matching `bg-*`; otherwise pair with the surface
 * default. Returns null if we can't guess — contrast info is then skipped.
 */
function pairingBgFor(theme: SterlingTheme, path: string): string | null {
  const parts = path.split(".")
  // Sterling flat paths like "fg-on-error" → pair with "bg-error"
  if (parts.length === 2 && parts[1] === "fgOn") {
    const role = parts[0] as keyof SterlingTheme
    const r = theme[role] as { bg?: string } | undefined
    return r?.bg ?? null
  }
  return theme.surface.default ?? theme["bg-surface-default"] ?? null
}

export interface DerivationPanelProps {
  theme: SterlingTheme
  openedPath: string | null
  /**
   * Active preview tier. When provided and != "truecolor", the panel shows
   * both the derived truecolor hex (full precision) AND the quantized hex
   * a terminal at this tier would actually emit.
   */
  tier?: ColorLevel
}

export function DerivationPanel({
  theme,
  openedPath,
  tier = "truecolor",
}: DerivationPanelProps): React.ReactElement | null {
  const step: SterlingDerivationStep | null = useMemo(() => {
    if (!openedPath) return null
    const trace = theme.derivationTrace ?? []
    return trace.find((s) => s.token === openedPath) ?? null
  }, [openedPath, theme])

  if (!openedPath) return null

  const flat = nestedToFlat(openedPath)
  const hex = step?.output ?? "(unknown)"
  const isKnown = hex !== "(unknown)"
  const quantized = isKnown && tier !== "truecolor" ? quantizeHex(hex, tier) : null

  const outOklch = isKnown ? hexToOklch(hex) : null
  const inputOklchs = useMemo(
    () => (step?.inputs ?? []).map((i) => ({ hex: i, o: hexToOklch(i) })),
    [step],
  )

  // If lifted, the pre-lift hex is step.liftedFrom; post-lift is step.output.
  // Contrast ratios against the pairing bg convey the benefit.
  const liftInfo = useMemo(() => {
    if (!step?.liftedFrom) return null
    const bg = pairingBgFor(theme, openedPath)
    if (!bg) return { pre: step.liftedFrom, post: step.output, bg: null, preR: null, postR: null }
    const preR = checkContrast(step.liftedFrom, bg)
    const postR = checkContrast(step.output, bg)
    return { pre: step.liftedFrom, post: step.output, bg, preR, postR }
  }, [step, theme, openedPath])

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="$fg-accent"
      paddingX={1}
      marginTop={0}
    >
      <Box gap={1}>
        <Text color="$fg-accent" bold>
          ▼
        </Text>
        <Strong>Derivation</Strong>
      </Box>
      <Divider />
      <Box flexDirection="column" gap={0}>
        <Box gap={1}>
          <Muted>nested</Muted>
          <Text bold>{openedPath}</Text>
        </Box>
        <Box gap={1}>
          <Muted>flat</Muted>
          <Text>${flat}</Text>
        </Box>
        <Box gap={1}>
          <Muted>hex</Muted>
          <Text color={hex}>██</Text>
          <Text bold>{hex}</Text>
        </Box>
        {outOklch ? (
          <Box gap={1}>
            <Muted>oklch</Muted>
            <Text>{fmtOklch(outOklch)}</Text>
          </Box>
        ) : null}
        {quantized ? (
          <Box gap={1}>
            <Muted>@{tier}</Muted>
            <Text color={quantized}>██</Text>
            <Text bold color="$fg-warning">
              {quantized}
            </Text>
          </Box>
        ) : null}
        {step ? (
          <>
            <Box gap={1}>
              <Muted>rule</Muted>
              <Text color="$fg-info">{step.rule}</Text>
            </Box>
            {step.inputs.length > 0 ? (
              <Box flexDirection="column" gap={0}>
                <Muted>inputs → output (OKLCH delta)</Muted>
                {inputOklchs.map(({ hex: inp, o: inO }, i) => (
                  <Box key={i} gap={1}>
                    <Text color={inp}>██</Text>
                    <Muted>{inp}</Muted>
                    <Text color="$fg-muted">{fmtOklch(inO)}</Text>
                    {inO && outOklch ? (
                      <Text color="$fg-accent">
                        {"Δ "}
                        {signed(outOklch.L - inO.L)}L {signed(outOklch.C - inO.C)}C{" "}
                        {signed(hueDelta(inO.H, outOklch.H), 0)}°H
                      </Text>
                    ) : null}
                  </Box>
                ))}
              </Box>
            ) : null}
            {liftInfo ? (
              <Box flexDirection="column" gap={0}>
                <Muted>auto-lifted for WCAG AA</Muted>
                <Box gap={1}>
                  <Text color={liftInfo.pre}>██</Text>
                  <Muted>pre</Muted>
                  <Text>{liftInfo.pre}</Text>
                  {liftInfo.preR ? (
                    <Text color="$fg-error">{liftInfo.preR.ratio.toFixed(2)}:1</Text>
                  ) : null}
                </Box>
                <Box gap={1}>
                  <Text color={liftInfo.post}>██</Text>
                  <Muted>post</Muted>
                  <Text bold>{liftInfo.post}</Text>
                  {liftInfo.postR ? (
                    <Text color="$fg-success">{liftInfo.postR.ratio.toFixed(2)}:1</Text>
                  ) : null}
                </Box>
                {liftInfo.preR && liftInfo.postR ? (
                  <Small>
                    <Muted>
                      Δ contrast {signed(liftInfo.postR.ratio - liftInfo.preR.ratio, 2)} against{" "}
                      {liftInfo.bg}
                    </Muted>
                  </Small>
                ) : null}
              </Box>
            ) : null}
            {step.pinned ? (
              <Small>
                <Muted>pinned by scheme author</Muted>
              </Small>
            ) : null}
          </>
        ) : (
          <Small>
            <Muted>(no derivation trace — enable via {"{ trace: true }"})</Muted>
          </Small>
        )}
      </Box>
    </Box>
  )
}
