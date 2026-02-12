/**
 * Inkx Rendering Performance Benchmarks
 *
 * Measures rendering performance with large numbers of components.
 * Tests scaling characteristics across component counts, nesting depths,
 * scroll containers, styles, and content patterns.
 *
 * Run: bun bench vendor/beorn-inkx/tests/performance.bench.tsx
 */

import React from "react"
import { bench, describe } from "vitest"
import { Box, Text } from "../src/components/index.js"
import { createRenderer } from "../src/testing/index.js"

const render = createRenderer()

const BENCH_OPTIONS = { iterations: 5, warmupIterations: 1 }

// ============================================================================
// Basic Scaling
// ============================================================================

describe("inkx render: basic scaling", () => {
  bench(
    "100 Text components",
    () => {
      const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`)
      render(
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
        { columns: 80, rows: 120 },
      )
    },
    BENCH_OPTIONS,
  )

  bench(
    "200 Text components",
    () => {
      const items = Array.from({ length: 200 }, (_, i) => `Line ${i}`)
      render(
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
        { columns: 80, rows: 220 },
      )
    },
    BENCH_OPTIONS,
  )

  bench(
    "500 Text components",
    () => {
      const items = Array.from({ length: 500 }, (_, i) => `Row ${i}`)
      render(
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
        { columns: 80, rows: 520 },
      )
    },
    BENCH_OPTIONS,
  )
})

// ============================================================================
// Scrolling Container
// ============================================================================

describe("inkx render: scroll container", () => {
  bench(
    "500 items in scroll (h=50)",
    () => {
      const items = Array.from({ length: 500 }, (_, i) => `Scroll item ${i}`)
      render(
        <Box flexDirection="column" height={50} overflow="scroll">
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
        { columns: 80, rows: 50 },
      )
    },
    BENCH_OPTIONS,
  )

  bench(
    "1000 items in scroll (h=30)",
    () => {
      const items = Array.from({ length: 1000 }, (_, i) => `Entry ${i}`)
      render(
        <Box flexDirection="column" height={30} overflow="scroll">
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
        { columns: 80, rows: 30 },
      )
    },
    BENCH_OPTIONS,
  )
})

// ============================================================================
// Nested Components
// ============================================================================

describe("inkx render: nested components", () => {
  bench(
    "100 Box+Text rows (3 Text per row)",
    () => {
      const items = Array.from({ length: 100 }, (_, i) => i)
      render(
        <Box flexDirection="column">
          {items.map((i) => (
            <Box key={i} flexDirection="row">
              <Text color="blue">[{i}]</Text>
              <Text> - </Text>
              <Text>Nested item with text</Text>
            </Box>
          ))}
        </Box>,
        { columns: 80, rows: 120 },
      )
    },
    BENCH_OPTIONS,
  )

  bench(
    "50 items × 5-level nesting",
    () => {
      render(
        <Box flexDirection="column">
          {Array.from({ length: 50 }, (_, i) => (
            <Box key={i} flexDirection="row">
              <Box paddingLeft={1}>
                <Box paddingLeft={1}>
                  <Box paddingLeft={1}>
                    <Box paddingLeft={1}>
                      <Text>Deep item {i}</Text>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>,
        { columns: 80, rows: 60 },
      )
    },
    BENCH_OPTIONS,
  )
})

// ============================================================================
// Edge Cases
// ============================================================================

describe("inkx render: edge cases", () => {
  bench(
    "50 wide (200 char) lines with truncate",
    () => {
      const wideText = "X".repeat(200)
      const items = Array.from({ length: 50 }, () => wideText)
      render(
        <Box flexDirection="column" width={80}>
          {items.map((item, i) => (
            <Text key={i} wrap="truncate">
              {item}
            </Text>
          ))}
        </Box>,
        { columns: 80, rows: 60 },
      )
    },
    BENCH_OPTIONS,
  )

  bench(
    "100 items with mixed styles",
    () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        text: `Item ${i}`,
        color: ["red", "green", "blue", "yellow", "magenta", "cyan"][i % 6] as
          | "red"
          | "green"
          | "blue"
          | "yellow"
          | "magenta"
          | "cyan",
        bold: i % 2 === 0,
      }))
      render(
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={i} color={item.color} bold={item.bold}>
              {item.text}
            </Text>
          ))}
        </Box>,
        { columns: 80, rows: 120 },
      )
    },
    BENCH_OPTIONS,
  )

  bench(
    "100 items (90% empty)",
    () => {
      const items = Array.from({ length: 100 }, (_, i) => (i % 10 === 0 ? `Item ${i}` : ""))
      render(
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
        { columns: 80, rows: 120 },
      )
    },
    BENCH_OPTIONS,
  )
})

// ============================================================================
// Rerender
// ============================================================================

describe("inkx render: rerender", () => {
  bench(
    "200 items: first render",
    () => {
      const items = Array.from({ length: 200 }, (_, i) => `Item ${i}`)
      render(
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
        { columns: 80, rows: 220 },
      )
    },
    BENCH_OPTIONS,
  )

  bench(
    "200 items: rerender with content change",
    () => {
      const items = Array.from({ length: 200 }, (_, i) => `Item ${i}`)
      const result = render(
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
        { columns: 80, rows: 220 },
      )
      const modified = items.map((item) => `${item} modified`)
      result.rerender(
        <Box flexDirection="column">
          {modified.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
        </Box>,
      )
    },
    BENCH_OPTIONS,
  )
})
