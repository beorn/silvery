/**
 * Live Resize Demo
 *
 * THE showcase demo for inkx's unique capability: components that know their size.
 *
 * Demonstrates:
 * - useContentRect() providing real-time width/height during render
 * - Multi-column layout that reflows from 1 to 2 to 3 columns based on width
 * - Responsive breakpoints with visual feedback
 * - Content that adapts its presentation based on available space
 * - No useEffect, no layout thrashing — dimensions are synchronous
 *
 * Usage: bun run examples/live-resize/index.tsx
 *
 * Try resizing your terminal to see the layout reflow in real-time!
 *
 * Controls:
 *   Esc/q or Ctrl+C - Quit
 */

import React from "react"
import { Box, Text, useContentRect } from "../../src/index.js"
import { run, useInput, type Key } from "../../src/runtime/index.js"
import { useCallback } from "react"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Live Resize",
  description: "Responsive multi-column grid that reflows based on terminal width",
  features: ["useContentRect()", "responsive breakpoints", "Box flexDirection"],
}

// ============================================================================
// Types
// ============================================================================

interface CardData {
  title: string
  icon: string
  value: string
  detail: string
  color: string
  sparkline: string
}

// ============================================================================
// Data
// ============================================================================

const CARDS: CardData[] = [
  {
    title: "CPU Usage",
    icon: "\u{1f4bb}",
    value: "42%",
    detail: "4 cores, 2.4 GHz base",
    color: "green",
    sparkline: "\u2582\u2583\u2585\u2587\u2586\u2584\u2583\u2585\u2587\u2588\u2586\u2584\u2583\u2582\u2583\u2585",
  },
  {
    title: "Memory",
    icon: "\u{1f9e0}",
    value: "8.2 GB",
    detail: "of 16 GB (51% used)",
    color: "cyan",
    sparkline: "\u2584\u2584\u2585\u2585\u2585\u2586\u2586\u2586\u2585\u2585\u2586\u2586\u2587\u2587\u2586\u2586",
  },
  {
    title: "Disk I/O",
    icon: "\u{1f4be}",
    value: "234 MB/s",
    detail: "Read: 180 MB/s Write: 54 MB/s",
    color: "yellow",
    sparkline: "\u2581\u2582\u2583\u2587\u2588\u2587\u2584\u2582\u2581\u2582\u2585\u2587\u2586\u2583\u2582\u2581",
  },
  {
    title: "Network",
    icon: "\u{1f310}",
    value: "1.2 Gb/s",
    detail: "In: 800 Mb/s Out: 400 Mb/s",
    color: "magenta",
    sparkline: "\u2583\u2584\u2585\u2586\u2587\u2586\u2585\u2584\u2585\u2586\u2587\u2588\u2587\u2586\u2585\u2584",
  },
  {
    title: "Processes",
    icon: "\u{2699}\u{fe0f}",
    value: "247",
    detail: "12 running, 235 sleeping",
    color: "blue",
    sparkline: "\u2585\u2585\u2585\u2586\u2585\u2585\u2585\u2585\u2586\u2585\u2585\u2585\u2586\u2585\u2585\u2585",
  },
  {
    title: "Temperature",
    icon: "\u{1f321}\u{fe0f}",
    value: "62 C",
    detail: "Max: 85 C (safe range)",
    color: "red",
    sparkline: "\u2583\u2583\u2584\u2584\u2585\u2585\u2586\u2586\u2585\u2585\u2584\u2584\u2583\u2584\u2585\u2585",
  },
]

// ============================================================================
// Components
// ============================================================================

function MetricCard({ card, compact }: { card: CardData; compact: boolean }): JSX.Element {
  if (compact) {
    // Minimal: single-line card for narrow terminals
    return (
      <Box borderStyle="round" borderColor={card.color} paddingX={1} flexDirection="row" justifyContent="space-between">
        <Text bold color={card.color}>
          {card.title}
        </Text>
        <Text bold>{card.value}</Text>
      </Box>
    )
  }

  // Full card with sparkline and details
  return (
    <Box borderStyle="round" borderColor={card.color} paddingX={1} flexDirection="column" flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={card.color}>
          {card.title}
        </Text>
        <Text bold color={card.color}>
          {card.value}
        </Text>
      </Box>
      <Text color={card.color}>{card.sparkline}</Text>
      <Text dim>{card.detail}</Text>
    </Box>
  )
}

