/**
 * Theme Explorer Example
 *
 * Browse all built-in palettes with live color preview.
 * First entry is always the detected terminal theme.
 * Left panel: scrollable list with mini color swatches.
 * Right panel: live preview wrapped in ThemeProvider showing
 * semantic tokens, ANSI 16-color table, surfaces, components, and typography.
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
  Link,
  Kbd,
  Muted,
  H1,
  H2,
  H3,
  Strong,
  Small,
  Lead,
  Code,
  P,
  Blockquote,
  ProgressBar,
  Spinner,
  Badge,
  Toggle,
  Divider,
  ThemeProvider,
  useInput,
  useApp,
  createTerm,
  detectTheme,
  type Key,
  type Theme,
} from "../../src/index.js"
import {
  builtinPalettes,
  deriveTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  type ColorPalette,
  type ThemeAdjustment,
} from "@silvery/theme"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Theme Explorer",
  description: "Browse built-in palettes with live color preview",
  demo: true,
  features: ["ThemeProvider", "builtinThemes", "detectTheme", "semantic tokens", "components"],
}

// ============================================================================
// Types
// ============================================================================

export interface ThemeEntry {
  name: string
  palette: ColorPalette | null // null for detected theme
  theme: Theme
  adjustments: ThemeAdjustment[]
  detected?: boolean
}

// ============================================================================
// Data (populated in main, after detection)
// ============================================================================

let allEntries: ThemeEntry[] = []

// ============================================================================
// Components
// ============================================================================

/** Small color swatch: 2 colored block chars */
function Swatch({ color }: { color: string }) {
  return <Text color={color}>{"██"}</Text>
}

/** Mini swatch: 4 colored blocks showing palette character */
function MiniSwatch({ palette }: { palette: ColorPalette }) {
  return (
    <Text>
      <Text color={palette.red}>{"█"}</Text>
      <Text color={palette.green}>{"█"}</Text>
      <Text color={palette.blue}>{"█"}</Text>
      <Text color={palette.yellow}>{"█"}</Text>
    </Text>
  )
}

/** Mini swatch from theme tokens (for detected theme without a palette) */
function ThemeMiniSwatch({ theme }: { theme: Theme }) {
  return (
    <Text>
      <Text color={theme.error}>{"█"}</Text>
      <Text color={theme.success}>{"█"}</Text>
      <Text color={theme.info}>{"█"}</Text>
      <Text color={theme.primary}>{"█"}</Text>
    </Text>
  )
}

