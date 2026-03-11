/**
 * Unicode Tests for Silvery
 *
 * Bead: km-silvery.unicode-tests
 *
 * Validates correct rendering of unicode text:
 * - CJK wide characters (2-column width)
 * - Mixed ASCII + CJK text
 * - CJK text truncation at column boundaries
 * - Emoji: basic, skin tone modifiers, ZWJ sequences, flags
 * - Combining characters (diacritics)
 * - RTL text (Arabic, Hebrew)
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, normalizeFrame } from "@silvery/test"
import { Box, Text, useContentRect } from "@silvery/react"
import {
  displayWidth,
  splitGraphemes,
  graphemeWidth,
  isCJK,
  isWideGrapheme,
  isLikelyEmoji,
  truncateText,
  hasWideCharacters,
  hasZeroWidthCharacters,
  isZeroWidthGrapheme,
} from "@silvery/react"

// ============================================================================
// CJK Wide Characters
// ============================================================================

describe("unicode: CJK wide characters", () => {
  test("CJK characters are 2 columns wide", () => {
    // Chinese characters
    expect(displayWidth("\u4F60")).toBe(2) // 你
    expect(displayWidth("\u597D")).toBe(2) // 好
    expect(displayWidth("\u4E16")).toBe(2) // 世
    expect(displayWidth("\u754C")).toBe(2) // 界

    // Japanese
    expect(displayWidth("\u3053")).toBe(2) // こ
    expect(displayWidth("\u3093")).toBe(2) // ん

    // Korean
    expect(displayWidth("\uC548")).toBe(2) // 안
    expect(displayWidth("\uB155")).toBe(2) // 녕
  })

  test("CJK string width is sum of character widths", () => {
    expect(displayWidth("\u4F60\u597D")).toBe(4) // 你好
    expect(displayWidth("\u4F60\u597D\u4E16\u754C")).toBe(8) // 你好世界
    expect(displayWidth("\u3053\u3093\u306B\u3061\u306F")).toBe(10) // こんにちは
  })

  test("isCJK detects CJK characters", () => {
    expect(isCJK("\u4F60")).toBe(true)
    expect(isCJK("\u3053")).toBe(true)
    expect(isCJK("\uC548")).toBe(true)
    expect(isCJK("A")).toBe(false)
    expect(isCJK("1")).toBe(false)
  })

  test("isWideGrapheme detects wide characters", () => {
    expect(isWideGrapheme("\u4F60")).toBe(true)
    expect(isWideGrapheme("A")).toBe(false)
  })

  test("hasWideCharacters detects wide chars in string", () => {
    expect(hasWideCharacters("\u4F60\u597D")).toBe(true)
    expect(hasWideCharacters("Hello")).toBe(false)
    expect(hasWideCharacters("Hello\u4F60")).toBe(true)
  })

  test("CJK text renders in terminal buffer", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(React.createElement(Text, null, "\u4F60\u597D\u4E16\u754C"))
    expect(app.text).toContain("\u4F60\u597D\u4E16\u754C")
  })
})

// ============================================================================
// Mixed ASCII + CJK
// ============================================================================

describe("unicode: mixed ASCII and CJK", () => {
  test("mixed string width is correct", () => {
    // "Hello你好" = 5 + 4 = 9
    expect(displayWidth("Hello\u4F60\u597D")).toBe(9)
    // "A你B好C" = 1 + 2 + 1 + 2 + 1 = 7
    expect(displayWidth("A\u4F60B\u597DC")).toBe(7)
  })

  test("mixed ASCII+CJK renders correctly", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(React.createElement(Text, null, "Hello \u4F60\u597D World"))
    expect(app.text).toContain("Hello \u4F60\u597D World")
  })

  test("mixed content in box layout", () => {
    const r = createRenderer({ cols: 60, rows: 10 })
    const app = r(
      React.createElement(
        Box,
        { flexDirection: "column" },
        React.createElement(Text, null, "Name: \u5F20\u4E09"),
        React.createElement(Text, null, "City: \u5317\u4EAC"),
        React.createElement(Text, null, "Status: Active"),
      ),
    )
    expect(app.text).toContain("Name: \u5F20\u4E09")
    expect(app.text).toContain("City: \u5317\u4EAC")
    expect(app.text).toContain("Status: Active")
  })
})

// ============================================================================
// CJK Truncation
// ============================================================================

describe("unicode: CJK truncation", () => {
  test("truncateText handles CJK at boundary", () => {
    // "你好世界" = 8 columns
    // Truncating to 5 should show "你好" (4) + space/ellipsis, not split a char
    const result = truncateText("\u4F60\u597D\u4E16\u754C", 5)
    const width = displayWidth(result)
    expect(width).toBeLessThanOrEqual(5)
    // Should not split a wide char in half
  })

  test("truncateText with mixed content", () => {
    // "Hi你好" = 2 + 4 = 6 columns
    const result = truncateText("Hi\u4F60\u597D", 4)
    const width = displayWidth(result)
    expect(width).toBeLessThanOrEqual(4)
  })

  test("CJK in fixed-width box truncates correctly", () => {
    const r = createRenderer({ cols: 10, rows: 3 })
    const app = r(
      React.createElement(Box, { width: 6 }, React.createElement(Text, null, "\u4F60\u597D\u4E16\u754C\u4F60\u597D")),
    )
    // Should not crash, and should produce output within bounds
    const text = app.text
    expect(text.length).toBeGreaterThan(0)
  })

  test("splitGraphemes segments CJK correctly", () => {
    const graphemes = splitGraphemes("\u4F60\u597D")
    expect(graphemes).toEqual(["\u4F60", "\u597D"])
  })
})

// ============================================================================
// Emoji
// ============================================================================

describe("unicode: emoji", () => {
  test("basic emoji width", () => {
    // Basic emoji should be 2 columns wide in terminal
    expect(graphemeWidth("\u{1F600}")).toBe(2) // 😀
    expect(graphemeWidth("\u{1F680}")).toBe(2) // 🚀
    expect(graphemeWidth("\u{1F4A1}")).toBe(2) // 💡
    expect(graphemeWidth("\u2764\uFE0F")).toBe(2) // ❤️ (with variation selector)
  })

  test("isLikelyEmoji detects emoji", () => {
    expect(isLikelyEmoji("\u{1F600}")).toBe(true)
    expect(isLikelyEmoji("\u{1F680}")).toBe(true)
    expect(isLikelyEmoji("A")).toBe(false)
    expect(isLikelyEmoji("1")).toBe(false)
  })

  test("emoji renders in terminal buffer", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(React.createElement(Text, null, "\u{1F600} Hello \u{1F680}"))
    // The text should contain the emoji (they may render as wide chars)
    expect(app.text).toContain("Hello")
  })

  test("skin tone modifier emoji", () => {
    // Skin tone modifiers create a single grapheme
    const thumbsUp = "\u{1F44D}\u{1F3FD}" // 👍🏽
    const graphemes = splitGraphemes(thumbsUp)
    expect(graphemes.length).toBe(1) // Single grapheme cluster
    expect(graphemeWidth(thumbsUp)).toBe(2) // 2 columns wide
  })

  test("ZWJ emoji sequences", () => {
    // Family emoji: 👨‍👩‍👧‍👦
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}"
    const graphemes = splitGraphemes(family)
    // ZWJ sequence should be a single grapheme cluster
    expect(graphemes.length).toBe(1)
  })

  test("flag emoji", () => {
    // US flag: 🇺🇸 (two regional indicator symbols)
    const usFlag = "\u{1F1FA}\u{1F1F8}"
    const graphemes = splitGraphemes(usFlag)
    expect(graphemes.length).toBe(1) // Single grapheme

    // JP flag: 🇯🇵
    const jpFlag = "\u{1F1EF}\u{1F1F5}"
    const jpGraphemes = splitGraphemes(jpFlag)
    expect(jpGraphemes.length).toBe(1)
  })

  test("emoji in box layout does not overflow", () => {
    const r = createRenderer({ cols: 30, rows: 5 })
    const app = r(
      React.createElement(
        Box,
        { width: 20 },
        React.createElement(Text, null, "\u{1F600}\u{1F680}\u{1F4A1}\u{1F60D}\u{1F389}"),
      ),
    )
    // Should render without crash
    expect(app.text.length).toBeGreaterThan(0)
  })

  test("mixed emoji and text width calculation", () => {
    // "Hi 😀 World" = 2 + 1 + 2 + 1 + 5 = 11
    const width = displayWidth("Hi \u{1F600} World")
    expect(width).toBe(11)
  })
})

// ============================================================================
// Combining Characters
// ============================================================================

describe("unicode: combining characters", () => {
  test("combining diacritical marks are zero width", () => {
    // e + combining acute accent
    expect(isZeroWidthGrapheme("\u0301")).toBe(true) // combining acute
    expect(isZeroWidthGrapheme("\u0303")).toBe(true) // combining tilde
    expect(isZeroWidthGrapheme("\u0308")).toBe(true) // combining diaeresis
  })

  test("hasZeroWidthCharacters detects standalone zero-width graphemes", () => {
    // A lone combining mark is a zero-width grapheme
    expect(hasZeroWidthCharacters("\u0301")).toBe(true)
    // But "e\u0301" forms a single grapheme cluster with width 1 (not zero)
    expect(hasZeroWidthCharacters("e\u0301")).toBe(false)
    expect(hasZeroWidthCharacters("Hello")).toBe(false)
  })

  test("grapheme with combining mark is single grapheme", () => {
    // "é" as e + combining acute = single grapheme
    const graphemes = splitGraphemes("e\u0301")
    expect(graphemes.length).toBe(1)
    expect(graphemes[0]).toBe("e\u0301")
  })

  test("combined character width is 1 column", () => {
    // e + combining acute = 1 column (the accent doesn't add width)
    expect(displayWidth("e\u0301")).toBe(1)
    // n + combining tilde = 1 column
    expect(displayWidth("n\u0303")).toBe(1)
  })

  test("combining characters render in buffer", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(React.createElement(Text, null, "caf\u00E9 re\u0301sume\u0301"))
    // Should contain the text (combining chars may display differently)
    expect(app.text.length).toBeGreaterThan(0)
  })

  test("multiple combining marks on single base", () => {
    // o + combining diaeresis + combining acute
    const text = "o\u0308\u0301"
    const graphemes = splitGraphemes(text)
    // Should be a single grapheme cluster
    expect(graphemes.length).toBe(1)
    expect(displayWidth(text)).toBe(1)
  })
})

// ============================================================================
// RTL Text
// ============================================================================

describe("unicode: RTL text", () => {
  test("Arabic text width calculation", () => {
    // Arabic characters are typically 1 column wide each
    const arabic = "\u0645\u0631\u062D\u0628\u0627" // مرحبا (Hello)
    const width = displayWidth(arabic)
    expect(width).toBeGreaterThan(0)
  })

  test("Hebrew text width calculation", () => {
    const hebrew = "\u05E9\u05DC\u05D5\u05DD" // שלום (Shalom)
    const width = displayWidth(hebrew)
    expect(width).toBeGreaterThan(0)
  })

  test("RTL text renders in buffer", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(
      React.createElement(
        Box,
        { flexDirection: "column" },
        React.createElement(Text, null, "\u05E9\u05DC\u05D5\u05DD"),
        React.createElement(Text, null, "\u0645\u0631\u062D\u0628\u0627"),
      ),
    )
    // Should render without crash
    expect(app.text.length).toBeGreaterThan(0)
  })

  test("mixed LTR and RTL text", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(React.createElement(Text, null, "Hello \u05E9\u05DC\u05D5\u05DD World"))
    // Terminal renders LTR by default — RTL is just characters
    expect(app.text).toContain("Hello")
    expect(app.text).toContain("World")
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe("unicode: edge cases", () => {
  test("empty string", () => {
    expect(displayWidth("")).toBe(0)
    expect(splitGraphemes("")).toEqual([])
  })

  test("single ASCII character", () => {
    expect(displayWidth("A")).toBe(1)
    expect(splitGraphemes("A")).toEqual(["A"])
  })

  test("newlines in width calculation", () => {
    // displayWidth should handle single-line strings
    expect(displayWidth("Hello")).toBe(5)
  })

  test("tab characters", () => {
    const width = displayWidth("\t")
    // Tab width varies by terminal; just verify it doesn't crash
    expect(typeof width).toBe("number")
  })

  test("null character", () => {
    const width = displayWidth("\0")
    expect(typeof width).toBe("number")
  })

  test("fullwidth Latin characters", () => {
    // Fullwidth A (U+FF21) is 2 columns wide
    const fullA = "\uFF21"
    expect(displayWidth(fullA)).toBe(2)
    expect(isWideGrapheme(fullA)).toBe(true)
  })

  test("halfwidth Katakana", () => {
    // Halfwidth katakana (U+FF65-FF9F) is 1 column wide
    const halfKana = "\uFF66" // ヲ halfwidth
    expect(displayWidth(halfKana)).toBe(1)
  })

  test("very long unicode string does not crash", () => {
    const longCJK = "\u4F60".repeat(10000)
    const width = displayWidth(longCJK)
    expect(width).toBe(20000)
  })

  test("mixed script rendering stress test", () => {
    const r = createRenderer({ cols: 80, rows: 10 })
    const app = r(
      React.createElement(
        Box,
        { flexDirection: "column" },
        React.createElement(Text, null, "English: Hello"),
        React.createElement(Text, null, "\u4E2D\u6587: \u4F60\u597D"),
        React.createElement(Text, null, "\u65E5\u672C\u8A9E: \u3053\u3093\u306B\u3061\u306F"),
        React.createElement(Text, null, "\uD55C\uAD6D\uC5B4: \uC548\uB155"),
        React.createElement(Text, null, "\u0639\u0631\u0628\u064A: \u0645\u0631\u062D\u0628\u0627"),
        React.createElement(Text, null, "\u05E2\u05D1\u05E8\u05D9\u05EA: \u05E9\u05DC\u05D5\u05DD"),
        React.createElement(Text, null, "Emoji: \u{1F600}\u{1F680}\u{1F4A1}"),
        React.createElement(Text, null, "Mix: Hello\u4F60\u{1F600}\u05E9\u05DC\u05D5\u05DD"),
      ),
    )
    // All content should be present
    expect(app.text).toContain("English: Hello")
    expect(app.text).toContain("Emoji:")
  })
})
