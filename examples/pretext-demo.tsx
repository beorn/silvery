/**
 * Pretext Demo — snug-content bubbles + even wrapping comparison
 *
 * Interactive demo showcasing Silvery's Pretext-inspired text layout:
 * - width="snug-content" — tightest box width for same line count (shrinkwrap)
 * - wrap="even" — minimum-raggedness line breaking (Knuth-Plass)
 *
 * Inspired by https://chenglou.me/pretext/
 *
 * Usage: bun examples/pretext-demo.tsx
 *
 * Controls:
 *   j/k - Cycle demo sections
 *   Esc/q - Quit
 */

import React, { useState, useCallback } from "react"
import { Box, Text, H2, Muted, Small, Kbd, Divider } from "../src/index.js"
import { run, useInput, type Key } from "@silvery/ag-term/runtime"
import { ExampleBanner, type ExampleMeta } from "./_banner.js"

export const meta: ExampleMeta = {
  name: "Pretext Demo",
  description: "Snug-content bubbles + even wrapping — inspired by chenglou/pretext",
  demo: true,
  features: ['width="snug-content"', 'wrap="even"', "chat bubbles", "paragraph layout"],
}

// ============================================================================
// Sample Data
// ============================================================================

const CHAT_MESSAGES = [
  { sender: "Alice", text: "Hey!" },
  { sender: "Bob", text: "What are you working on?" },
  { sender: "Alice", text: "Building a terminal UI framework with beautiful text layout." },
  {
    sender: "Bob",
    text: "That sounds interesting. Does it handle word wrapping well? Most terminal apps have really ugly ragged text.",
  },
  {
    sender: "Alice",
    text: "Yes! It uses Pretext-inspired algorithms for snug bubbles and even line breaking.",
  },
]

const PARAGRAPH =
  "The quick brown fox jumps over the lazy dog. " +
  "Typography in terminal applications has always been limited by the character grid, " +
  "but modern algorithms can distribute text across lines for minimum raggedness, " +
  "producing results that rival print-quality typesetting. " +
  "Silvery brings these techniques to the terminal."

// ============================================================================
// Components
// ============================================================================

/** A single chat bubble with configurable width and wrap mode. */
function Bubble({
  sender,
  text,
  width,
  wrap,
  align,
}: {
  sender: string
  text: string
  width: "fit-content" | "snug-content"
  wrap?: "wrap" | "even"
  align?: "flex-start" | "flex-end"
}) {
  return (
    <Box flexDirection="column" alignItems={align ?? "flex-start"}>
      <Small> {sender}</Small>
      <Box
        width={width}
        borderStyle="round"
        borderColor="$border"
        paddingX={1}
        maxWidth={48}
      >
        <Text wrap={wrap ?? "wrap"}>{text}</Text>
      </Box>
    </Box>
  )
}

/** Column of chat bubbles with a label. */
function BubbleColumn({
  label,
  sublabel,
  width,
  wrap,
}: {
  label: string
  sublabel: string
  width: "fit-content" | "snug-content"
  wrap?: "wrap" | "even"
}) {
  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0}>
      <Text bold color="$accent">
        {label}
      </Text>
      <Muted>{sublabel}</Muted>
      <Text> </Text>
      <Box flexDirection="column" gap={1}>
        {CHAT_MESSAGES.map((msg, i) => (
          <Bubble
            key={i}
            sender={msg.sender}
            text={msg.text}
            width={width}
            wrap={wrap}
            align={msg.sender === "Bob" ? "flex-end" : "flex-start"}
          />
        ))}
      </Box>
    </Box>
  )
}

/** Side-by-side paragraph comparison. */
function ParagraphComparison({
  label,
  sublabel,
  wrap,
}: {
  label: string
  sublabel: string
  wrap: "wrap" | "even"
}) {
  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0}>
      <Text bold color="$accent">
        {label}
      </Text>
      <Muted>{sublabel}</Muted>
      <Text> </Text>
      <Box width={52} borderStyle="single" borderColor="$border" paddingX={1}>
        <Text wrap={wrap}>{PARAGRAPH}</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Demo Sections
// ============================================================================

function Demo1Bubbles() {
  return (
    <Box flexDirection="column">
      <H2>Chat Bubbles: fit-content vs snug-content</H2>
      <Muted>
        {"  "}fit-content sizes to the widest wrapped line (dead space on short lines).
      </Muted>
      <Muted>
        {"  "}snug-content binary-searches for the tightest width with the same line count.
      </Muted>
      <Text> </Text>
      <Box flexDirection="row" gap={3} paddingX={1}>
        <BubbleColumn
          label='width="fit-content"'
          sublabel="CSS default — dead space"
          width="fit-content"
        />
        <BubbleColumn
          label='width="snug-content"'
          sublabel="Pretext shrinkwrap — tight"
          width="snug-content"
        />
      </Box>
    </Box>
  )
}

