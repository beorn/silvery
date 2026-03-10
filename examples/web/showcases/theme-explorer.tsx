/**
 * ThemeExplorerShowcase — browse built-in color palettes
 *
 * Two-column layout of palette cards with ANSI color swatches, sample text,
 * keyboard navigation, and mouse click support.
 */

import React, { useState } from "react"
import { Box, Text, useContentRect, useInput } from "@silvery/term/xterm/index.ts"
import { builtinPalettes, type ColorPalette } from "@silvery/theme"
import { useMouseClick, KeyHints } from "./shared.js"

// --- Data ---

const PALETTE_NAMES = [
  "catppuccin-mocha",
  "catppuccin-latte",
  "nord",
  "dracula",
  "tokyo-night",
  "gruvbox-dark",
  "gruvbox-light",
  "rose-pine",
  "solarized-dark",
  "solarized-light",
  "kanagawa-wave",
  "everforest-dark",
  "one-dark",
  "monokai",
]

const ANSI_LABELS = ["red", "green", "yellow", "blue", "magenta", "cyan"] as const
const BRIGHT_LABELS = ["brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan"] as const

// --- Helpers ---

/** Simple contrast: use black text on light backgrounds, white on dark. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? "#000000" : "#ffffff"
}

// --- Components ---

function ColorSwatch({ color, label }: { color: string; label?: string }): JSX.Element {
  return (
    <Box backgroundColor={color} paddingX={1}>
      <Text color={contrastText(color)}>{label || "  "}</Text>
    </Box>
  )
}

function PaletteCard({ palette, isSelected }: { palette: ColorPalette; isSelected: boolean }): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={isSelected ? "#89b4fa" : "#444"} width={36}>
      {/* Header with palette name */}
      <Box backgroundColor={palette.background} paddingX={1}>
        <Text color={palette.foreground} bold={isSelected}>
          {isSelected ? "\u25B8 " : "  "}
          {palette.name || "unnamed"}
        </Text>
        <Text color={palette.foreground}> {palette.dark ? "dark" : "light"}</Text>
      </Box>

      {/* Normal ANSI colors row */}
      <Box flexDirection="row" backgroundColor={palette.background}>
        <Box paddingX={1}>
          <Text color={palette.foreground}> </Text>
        </Box>
        {ANSI_LABELS.map((name) => (
          <ColorSwatch key={name} color={(palette as Record<string, string>)[name]!} />
        ))}
      </Box>

      {/* Bright ANSI colors row */}
      <Box flexDirection="row" backgroundColor={palette.background}>
        <Box paddingX={1}>
          <Text color={palette.foreground}> </Text>
        </Box>
        {BRIGHT_LABELS.map((name) => (
          <ColorSwatch key={name} color={(palette as Record<string, string>)[name]!} />
        ))}
      </Box>

      {/* Sample text preview */}
      <Box backgroundColor={palette.background} paddingX={1} flexDirection="row" gap={1}>
        <Text color={palette.foreground}>text</Text>
        <Text color={palette.red}>err</Text>
        <Text color={palette.green}>ok</Text>
        <Text color={palette.yellow}>warn</Text>
        <Text color={palette.blue}>info</Text>
      </Box>
    </Box>
  )
}

// --- Main component ---

export function ThemeExplorerShowcase(): JSX.Element {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const { width, height } = useContentRect()

  useInput((_input, key) => {
    if (key.downArrow) {
      setSelectedIdx((i) => Math.min(i + 1, PALETTE_NAMES.length - 1))
    }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
  })

  useMouseClick(({ y }) => {
    // Each card is ~6 rows tall. Account for 1-row padding at top.
    const cardHeight = 6
    const idx = Math.floor((y - 1) / cardHeight)
    if (idx >= 0 && idx < PALETTE_NAMES.length) {
      setSelectedIdx(idx)
    }
  })

  // Determine layout: 2-column if wide enough, 1-column otherwise
  const twoCol = (width || 80) >= 74
  const contentHeight = (height || 24) - 3 // padding + key hints
  const cardsPerCol = Math.floor(contentHeight / 6)

  // Scroll to keep selected visible
  const totalVisible = twoCol ? cardsPerCol * 2 : cardsPerCol
  const scrollOffset = Math.max(0, selectedIdx - totalVisible + 1)
  const visiblePalettes = PALETTE_NAMES.slice(scrollOffset, scrollOffset + totalVisible)

  // Split into columns
  const col1 = twoCol ? visiblePalettes.slice(0, cardsPerCol) : visiblePalettes
  const col2 = twoCol ? visiblePalettes.slice(cardsPerCol) : []

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="#89b4fa">
          Theme Explorer
        </Text>
        <Text color="#6c7086">
          {" "}
          {"\u2014"} {PALETTE_NAMES.length} palettes from @silvery/theme
        </Text>
      </Box>

      <Box flexDirection="row" gap={1} flexGrow={1}>
        <Box flexDirection="column" gap={0}>
          {col1.map((name) => {
            const palette = builtinPalettes[name]!
            const globalIdx = PALETTE_NAMES.indexOf(name)
            return <PaletteCard key={name} palette={palette} isSelected={globalIdx === selectedIdx} />
          })}
        </Box>
        {twoCol && col2.length > 0 && (
          <Box flexDirection="column" gap={0}>
            {col2.map((name) => {
              const palette = builtinPalettes[name]!
              const globalIdx = PALETTE_NAMES.indexOf(name)
              return <PaletteCard key={name} palette={palette} isSelected={globalIdx === selectedIdx} />
            })}
          </Box>
        )}
      </Box>

      <KeyHints hints={"\u2191\u2193 browse palettes  click to select"} />
    </Box>
  )
}
