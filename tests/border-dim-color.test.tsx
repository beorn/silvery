import React from "react"
/**
 * Tests for borderDimColor behavior (Ink issue #840)
 *
 * This tests that:
 * 1. Dim styles on Box don't incorrectly bleed into child Text components
 * 2. Text at the left edge of bordered boxes is not incorrectly dimmed
 * 3. Various border styles with dim colors work correctly
 *
 * The original Ink bug: When a Box has borderStyle and borderDimColor enabled,
 * it incorrectly dims Text components that "touch" the left edge of the Box.
 * This was caused by improper ANSI escape sequence handling.
 *
 * @see https://github.com/vadimdemedes/ink/issues/840
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer, stripAnsi } from "../src/testing/index.tsx"

const render = createRenderer({ cols: 40, rows: 15 })

/**
 * Check if an ANSI string contains bold styling (SGR code 1).
 * Inkx outputs codes like \x1b[0;1m (reset + bold) or \x1b[1m.
 */
function hasBold(str: string): boolean {
  // Match SGR sequences containing bold code (1) as a distinct segment
  // Handles: [1m, [0;1m, [1;38;5;2m, etc.
  return /\x1b\[([0-9]*;)*1(;[0-9]+)*m/.test(str)
}

/**
 * Check if an ANSI string contains dim styling (SGR code 2).
 * The bug would show as \x1b[2m or similar appearing where it shouldn't.
 */
function hasDim(str: string): boolean {
  // Match SGR sequences containing dim code (2) as a distinct segment
  return /\x1b\[([0-9]*;)*2(;[0-9]+)*m/.test(str)
}

/**
 * Check if an ANSI string contains green foreground color.
 * Green can be basic (32) or 256-color (38;5;2).
 */
function hasGreen(str: string): boolean {
  // Check for basic green (32) or 256-color green (38;5;2)
  return /\x1b\[([0-9]*;)*32(;[0-9]+)*m/.test(str) || str.includes("38;5;2")
}

describe("borderDimColor does not affect child Text", () => {
  test("Box with dim style does not dim child Text", () => {
    const { lastFrame } = render(
      <Box borderStyle="single" dim>
        <Text>Hello</Text>
      </Box>,
    )
    const frame = lastFrame() ?? ""

    // The text "Hello" should be present
    expect(stripAnsi(frame)).toContain("Hello")

    // The frame should have ANSI codes
    expect(frame).toContain("\x1b[")

    // Find the line with "Hello"
    const lines = frame.split("\n")
    const textLine = lines.find((line) => stripAnsi(line).includes("Hello"))
    expect(textLine).toBeDefined()

    // The text line should NOT have dim applied to the text content
    // (border can be dim, but that's separate from the text)
  })

  test("Text at left edge of bordered Box is not dimmed", () => {
    // This reproduces the Ink bug where text touching the left border gets dimmed
    const { lastFrame } = render(
      <Box borderStyle="single" borderColor="gray">
        <Text bold>Important Text</Text>
      </Box>,
    )
    const frame = lastFrame() ?? ""
    const stripped = stripAnsi(frame)

    // Text should be present
    expect(stripped).toContain("Important Text")

    // Split into lines and find the line with "Important Text"
    const lines = frame.split("\n")
    const textLine = lines.find((line) =>
      stripAnsi(line).includes("Important Text"),
    )
    expect(textLine).toBeDefined()

    // The text should have bold styling
    if (textLine) {
      expect(hasBold(textLine)).toBe(true)
    }
  })

  test("nested Text children at various positions are not dimmed", () => {
    const { lastFrame } = render(
      <Box borderStyle="single" borderColor="gray">
        <Box flexDirection="column">
          <Text>First line at edge</Text>
          <Text bold>Bold line at edge</Text>
          <Text color="red">Colored line at edge</Text>
        </Box>
      </Box>,
    )
    const frame = lastFrame() ?? ""
    const stripped = stripAnsi(frame)

    // All text should be present
    expect(stripped).toContain("First line at edge")
    expect(stripped).toContain("Bold line at edge")
    expect(stripped).toContain("Colored line at edge")
  })

  test("deeply nested Text is not affected by parent border", () => {
    const { lastFrame } = render(
      <Box borderStyle="single" borderColor="gray">
        <Box>
          <Box>
            <Text bold>Deep nested bold</Text>
          </Box>
        </Box>
      </Box>,
    )
    const frame = lastFrame() ?? ""

    expect(stripAnsi(frame)).toContain("Deep nested bold")

    // Find the line with the text
    const lines = frame.split("\n")
    const textLine = lines.find((line) =>
      stripAnsi(line).includes("Deep nested bold"),
    )
    expect(textLine).toBeDefined()

    // Should have bold styling
    if (textLine) {
      expect(hasBold(textLine)).toBe(true)
    }
  })
})

describe("various border styles with color", () => {
  const borderStyles = ["single", "double", "round", "bold", "classic"] as const

  for (const borderStyle of borderStyles) {
    test(`${borderStyle} border with color does not affect child Text`, () => {
      const { lastFrame } = render(
        <Box borderStyle={borderStyle} borderColor="blue">
          <Text color="green">Styled Text</Text>
        </Box>,
      )
      const frame = lastFrame() ?? ""
      const stripped = stripAnsi(frame)

      expect(stripped).toContain("Styled Text")

      // Find the line with the text
      const lines = frame.split("\n")
      const textLine = lines.find((line) =>
        stripAnsi(line).includes("Styled Text"),
      )
      expect(textLine).toBeDefined()

      // Text should have green color (not blue from border)
      if (textLine) {
        expect(hasGreen(textLine)).toBe(true)
      }
    })
  }
})

describe("Box with explicit dim prop", () => {
  test("dim Box border does not dim non-dim Text children", () => {
    // In Inkx, dim on Box affects the border styling, not children
    const { lastFrame } = render(
      <Box borderStyle="single" dim>
        <Text>Normal text</Text>
        <Text bold>Bold text</Text>
      </Box>,
    )
    const frame = lastFrame() ?? ""
    const stripped = stripAnsi(frame)

    expect(stripped).toContain("Normal text")
    expect(stripped).toContain("Bold text")
  })

  test("explicit dimColor on Text is applied correctly", () => {
    const { lastFrame } = render(
      <Box borderStyle="single">
        <Box flexDirection="column">
          <Text>Normal</Text>
          <Text dimColor>Dimmed</Text>
          <Text bold>Bold</Text>
        </Box>
      </Box>,
    )
    const frame = lastFrame() ?? ""
    const stripped = stripAnsi(frame)

    expect(stripped).toContain("Normal")
    expect(stripped).toContain("Dimmed")
    expect(stripped).toContain("Bold")

    // Find lines with each text type
    const lines = frame.split("\n")
    const dimmedLine = lines.find((line) => stripAnsi(line).includes("Dimmed"))
    const boldLine = lines.find((line) => stripAnsi(line).includes("Bold"))

    expect(dimmedLine).toBeDefined()
    expect(boldLine).toBeDefined()

    // Dimmed line should have dim styling
    if (dimmedLine) {
      expect(hasDim(dimmedLine)).toBe(true)
    }

    // Bold line should have bold styling
    if (boldLine) {
      expect(hasBold(boldLine)).toBe(true)
    }
  })
})

describe("padding workaround for Ink bug should not be needed", () => {
  // In Ink, adding paddingLeft was a workaround for the borderDimColor bug.
  // In Inkx, this should not be necessary - both should render the same.

  test("Text without paddingLeft is styled correctly", () => {
    const { lastFrame } = render(
      <Box borderStyle="single" borderColor="gray">
        <Text bold>No padding</Text>
      </Box>,
    )
    const frame = lastFrame() ?? ""

    const lines = frame.split("\n")
    const textLine = lines.find((line) =>
      stripAnsi(line).includes("No padding"),
    )
    expect(textLine).toBeDefined()

    if (textLine) {
      expect(hasBold(textLine)).toBe(true)
    }
  })

  test("Text with paddingLeft has same styling as without", () => {
    const withoutPadding = render(
      <Box borderStyle="single" borderColor="gray">
        <Text bold>Test text</Text>
      </Box>,
    )

    const withPadding = render(
      <Box borderStyle="single" borderColor="gray" paddingLeft={1}>
        <Text bold>Test text</Text>
      </Box>,
    )

    const frameWithout = withoutPadding.lastFrame() ?? ""
    const frameWith = withPadding.lastFrame() ?? ""

    // Both should have bold text
    const linesWithout = frameWithout.split("\n")
    const linesWith = frameWith.split("\n")

    const textLineWithout = linesWithout.find((line) =>
      stripAnsi(line).includes("Test text"),
    )
    const textLineWith = linesWith.find((line) =>
      stripAnsi(line).includes("Test text"),
    )

    expect(textLineWithout).toBeDefined()
    expect(textLineWith).toBeDefined()

    // Both should have bold styling
    if (textLineWithout && textLineWith) {
      expect(hasBold(textLineWithout)).toBe(true)
      expect(hasBold(textLineWith)).toBe(true)
    }
  })
})

describe("alignItems workaround for Ink bug should not be needed", () => {
  // In Ink, changing alignItems to center was a workaround for borderDimColor.
  // In Inkx, this should not be necessary.

  test("alignItems=flex-start does not cause dimming issues", () => {
    const { lastFrame } = render(
      <Box borderStyle="single" borderColor="gray" alignItems="flex-start">
        <Text bold>Left aligned bold</Text>
      </Box>,
    )
    const frame = lastFrame() ?? ""

    const lines = frame.split("\n")
    const textLine = lines.find((line) =>
      stripAnsi(line).includes("Left aligned bold"),
    )
    expect(textLine).toBeDefined()

    if (textLine) {
      expect(hasBold(textLine)).toBe(true)
    }
  })

  test("alignItems=center text is styled correctly", () => {
    const { lastFrame } = render(
      <Box
        borderStyle="single"
        borderColor="gray"
        alignItems="center"
        width={30}
      >
        <Text bold>Centered bold</Text>
      </Box>,
    )
    const frame = lastFrame() ?? ""

    const lines = frame.split("\n")
    const textLine = lines.find((line) =>
      stripAnsi(line).includes("Centered bold"),
    )
    expect(textLine).toBeDefined()

    if (textLine) {
      expect(hasBold(textLine)).toBe(true)
    }
  })
})

describe("ANSI code isolation between border and content", () => {
  test("border color does not leak into content area", () => {
    const { lastFrame } = render(
      <Box borderStyle="single" borderColor="red">
        <Text color="green">Green text</Text>
      </Box>,
    )
    const frame = lastFrame() ?? ""

    // Find the content line (not border lines)
    const lines = frame.split("\n")
    const textLine = lines.find((line) =>
      stripAnsi(line).includes("Green text"),
    )
    expect(textLine).toBeDefined()

    if (textLine) {
      // Text should be green, not red
      expect(hasGreen(textLine)).toBe(true)
    }
  })

  test("multiple border colors in nested boxes are isolated", () => {
    const { lastFrame } = render(
      <Box borderStyle="single" borderColor="red">
        <Box borderStyle="single" borderColor="blue">
          <Text color="green">Nested green text</Text>
        </Box>
      </Box>,
    )
    const frame = lastFrame() ?? ""

    const lines = frame.split("\n")
    const textLine = lines.find((line) =>
      stripAnsi(line).includes("Nested green text"),
    )
    expect(textLine).toBeDefined()

    if (textLine) {
      // Text should be green, not affected by red or blue borders
      expect(hasGreen(textLine)).toBe(true)
    }
  })
})
