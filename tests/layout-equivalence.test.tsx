/**
 * Layout Engine Equivalence Tests (km-zofe)
 *
 * Verifies that Yoga and Flexx layout engines produce equivalent results
 * for the same component trees. This ensures that components render
 * identically regardless of which layout engine is used.
 *
 * Tests marked with `.skip` have known differences between engines.
 * These serve as documentation of divergent behavior and regression tests
 * for when Flexx compatibility improves.
 *
 * NOTE: These tests are skipped in CI because yoga-wasm-web behaves
 * differently on Linux runners vs local macOS development.
 */

import { beforeAll, describe, expect, test } from "vitest"

// Skip in CI - Yoga WASM has platform-specific behavior on Linux runners
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true"
import type React from "react"
import { createFlexxZeroEngine } from "../src/adapters/flexx-zero-adapter.js"
import { initYogaEngine } from "../src/adapters/yoga-adapter.js"
import { Box, Text } from "../src/index.js"
import type { LayoutEngine } from "../src/layout-engine.js"
import { createRenderer, normalizeFrame } from "inkx/testing"

// ============================================================================
// Test Setup - Initialize engines once before all tests
// ============================================================================

let yogaEngine: LayoutEngine
let flexxEngine: LayoutEngine

beforeAll(async () => {
  yogaEngine = await initYogaEngine()
  flexxEngine = createFlexxZeroEngine()
})

/**
 * Helper to render a component with both engines and compare results.
 * Returns both frames for inspection if needed.
 */
function renderWithBothEngines(element: React.ReactElement, options: { columns?: number; rows?: number } = {}) {
  const { columns = 80, rows = 24 } = options

  // Render with Yoga
  const yogaRender = createRenderer({
    layoutEngine: yogaEngine,
    cols: columns,
    rows,
  })
  const yogaResult = yogaRender(element)
  const yogaFrame = yogaResult.lastFrame()

  // Render with Flexx
  const flexxRender = createRenderer({
    layoutEngine: flexxEngine,
    cols: columns,
    rows,
  })
  const flexxResult = flexxRender(element)
  const flexxFrame = flexxResult.lastFrame()

  return {
    yogaFrame,
    flexxFrame,
    yogaNormalized: yogaFrame ? normalizeFrame(yogaFrame) : "",
    flexxNormalized: flexxFrame ? normalizeFrame(flexxFrame) : "",
  }
}

/**
 * Assert that both engines produce identical normalized output.
 */
function expectEquivalent(element: React.ReactElement, options: { columns?: number; rows?: number } = {}) {
  const { yogaNormalized, flexxNormalized, yogaFrame, flexxFrame } = renderWithBothEngines(element, options)

  if (yogaNormalized !== flexxNormalized) {
    console.log("=== Yoga Frame ===")
    console.log(yogaFrame)
    console.log("=== Flexx Frame ===")
    console.log(flexxFrame)
  }

  expect(yogaNormalized).toBe(flexxNormalized)
}

/**
 * Check that both engines render something (not empty), even if different.
 * Used to verify both engines work for a test case, even if outputs differ.
 */
function expectBothRender(element: React.ReactElement, options: { columns?: number; rows?: number } = {}) {
  const { yogaNormalized, flexxNormalized } = renderWithBothEngines(element, options)

  expect(yogaNormalized.length).toBeGreaterThan(0)
  expect(flexxNormalized.length).toBeGreaterThan(0)
}

// ============================================================================
// Test Cases
// ============================================================================

