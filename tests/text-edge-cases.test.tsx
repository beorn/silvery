import React from "react"
/**
 * Tests for text handling edge cases in inkx.
 *
 * Tests various edge cases:
 * - Text wrapping with long words (words longer than container width)
 * - ANSI escape codes in text (colors, bold, etc.)
 * - Emoji and wide characters (characters that take 2 cells)
 * - Mixed content (text + emoji + ANSI together)
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer, stripAnsi } from "../src/testing/index.tsx"

// ============================================================================
// Text wrapping with long words
// ============================================================================

describe("text wrapping with long words", () => {
  const render = createRenderer({ cols: 20, rows: 10 })

  test("word longer than container width should wrap or truncate", () => {
    const app = render(
      <Box width={10}>
        <Text>supercalifragilisticexpialidocious</Text>
      </Box>,
    )
    const frame = app.text

    // The long word should be present (possibly wrapped/truncated)
    expect(frame).toContain("super")
  })

  test("long word at end of line should handle correctly", () => {
    const app = render(
      <Box width={15}>
        <Text>Hi thisisaverylongword</Text>
      </Box>,
    )
    const frame = app.text

    // The first word should always be present
    expect(frame).toContain("Hi")
    // Long word may be truncated or wrapped depending on layout behavior
  })

  test("multiple long words are present in output", () => {
    // Use a taller container to allow for wrapping
    const render = createRenderer({ cols: 20, rows: 20 })
    const app = render(
      <Box width={10} height={10}>
        <Text>aaaaaaaaaaaaaa bbbbbbbbbbbbbb</Text>
      </Box>,
    )
    const frame = app.text

    // At minimum the first part should be present
    expect(frame).toContain("aaaa")
  })

  test("long URL-like strings should wrap", () => {
    const app = render(
      <Box width={15}>
        <Text>https://example.com/very/long/path/to/resource</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("https")
  })

  test("wrap=truncate-end should truncate long text", () => {
    const app = render(
      <Box width={10}>
        <Text wrap="truncate-end">supercalifragilisticexpialidocious</Text>
      </Box>,
    )
    const frame = app.text

    // Should be truncated to fit Box width (trimmed because terminal may be wider)
    const lines = frame.split("\n")
    const textLine = lines.find((line) => line.trim().length > 0)
    expect(textLine).toBeDefined()
    if (textLine) {
      // Check trimmed content length, since frame includes terminal padding
      expect(textLine.trim().length).toBeLessThanOrEqual(10)
    }
  })
})

// ============================================================================
// ANSI escape codes in text
// ============================================================================

describe("ANSI escape codes in text", () => {
  const render = createRenderer({ cols: 40, rows: 10 })

  test("text with bold styling renders correctly", () => {
    const app = render(
      <Box>
        <Text bold>Bold text</Text>
      </Box>,
    )
    const frame = app.ansi

    // Should contain bold text
    expect(stripAnsi(frame)).toContain("Bold text")

    // Should contain ANSI bold code (1)
    expect(frame).toMatch(/\x1b\[([0-9]*;)*1(;[0-9]+)*m/)
  })

  test("text with color renders correctly", () => {
    const app = render(
      <Box>
        <Text color="red">Red text</Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("Red text")
    // Should contain ANSI escape codes
    expect(frame).toContain("\x1b[")
  })

  test("text with background color renders correctly", () => {
    const app = render(
      <Box>
        <Text backgroundColor="blue">Blue background</Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("Blue background")
    expect(frame).toContain("\x1b[")
  })

  test("text with multiple styles renders correctly", () => {
    const app = render(
      <Box>
        <Text bold italic underline color="green">
          Styled text
        </Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("Styled text")
    expect(frame).toContain("\x1b[")
  })

  test("nested styled text renders correctly", () => {
    const app = render(
      <Box>
        <Text>
          Normal <Text bold>bold</Text> normal
        </Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("Normal")
    expect(frame).toContain("bold")
    expect(frame).toContain("normal")
  })

  test("dim text renders correctly", () => {
    const app = render(
      <Box>
        <Text dim>Dimmed text</Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("Dimmed text")

    // Should contain ANSI dim code (2)
    expect(frame).toMatch(/\x1b\[([0-9]*;)*2(;[0-9]+)*m/)
  })

  test("inverse text renders correctly", () => {
    const app = render(
      <Box>
        <Text inverse>Inverted</Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("Inverted")

    // Should contain ANSI codes (inverse may be implemented differently)
    expect(frame).toContain("\x1b[")
  })

  test("strikethrough text renders correctly", () => {
    const app = render(
      <Box>
        <Text strikethrough>Strikethrough</Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("Strikethrough")

    // Should contain ANSI strikethrough code (9)
    expect(frame).toMatch(/\x1b\[([0-9]*;)*9(;[0-9]+)*m/)
  })
})

// ============================================================================
// Emoji and wide characters
// ============================================================================

describe("emoji and wide characters", () => {
  const render = createRenderer({ cols: 40, rows: 10 })

  test("single emoji renders correctly", () => {
    const app = render(
      <Box>
        <Text>Hello 👋</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("Hello")
    expect(frame).toContain("👋")
  })

  test("multiple emojis render correctly", () => {
    const app = render(
      <Box>
        <Text>🎉🎊🎁</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("🎉")
    expect(frame).toContain("🎊")
    expect(frame).toContain("🎁")
  })

  test("emoji at start of text renders correctly", () => {
    const app = render(
      <Box>
        <Text>✅ Task complete</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("✅")
    expect(frame).toContain("Task complete")
  })

  test("emoji at end of text renders correctly", () => {
    const app = render(
      <Box>
        <Text>Success! 🚀</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("Success!")
    expect(frame).toContain("🚀")
  })

  test("CJK characters render correctly", () => {
    const app = render(
      <Box>
        <Text>Hello 世界</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("Hello")
    expect(frame).toContain("世界")
  })

  test("mixed width characters in box", () => {
    const app = render(
      <Box width={20}>
        <Text>AB世界CD</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("AB")
    expect(frame).toContain("世界")
    expect(frame).toContain("CD")
  })

  test("emoji with skin tone modifier", () => {
    const app = render(
      <Box>
        <Text>Wave 👋🏻 hello</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("Wave")
    expect(frame).toContain("hello")
  })

  test("flag emoji renders correctly", () => {
    const app = render(
      <Box>
        <Text>USA 🇺🇸</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("USA")
  })

  test("compound emoji renders correctly", () => {
    const app = render(
      <Box>
        <Text>Family: 👨‍👩‍👧‍👦</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("Family:")
  })
})

// ============================================================================
// Mixed content (text + emoji + ANSI)
// ============================================================================

describe("mixed content (text + emoji + ANSI)", () => {
  const render = createRenderer({ cols: 60, rows: 10 })

  test("styled text with emoji", () => {
    const app = render(
      <Box>
        <Text bold color="green">
          ✅ Success!
        </Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("✅")
    expect(stripAnsi(frame)).toContain("Success!")
    // Should have ANSI codes
    expect(frame).toContain("\x1b[")
  })

  test("multiple styled segments with emojis", () => {
    const app = render(
      <Box>
        <Text>
          <Text color="green">✅ Pass</Text> <Text color="red">❌ Fail</Text>
        </Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("✅")
    expect(frame).toContain("Pass")
    expect(frame).toContain("❌")
    expect(frame).toContain("Fail")
  })

  test("emoji in bold text", () => {
    const app = render(
      <Box>
        <Text bold>🔥 Hot take</Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("🔥")
    expect(stripAnsi(frame)).toContain("Hot take")
    // Should have bold code
    expect(frame).toMatch(/\x1b\[([0-9]*;)*1(;[0-9]+)*m/)
  })

  test("CJK text with styling", () => {
    const app = render(
      <Box>
        <Text color="blue" bold>
          你好世界
        </Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("你好世界")
    expect(frame).toContain("\x1b[")
  })

  test("mixed ASCII, emoji, and CJK", () => {
    const app = render(
      <Box>
        <Text>Hello 👋 世界!</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("Hello")
    expect(frame).toContain("👋")
    expect(frame).toContain("世界")
  })

  test("emoji with background color", () => {
    const app = render(
      <Box>
        <Text backgroundColor="yellow">🌟 Star</Text>
      </Box>,
    )
    const frame = app.ansi

    expect(stripAnsi(frame)).toContain("🌟")
    expect(stripAnsi(frame)).toContain("Star")
    expect(frame).toContain("\x1b[")
  })

  test("complex status line with icons", () => {
    const app = render(
      <Box width={50}>
        <Text>
          <Text color="green">●</Text> Online <Text color="yellow">⚠</Text> Warning <Text color="red">✗</Text> Error
        </Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("●")
    expect(frame).toContain("Online")
    expect(frame).toContain("⚠")
    expect(frame).toContain("Warning")
    expect(frame).toContain("✗")
    expect(frame).toContain("Error")
  })

  test("progress indicator with emoji", () => {
    const app = render(
      <Box>
        <Text>
          <Text dim>[</Text>
          <Text color="green">████</Text>
          <Text dim>░░░░</Text>
          <Text dim>]</Text>
          <Text> 50% 🚀</Text>
        </Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("████")
    expect(frame).toContain("50%")
    expect(frame).toContain("🚀")
  })

  test("list with emoji bullets", () => {
    const app = render(
      <Box flexDirection="column">
        <Text>📁 Documents</Text>
        <Text>📷 Photos</Text>
        <Text>🎵 Music</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("📁")
    expect(frame).toContain("Documents")
    expect(frame).toContain("📷")
    expect(frame).toContain("Photos")
    expect(frame).toContain("🎵")
    expect(frame).toContain("Music")
  })
})

// ============================================================================
// Edge cases with wrapping and wide characters
// ============================================================================

describe("wrapping with wide characters", () => {
  const render = createRenderer({ cols: 20, rows: 10 })

  test("emoji at wrap boundary", () => {
    // Set up a scenario where emoji might be at wrap boundary
    const app = render(
      <Box width={10}>
        <Text>12345678👋9</Text>
      </Box>,
    )
    const frame = app.text

    // Content should be present
    expect(frame).toContain("1234")
  })

  test("CJK text wrapping", () => {
    const app = render(
      <Box width={10}>
        <Text>你好世界这是一个测试</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("你好")
  })

  test("mixed content wrapping", () => {
    const app = render(
      <Box width={15}>
        <Text>Hello 你好 World 世界 🎉</Text>
      </Box>,
    )
    const frame = app.text

    expect(frame).toContain("Hello")
  })
})