function BreakpointIndicator({ width, columns }: { width: number; columns: number }): JSX.Element {
  const breakpoints = [
    { threshold: 0, cols: 1, label: "< 60" },
    { threshold: 60, cols: 2, label: "60-99" },
    { threshold: 100, cols: 3, label: "100+" },
  ]

  return (
    <Box gap={2} paddingX={1}>
      {breakpoints.map((bp) => {
        const isActive = bp.cols === columns
        return (
          <Box key={bp.cols} gap={1}>
            <Text color={isActive ? "green" : "gray"} bold={isActive}>
              {isActive ? "\u25cf" : "\u25cb"}
            </Text>
            <Text color={isActive ? "white" : "gray"} bold={isActive}>
              {bp.cols} col{bp.cols > 1 ? "s" : " "} ({bp.label})
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

function GridLayout({
  cards,
  columns,
  compact,
}: {
  cards: CardData[]
  columns: number
  compact: boolean
}): JSX.Element {
  if (columns === 1) {
    return (
      <Box flexDirection="column" gap={compact ? 0 : 1} flexGrow={1}>
        {cards.map((card) => (
          <MetricCard key={card.title} card={card} compact={compact} />
        ))}
      </Box>
    )
  }

  // Build rows of N columns
  const rows: CardData[][] = []
  for (let i = 0; i < cards.length; i += columns) {
    rows.push(cards.slice(i, i + columns))
  }

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex} flexDirection="row" gap={1}>
          {row.map((card) => (
            <Box key={card.title} flexGrow={1} flexBasis={0}>
              <MetricCard card={card} compact={false} />
            </Box>
          ))}
          {/* Fill remaining slots for even spacing */}
          {row.length < columns &&
            Array.from({ length: columns - row.length }, (_, i) => (
              <Box key={`spacer-${i}`} flexGrow={1} flexBasis={0} />
            ))}
        </Box>
      ))}
    </Box>
  )
}

function CodeSnippet({ width }: { width: number }): JSX.Element {
  const showSnippet = width >= 60

  if (!showSnippet) {
    return (
      <Box paddingX={1}>
        <Text dim italic>
          (Widen terminal to see the code that powers this)
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="yellow">
        How it works:
      </Text>
      <Text color="gray">
        {"  "}
        <Text color="magenta">const</Text> {"{"} width {"}"} = <Text color="cyan">useContentRect</Text>()
      </Text>
      <Text color="gray">
        {"  "}
        <Text color="magenta">const</Text> columns = width {">"} 100 ? <Text color="green">3</Text> : width {">"} 60 ?{" "}
        <Text color="green">2</Text> : <Text color="green">1</Text>
      </Text>
      <Text dim italic>
        {"  "}// No useEffect, no layout thrashing. Synchronous.
      </Text>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

function LiveResize(): JSX.Element {
  const { width, height } = useContentRect()

  // Responsive breakpoints
  const columns = width >= 100 ? 3 : width >= 60 ? 2 : 1
  const compact = height < 20 || width < 40

  useInput(
    useCallback((input: string, key: Key) => {
      if (input === "q" || key.escape || (key.ctrl && input === "c")) {
        return "exit"
      }
    }, []),
  )

  return (
    <Box flexDirection="column" width="100%" height="100%" padding={1}>
      {/* Breakpoint indicator */}
      <BreakpointIndicator width={width} columns={columns} />

      {/* Main grid */}
      <Box flexGrow={1} flexDirection="column" marginTop={1}>
        <GridLayout cards={CARDS} columns={columns} compact={compact} />
      </Box>

      {/* Code snippet showing how it works */}
      {!compact && <CodeSnippet width={width} />}

      {/* Footer */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text dim>Resize your terminal to see the layout reflow</Text>
        <Text dim>
          <Text bold dim>
            Esc/q
          </Text>{" "}
          quit
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const handle = await run(
    <ExampleBanner meta={meta} controls="Resize terminal to see reflow  Esc/q quit">
      <LiveResize />
    </ExampleBanner>,
  )
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