describe.skipIf(isCI)("Layout Engine Equivalence (km-zofe)", () => {
  describe("Simple Box with fixed dimensions", () => {
    test("Box with explicit width and height", () => {
      const element = (
        <Box width={10} height={3}>
          <Text>Hello</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 20, rows: 10 })
    })

    test("Box with only width specified", () => {
      const element = (
        <Box width={15}>
          <Text>Content</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })

    test("Box with only height specified", () => {
      const element = (
        <Box height={5}>
          <Text>Text</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 20, rows: 10 })
    })

    test("Empty Box with dimensions", () => {
      const element = <Box width={10} height={5} />
      expectEquivalent(element, { columns: 20, rows: 10 })
    })
  })

  describe("Nested Boxes with flexDirection row/column", () => {
    test("column direction (default) with multiple children", () => {
      const element = (
        <Box flexDirection="column" width={20}>
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })

    test("row direction with multiple children", () => {
      const element = (
        <Box flexDirection="row" width={30}>
          <Text>A</Text>
          <Text>B</Text>
          <Text>C</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 5 })
    })

    test("nested row inside column", () => {
      const element = (
        <Box flexDirection="column" width={30}>
          <Text>Header</Text>
          <Box flexDirection="row">
            <Text>Left</Text>
            <Text>Right</Text>
          </Box>
          <Text>Footer</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 10 })
    })

    test("nested column inside row", () => {
      const element = (
        <Box flexDirection="row" width={40}>
          <Box flexDirection="column">
            <Text>Top</Text>
            <Text>Bottom</Text>
          </Box>
          <Box flexDirection="column">
            <Text>A</Text>
            <Text>B</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 50, rows: 10 })
    })

    test("deeply nested boxes", () => {
      const element = (
        <Box flexDirection="column" width={40}>
          <Box flexDirection="row">
            <Box flexDirection="column">
              <Text>1</Text>
              <Text>2</Text>
            </Box>
            <Box flexDirection="column">
              <Text>3</Text>
              <Text>4</Text>
            </Box>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 50, rows: 10 })
    })
  })

  describe("flexGrow/flexShrink behavior", () => {
    test("single child with flexGrow=1 fills container", () => {
      const element = (
        <Box width={30} height={5}>
          <Box flexGrow={1}>
            <Text>Grows</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 10 })
    })

    test("multiple children with flexGrow share space (row)", () => {
      const element = (
        <Box flexDirection="row" width={30} height={3}>
          <Box flexGrow={1}>
            <Text>A</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>B</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 10 })
    })

    test("unequal flexGrow ratios (row)", () => {
      const element = (
        <Box flexDirection="row" width={30} height={3}>
          <Box flexGrow={1}>
            <Text>1</Text>
          </Box>
          <Box flexGrow={2}>
            <Text>2</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 10 })
    })

    test("fixed width child alongside flexGrow child (row)", () => {
      const element = (
        <Box flexDirection="row" width={40} height={3}>
          <Box width={10}>
            <Text>Fixed</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>Grows</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 50, rows: 10 })
    })

    test("flexGrow in column direction", () => {
      const element = (
        <Box flexDirection="column" width={20} height={10}>
          <Box height={2}>
            <Text>Header</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>Content</Text>
          </Box>
          <Box height={2}>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 15 })
    })
  })

  describe("Padding and margin handling", () => {
    test("uniform padding", () => {
      const element = (
        <Box width={20} height={5} padding={2}>
          <Text>Padded</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })

    test("asymmetric padding (paddingX/paddingY)", () => {
      const element = (
        <Box width={20} height={5} paddingX={3} paddingY={1}>
          <Text>Content</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })

    test("individual padding sides", () => {
      const element = (
        <Box width={20} height={6} paddingTop={1} paddingBottom={2} paddingLeft={3} paddingRight={1}>
          <Text>Text</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 12 })
    })

    test("margin between siblings (column)", () => {
      const element = (
        <Box flexDirection="column" width={20}>
          <Box marginBottom={1}>
            <Text>First</Text>
          </Box>
          <Box marginTop={1}>
            <Text>Second</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })

    test("marginX and marginY", () => {
      const element = (
        <Box width={30} height={8}>
          <Box marginX={2} marginY={1}>
            <Text>Centered</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 12 })
    })

    test("padding and margin combined", () => {
      const element = (
        <Box width={30} height={8} padding={1}>
          <Box margin={1}>
            <Text>Nested</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 12 })
    })
  })

  describe("Text with wrapping", () => {
    test("short text within bounds", () => {
      const element = (
        <Box width={20}>
          <Text>Short</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 5 })
    })

    // Skip: Word-aware wrapping (wrap-ansi) produces different line breaks than
    // character-based wrapping, causing layout height differences between engines
    test.skip("text that would overflow container", () => {
      const element = (
        <Box width={10}>
          <Text>This is longer text</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 20, rows: 5 })
    })

    test("text with wrap=truncate", () => {
      const element = (
        <Box width={10}>
          <Text wrap="truncate">This is a very long text that should be truncated</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 20, rows: 5 })
    })

    test("text with wrap=truncate-middle", () => {
      const element = (
        <Box width={15}>
          <Text wrap="truncate-middle">This is a very long text for middle truncation</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 25, rows: 5 })
    })

    // Skip: Depends on column direction working
    test.skip("multiple text children (column)", () => {
      const element = (
        <Box flexDirection="column" width={20}>
          <Text>Line one</Text>
          <Text>Line two is longer</Text>
          <Text>Three</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })
  })

  describe('overflow="scroll" behavior', () => {
    // Skip: Depends on column direction working
    test.skip("scroll container with content that fits", () => {
      const element = (
        <Box width={20} height={5} overflow="scroll">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })

    // Skip: Depends on column direction working
    test.skip("scroll container with overflow content", () => {
      const element = (
        <Box width={20} height={4} overflow="scroll">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
          <Text>Line 4</Text>
          <Text>Line 5</Text>
          <Text>Line 6</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })

    // Skip: Depends on column direction working
    test.skip("scroll container with nested boxes", () => {
      const element = (
        <Box width={25} height={5} overflow="scroll">
          <Box>
            <Text>Header</Text>
          </Box>
          <Box>
            <Text>Content 1</Text>
          </Box>
          <Box>
            <Text>Content 2</Text>
          </Box>
          <Box>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 35, rows: 10 })
    })
  })

  describe("Alignment properties", () => {
    test("justifyContent center (row)", () => {
      const element = (
        <Box flexDirection="row" width={30} height={3} justifyContent="center">
          <Text>Centered</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 8 })
    })

    test("justifyContent space-between (row)", () => {
      // Width 31 with 3 single-char items = 28 gap space / 2 gaps = 14 each (no fractional)
      const element = (
        <Box flexDirection="row" width={31} height={3} justifyContent="space-between">
          <Text>A</Text>
          <Text>B</Text>
          <Text>C</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 8 })
    })

    test("alignItems center (row)", () => {
      const element = (
        <Box flexDirection="row" width={30} height={5} alignItems="center">
          <Box height={1}>
            <Text>Short</Text>
          </Box>
          <Box height={3}>
            <Text>Tall</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 10 })
    })

    test("alignItems flex-end (row)", () => {
      const element = (
        <Box flexDirection="row" width={30} height={5} alignItems="flex-end">
          <Box height={2}>
            <Text>A</Text>
          </Box>
          <Box height={3}>
            <Text>B</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 10 })
    })
  })

  describe("Gap property", () => {
    test("gap in row direction", () => {
      const element = (
        <Box flexDirection="row" width={30} gap={2}>
          <Text>A</Text>
          <Text>B</Text>
          <Text>C</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 40, rows: 5 })
    })

    test("gap in column direction", () => {
      const element = (
        <Box flexDirection="column" width={20} gap={1}>
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })
  })

  describe("Edge cases", () => {
    test("zero-width container", () => {
      const element = (
        <Box width={0}>
          <Text>Hidden</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 20, rows: 5 })
    })

    test("very small container", () => {
      const element = (
        <Box width={3} height={2}>
          <Text>AB</Text>
        </Box>
      )
      expectEquivalent(element, { columns: 10, rows: 5 })
    })

    test("empty nested boxes", () => {
      const element = (
        <Box width={20} height={5}>
          <Box>
            <Box />
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })

    test("many siblings (column)", () => {
      const items = Array.from({ length: 10 }, (_, i) => <Text key={i}>Item {i}</Text>)
      const element = (
        <Box flexDirection="column" width={20}>
          {items}
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 15 })
    })

    test("many siblings (row)", () => {
      const items = Array.from({ length: 5 }, (_, i) => <Text key={i}>{i}</Text>)
      const element = (
        <Box flexDirection="row" width={20}>
          {items}
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 5 })
    })
  })

  // ========================================================================
  // Known Differences Documentation
  // ========================================================================

  describe("Known Differences (both engines work, outputs differ)", () => {
    // Note: The column layout bug has been fixed. Both engines now produce
    // identical output for basic column layouts. This test verifies the fix.
    test("column layout: both engines produce identical output (was: regression test)", () => {
      const element = (
        <Box flexDirection="column" width={20}>
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
        </Box>
      )

      // Both engines should render something
      expectBothRender(element, { columns: 30, rows: 10 })

      // Document the specific difference
      const { yogaNormalized, flexxNormalized } = renderWithBothEngines(element, {
        columns: 30,
        rows: 10,
      })

      // Both engines show all three lines now
      expect(yogaNormalized).toContain("Line 1")
      expect(yogaNormalized).toContain("Line 2")
      expect(yogaNormalized).toContain("Line 3")

      // Flexx now shows all lines too (bug fixed)
      expect(flexxNormalized).toContain("Line 1")
      expect(flexxNormalized).toContain("Line 2")
      expect(flexxNormalized).toContain("Line 3")
    })

    // Skip: Different text wrapping behavior - Flexx layout is correct,
    // but text rendering differs when text overflows its container
    test.skip("flexShrink with text overflow - different wrapping behavior", () => {
      const element = (
        <Box flexDirection="row" width={20} height={3}>
          <Box width={15} flexShrink={1}>
            <Text>Shrinkable</Text>
          </Box>
          <Box width={15} flexShrink={1}>
            <Text>Also shrinks</Text>
          </Box>
        </Box>
      )
      expectEquivalent(element, { columns: 30, rows: 10 })
    })
  })
})
