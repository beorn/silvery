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
 * - Live content dimensions via useBoxRect()
 *
 * Run: bun examples/apps/outline.tsx
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
  Kbd,
  Muted,
  useInput,
  useApp,
  useBoxRect,
  createTerm,
  type Key,
} from "silvery"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Outline vs Border",
  description: "Side-by-side comparison showing outline (no layout impact) vs border",
  features: ["outlineStyle", "borderStyle", "useBoxRect()", "layout dimensions"],
}

// ============================================================================
// Types
// ============================================================================

type StyleVariant = "single" | "double" | "round" | "bold"

const STYLES: StyleVariant[] = ["single", "double", "round", "bold"]

// ============================================================================
// Components
// ============================================================================

function ContentWithSize({ label }: { label: string }) {
  const { width, height } = useBoxRect()

  return (
    <Box flexDirection="column">
      <Text bold>{label}</Text>
      <Text>
        Content area:{" "}
        <Text color="$success" bold>
          {width}
        </Text>
        x
        <Text color="$success" bold>
          {height}
        </Text>
      </Text>
      <Text dim>The quick brown fox</Text>
      <Text dim>jumps over the lazy</Text>
      <Text dim>dog on a sunny day.</Text>
    </Box>
  )
}

function BorderPanel({ style, highlight }: { style: StyleVariant; highlight: boolean }) {
  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Text bold color={highlight ? "$primary" : undefined}>
        borderStyle="{style}"
      </Text>
      <Box
        borderStyle={style}
        borderColor={highlight ? "$primary" : "$border"}
        width={30}
        height={9}
      >
        <ContentWithSize label="Border Box" />
      </Box>
      <Muted>Border adds to layout.</Muted>
      <Muted>Content is pushed inward.</Muted>
    </Box>
  )
}

function OutlinePanel({ style, highlight }: { style: StyleVariant; highlight: boolean }) {
  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Text bold color={highlight ? "$warning" : undefined}>
        outlineStyle="{style}"
      </Text>
      <Box
        outlineStyle={style}
        outlineColor={highlight ? "$warning" : "$border"}
        width={30}
        height={9}
      >
        <ContentWithSize label="Outline Box" />
      </Box>
      <Muted>Outline overlaps content.</Muted>
      <Muted>No layout impact at all.</Muted>
    </Box>
  )
}

export function OutlineDemo() {
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
          <Text key={s} color={i === styleIndex ? "$primary" : "$muted"} bold={i === styleIndex}>
            {i === styleIndex ? `[${s}]` : s}
          </Text>
        ))}
      </Box>

      <Box flexDirection="row" gap={2}>
        <BorderPanel style={currentStyle} highlight={focusedSide === "border"} />
        <OutlinePanel style={currentStyle} highlight={focusedSide === "outline"} />
      </Box>

      <Muted>
        {" "}
        <Kbd>Tab</Kbd> toggle focus <Kbd>h/l</Kbd> change style <Kbd>Esc/q</Kbd> quit
      </Muted>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="Tab toggle  h/l style  Esc/q quit">
      <OutlineDemo />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}
