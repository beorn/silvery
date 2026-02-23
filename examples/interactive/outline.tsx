/**
 * Outline vs Border Comparison
 *
 * Side-by-side demonstration of outlineStyle vs borderStyle.
 * Borders push content inward (adding to layout dimensions), while
 * outlines overlap the content edge without affecting layout.
 *
 * Features:
 * - Left panel: Box with borderStyle — content area is smaller
 * - Right panel: Box with outlineStyle — content starts at edge
 * - Toggle between styles with Tab
 * - Live content dimensions via useContentRect()
 *
 * Run: bun vendor/beorn-inkx/examples/interactive/outline.tsx
 */

import React, { useState } from "react"
import { render, Box, Text, useInput, useApp, useContentRect, createTerm, type Key } from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Outline vs Border",
  description: "Side-by-side comparison showing outline (no layout impact) vs border",
  features: ["outlineStyle", "borderStyle", "useContentRect()", "layout dimensions"],
}

// ============================================================================
// Types
// ============================================================================

type StyleVariant = "single" | "double" | "round" | "bold"

const STYLES: StyleVariant[] = ["single", "double", "round", "bold"]

// ============================================================================
// Components
// ============================================================================

function ContentWithSize({ label }: { label: string }): JSX.Element {
  const { width, height } = useContentRect()

  return (
    <Box flexDirection="column">
      <Text bold>{label}</Text>
      <Text>
        Content area: <Text color="green" bold>{width}</Text>x<Text color="green" bold>{height}</Text>
      </Text>
      <Text dim>The quick brown fox</Text>
      <Text dim>jumps over the lazy</Text>
      <Text dim>dog on a sunny day.</Text>
    </Box>
  )
}

function BorderPanel({ style, highlight }: { style: StyleVariant; highlight: boolean }): JSX.Element {
  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Text bold color={highlight ? "cyan" : "white"}>
        borderStyle="{style}"
      </Text>
      <Box
        borderStyle={style}
        borderColor={highlight ? "cyan" : "gray"}
        width={30}
        height={9}
      >
        <ContentWithSize label="Border Box" />
      </Box>
      <Text dim>Border adds to layout.</Text>
      <Text dim>Content is pushed inward.</Text>
    </Box>
  )
}

function OutlinePanel({ style, highlight }: { style: StyleVariant; highlight: boolean }): JSX.Element {
  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Text bold color={highlight ? "yellow" : "white"}>
        outlineStyle="{style}"
      </Text>
      <Box
        outlineStyle={style}
        outlineColor={highlight ? "yellow" : "gray"}
        width={30}
        height={9}
      >
        <ContentWithSize label="Outline Box" />
      </Box>
      <Text dim>Outline overlaps content.</Text>
      <Text dim>No layout impact at all.</Text>
    </Box>
  )
}

export function OutlineDemo(): JSX.Element {
  const { exit } = useApp()
  const [styleIndex, setStyleIndex] = useState(0)
  const [focusedSide, setFocusedSide] = useState<"border" | "outline">("border")

  const currentStyle = STYLES[styleIndex]!

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
      return
    }

    // Toggle focus between panels
    if (key.tab || input === "\t") {
      setFocusedSide((prev) => (prev === "border" ? "outline" : "border"))
    }

    // Cycle through border/outline styles
    if (key.rightArrow || input === "l") {
      setStyleIndex((prev) => (prev + 1) % STYLES.length)
    }
    if (key.leftArrow || input === "h") {
      setStyleIndex((prev) => (prev - 1 + STYLES.length) % STYLES.length)
    }
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box gap={1}>
        <Text bold>Style:</Text>
        {STYLES.map((s, i) => (
          <Text key={s} color={i === styleIndex ? "cyan" : "gray"} bold={i === styleIndex}>
            {i === styleIndex ? `[${s}]` : s}
          </Text>
        ))}
      </Box>

      <Box flexDirection="row" gap={2}>
        <BorderPanel style={currentStyle} highlight={focusedSide === "border"} />
        <OutlinePanel style={currentStyle} highlight={focusedSide === "outline"} />
      </Box>

      <Text dim>
        {" "}
        <Text bold dim>
          Tab
        </Text>{" "}
        toggle focus{" "}
        <Text bold dim>
          h/l
        </Text>{" "}
        change style{" "}
        <Text bold dim>
          Esc/q
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="Tab toggle  h/l style  Esc/q quit">
      <OutlineDemo />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
