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

function TokenRow({ theme, token }: { theme: Theme; token: keyof Theme }) {
  const value = theme[token]
  if (typeof value !== "string") return null
  const oklch = formatOklch(value)
  return (
    <Box gap={1}>
      <SwatchCell color={value} />
      <Text>${String(token).padEnd(14)}</Text>
      <Muted>{value}</Muted>
      {oklch ? <Muted>· {oklch}</Muted> : null}
    </Box>
  )
}

export function TokenSwatches({ theme }: { theme: Theme }) {
  return (
    <Box flexDirection="column" gap={1}>
      <H2>Theme tokens (33)</H2>

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