/** Left panel: theme list with color swatches */
function ThemeList({ entries, selectedIndex }: { entries: ThemeEntry[]; selectedIndex: number }) {
  return (
    <Box flexDirection="column" width={30} borderStyle="single" overflow="scroll" scrollTo={selectedIndex}>
      <Box paddingX={1}>
        <Text bold color="$primary">
          Palettes
        </Text>
        <Muted> ({entries.length})</Muted>
      </Box>
      <Divider />
      <Box flexDirection="column" paddingX={1}>
        {entries.map((entry, i) => {
          const isSelected = i === selectedIndex
          return (
            <Box key={entry.name}>
              <Text inverse={isSelected}>
                {isSelected ? "▸" : " "} {entry.name.padEnd(18)}
              </Text>
              <Text> </Text>
              {entry.palette ? <MiniSwatch palette={entry.palette} /> : <ThemeMiniSwatch theme={entry.theme} />}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

/** Semantic token showcase row */
function SemanticTokens() {
  const tokens: Array<{ name: string; token: string; icon: string }> = [
    { name: "primary", token: "$primary", icon: "●" },
    { name: "success", token: "$success", icon: "✓" },
    { name: "warning", token: "$warning", icon: "⚠" },
    { name: "error", token: "$error", icon: "✗" },
    { name: "info", token: "$info", icon: "ℹ" },
    { name: "accent", token: "$accent", icon: "◆" },
    { name: "muted", token: "$muted", icon: "○" },
    { name: "link", token: "$link", icon: "🔗" },
  ]

  return (
    <Box flexDirection="column">
      <H2>Semantic Tokens</H2>
      <Box flexDirection="row" flexWrap="wrap" gap={1} paddingX={1}>
        {tokens.map((t) => (
          <Text key={t.name} color={t.token}>
            {t.icon} {t.name}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

/** ANSI 16-color table */
function AnsiColorTable({ palette }: { palette: ColorPalette }) {
  const normal = [
    palette.black,
    palette.red,
    palette.green,
    palette.yellow,
    palette.blue,
    palette.magenta,
    palette.cyan,
    palette.white,
  ]
  const bright = [
    palette.brightBlack,
    palette.brightRed,
    palette.brightGreen,
    palette.brightYellow,
    palette.brightBlue,
    palette.brightMagenta,
    palette.brightCyan,
    palette.brightWhite,
  ]

  return (
    <Box flexDirection="column">
      <H2>ANSI 16 Colors</H2>
      <Box paddingX={1} gap={1}>
        <Box>
          <Muted>0-7 </Muted>
          {normal.map((c, i) => (
            <Swatch key={i} color={c} />
          ))}
        </Box>
      </Box>
      <Box paddingX={1} gap={1}>
        <Box>
          <Muted>8-15 </Muted>
          {bright.map((c, i) => (
            <Swatch key={i} color={c} />
          ))}
        </Box>
      </Box>
    </Box>
  )
}

/** ANSI 16-color table from theme palette array (for detected theme) */
function ThemeAnsiColorTable({ palette }: { palette: string[] }) {
  const normal = palette.slice(0, 8)
  const bright = palette.slice(8, 16)

  return (
    <Box flexDirection="column">
      <H2>ANSI 16 Colors</H2>
      <Box paddingX={1} gap={1}>
        <Box>
          <Muted>0-7 </Muted>
          {normal.map((c, i) => (
            <Swatch key={i} color={c} />
          ))}
        </Box>
      </Box>
      <Box paddingX={1} gap={1}>
        <Box>
          <Muted>8-15 </Muted>
          {bright.map((c, i) => (
            <Swatch key={i} color={c} />
          ))}
        </Box>
      </Box>
    </Box>
  )
}

/** Component showcase — real silvery components using theme tokens */
function ComponentShowcase() {
  return (
    <Box flexDirection="column">
      <H2>Components</H2>
      <Box flexDirection="column" paddingX={1} gap={1}>
        {/* Links */}
        <Box gap={2}>
          <Link href="https://silvery.dev">silvery.dev</Link>
          <Link href="https://example.com" color="$primary">
            primary link
          </Link>
          <Link href="https://example.com" dim>
            dim link
          </Link>
        </Box>

        {/* Badges */}
        <Box gap={1} flexWrap="wrap">
          <Badge label="default" variant="default" />
          <Badge label="success" variant="success" />
          <Badge label="error" variant="error" />
          <Badge label="warning" variant="warning" />
          <Badge label="primary" variant="primary" />
        </Box>

        {/* Progress + Spinner */}
        <Box gap={2}>
          <Box gap={1}>
            <Muted>Progress:</Muted>
            <Box width={16}>
              <ProgressBar value={0.65} />
            </Box>
          </Box>
          <Box gap={1}>
            <Spinner />
            <Muted>Loading...</Muted>
          </Box>
        </Box>

        {/* Toggle */}
        <Box gap={2}>
          <Box gap={1}>
            <Toggle value={true} onChange={() => {}} label="Enabled" />
          </Box>
          <Box gap={1}>
            <Toggle value={false} onChange={() => {}} label="Disabled" />
          </Box>
        </Box>

        {/* Dialog box */}
        <Box borderStyle="round" paddingX={1} flexDirection="column">
          <Text bold color="$primary">
            Dialog Title
          </Text>
          <Text>Body text with default colors.</Text>
          <Muted>Muted secondary info</Muted>
        </Box>

        {/* Input border */}
        <Box borderStyle="single" borderColor="$inputborder" paddingX={1} width={30}>
          <Text color="$disabledfg">Search...</Text>
        </Box>

        {/* Focus border */}
        <Box borderStyle="single" borderColor="$focusborder" paddingX={1} width={30}>
          <Text>Focused input</Text>
        </Box>
      </Box>
    </Box>
  )
}

/** Typography samples */
function TypographySamples() {
  return (
    <Box flexDirection="column">
      <H2>Typography</H2>
      <Box flexDirection="column" paddingX={1}>
        <H1>Heading 1</H1>
        <H2>Heading 2</H2>
        <H3>Heading 3</H3>
        <Strong>Strong text</Strong>
        <Lead>Lead text (italic)</Lead>
        <P>Normal paragraph text</P>
        <Muted>Muted text</Muted>
        <Small>Small text</Small>
        <Box gap={1}>
          <Kbd>Kbd</Kbd>
          <Kbd>⌘K</Kbd>
          <Kbd>Enter</Kbd>
        </Box>
        <Code>inline code</Code>
        <Blockquote>Blockquote text</Blockquote>
      </Box>
    </Box>
  )
}

/** Surface pairs showcase */
function SurfacePairs() {
  return (
    <Box flexDirection="column">
      <H2>Surfaces</H2>
      <Box flexDirection="column" paddingX={1} gap={0}>
        <Box gap={1}>
          <Box backgroundColor="$surfacebg" paddingX={1}>
            <Text color="$surface">surface</Text>
          </Box>
          <Box backgroundColor="$inversebg" paddingX={1}>
            <Text color="$inverse">inverse</Text>
          </Box>
          <Box backgroundColor="$mutedbg" paddingX={1}>
            <Text>muted bg</Text>
          </Box>
        </Box>
        <Box gap={1}>
          <Box backgroundColor="$primary" paddingX={1}>
            <Text color="$primaryfg">primary</Text>
          </Box>
          <Box backgroundColor="$error" paddingX={1}>
            <Text color="$errorfg">error</Text>
          </Box>
          <Box backgroundColor="$success" paddingX={1}>
            <Text color="$successfg">success</Text>
          </Box>
        </Box>
        <Box gap={1}>
          <Box backgroundColor="$selectionbg" paddingX={1}>
            <Text color="$selection">selection</Text>
          </Box>
          <Box backgroundColor="$popoverbg" paddingX={1}>
            <Text color="$popover">popover</Text>
          </Box>
          <Box backgroundColor="$accent" paddingX={1}>
            <Text color="$accentfg">accent</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

/** Contrast adjustments made during derivation */
function AdjustmentLog({ adjustments = [] }: { adjustments?: ThemeAdjustment[] }) {
  if (adjustments.length === 0) {
    return (
      <Box flexDirection="column">
        <H2>Contrast Adjustments</H2>
        <Box paddingX={1}>
          <Text color="$success">✓ No adjustments needed — all tokens meet contrast targets</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <H2>Contrast Adjustments ({adjustments.length})</H2>
      <Box flexDirection="column" paddingX={1}>
        {adjustments.map((adj, i) => (
          <Box key={i} gap={1}>
            <Text bold>{adj.token.padEnd(12)}</Text>
            <Text color={adj.from}>{"██"}</Text>
            <Muted>→</Muted>
            <Text color={adj.to}>{"██"}</Text>
            <Muted>
              {adj.ratioBefore.toFixed(1)}→{adj.ratioAfter.toFixed(1)}:1 (target {adj.target}:1)
            </Muted>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/** Right panel: live preview wrapped in selected ThemeProvider */
function ThemePreview({ entry }: { entry: ThemeEntry }) {
  const label = entry.detected ? "(detected)" : entry.palette?.dark === false ? "(light)" : "(dark)"

  return (
    <ThemeProvider theme={entry.theme}>
      <Box theme={entry.theme} flexDirection="column" flexGrow={1} borderStyle="single" overflow="scroll">
        <Box paddingX={1} gap={1}>
          <H1>{entry.name}</H1>
          <Muted>{label}</Muted>
        </Box>
        <Divider />
        <Box flexDirection="column" gap={1}>
          <SemanticTokens />
          {entry.palette ? (
            <AnsiColorTable palette={entry.palette} />
          ) : (
            <ThemeAnsiColorTable palette={entry.theme.palette} />
          )}
          <SurfacePairs />
          <ComponentShowcase />
          <TypographySamples />
          <AdjustmentLog adjustments={entry.adjustments} />
        </Box>
      </Box>
    </ThemeProvider>
  )
}

function HelpBar() {
  return (
    <Muted>
      {" "}
      <Kbd>j/k</Kbd> navigate <Kbd>Esc/q</Kbd> quit
    </Muted>
  )
}

export function ThemeExplorer({ entries }: { entries: ThemeEntry[] }) {
  const { exit } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(i + 1, entries.length - 1))
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(i - 1, 0))
    }
  })

  const entry = entries[selectedIndex]!

  return (
    <Box flexDirection="column" height="100%" padding={1}>
      <Box flexGrow={1} flexDirection="row" gap={1} overflow="hidden">
        <ThemeList entries={entries} selectedIndex={selectedIndex} />
        <ThemePreview entry={entry} />
      </Box>
      <HelpBar />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Detect terminal theme BEFORE entering alternate screen
  const detectedTheme = await detectTheme()

  const builtinEntries: ThemeEntry[] = Object.entries(builtinPalettes).map(([name, palette]) => {
    const adjustments: ThemeAdjustment[] = []
    const theme = deriveTheme(palette, "truecolor", adjustments)
    return { name, palette, theme, adjustments }
  })

  allEntries = [
    { name: "Detected", palette: null, theme: detectedTheme, adjustments: [], detected: true },
    { name: "ANSI 16 Dark", palette: null, theme: ansi16DarkTheme, adjustments: [] },
    { name: "ANSI 16 Light", palette: null, theme: ansi16LightTheme, adjustments: [] },
    ...builtinEntries,
  ]

  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="j/k navigate  Esc/q quit">
      <ThemeExplorer entries={allEntries} />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
