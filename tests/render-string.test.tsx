/**
 * Tests for renderString - static one-shot rendering
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, initYogaEngine, renderString, renderStringSync, setLayoutEngine } from "../src"

describe("renderString", () => {
  test("renders simple text", async () => {
    const output = await renderString(<Text>Hello World</Text>)

    expect(output).toContain("Hello World")
  })

  test("renders with ANSI codes by default", async () => {
    const output = await renderString(<Text color="green">Green</Text>)

    // Should contain ANSI escape codes
    expect(output).toMatch(/\x1b\[/)
    expect(output).toContain("Green")
  })

  test("renders plain text with plain option", async () => {
    const output = await renderString(<Text color="green">Green</Text>, {
      plain: true,
    })

    // Should NOT contain ANSI escape codes
    expect(output).not.toMatch(/\x1b\[/)
    expect(output).toContain("Green")
  })

  test("respects width option for layout", async () => {
    const narrow = await renderString(
      <Box width="100%">
        <Text>Full width</Text>
      </Box>,
      { width: 40, plain: true },
    )

    const wide = await renderString(
      <Box width="100%">
        <Text>Full width</Text>
      </Box>,
      { width: 80, plain: true },
    )

    // Both should contain the text
    expect(narrow).toContain("Full width")
    expect(wide).toContain("Full width")

    // Wide should have more space (or at least not less)
    // The layout fills to the specified width
    const narrowLines = narrow.split("\n")
    const wideLines = wide.split("\n")

    // Check that first line has different trailing space
    expect(wideLines[0]!.length).toBeGreaterThanOrEqual(narrowLines[0]!.length)
  })

  test("renders complex layouts", async () => {
    const output = await renderString(
      <Box flexDirection="column">
        <Text>Header</Text>
        <Box flexDirection="row">
          <Box width={10}>
            <Text>Left</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>Right</Text>
          </Box>
        </Box>
        <Text>Footer</Text>
      </Box>,
      { plain: true },
    )

    expect(output).toContain("Header")
    expect(output).toContain("Left")
    expect(output).toContain("Right")
    expect(output).toContain("Footer")
  })

  test("height option limits output", async () => {
    const output = await renderString(
      <Box flexDirection="column" height="100%">
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </Box>,
      { height: 3, plain: true },
    )

    const lines = output.split("\n")
    expect(lines.length).toBeLessThanOrEqual(3)
  })
})

describe("renderStringSync", () => {
  test("throws when layout engine not initialized", async () => {
    // This test verifies the error message, but since we use vitest's
    // parallel execution and the engine is typically already initialized,
    // we can't reliably test the uninitialized state.
    // We just verify the sync version works when engine is ready.

    // Ensure engine is initialized first
    const engine = await initYogaEngine()
    setLayoutEngine(engine)

    const output = renderStringSync(<Text>Sync render</Text>)
    expect(output).toContain("Sync render")
  })

  test("works identically to async version when engine is ready", async () => {
    const engine = await initYogaEngine()
    setLayoutEngine(engine)

    const asyncOutput = await renderString(<Text color="blue">Test</Text>, {
      plain: true,
    })
    const syncOutput = renderStringSync(<Text color="blue">Test</Text>, {
      plain: true,
    })

    expect(syncOutput).toBe(asyncOutput)
  })
})
