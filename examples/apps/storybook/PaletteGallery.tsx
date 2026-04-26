/**
 * PaletteGallery — fullscreen palette browser (mode "gallery").
 *
 * Toggled with `p` from the storybook root. Replaces the entire middle +
 * left + right tri-pane with a single-screen scrollable list of all 84
 * palettes, one row each, showing the four canvas-defining tokens:
 *
 *   • bg-surface-default — the canvas background
 *   • bg-accent          — primary fill
 *   • fg-default         — body text
 *   • border-default     — default rule line
 *
 * Useful for QA — scan all 84 schemes at a glance to spot outliers, see
 * which ones go monochrome under ANSI16 quantization, etc.
 *
 * Selecting a row from the gallery (Enter) commits that scheme as the
 * active scheme and exits gallery mode back to the tri-pane view.
 */

import React, { useMemo, useState } from "react"
import { Box, Text, Muted, Strong, Divider, Kbd, useInput, useBoxRect, type Key } from "silvery"
import { sterling, type SterlingTheme } from "@silvery/theme"
import type { ColorScheme } from "@silvery/ansi"
import { quantizeSterlingTheme } from "./shared/quantize.ts"
import type { Tier } from "./TierBar.tsx"

/** Floor below which scroll math gets weird. */
const MIN_PAGE = 8
/** Rows reserved for chrome (header + 2 dividers + column header + bottom divider + key legend). */
const CHROME_ROWS = 6

export interface PaletteGalleryProps {
  schemes: readonly string[]
  builtinPalettes: Record<string, ColorScheme>
  activeIndex: number
  tier: Tier
  onSelect: (index: number) => void
  onExit: () => void
}

interface Row {
  name: string
  scheme: ColorScheme
  theme: SterlingTheme
}

export function PaletteGallery({
  schemes,
  builtinPalettes,
  activeIndex,
  tier,
  onSelect,
  onExit,
}: PaletteGalleryProps): React.ReactElement {
  const [cursor, setCursor] = useState(activeIndex)
  const [scroll, setScroll] = useState(0)

  // Derive themes once per scheme list / tier — cheap (84 schemes × ~1 ms).
  // Quantize to the active tier so collapses are visible at a glance.
  const rows: readonly Row[] = useMemo(
    () =>
      schemes.map((name) => {
        const scheme = builtinPalettes[name]!
        const truecolor = sterling.deriveFromScheme(scheme)
        const theme = quantizeSterlingTheme(truecolor, tier)
        return { name, scheme, theme }
      }),
    [schemes, builtinPalettes, tier],
  )

  // Page size derives from the gallery's measured height minus chrome —
  // silverized (no hardcoded heights; reflows when the terminal resizes).
  const galleryRect = useBoxRect()
  const PAGE = Math.max(MIN_PAGE, (galleryRect?.height ?? MIN_PAGE + CHROME_ROWS) - CHROME_ROWS)
  const visibleStart = scroll
  const visibleEnd = Math.min(rows.length, scroll + PAGE)
  const visible = rows.slice(visibleStart, visibleEnd)

  const stepCursor = (delta: number): void => {
    const next = Math.max(0, Math.min(rows.length - 1, cursor + delta))
    setCursor(next)
    if (next < scroll) setScroll(next)
    else if (next >= scroll + PAGE) setScroll(next - PAGE + 1)
  }

  useInput((input: string, key: Key) => {
    if (input === "p" || key.escape) return onExit()
    if (input === "j" || key.downArrow) return stepCursor(1)
    if (input === "k" || key.upArrow) return stepCursor(-1)
    if (input === "J") return stepCursor(10)
    if (input === "K") return stepCursor(-10)
    if (input === "g") {
      setCursor(0)
      setScroll(0)
      return
    }
    if (input === "G") {
      const last = rows.length - 1
      setCursor(last)
      setScroll(Math.max(0, last - PAGE + 1))
      return
    }
    if (key.return) {
      onSelect(cursor)
      onExit()
      return
    }
  })

  return (
    <Box flexDirection="column" flexGrow={1} padding={0} userSelect="contain">
      <Box paddingX={1} gap={1}>
        <Text color="$fg-accent">▸ silvery</Text>
        <Strong>Palette Gallery</Strong>
        <Muted>
          — all {rows.length} schemes, current tier: {tier}
        </Muted>
      </Box>
      <Divider />
      <Box paddingX={1} gap={2} marginBottom={0}>
        <Box width={22}>
          <Muted>scheme</Muted>
        </Box>
        <Box width={10}>
          <Muted>canvas</Muted>
        </Box>
        <Box width={10}>
          <Muted>accent</Muted>
        </Box>
        <Box width={10}>
          <Muted>text</Muted>
        </Box>
        <Box width={10}>
          <Muted>border</Muted>
        </Box>
        <Muted>preview</Muted>
      </Box>
      <Divider />
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visible.map((row, i) => {
          const idx = visibleStart + i
          const isCursor = idx === cursor
          const isActive = idx === activeIndex
          return <PaletteRow key={row.name} row={row} isCursor={isCursor} isActive={isActive} />
        })}
      </Box>
      <Divider />
      <Box paddingX={1} gap={1}>
        <Muted>
          <Kbd>j/k</Kbd> move
        </Muted>
        <Muted>
          <Kbd>J/K</Kbd> ±10
        </Muted>
        <Muted>
          <Kbd>g/G</Kbd> top/bottom
        </Muted>
        <Muted>
          <Kbd>Enter</Kbd> select
        </Muted>
        <Muted>
          <Kbd>p</Kbd> / <Kbd>Esc</Kbd> back
        </Muted>
        <Muted>·</Muted>
        <Muted>
          {cursor + 1}/{rows.length}
        </Muted>
      </Box>
    </Box>
  )
}

