/**
 * Swatch panels — slot inputs and derived tokens.
 *
 * Two panels:
 *   1. Slots: 22 input ColorScheme slots (ANSI 16 + fg/bg/cursor/selection)
 *   2. Tokens: 33 derived Theme tokens, grouped (surfaces, states, standalones)
 *
 * Each row shows: swatch | label | hex value.
 */

import React from "react"
import { Box, Text, Muted, H2, H3 } from "silvery"
import type { ColorScheme, Theme } from "@silvery/theme"
import { hexToOklch } from "@silvery/color"
import { monoAttrsFor } from "@silvery/ansi"
import type { MonoAttr } from "@silvery/ansi"
import { quantize256, quantizeAnsi16Hex } from "./tier"

function SwatchCell({ color }: { color: string }) {
  return <Text color={color}>{"██"}</Text>
}

/** Format OKLCH as a compact readable string: L65 C0.17 H25 */
function formatOklch(hex: string): string {
  const ok = hexToOklch(hex)
  if (!ok) return ""
  const L = Math.round(ok.L * 100)
  const C = ok.C.toFixed(2)
  const H = Math.round(ok.H)
  return `L${L} C${C} H${H}`
}

function SwatchRow({ color, label, hex }: { color: string; label: string; hex: string }) {
  const oklch = formatOklch(hex)
  return (
    <Box gap={1}>
      <SwatchCell color={color} />
      <Text>{label.padEnd(16)}</Text>
      <Text>{hex}</Text>
      {oklch ? <Muted>· {oklch}</Muted> : null}
    </Box>
  )
}

// -----------------------------------------------------------------------------
// Slot groups — 22 ColorScheme fields (the "input" slots)
// -----------------------------------------------------------------------------

const ANSI_NORMAL: (keyof ColorScheme)[] = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
]
const ANSI_BRIGHT: (keyof ColorScheme)[] = [
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
]
const SURFACE_SLOTS: (keyof ColorScheme)[] = [
  "foreground",
  "background",
  "cursorColor",
  "cursorText",
  "selectionBackground",
  "selectionForeground",
]

