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

function TokenRow({ theme, token }: { theme: Theme; token: keyof Theme }) {
  const value = theme[token]
  if (typeof value !== "string") return null
  return (
    <Box gap={1}>
      <SwatchCell color={value} />
      <Text>${String(token).padEnd(14)}</Text>
      <Muted>{value}</Muted>
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
    </Box>
  )
}