interface PaletteRowProps {
  row: Row
  isCursor: boolean
  isActive: boolean
}

function PaletteRow({ row, isCursor, isActive }: PaletteRowProps): React.ReactElement {
  const t = row.theme
  // Direct hex access — quantized themes are plain string maps.
  const surfaceBg = (t as unknown as Record<string, string>)["bg-surface-default"]
  const accentBg = (t as unknown as Record<string, string>)["bg-accent"]
  const fgDefault = (t as unknown as Record<string, string>)["fg-default"]
  const borderDefault = (t as unknown as Record<string, string>)["border-default"]
  const fgOnAccent = (t as unknown as Record<string, string>)["fg-on-accent"]

  const cursorMark = isCursor ? "▸ " : "  "
  const activeMark = isActive ? " *" : ""
  const nameColor = isCursor ? "$fg-accent" : isActive ? "$fg-info" : undefined

  return (
    <Box paddingX={1} gap={2} backgroundColor={isCursor ? "$bg-surface-hover" : undefined}>
      <Box width={22}>
        <Text color={nameColor} bold={isCursor || isActive}>
          {cursorMark}
          {row.name}
          {activeMark}
        </Text>
      </Box>
      <Box width={10}>
        <Text color={surfaceBg}>██████</Text>
      </Box>
      <Box width={10}>
        <Text color={accentBg}>██████</Text>
      </Box>
      <Box width={10}>
        <Text color={fgDefault}>Aa Aa</Text>
      </Box>
      <Box width={10}>
        <Text color={borderDefault}>──────</Text>
      </Box>
      <Box>
        <Box backgroundColor={surfaceBg} paddingX={1}>
          <Text color={fgDefault}>The </Text>
          <Text color={accentBg} bold>
            quick
          </Text>
          <Text color={fgDefault}> brown </Text>
          <Box backgroundColor={accentBg} paddingX={1}>
            <Text color={fgOnAccent} bold>
              jumps
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
