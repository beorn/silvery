/**
 * Inkx Integration Tests
 *
 * Tests that verify the rendering works correctly.
 * Uses simplified text extraction for fast, reliable testing.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Newline, Spacer, Text } from "../src/components/index.js"
import { createRenderer } from "../src/testing/index.js"

const render = createRenderer()

describe("Inkx Integration", () => {
  describe("Basic Rendering", () => {
    test("renders simple text", () => {
      const app = render(<Text>Hello World</Text>)
      expect(app.ansi).toContain("Hello World")
    })

    test("renders nested boxes", () => {
      const app = render(
        <Box flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Line 1")
      expect(frame).toContain("Line 2")
    })

    test("renders with colors", () => {
      const app = render(<Text color="red">Red Text</Text>)
      expect(app.ansi).toContain("Red Text")
    })

    test("renders with bold", () => {
      const app = render(<Text bold>Bold Text</Text>)
      expect(app.ansi).toContain("Bold Text")
    })
  })

  describe("Layout", () => {
    test("renders horizontal layout", () => {
      const app = render(
        <Box flexDirection="row">
          <Text>Left</Text>
          <Text>Right</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Left")
      expect(frame).toContain("Right")
    })

    test("renders vertical layout", () => {
      const app = render(
        <Box flexDirection="column">
          <Text>Top</Text>
          <Text>Bottom</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Top")
      expect(frame).toContain("Bottom")
    })

    test("Spacer renders without error", () => {
      const app = render(
        <Box flexDirection="row" width={20}>
          <Text>A</Text>
          <Spacer />
          <Text>B</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("A")
      expect(frame).toContain("B")
    })

    test("Newline renders without error", () => {
      const app = render(
        <Box flexDirection="column">
          <Text>Before</Text>
          <Newline count={2} />
          <Text>After</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Before")
      expect(frame).toContain("After")
    })
  })

  describe("Borders", () => {
    test("renders single border", () => {
      const app = render(
        <Box borderStyle="single" width={10} height={3}>
          <Text>Hi</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Hi")
      // Should have border characters
      expect(frame).toMatch(/[─│┌┐└┘]/)
    })

    test("renders double border", () => {
      const app = render(
        <Box borderStyle="double" width={10} height={3}>
          <Text>Hi</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Hi")
      // Should have double border characters
      expect(frame).toMatch(/[═║╔╗╚╝]/)
    })
  })

  describe("Rerender", () => {
    test("rerender updates content", () => {
      const app = render(<Text>Initial</Text>)
      expect(app.ansi).toContain("Initial")

      app.rerender(<Text>Updated</Text>)
      expect(app.ansi).toContain("Updated")
    })

    test("tracks multiple frames", () => {
      const app = render(<Text>Frame 1</Text>)

      app.rerender(<Text>Frame 2</Text>)
      app.rerender(<Text>Frame 3</Text>)

      expect(app.frames.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe("Unmount", () => {
    test("unmount cleans up", () => {
      const app = render(<Text>Content</Text>)
      expect(app.ansi).toContain("Content")

      app.unmount()

      // After unmount, lastFrame should still return last rendered frame
      expect(app.ansi).toContain("Content")
    })
  })

  describe("Buffer Access", () => {
    test("lastBuffer returns the terminal buffer", () => {
      const app = render(<Text>Buffer Test</Text>)
      const buffer = app.term.buffer

      expect(buffer).toBeDefined()
      expect(buffer!.width).toBe(80) // Default test width
      // Buffer height reflects content height, not terminal height
      expect(buffer!.height).toBeGreaterThanOrEqual(1)
    })

    test("lastFrameText returns plain text without ANSI", () => {
      const app = render(<Text color="red">Plain Text</Text>)
      const text = app.text

      expect(text).toBeDefined()
      expect(text).toContain("Plain Text")
      // Should NOT contain ANSI escape codes
      expect(text).not.toContain("\x1b[")
    })

    test("lastFrameText trims whitespace by default", () => {
      const app = render(
        <Box width={20}>
          <Text>Short</Text>
        </Box>,
      )
      const text = app.text

      expect(text).toBe("Short")
    })
  })
})