export function SlotSwatches({ palette }: { palette: ColorScheme }) {
  return (
    <Box flexDirection="column" gap={1}>
      <H2>ColorScheme slots (22)</H2>

      <Box flexDirection="column" paddingX={1}>
        <H3>ANSI 0–7 (normal)</H3>
        {ANSI_NORMAL.map((name) => (
          <SwatchRow
            key={name}
            color={palette[name] as string}
            label={name}
            hex={palette[name] as string}
          />
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <H3>ANSI 8–15 (bright)</H3>
        {ANSI_BRIGHT.map((name) => (
          <SwatchRow
            key={name}
            color={palette[name] as string}
            label={name}
            hex={palette[name] as string}
          />
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <H3>Surface + cursor + selection</H3>
        {SURFACE_SLOTS.map((name) => (
          <SwatchRow
            key={name}
            color={palette[name] as string}
            label={name}
            hex={palette[name] as string}
          />
        ))}
      </Box>
    </Box>
  )
}

// -----------------------------------------------------------------------------
// Token groups — 33 Theme semantic tokens
// -----------------------------------------------------------------------------

const SURFACE_TOKENS: (keyof Theme)[] = [
  "bg",
  "fg",
  "muted",
  "mutedbg",
  "surface",
  "surfacebg",
  "popover",
  "popoverbg",
  "inverse",
  "inversebg",
  "cursor",
  "cursorbg",
  "selection",
  "selectionbg",
]

const STATE_TOKENS: (keyof Theme)[] = [
  "primary",
  "primaryfg",
  "secondary",
  "secondaryfg",
  "accent",
  "accentfg",
  "error",
  "errorfg",
  "warning",
  "warningfg",
  "success",
  "successfg",
  "info",
  "infofg",
]

const STANDALONE_TOKENS: (keyof Theme)[] = [
  "border",
  "inputborder",
  "focusborder",
  "link",
  "disabledfg",
]

/**
 * Paired tokens — rendered as a background-colored chip with its paired
 * foreground text on top. Shows the pair IN USE so you can eyeball contrast.
 *
 * Convention: first element is the BG token; second is the FG token used
 * on that bg. Matches the silvery styling guide "always pair surfaces" rule.
 */
const PAIRS: { bg: keyof Theme; fg: keyof Theme; label: string }[] = [
  { bg: "bg", fg: "fg", label: "root" },
  { bg: "mutedbg", fg: "muted", label: "muted" },
  { bg: "surfacebg", fg: "surface", label: "surface" },
  { bg: "popoverbg", fg: "popover", label: "popover" },
  { bg: "inversebg", fg: "inverse", label: "inverse" },
  { bg: "cursorbg", fg: "cursor", label: "cursor" },
  { bg: "selectionbg", fg: "selection", label: "selection" },
  { bg: "primary", fg: "primaryfg", label: "primary" },
  { bg: "secondary", fg: "secondaryfg", label: "secondary" },
  { bg: "accent", fg: "accentfg", label: "accent" },
  { bg: "error", fg: "errorfg", label: "error" },
  { bg: "warning", fg: "warningfg", label: "warning" },
  { bg: "success", fg: "successfg", label: "success" },
  { bg: "info", fg: "infofg", label: "info" },
]

function PairRow({ theme, pair }: { theme: Theme; pair: (typeof PAIRS)[number] }) {
  const bg = theme[pair.bg]
  const fg = theme[pair.fg]
  if (typeof bg !== "string" || typeof fg !== "string") return null
  return (
    <Box gap={1}>
      <Box backgroundColor={bg} paddingX={1}>
        <Text color={fg}>{pair.label.padEnd(10)}</Text>
      </Box>
      <Muted>${String(pair.bg)} / ${String(pair.fg)}</Muted>
    </Box>
  )
}

/**
 * Human-readable derivation rule for each derived Theme token — mirrors
 * deriveTruecolorTheme in @silvery/ansi/theme/derive.ts. Shown next to each
 * row so readers can see WHY a token has its value, not just what it is.
 */
const RULES: Partial<Record<keyof Theme, string>> = {
  bg: "palette.background",
  fg: "ensureContrast(palette.fg, popoverbg, AA)",
  muted: "ensureContrast(blend(fg, bg, 40%), mutedbg, AA)",
  mutedbg: "blend(bg, palette.fg, 4%)",
  surface: "= fg",
  surfacebg: "blend(bg, palette.fg, 5%)",
  popover: "= fg",
  popoverbg: "blend(bg, palette.fg, 8%)",
  inverse: "contrastFg(blend(fg, bg, 10%))",
  inversebg: "blend(fg, bg, 10%)",
  cursor: "ensureContrast(palette.cursorText, repaired-cursorbg, AA)",
  cursorbg: "repairCursorBg(palette.cursorColor, bg)",
  selection: "ensureContrast(palette.selFg, repaired-selbg, AA)",
  selectionbg: "repairSelectionBg(palette.selBg, bg)",
  primary: "ensureContrast(palette.primary ?? (dark ? yellow : blue), bg, AA)",
  primaryfg: "contrastFg(primary)",
  secondary: "ensureContrast(blend(primary, accent, 35%), bg, AA)",
  secondaryfg: "contrastFg(secondary)",
  accent: "ensureContrast(complement(primary), bg, AA)",
  accentfg: "contrastFg(accent)",
  error: "ensureContrast(palette.red, bg, AA)",
  errorfg: "contrastFg(error)",
  warning: "ensureContrast(palette.yellow, bg, AA)",
  warningfg: "contrastFg(warning)",
  success: "ensureContrast(palette.green, bg, AA)",
  successfg: "contrastFg(success)",
  info: "ensureContrast(blend(fg, accent, 50%), bg, AA)",
  infofg: "contrastFg(info)",
  border: "ensureContrast(blend(bg, palette.fg, 15%), bg, FAINT)",
  inputborder: "ensureContrast(blend(bg, palette.fg, 25%), bg, CONTROL)",
  focusborder: "= link",
  link: "ensureContrast(dark ? brightBlue : blue, bg, AA)",
  disabledfg: "ensureContrast(blend(fg, bg, 50%), bg, DIM)",
}

/** Render a token name with its mono-tier SGR attrs applied as a preview. */
function MonoPreview({ attrs }: { attrs: readonly MonoAttr[] }) {
  const hasAttrs = attrs.length > 0
  return (
    <Text
      bold={attrs.includes("bold")}
      dim={attrs.includes("dim")}
      italic={attrs.includes("italic")}
      inverse={attrs.includes("inverse")}
      underlineStyle={attrs.includes("underline") ? "single" : undefined}
      strikethrough={attrs.includes("strikethrough")}
    >
      {hasAttrs ? attrs.map((a) => a.slice(0, 1).toUpperCase()).join("") : "·"}
    </Text>
  )
}

/**
 * One row per Theme token. Shows four tier-rendered swatches side by side
 * (truecolor / 256 / ansi16 / mono) so the reader can compare a token's
 * rendering across capability tiers without switching tiers globally. The
 * derivation rule is shown in $muted at the right.
 */
function TokenRow({ theme, token }: { theme: Theme; token: keyof Theme }) {
  const value = theme[token]
  if (typeof value !== "string") return null
  const tc = value
  const c256 = quantize256(value)
  const c16 = quantizeAnsi16Hex(value)
  const monoAttrs = monoAttrsFor(theme, token)
  const rule = RULES[token] ?? ""
  return (
    <Box gap={1}>
      <SwatchCell color={tc} />
      <SwatchCell color={c256} />
      <SwatchCell color={c16} />
      <MonoPreview attrs={monoAttrs} />
      <Text>${String(token).padEnd(14)}</Text>
      {rule ? <Muted>{rule}</Muted> : null}
    </Box>
  )
}

export function TokenSwatches({ theme }: { theme: Theme }) {
  return (
    <Box flexDirection="column" gap={1}>
      <H2>Theme tokens (33)</H2>
      <Box paddingX={1}>
        <Muted>
          Each row: <Text>truecolor · 256 · ansi16 · mono</Text>{" "}
          · name · derivation rule. Mono column shows the one-letter code
          for each SGR attr (B=bold, D=dim, I=italic, U=underline, V=inverse)
          applied to the token at monochrome tier.
        </Muted>
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <H3>Surfaces + text</H3>
        {SURFACE_TOKENS.map((t) => (
          <TokenRow key={t as string} theme={theme} token={t} />
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <H3>State pairs</H3>
        {STATE_TOKENS.map((t) => (
          <TokenRow key={t as string} theme={theme} token={t} />
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <H3>Standalone</H3>
        {STANDALONE_TOKENS.map((t) => (
          <TokenRow key={t as string} theme={theme} token={t} />
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <H3>Combined pairs (bg + fg)</H3>
        {PAIRS.map((p) => (
          <PairRow key={p.label} theme={theme} pair={p} />
        ))}
      </Box>
    </Box>
  )
}