function Demo2EvenWrap() {
  return (
    <Box flexDirection="column">
      <H2>Paragraph Layout: greedy vs even wrapping</H2>
      <Muted>
        {"  "}Greedy fills each line left-to-right, leaving a ragged right edge.
      </Muted>
      <Muted>
        {"  "}Even uses minimum-raggedness DP to distribute words across all lines.
      </Muted>
      <Text> </Text>
      <Box flexDirection="row" gap={3} paddingX={1}>
        <ParagraphComparison
          label='wrap="wrap"'
          sublabel="Greedy — ragged right edge"
          wrap="wrap"
        />
        <ParagraphComparison
          label='wrap="even"'
          sublabel="Min-raggedness — balanced lines"
          wrap="even"
        />
      </Box>
    </Box>
  )
}

function Demo3Combined() {
  return (
    <Box flexDirection="column">
      <H2>Combined: snug-content + even wrapping</H2>
      <Muted>
        {"  "}The tightest, most beautiful text layout — both features together.
      </Muted>
      <Text> </Text>
      <Box flexDirection="row" gap={3} paddingX={1}>
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <Text bold color="$accent">
            Default (fit-content + greedy)
          </Text>
          <Muted>Widest line sets width, lines fill greedily</Muted>
          <Text> </Text>
          <Box flexDirection="column" gap={1}>
            <Box
              width="fit-content"
              borderStyle="round"
              borderColor="$border"
              paddingX={1}
              maxWidth={48}
            >
              <Text wrap="wrap">
                Typography in terminal applications has always been limited by the character grid, but modern algorithms change that.
              </Text>
            </Box>
            <Box
              width="fit-content"
              borderStyle="round"
              borderColor="$border"
              paddingX={1}
              maxWidth={48}
            >
              <Text wrap="wrap">
                Silvery brings Pretext-inspired layout to the terminal with two simple props.
              </Text>
            </Box>
          </Box>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexBasis={0}>
          <Text bold color="$accent">
            Pretext (snug-content + even)
          </Text>
          <Muted>Tightest width, balanced line lengths</Muted>
          <Text> </Text>
          <Box flexDirection="column" gap={1}>
            <Box
              width="snug-content"
              borderStyle="round"
              borderColor="$primary"
              paddingX={1}
              maxWidth={48}
            >
              <Text wrap="even">
                Typography in terminal applications has always been limited by the character grid, but modern algorithms change that.
              </Text>
            </Box>
            <Box
              width="snug-content"
              borderStyle="round"
              borderColor="$primary"
              paddingX={1}
              maxWidth={48}
            >
              <Text wrap="even">
                Silvery brings Pretext-inspired layout to the terminal with two simple props.
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

const DEMOS = [Demo1Bubbles, Demo2EvenWrap, Demo3Combined]
const DEMO_LABELS = ["Chat Bubbles", "Even Wrapping", "Combined"]

function PretextDemo() {
  const [demoIndex, setDemoIndex] = useState(0)

  useInput(
    useCallback(
      (input: string, key: Key) => {
        if (input === "q" || key.escape) return "exit"
        if (input === "j" || key.downArrow || key.rightArrow) {
          setDemoIndex((i) => Math.min(i + 1, DEMOS.length - 1))
        }
        if (input === "k" || key.upArrow || key.leftArrow) {
          setDemoIndex((i) => Math.max(i - 1, 0))
        }
        if (input === "1") setDemoIndex(0)
        if (input === "2") setDemoIndex(1)
        if (input === "3") setDemoIndex(2)
      },
      [],
    ),
  )

  const Demo = DEMOS[demoIndex]!

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      {/* Tab bar */}
      <Box gap={2}>
        {DEMO_LABELS.map((label, i) => (
          <Text key={i} bold={i === demoIndex} color={i === demoIndex ? "$primary" : "$muted"}>
            {i === demoIndex ? "▸ " : "  "}
            {i + 1}. {label}
          </Text>
        ))}
      </Box>
      <Divider />
      {/* Active demo */}
      <Demo />
      {/* Footer */}
      <Box>
        <Muted>
          {"  "}
          <Kbd>j/k</Kbd> or <Kbd>1-3</Kbd> switch demo{"  "}
          <Kbd>Esc/q</Kbd> quit
        </Muted>
      </Box>
    </Box>
  )
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  const handle = await run(
    <ExampleBanner meta={meta} controls="j/k switch demo  1-3 jump  Esc/q quit">
      <PretextDemo />
    </ExampleBanner>,
  )
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
