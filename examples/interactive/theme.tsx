/**
 * Theme Explorer Example
 *
 * Browse all built-in palettes with live color preview.
 * Left panel: scrollable list with mini color swatches.
 * Right panel: live preview wrapped in ThemeProvider showing
 * semantic tokens, ANSI 16-color table, surfaces, sample UI, and typography.
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
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
  ProgressBar,
  Badge,
  Divider,
  ThemeProvider,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "../../src/index.js"
import { builtinPalettes, deriveTheme, type ColorPalette } from "@silvery/theme"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Theme Explorer",
  description: "Browse built-in palettes with live color preview",
  demo: true,
  features: ["ThemeProvider", "builtinThemes", "semantic tokens", "ANSI colors"],
}

// ============================================================================
// Data
// ============================================================================

const paletteEntries = Object.entries(builtinPalettes).map(([name, palette]) => ({
  name,
  palette,
  theme: deriveTheme(palette),
}))

// ============================================================================
// Components
// ============================================================================

/** Small color swatch: 2 colored block chars */
function Swatch({ color }: { color: string }): JSX.Element {
  return <Text color={color}>{"██"}</Text>
}

/** Mini swatch: 4 colored blocks showing palette character */
function MiniSwatch({ palette }: { palette: ColorPalette }): JSX.Element {
  return (
    <Text>
      <Text color={palette.red}>{"█"}</Text>
      <Text color={palette.green}>{"█"}</Text>
      <Text color={palette.blue}>{"█"}</Text>
      <Text color={palette.yellow}>{"█"}</Text>
    </Text>
  )
}

/** Left panel: theme list with color swatches */
function ThemeList({ selectedIndex }: { selectedIndex: number }): JSX.Element {
  return (
    <Box flexDirection="column" width={30} borderStyle="single" overflow="scroll" scrollTo={selectedIndex}>
      <Box paddingX={1}>
        <Text bold color="$primary">
          Palettes
        </Text>
        <Muted> ({paletteEntries.length})</Muted>
      </Box>
      <Divider />
      <Box flexDirection="column" paddingX={1}>
        {paletteEntries.map((entry, i) => {
          const isSelected = i === selectedIndex
          const p = entry.palette
          return (
            <Box key={entry.name}>
              <Text inverse={isSelected}>
                {isSelected ? "▸" : " "} {entry.name.padEnd(20)}
              </Text>
              <Text> </Text>
              <MiniSwatch palette={p} />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

/** Semantic token showcase row */
function SemanticTokens(): JSX.Element {
  const tokens: Array<{ name: string; token: string; icon: string }> = [
    { name: "primary", token: "$primary", icon: "●" },
    { name: "success", token: "$success", icon: "✓" },
    { name: "warning", token: "$warning", icon: "⚠" },
    { name: "error", token: "$error", icon: "✗" },
    { name: "info", token: "$info", icon: "ℹ" },
    { name: "accent", token: "$accent", icon: "◆" },
    { name: "muted", token: "$muted", icon: "○" },
    { name: "link", token: "$link", icon: "→" },
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
function AnsiColorTable({ palette }: { palette: ColorPalette }): JSX.Element {
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

/** Sample UI elements using theme tokens */
function SampleUI(): JSX.Element {
  return (
    <Box flexDirection="column">
      <H2>Sample UI</H2>
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box borderStyle="round" paddingX={1} flexDirection="column">
          <Text bold color="$primary">
            Dialog Title
          </Text>
          <Text>This is body text using default colors.</Text>
          <Box gap={2}>
            <Badge variant="success">Passed</Badge>
            <Badge variant="error">Failed</Badge>
            <Badge variant="warning">Pending</Badge>
          </Box>
        </Box>
        <Box gap={1}>
          <Muted>Progress:</Muted>
          <Box width={20}>
            <ProgressBar value={0.65} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

/** Typography samples */
function TypographySamples(): JSX.Element {
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
        <Code>inline code</Code>
      </Box>
    </Box>
  )
}

/** Surface pairs showcase */
function SurfacePairs(): JSX.Element {
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
      </Box>
    </Box>
  )
}

/** Right panel: live preview wrapped in selected ThemeProvider */
function ThemePreview({ entry }: { entry: (typeof paletteEntries)[number] }): JSX.Element {
  return (
    <ThemeProvider theme={entry.theme}>
      <Box flexDirection="column" flexGrow={1} borderStyle="single" overflow="scroll" backgroundColor="$bg">
        <Box paddingX={1} gap={1}>
          <H1>{entry.name}</H1>
          <Muted>{entry.palette.dark === false ? "(light)" : "(dark)"}</Muted>
        </Box>
        <Divider />
        <Box flexDirection="column" gap={1}>
          <SemanticTokens />
          <AnsiColorTable palette={entry.palette} />
          <SurfacePairs />
          <SampleUI />
          <TypographySamples />
        </Box>
      </Box>
    </ThemeProvider>
  )
}

function HelpBar(): JSX.Element {
  return (
    <Muted>
      {" "}
      <Kbd>j/k</Kbd> navigate <Kbd>Esc/q</Kbd> quit
    </Muted>
  )
}

export function ThemeExplorer(): JSX.Element {
  const { exit } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(i + 1, paletteEntries.length - 1))
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(i - 1, 0))
    }
  })

  const entry = paletteEntries[selectedIndex]!

  return (
    <Box flexDirection="column" height="100%" padding={1}>
      <Box flexGrow={1} flexDirection="row" gap={1} overflow="hidden">
        <ThemeList selectedIndex={selectedIndex} />
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
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="j/k navigate  Esc/q quit">
      <ThemeExplorer />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
