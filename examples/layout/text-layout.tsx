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
import { Box, Text, H2, Muted, Small, Kbd, Divider } from "silvery"
import { run, useInput, type Key } from "silvery/runtime"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "text layout",
  description: "Snug-content bubbles + even wrapping — inspired by chenglou/pretext",
  demo: true,
  features: ['width="snug-content"', 'wrap="even"', "chat bubbles", "paragraph layout"],
}

// ============================================================================
// Sample Data
// ============================================================================

// Chat messages chosen so snug-content binary search shrinks the box
// visibly below fit-content's widest wrapped line. Verified at maxWidth 48:
// each message produces a tighter snug-content box than fit-content. See
// tests/features/pretext-layout.test.tsx for the ground-truth measurements.
const CHAT_MESSAGES = [
  { sender: "Alice", text: "A brief note about our typography work" },
  { sender: "Bob", text: "OK so in chat bubbles it means no more ugly dead space on the right" },
  {
    sender: "Alice",
    text: "The algorithms balance lines using minimum raggedness which is literally Knuth Plass from TeX",
  },
  {
    sender: "Bob",
    text: "Terminal typography matters more than you think — especially when reading a long message like this one",
  },
  {
    sender: "Alice",
    text: "You can read about it in Breaking Paragraphs into Lines — a classic paper from 1981 by Knuth and Plass",
  },
]

// Paragraph chosen so Knuth-Plass produces visibly different break positions
// than greedy at width 46. Verified: lines 2, 3, 4 all differ. Optimal widths
// [39, 42, 43, 45, 15] are more balanced than greedy's [39, 45, 45, 40, 15].
const PARAGRAPH =
  "Breaking paragraphs into lines is not a trivial problem. " +
  "Knuth and Plass solved it in 1981 with a dynamic programming approach " +
  "that minimizes squared slack across all lines simultaneously."

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
      <Box width={width} borderStyle="round" borderColor="$border" paddingX={1} maxWidth={48}>
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
  border,
}: {
  label: string
  sublabel: string
  width: "fit-content" | "snug-content"
  wrap?: "wrap" | "even"
  border?: boolean
}) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      borderStyle={border ? "single" : undefined}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor="$border"
      paddingLeft={border ? 1 : 0}
    >
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
  border,
}: {
  label: string
  sublabel: string
  wrap: "wrap" | "even"
  border?: boolean
}) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      borderStyle={border ? "single" : undefined}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor="$border"
      paddingLeft={border ? 1 : 0}
    >
      <Text bold color="$accent">
        {label}
      </Text>
      <Muted>{sublabel}</Muted>
      <Text> </Text>
      <Box
        width="fit-content"
        maxWidth={54}
        borderStyle="single"
        borderColor="$border"
        paddingX={1}
      >
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
      <Muted>{"  "}fit-content sizes to the widest wrapped line (dead space on short lines).</Muted>
      <Muted>
        {"  "}snug-content binary-searches for the tightest width with the same line count.
      </Muted>
      <Text> </Text>
      <Box flexDirection="row" gap={1} paddingX={1}>
        <BubbleColumn
          label='width="fit-content" + wrap="wrap"'
          sublabel="CSS default — dead space"
          width="fit-content"
          wrap="wrap"
        />
        <BubbleColumn
          label='width="snug-content" + wrap="even"'
          sublabel="Pretext shrinkwrap — tight"
          width="snug-content"
          wrap="even"
          border
        />
      </Box>
    </Box>
  )
}

function Demo2EvenWrap() {
  return (
    <Box flexDirection="column">
      <H2>Paragraph Layout: greedy vs even wrapping</H2>
      <Muted>{"  "}Greedy fills each line left-to-right, leaving a ragged right edge.</Muted>
      <Muted>{"  "}Even uses minimum-raggedness DP to distribute words across all lines.</Muted>
      <Text> </Text>
      <Box flexDirection="row" gap={1} paddingX={1}>
        <ParagraphComparison
          label='wrap="wrap"'
          sublabel="Greedy — ragged right edge"
          wrap="wrap"
        />
        <ParagraphComparison
          label='wrap="even"'
          sublabel="Min-raggedness — balanced lines"
          wrap="even"
          border
        />
      </Box>
    </Box>
  )
}

function Demo3Combined() {
  return (
    <Box flexDirection="column">
      <H2>Combined: snug-content + even wrapping</H2>
      <Muted>{"  "}The tightest, most beautiful text layout — both features together.</Muted>
      <Text> </Text>
      <Box flexDirection="row" gap={1} paddingX={1}>
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
                Terminal typography matters more than you think — especially when reading a long
                message like this one.
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
                The algorithms balance lines using minimum raggedness which is literally Knuth Plass
                from TeX.
              </Text>
            </Box>
          </Box>
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          flexBasis={0}
          borderStyle="single"
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderColor="$border"
          paddingLeft={1}
        >
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
                Terminal typography matters more than you think — especially when reading a long
                message like this one.
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
                The algorithms balance lines using minimum raggedness which is literally Knuth Plass
                from TeX.
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
    useCallback((input: string, key: Key) => {
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
    }, []),
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

export async function main() {
  const handle = await run(
    <ExampleBanner meta={meta} controls="j/k switch demo  1-3 jump  Esc/q quit">
      <PretextDemo />
    </ExampleBanner>,
  )
  await handle.waitUntilExit()
}
