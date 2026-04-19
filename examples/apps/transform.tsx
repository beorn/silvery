/**
 * Transform Component Demo
 *
 * Shows the Transform component for text post-processing. Each transform
 * applies a string transformation to every line of rendered text output.
 *
 * Features:
 * - Multiple transforms: uppercase, leetspeak, reverse, ROT13, etc.
 * - Cycle through transforms with j/k
 * - Shows original and transformed text side by side
 * - Uses Transform from silvery components
 *
 * Run: bun examples/apps/transform.tsx
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
  H1,
  Small,
  Kbd,
  Muted,
  Transform,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "silvery"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Transform",
  description: "Text post-processing with the Transform component",
  features: ["Transform", "transform function", "side-by-side comparison"],
}

// ============================================================================
// Transforms
// ============================================================================

const leetMap: Record<string, string> = {
  a: "4",
  e: "3",
  i: "1",
  o: "0",
  s: "5",
  t: "7",
  A: "4",
  E: "3",
  I: "1",
  O: "0",
  S: "5",
  T: "7",
}

const rot13Char = (c: string): string => {
  const code = c.charCodeAt(0)
  if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + 13) % 26) + 65)
  if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + 13) % 26) + 97)
  return c
}

interface TransformDef {
  name: string
  description: string
  fn: (line: string) => string
}

const transforms: TransformDef[] = [
  {
    name: "Uppercase",
    description: "Convert all characters to upper case",
    fn: (s: string) => s.toUpperCase(),
  },
  {
    name: "Lowercase",
    description: "Convert all characters to lower case",
    fn: (s: string) => s.toLowerCase(),
  },
  {
    name: "Leetspeak",
    description: "Replace letters with numbers (a=4, e=3, i=1, ...)",
    fn: (s: string) =>
      s
        .split("")
        .map((c) => leetMap[c] ?? c)
        .join(""),
  },
  {
    name: "Reverse",
    description: "Reverse each line of text",
    fn: (s: string) => s.split("").reverse().join(""),
  },
  {
    name: "ROT13",
    description: "Caesar cipher — shift each letter by 13 positions",
    fn: (s: string) => s.split("").map(rot13Char).join(""),
  },
  {
    name: "Alternating Case",
    description: "Alternate between upper and lower case characters",
    fn: (s: string) =>
      s
        .split("")
        .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
        .join(""),
  },
  {
    name: "Spaces to Dots",
    description: "Replace spaces with middle dots for visibility",
    fn: (s: string) => s.replace(/ /g, "·"),
  },
]

// ============================================================================
// Sample Text
// ============================================================================

const sampleLines = [
  "The quick brown fox jumps",
  "over the lazy dog on a",
  "beautiful sunny afternoon.",
  "",
  "Pack my box with five dozen",
  "liquor jugs and enjoy them.",
]

// ============================================================================
// Components
// ============================================================================

function TransformSelector({
  current,
  transforms: items,
}: {
  current: number
  transforms: TransformDef[]
}) {
  return (
    <Box flexDirection="column" overflow="scroll" scrollTo={current} height={7}>
      {items.map((t, index) => {
        const isSelected = index === current
        return (
          <Box key={t.name} paddingX={1}>
            <Text
              color={isSelected ? "$bg" : undefined}
              backgroundColor={isSelected ? "$primary" : undefined}
              bold={isSelected}
            >
              {isSelected ? " > " : "   "}
              {t.name}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

function TextPanel({
  title,
  titleColor,
  children,
}: {
  title: string
  titleColor: string
  children: React.ReactNode
}) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="$border" paddingX={1}>
      <Box marginBottom={1}>
        <H1 color={titleColor}>{title}</H1>
      </Box>
      {children}
    </Box>
  )
}

export function TransformDemo() {
  const { exit } = useApp()
  const [currentIndex, setCurrentIndex] = useState(0)

  const current = transforms[currentIndex]!

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
      return
    }

    if (key.upArrow || input === "k") {
      setCurrentIndex((prev) => Math.max(0, prev - 1))
    }
    if (key.downArrow || input === "j") {
      setCurrentIndex((prev) => Math.min(transforms.length - 1, prev + 1))
    }
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      {/* Transform selector */}
      <Box flexDirection="column" borderStyle="round" borderColor="$primary" paddingX={1}>
        <Box marginBottom={1} gap={1}>
          <H1>Transform</H1>
          <Small>
            — {current.name}: {current.description}
          </Small>
        </Box>
        <TransformSelector current={currentIndex} transforms={transforms} />
      </Box>

      {/* Side-by-side comparison */}
      <Box flexDirection="row" gap={1}>
        <TextPanel title="Original" titleColor="$muted">
          <Box flexDirection="column">
            {sampleLines.map((line, i) => (
              <Text key={i}>{line || " "}</Text>
            ))}
          </Box>
        </TextPanel>

        <TextPanel title={`${current.name}`} titleColor="$warning">
          <Transform transform={current.fn}>
            <Text>{sampleLines.join("\n")}</Text>
          </Transform>
        </TextPanel>
      </Box>

      <Muted>
        {" "}
        <Kbd>j/k</Kbd> select transform <Kbd>Esc/q</Kbd> quit
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
    <ExampleBanner meta={meta} controls="j/k select transform  Esc/q quit">
      <TransformDemo />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}
