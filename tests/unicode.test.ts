/**
 * Unicode Tests
 *
 * Tests for Unicode handling: grapheme segmentation, display width,
 * text manipulation, and buffer writing.
 */

import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import {
  BG_OVERRIDE_CODE,
  displayWidth,
  displayWidthAnsi,
  getFirstCodePoint,
  graphemeCount,
  graphemeWidth,
  hasAnsi,
  hasWideCharacters,
  hasZeroWidthCharacters,
  isCJK,
  isLikelyEmoji,
  isWideGrapheme,
  isZeroWidthGrapheme,
  measureText,
  normalizeText,
  padText,
  parseAnsiText,
  sliceByWidth,
  splitGraphemes,
  stripAnsi,
  truncateAnsi,
  truncateText,
  wrapText,
  writeLinesToBuffer,
  writeTextToBuffer,
  writeTextTruncated,
} from "../src/unicode.js"

// ============================================================================
// Test Helpers
// ============================================================================

/** Assert display width equals expected value */
function expectWidth(text: string, expected: number) {
  expect(displayWidth(text)).toBe(expected)
}

/** Assert grapheme count equals expected value */
function expectGraphemeCount(text: string, expected: number) {
  expect(graphemeCount(text)).toBe(expected)
}

/** Assert text properties in one call */
function expectTextMetrics(text: string, metrics: { width?: number; graphemes?: number }) {
  if (metrics.width !== undefined) expectWidth(text, metrics.width)
  if (metrics.graphemes !== undefined) expectGraphemeCount(text, metrics.graphemes)
}

/** Assert all wrapped lines fit within maxWidth */
function expectAllLinesFitWidth(lines: string[], maxWidth: number) {
  for (const line of lines) {
    expect(displayWidth(line)).toBeLessThanOrEqual(maxWidth)
  }
}

/** Assert truncation respects width and adds ellipsis when needed */
function expectTruncation(text: string, maxWidth: number, options?: { hasEllipsis?: boolean }) {
  const result = truncateText(text, maxWidth)
  expect(displayWidth(result)).toBeLessThanOrEqual(maxWidth)
  if (options?.hasEllipsis) {
    expect(result).toContain("…")
  }
}

describe("Unicode", () => {
  describe("splitGraphemes", () => {
    test("splits ASCII text", () => {
      expect(splitGraphemes("hello")).toEqual(["h", "e", "l", "l", "o"])
    })

    test("splits CJK characters", () => {
      expect(splitGraphemes("한국어")).toEqual(["한", "국", "어"])
    })

    test("handles combining characters", () => {
      // e + combining acute accent
      const cafe = "cafe\u0301"
      const graphemes = splitGraphemes(cafe)
      expect(graphemes).toHaveLength(4)
      expect(graphemes[3]).toBe("e\u0301")
    })

    test("handles emoji", () => {
      expect(splitGraphemes("😀🎉")).toEqual(["😀", "🎉"])
    })

    test("handles ZWJ emoji sequences", () => {
      // Family emoji (man + ZWJ + woman + ZWJ + girl)
      const family = "👨‍👩‍👧"
      const graphemes = splitGraphemes(family)
      expect(graphemes).toHaveLength(1)
    })
  })

  describe("graphemeCount", () => {
    test.each([
      ["hello", 5],
      ["한국어", 3],
      ["cafe\u0301", 4], // combining as single grapheme
    ])('graphemeCount("%s") = %d', (text, expected) => {
      expectGraphemeCount(text, expected)
    })
  })

  describe("displayWidth", () => {
    test.each([
      ["hello", 5], // ASCII is 1 column each
      ["한국어", 6], // CJK is 2 columns each
      ["\u0301", 0], // combining chars are 0 width
    ])('displayWidth("%s") = %d', (text, expected) => {
      expectWidth(text, expected)
    })

    test("emoji varies", () => {
      // Most emoji are 2 columns wide in modern terminals
      expect(displayWidth("😀")).toBeGreaterThanOrEqual(1)
    })
  })

  describe("graphemeWidth", () => {
    test.each([
      ["A", 1], // ASCII grapheme
      ["한", 2], // CJK grapheme
    ])('graphemeWidth("%s") = %d', (grapheme, expected) => {
      expect(graphemeWidth(grapheme)).toBe(expected)
    })
  })

  describe("isWideGrapheme", () => {
    test.each([
      ["A", false], // ASCII is not wide
      ["中", true], // CJK is wide
    ])('isWideGrapheme("%s") = %s', (grapheme, expected) => {
      expect(isWideGrapheme(grapheme)).toBe(expected)
    })
  })

  describe("isZeroWidthGrapheme", () => {
    test.each([
      ["A", false], // ASCII is not zero-width
      ["\u0301", true], // combining accent is zero-width
    ])('isZeroWidthGrapheme("%s") = %s', (grapheme, expected) => {
      expect(isZeroWidthGrapheme(grapheme)).toBe(expected)
    })
  })

  describe("truncateText", () => {
    test("no truncation if fits", () => {
      expect(truncateText("hello", 10)).toBe("hello")
    })

    test("truncates with ellipsis", () => {
      expect(truncateText("hello world", 8)).toBe("hello w…")
    })

    test("handles CJK truncation", () => {
      expectTruncation("한국어입니다", 7, { hasEllipsis: true })
    })

    test("custom ellipsis", () => {
      expect(truncateText("hello world", 8, "...")).toBe("hello...")
    })

    test("empty when maxWidth too small", () => {
      expect(truncateText("hello", 0)).toBe("")
    })
  })

  describe("padText", () => {
    test("pads left (right-aligns content)", () => {
      expect(padText("hi", 5, "left")).toBe("hi   ")
    })

    test("pads right (left-aligns content)", () => {
      expect(padText("hi", 5, "right")).toBe("   hi")
    })

    test("pads center", () => {
      const padded = padText("hi", 6, "center")
      expect(padded).toBe("  hi  ")
    })

    test("no pad if already fits", () => {
      expect(padText("hello", 3)).toBe("hello")
    })

    test("handles CJK padding", () => {
      const padded = padText("한", 5, "left")
      expect(displayWidth(padded)).toBe(5)
    })
  })

  describe("wrapText", () => {
    test("wraps long text at word boundaries", () => {
      const lines = wrapText("hello world test", 6)
      // Word wrapping: breaks at spaces, keeps space at end of line
      expect(lines).toEqual(["hello ", "world ", "test"])
    })

    test("preserves newlines by default", () => {
      const lines = wrapText("a\nb\nc", 10)
      expect(lines).toEqual(["a", "b", "c"])
    })

    test("handles empty lines", () => {
      const lines = wrapText("a\n\nb", 10)
      expect(lines).toEqual(["a", "", "b"])
    })

    test("wraps CJK correctly", () => {
      const lines = wrapText("한국어입니다", 5)
      expectAllLinesFitWidth(lines, 5)
    })

    test("returns empty for width 0", () => {
      expect(wrapText("hello", 0)).toEqual([])
    })
  })

  // ========================================================================
  // Word Wrapping Tests (km-0c2i)
  // Comprehensive tests for word-boundary wrapping behavior
  // ========================================================================
  describe("Word Wrapping (km-0c2i)", () => {
    describe("basic word boundary wrapping", () => {
      test("wraps at space boundaries", () => {
        const lines = wrapText("the quick brown fox", 10)
        expect(lines).toEqual(["the quick ", "brown fox"])
      })

      test("wraps at hyphen boundaries", () => {
        const lines = wrapText("well-known fact", 8)
        expect(lines).toEqual(["well-", "known ", "fact"])
      })

      test("wraps multiple words correctly", () => {
        const lines = wrapText("one two three four five", 8)
        expect(lines).toEqual(["one two ", "three ", "four ", "five"])
      })

      test("keeps word together when it fits", () => {
        const lines = wrapText("hello world", 11)
        expect(lines).toEqual(["hello world"])
      })

      test("handles trailing space", () => {
        const lines = wrapText("hello ", 10)
        expect(lines).toEqual(["hello "])
      })

      test("handles leading space", () => {
        const lines = wrapText(" hello", 10)
        expect(lines).toEqual([" hello"])
      })
    })

    describe("character fallback for long words", () => {
      test("falls back to character wrap for word longer than width", () => {
        const lines = wrapText("supercalifragilistic", 5)
        expectAllLinesFitWidth(lines, 5)
        expect(lines.length).toBeGreaterThan(1)
      })

      test("wraps long word then continues with normal word wrap", () => {
        const lines = wrapText("supercalifragilistic is a word", 8)
        expectAllLinesFitWidth(lines, 8)
      })

      test("handles single very long word", () => {
        const lines = wrapText("abcdefghij", 3)
        expect(lines).toEqual(["abc", "def", "ghi", "j"])
      })
    })

    describe("CJK text (can break anywhere)", () => {
      test("CJK text breaks at any character boundary", () => {
        const lines = wrapText("中文测试文本", 5)
        expect(lines.length).toBeGreaterThan(0)
        expect(lines[0]).toBe("中文")
        expect(displayWidth(lines[0] ?? "")).toBeLessThanOrEqual(5)
      })

      test.each([
        ["Hello中文World", 7],
        ["日本語テスト", 5],
        ["안녕하세요세상", 6],
      ])('wraps "%s" correctly within width %d', (text, width) => {
        const lines = wrapText(text, width)
        expectAllLinesFitWidth(lines, width)
      })
    })

    describe("preserving intentional line breaks", () => {
      test("preserves single newline", () => {
        const lines = wrapText("hello\nworld", 20)
        expect(lines).toEqual(["hello", "world"])
      })

      test("preserves multiple newlines (empty lines)", () => {
        const lines = wrapText("hello\n\n\nworld", 20)
        expect(lines).toEqual(["hello", "", "", "world"])
      })

      test("combines newlines with word wrapping", () => {
        const lines = wrapText("hello world\nfoo bar", 7)
        expect(lines).toEqual(["hello ", "world", "foo bar"])
      })

      test("preserveNewlines=false collapses newlines to spaces", () => {
        const lines = wrapText("hello\nworld", 20, false)
        expect(lines).toEqual(["hello world"])
      })
    })

    describe("edge cases", () => {
      test.each([
        ["", 10, [""]],
        ["a", 10, ["a"]],
        [" ", 10, [" "]],
        ["abc", 1, ["a", "b", "c"]],
        ["hello", 5, ["hello"]],
      ])('wrapText("%s", %d) = %j', (text, width, expected) => {
        expect(wrapText(text, width)).toEqual(expected)
      })

      test("only spaces", () => {
        const lines = wrapText("     ", 3)
        expect(lines.length).toBeGreaterThan(0)
        expectAllLinesFitWidth(lines, 3)
      })

      test("consecutive spaces", () => {
        const lines = wrapText("hello  world", 8)
        expectAllLinesFitWidth(lines, 8)
      })

      test("tab characters as word boundaries", () => {
        const lines = wrapText("hello\tworld", 8)
        expectAllLinesFitWidth(lines, 8)
      })
    })

    describe("mixed content", () => {
      test.each([
        ["Hello 中文 😀 World", 10],
        ["Count: 12345 items", 8],
        ["Hello, world! How are you?", 10],
      ])('wraps "%s" within width %d', (text, width) => {
        const lines = wrapText(text, width)
        expectAllLinesFitWidth(lines, width)
      })
    })

    describe("hyphenation behavior", () => {
      test("breaks after hyphen in hyphenated word", () => {
        const lines = wrapText("self-contained unit", 10)
        expect(lines[0]).toContain("self-")
      })

      test("multiple hyphens in text", () => {
        const lines = wrapText("well-known well-tested", 8)
        expectAllLinesFitWidth(lines, 8)
      })

      test("hyphen at end of word", () => {
        const lines = wrapText("end- start", 6)
        expect(lines).toEqual(["end- ", "start"])
      })
    })
  })

  describe("sliceByWidth", () => {
    test.each([
      ["hello", 1, 4, "ell"],
      ["한국어", 0, 4, "한국"],
      ["hello", 0, 3, "hel"],
      ["hello", 2, undefined, "llo"],
    ])('sliceByWidth("%s", %d, %s) = "%s"', (text, start, end, expected) => {
      expect(sliceByWidth(text, start, end)).toBe(expected)
    })
  })

  describe("stripAnsi", () => {
    test.each([
      ["\x1b[31mred\x1b[0m", "red"],
      ["\x1b[1m\x1b[32mbold green\x1b[0m", "bold green"],
      ["plain", "plain"],
      ["\x1b[4:3mwavy\x1b[4:0m", "wavy"],
      ["\x1b[58:2::255:0:0mcolored\x1b[59m", "colored"],
      ["\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\", "link"],
    ])("stripAnsi(%j) = %j", (input, expected) => {
      expect(stripAnsi(input)).toBe(expected)
    })
  })

  describe("displayWidthAnsi", () => {
    test("ignores ANSI in width calculation", () => {
      expect(displayWidthAnsi("\x1b[31mhello\x1b[0m")).toBe(5)
    })
  })

  describe("truncateAnsi", () => {
    test("truncates after stripping ANSI", () => {
      const result = truncateAnsi("\x1b[31mhello world\x1b[0m", 8)
      expect(result).toBe("hello w…")
    })
  })

  describe("measureText", () => {
    test.each([
      ["hello", { width: 5, height: 1 }],
      ["hello\nworld!", { width: 6, height: 2 }],
      ["한국어", { width: 6, height: 1 }],
    ])('measureText("%s") = %j', (text, expected) => {
      expect(measureText(text)).toEqual(expected)
    })
  })

  describe("hasWideCharacters", () => {
    test.each([
      ["hello", false],
      ["hello 한국어", true],
    ])('hasWideCharacters("%s") = %s', (text, expected) => {
      expect(hasWideCharacters(text)).toBe(expected)
    })
  })

  describe("hasZeroWidthCharacters", () => {
    test.each([
      ["hello", false],
      ["\u0301", true], // standalone combining char
      ["cafe\u0301", false], // combining char merges with base
    ])('hasZeroWidthCharacters("%s") = %s', (text, expected) => {
      expect(hasZeroWidthCharacters(text)).toBe(expected)
    })
  })

  describe("isLikelyEmoji", () => {
    test.each([
      ["😀", true],
      ["👨‍👩‍👧", true], // ZWJ emoji
      ["A", false],
    ])('isLikelyEmoji("%s") = %s', (grapheme, expected) => {
      expect(isLikelyEmoji(grapheme)).toBe(expected)
    })
  })

  describe("isCJK", () => {
    test.each([
      ["中", true], // Chinese
      ["あ", true], // Japanese hiragana
      ["한", true], // Korean
      ["A", false], // ASCII
    ])('isCJK("%s") = %s', (char, expected) => {
      expect(isCJK(char)).toBe(expected)
    })
  })

  // ========================================================================
  // CJK Character Width Tests (km-6lkh)
  // Comprehensive tests for double-width CJK character rendering
  // ========================================================================
  describe("CJK Character Width", () => {
    describe("Chinese characters (中文)", () => {
      test.each([
        ["中", 2],
        ["文", 2],
        ["中文测试", 8],
        ["國", 2], // Traditional
        ["語", 2],
        ["繁體中文", 8],
        ["你好世界", 8],
      ])('displayWidth("%s") = %d', (text, expected) => {
        expectWidth(text, expected)
      })

      test.each([
        ["。", 2],
        ["，", 2],
        ["！", 2],
        ["？", 2],
      ])('Chinese punctuation "%s" = %d', (punct, expected) => {
        expectWidth(punct, expected)
      })

      test("Chinese sentence grapheme count", () => {
        expectTextMetrics("你好世界", { width: 8, graphemes: 4 })
      })
    })

    describe("Japanese characters (日本語)", () => {
      test.each([
        ["あ", 2], // Hiragana
        ["い", 2],
        ["ひらがな", 8],
        ["ア", 2], // Katakana
        ["イ", 2],
        ["カタカナ", 8],
        ["日", 2], // Kanji
        ["本", 2],
        ["日本語", 6],
        ["ｱ", 1], // Half-width Katakana
        ["ｲ", 1],
        ["東京", 4],
      ])('displayWidth("%s") = %d', (text, expected) => {
        expectWidth(text, expected)
      })
    })

    describe("Korean characters (한국어)", () => {
      test.each([
        ["한", 2],
        ["국", 2],
        ["어", 2],
        ["한국어", 6],
        ["ㄱ", 2], // Compatibility Jamo are wide
        ["ㅏ", 2],
      ])('displayWidth("%s") = %d', (text, expected) => {
        expectWidth(text, expected)
      })

      test("Korean sentence", () => {
        expectTextMetrics("안녕하세요", { width: 10, graphemes: 5 })
      })
    })

    describe("Mixed CJK and ASCII text", () => {
      test.each([
        ["Hello中文", 9], // 5 + 4
        ["Test日本語", 10], // 4 + 6
        ["Hi한국어", 8], // 2 + 6
        ["2024年", 6], // 4 + 2
        ["中文.", 5], // 4 + 1
      ])('displayWidth("%s") = %d', (text, expected) => {
        expectWidth(text, expected)
      })
    })

    describe("CJK in truncation scenarios", () => {
      test.each([
        ["中文测试", 5],
        ["日本語です", 7],
        ["안녕하세요", 7],
        ["Hello世界", 7],
        ["中文", 3],
        ["中文", 2],
      ])('truncateText("%s", %d) respects width', (text, maxWidth) => {
        expectTruncation(text, maxWidth)
      })
    })

    describe("CJK in wrapping scenarios", () => {
      test.each([
        ["中文测试文本", 5],
        ["日本語テスト", 5],
        ["한국어테스트", 5],
        ["A中B文C", 4],
      ])('wrapText("%s", %d) respects width', (text, width) => {
        const lines = wrapText(text, width)
        expectAllLinesFitWidth(lines, width)
      })
    })

    describe("CJK in padding scenarios", () => {
      test.each([
        ["中文", 8, "left"],
        ["中", 6, "center"],
        ["日本", 8, "right"],
      ] as const)('padText("%s", %d, "%s") has correct width', (text, width, align) => {
        const padded = padText(text, width, align)
        expect(displayWidth(padded)).toBe(width)
      })
    })

    describe("CJK in slice scenarios", () => {
      test.each([
        ["中文测试", 0, 4, "中文", 4],
        ["中文测试", 2, 6, "文测", 4],
        ["A中B文", 1, 4, "中B", undefined],
      ])('sliceByWidth("%s", %d, %d) = "%s"', (text, start, end, expected, expectedWidth) => {
        const result = sliceByWidth(text, start, end)
        expect(result).toBe(expected)
        if (expectedWidth !== undefined) {
          expect(displayWidth(result)).toBe(expectedWidth)
        }
      })
    })

    describe("CJK buffer writing", () => {
      test("writes Chinese to buffer", () => {
        const buffer = new TerminalBuffer(10, 1)
        const endCol = writeTextToBuffer(buffer, 0, 0, "中文")
        expect(endCol).toBe(4)
        expect(buffer.getCell(0, 0).char).toBe("中")
        expect(buffer.getCell(0, 0).wide).toBe(true)
        expect(buffer.getCell(1, 0).continuation).toBe(true)
        expect(buffer.getCell(2, 0).char).toBe("文")
        expect(buffer.getCell(2, 0).wide).toBe(true)
        expect(buffer.getCell(3, 0).continuation).toBe(true)
      })

      test.each([
        ["あい", 4], // Japanese
        ["한글", 4], // Korean
      ])('writes "%s" to buffer with endCol %d', (text, expectedEndCol) => {
        const buffer = new TerminalBuffer(10, 1)
        const endCol = writeTextToBuffer(buffer, 0, 0, text)
        expect(endCol).toBe(expectedEndCol)
        expect(buffer.getCell(0, 0).wide).toBe(true)
        expect(buffer.getCell(2, 0).wide).toBe(true)
      })

      test("truncates CJK in buffer correctly", () => {
        const buffer = new TerminalBuffer(5, 1)
        writeTextTruncated(buffer, 0, 0, "中文测试", 5)
        expect(buffer.getCell(4, 0).char).toBe("…")
      })

      test("handles CJK at buffer edge", () => {
        const buffer = new TerminalBuffer(3, 1)
        writeTextTruncated(buffer, 0, 0, "中文", 3)
        expect(displayWidth(buffer.getCell(0, 0).char)).toBe(2)
      })
    })

    describe("CJK detection functions", () => {
      test.each([
        ["中", true],
        ["漢", true],
        ["あ", true], // Hiragana
        ["ア", true], // Katakana
        ["한", true], // Hangul
      ])('isCJK("%s") = %s', (char, expected) => {
        expect(isCJK(char)).toBe(expected)
      })

      test.each([["中"], ["あ"], ["한"]])('isWideGrapheme("%s") = true', (char) => {
        expect(isWideGrapheme(char)).toBe(true)
      })

      test.each([
        ["Hello中文World", true],
        ["Hello World", false],
      ])('hasWideCharacters("%s") = %s', (text, expected) => {
        expect(hasWideCharacters(text)).toBe(expected)
      })
    })
  })

  // ========================================================================
  // Emoji and ZWJ Sequences Tests (km-lzto)
  // Comprehensive tests for emoji rendering including ZWJ sequences
  // ========================================================================
  describe("Emoji and ZWJ Sequences (km-lzto)", () => {
    describe("Simple emoji", () => {
      test.each([
        ["😀", 2],
        ["🎉", 2],
        ["🔥", 2],
        ["❤️", 2], // with variation selector
        ["😀🎉🔥", 6],
      ])('displayWidth("%s") = %d', (text, expected) => {
        expectWidth(text, expected)
      })

      test("heart emoji grapheme count", () => {
        expectGraphemeCount("❤️", 1)
      })

      test("multiple emoji grapheme count", () => {
        expectGraphemeCount("😀🎉🔥", 3)
      })

      test.each([["😀"], ["❤️"], ["🔥"]])('isLikelyEmoji("%s") = true', (emoji) => {
        expect(isLikelyEmoji(emoji)).toBe(true)
      })
    })

    describe("Skin tone modifiers", () => {
      test.each([
        ["👋🏽", 1, 2],
        ["👍🏻", 1, 2],
        ["✋🏿", 1, 2],
        ["👋🏽👍🏻", 2, 4],
      ])('"%s" has %d grapheme(s) and width %d', (text, graphemes, width) => {
        expectTextMetrics(text, { graphemes, width })
      })

      test("all skin tone variants", () => {
        const skinTones = ["👋🏻", "👋🏼", "👋🏽", "👋🏾", "👋🏿"]
        for (const emoji of skinTones) {
          expectTextMetrics(emoji, { graphemes: 1, width: 2 })
        }
      })
    })

    describe("ZWJ family sequences", () => {
      const family = "👨‍👩‍👧‍👦"
      const couple = "👨‍👩‍👧"
      const manTech = "👨‍💻"
      const womanScientist = "👩‍🔬"
      const rainbow = "🏳️‍🌈"

      test.each([
        [family, 1, 2],
        [couple, 1, 2],
        [manTech, 1, 2],
        [womanScientist, 1, 2],
        [rainbow, 1, 2],
      ])('"%s" has %d grapheme(s) and width %d', (text, graphemes, width) => {
        expectTextMetrics(text, { graphemes, width })
      })
    })

    describe("Flag sequences", () => {
      test.each([
        ["🇺🇸", 1, 2],
        ["🇯🇵", 1, 2],
        ["🇬🇧", 1, 2],
        ["🇺🇸🇯🇵", 2, 4],
      ])('"%s" has %d grapheme(s) and width %d', (text, graphemes, width) => {
        expectTextMetrics(text, { graphemes, width })
      })

      test("flag detection (regional indicators not in emoji heuristic)", () => {
        // Note: isLikelyEmoji uses a simplified heuristic that doesn't
        // include regional indicator symbols (U+1F1E6-U+1F1FF)
        expect(isLikelyEmoji("🇺🇸")).toBe(false)
        expect(isLikelyEmoji("🇯🇵")).toBe(false)
      })
    })

    describe("Emoji in truncation scenarios", () => {
      test("truncates simple emoji", () => {
        const result = truncateText("😀🎉🔥", 5)
        expect(displayWidth(result)).toBeLessThanOrEqual(5)
        expect(result).toContain("…")
      })

      test("truncates emoji preserving grapheme boundaries", () => {
        const result = truncateText("😀🎉🔥", 5)
        expect(graphemeCount(result.replace("…", ""))).toBeLessThanOrEqual(2)
      })

      test("truncates skin tone emoji correctly", () => {
        const result = truncateText("👋🏽👍🏻✋🏿", 5)
        expect(displayWidth(result)).toBeLessThanOrEqual(5)
        const graphemes = splitGraphemes(result.replace("…", ""))
        for (const g of graphemes) {
          expect(displayWidth(g)).toBeGreaterThanOrEqual(1)
        }
      })

      test("truncates ZWJ family sequence correctly", () => {
        const family = "👨‍👩‍👧‍👦"
        const result = truncateText(`${family}🎉`, 3)
        expect(displayWidth(result)).toBeLessThanOrEqual(3)
      })

      test("truncates flag emoji correctly", () => {
        const result = truncateText("🇺🇸🇯🇵🇬🇧", 5)
        expect(displayWidth(result)).toBeLessThanOrEqual(5)
      })

      test("truncates mixed emoji and text", () => {
        const result = truncateText("Hello 😀 World", 10)
        expect(displayWidth(result)).toBeLessThanOrEqual(10)
      })

      test("truncates emoji at exact width boundary", () => {
        expect(truncateText("😀🎉", 4)).toBe("😀🎉")
      })

      test("handles emoji when maxWidth equals emoji width", () => {
        const result = truncateText("😀🎉", 2)
        expect(displayWidth(result)).toBeLessThanOrEqual(2)
      })
    })

    describe("Emoji width calculation", () => {
      test.each([["😀"], ["👋🏽"], ["🇺🇸"]])('isWideGrapheme("%s") = true', (emoji) => {
        expect(isWideGrapheme(emoji)).toBe(true)
      })

      test.each([
        ["Hello 😀 World", true],
        ["Hello World", false],
      ])('hasWideCharacters("%s") = %s', (text, expected) => {
        expect(hasWideCharacters(text)).toBe(expected)
      })

      test.each([
        ["😀🎉", { width: 4, height: 1 }],
        ["Hi 👋🏽", { width: 5, height: 1 }],
        ["👨‍👩‍👧‍👦", { width: 2, height: 1 }],
        ["🇺🇸🇯🇵", { width: 4, height: 1 }],
      ])('measureText("%s") = %j', (text, expected) => {
        expect(measureText(text)).toEqual(expected)
      })
    })

    describe("Emoji in wrapping scenarios", () => {
      test.each([
        ["😀🎉🔥💯", 5],
        ["Hi 😀 there 🎉", 6],
        ["🇺🇸🇯🇵🇬🇧🇫🇷", 5],
      ])('wrapText("%s", %d) respects width', (text, width) => {
        const lines = wrapText(text, width)
        expectAllLinesFitWidth(lines, width)
      })

      test("wraps ZWJ sequences without breaking", () => {
        const family = "👨‍👩‍👧‍👦"
        const lines = wrapText(family + family + family, 5)
        expectAllLinesFitWidth(lines, 5)
        for (const line of lines) {
          const graphemes = splitGraphemes(line)
          for (const g of graphemes) {
            expect(graphemeCount(g)).toBe(1)
          }
        }
      })
    })

    describe("Emoji in padding scenarios", () => {
      test.each([
        ["😀", 6, "left"],
        ["😀", 6, "center"],
        ["🇺🇸", 6, "right"],
        ["👨‍👩‍👧‍👦", 6, "left"],
      ] as const)('padText("%s", %d, "%s") has correct width', (text, width, align) => {
        const padded = padText(text, width, align)
        expect(displayWidth(padded)).toBe(width)
      })
    })

    describe("Emoji in slice scenarios", () => {
      test("slices emoji by width", () => {
        const result = sliceByWidth("😀🎉🔥", 0, 4)
        expect(displayWidth(result)).toBeLessThanOrEqual(4)
      })

      test("slices from middle of emoji string", () => {
        const result = sliceByWidth("😀🎉🔥", 2, 4)
        expect(result).toBe("🎉")
      })

      test("slices mixed emoji and ASCII", () => {
        const result = sliceByWidth("A😀B", 1, 3)
        expect(result).toBe("😀")
      })
    })

    describe("Emoji buffer writing", () => {
      test.each([
        ["😀", 2],
        ["👋🏽", 2],
        ["👨‍👩‍👧‍👦", 2],
        ["🇺🇸", 2],
        ["😀🎉", 4],
      ])('writes "%s" to buffer with endCol %d', (text, expectedEndCol) => {
        const buffer = new TerminalBuffer(10, 1)
        const endCol = writeTextToBuffer(buffer, 0, 0, text)
        expect(endCol).toBe(expectedEndCol)
        expect(buffer.getCell(0, 0).wide).toBe(true)
      })

      test("truncates emoji in buffer correctly", () => {
        const buffer = new TerminalBuffer(5, 1)
        writeTextTruncated(buffer, 0, 0, "😀🎉🔥", 5)
        expect(buffer.getCell(4, 0).char).toBe("…")
      })

      test("handles emoji at buffer edge", () => {
        const buffer = new TerminalBuffer(3, 1)
        writeTextTruncated(buffer, 0, 0, "😀🎉", 3)
        expect(buffer.getCell(0, 0).char).toBe("😀")
        expect(buffer.getCell(2, 0).char).toBe("…")
      })

      test("writes emoji with style", () => {
        const buffer = new TerminalBuffer(10, 1)
        writeTextToBuffer(buffer, 0, 0, "😀", {
          fg: 196,
          bg: null,
          attrs: { bold: true },
        })
        expect(buffer.getCell(0, 0).fg).toBe(196)
        expect(buffer.getCell(0, 0).attrs.bold).toBe(true)
      })
    })

    describe("Edge cases", () => {
      test("empty string", () => {
        expectTextMetrics("", { width: 0, graphemes: 0 })
      })

      test("emoji mixed with CJK", () => {
        expectTextMetrics("你好😀世界", { width: 10, graphemes: 5 })
      })

      test("emoji with ANSI codes", () => {
        const withAnsi = "\x1b[31m😀\x1b[0m"
        expect(displayWidthAnsi(withAnsi)).toBe(2)
      })

      test("keycap sequences", () => {
        const keycap = "1️⃣"
        expect(graphemeCount(keycap)).toBe(1)
        expect(displayWidth(keycap)).toBeGreaterThanOrEqual(1)
      })

      test("emoji presentation selector", () => {
        const emojiStyle = "☺️"
        expect(graphemeCount(emojiStyle)).toBe(1)
      })
    })
  })

  describe("writeTextToBuffer", () => {
    test("writes ASCII text", () => {
      const buffer = new TerminalBuffer(10, 1)
      const endCol = writeTextToBuffer(buffer, 0, 0, "hello")
      expect(endCol).toBe(5)
      expect(buffer.getCell(0, 0).char).toBe("h")
      expect(buffer.getCell(4, 0).char).toBe("o")
    })

    test("writes CJK with wide cells", () => {
      const buffer = new TerminalBuffer(10, 1)
      writeTextToBuffer(buffer, 0, 0, "한")
      expect(buffer.getCell(0, 0).char).toBe("한")
      expect(buffer.getCell(0, 0).wide).toBe(true)
      expect(buffer.getCell(1, 0).continuation).toBe(true)
    })

    test("writes with style", () => {
      const buffer = new TerminalBuffer(10, 1)
      writeTextToBuffer(buffer, 0, 0, "hi", {
        fg: 196,
        bg: null,
        attrs: { bold: true },
      })
      expect(buffer.getCell(0, 0).fg).toBe(196)
      expect(buffer.getCell(0, 0).attrs.bold).toBe(true)
    })

    test("combines zero-width chars with previous", () => {
      const buffer = new TerminalBuffer(10, 1)
      writeTextToBuffer(buffer, 0, 0, "e\u0301")
      expect(buffer.getCell(0, 0).char).toBe("e\u0301")
    })
  })

  describe("writeTextTruncated", () => {
    test("writes without truncation if fits", () => {
      const buffer = new TerminalBuffer(10, 1)
      writeTextTruncated(buffer, 0, 0, "hello", 10)
      expect(buffer.getCell(4, 0).char).toBe("o")
    })

    test("truncates with ellipsis", () => {
      const buffer = new TerminalBuffer(10, 1)
      writeTextTruncated(buffer, 0, 0, "hello world", 6)
      expect(buffer.getCell(5, 0).char).toBe("…")
    })
  })

  // ========================================================================
  // ANSI-aware Truncation Tests (km-jatd)
  // Tests for truncating styled text while handling ANSI escape sequences
  // ========================================================================
  describe("ANSI-aware Truncation (km-jatd)", () => {
    describe("basic styled text truncation", () => {
      test.each([
        ["\x1b[31mhello world\x1b[0m", 8, "hello w…"], // red text
        ["\x1b[1mhello world\x1b[0m", 8, "hello w…"], // bold text
        ["\x1b[4mhello world\x1b[0m", 5, "hell…"], // underlined text
        ["\x1b[32mhi\x1b[0m", 10, "hi"], // no truncation when fits
      ])("truncateAnsi(%j, %d) = %j", (styled, maxWidth, expected) => {
        expect(truncateAnsi(styled, maxWidth)).toBe(expected)
      })
    })

    describe("Chalk-style nested formatting", () => {
      test.each([
        ["\x1b[1m\x1b[31mhello world\x1b[0m", 8, "hello w…"],
        ["\x1b[1m\x1b[4m\x1b[36mdeep nesting\x1b[0m", 6, "deep …"],
        ["\x1b[31mred\x1b[0m \x1b[34mblue\x1b[0m", 6, "red b…"],
      ])("truncateAnsi(%j, %d) = %j", (styled, maxWidth, expected) => {
        expect(truncateAnsi(styled, maxWidth)).toBe(expected)
      })
    })

    describe("mixed styled and unstyled text", () => {
      test.each([
        ["\x1b[31mhello\x1b[0m world", 8, "hello w…"],
        ["hello \x1b[31mworld\x1b[0m", 8, "hello w…"],
        ["a \x1b[31mred\x1b[0m z", 5, "a re…"],
        ["hello world", 8, "hello w…"], // unstyled
      ])("truncateAnsi(%j, %d) = %j", (text, maxWidth, expected) => {
        expect(truncateAnsi(text, maxWidth)).toBe(expected)
      })
    })

    describe("ANSI reset code handling", () => {
      test.each([
        ["\x1b[31mred\x1b[0m normal", 5, "red …"],
        ["\x1b[31mred\x1b[m normal", 5, "red …"], // short form
        ["\x1b[31mred\x1b[0m\x1b[0m\x1b[0m", 3, "red"], // multiple resets
      ])("truncateAnsi(%j, %d) = %j", (styled, maxWidth, expected) => {
        expect(truncateAnsi(styled, maxWidth)).toBe(expected)
      })
    })

    describe("no broken escape sequences in output", () => {
      test("output contains no partial escape sequences", () => {
        const styled = "\x1b[31mhello world\x1b[0m"
        const result = truncateAnsi(styled, 8)
        const partialEscapePattern = /\x1b\[[^m]*$/
        expect(result).not.toMatch(partialEscapePattern)
      })

      test("output contains no orphaned escape character", () => {
        const styled = "\x1b[1m\x1b[31mbold red\x1b[0m"
        const result = truncateAnsi(styled, 5)
        expect(result).not.toMatch(/\x1b$/)
      })

      test.each([
        ["\x1b[38;5;196mhello world\x1b[0m", 8], // 256-color
        ["\x1b[38;2;255;0;0mhello world\x1b[0m", 8], // RGB true color
      ])("color codes do not leak: %j truncated to %d", (styled, maxWidth) => {
        const result = truncateAnsi(styled, maxWidth)
        expect(result).toBe("hello w…")
        expect(result).not.toMatch(/\x1b\[[^m]*$/)
      })
    })

    describe("edge cases", () => {
      test.each([
        ["\x1b[31m\x1b[0m", 5, ""], // empty styled
        ["\x1b[31m\x1b[1m\x1b[0m", 10, ""], // only codes
        ["\x1b[31mhello\x1b[0m", 0, ""], // width 0
        ["\x1b[31mhello\x1b[0m", 1, "…"], // width 1
        ["\x1b[31mhello\x1b[0m", 5, "hello"], // exact fit
      ])("truncateAnsi(%j, %d) = %j", (styled, maxWidth, expected) => {
        expect(truncateAnsi(styled, maxWidth)).toBe(expected)
      })

      test("custom ellipsis with styled text", () => {
        const styled = "\x1b[31mhello world\x1b[0m"
        const result = truncateAnsi(styled, 8, "...")
        expect(result).toBe("hello...")
      })
    })

    describe("stripAnsi baseline verification", () => {
      test.each([
        ["\x1b[31mred\x1b[0m", "red"],
        ["\x1b[1m\x1b[31mbold red\x1b[0m", "bold red"],
        ["\x1b[38;5;196mcolor\x1b[0m", "color"],
        ["\x1b[38;2;255;0;0mrgb\x1b[0m", "rgb"],
        ["\x1b[41mred bg\x1b[0m", "red bg"],
        ["plain text", "plain text"],
      ])("stripAnsi(%j) = %j", (input, expected) => {
        expect(stripAnsi(input)).toBe(expected)
      })
    })

    describe("displayWidthAnsi verification", () => {
      test.each([
        ["\x1b[31mhello\x1b[0m", 5],
        ["\x1b[1m\x1b[31mhello\x1b[0m", 5],
        ["\x1b[31mred\x1b[0m \x1b[34mblue\x1b[0m", 8],
        ["\x1b[31m中文\x1b[0m", 4],
      ])("displayWidthAnsi(%j) = %d", (text, expected) => {
        expect(displayWidthAnsi(text)).toBe(expected)
      })
    })
  })

  // ========================================================================
  // writeLinesToBuffer Tests
  // ========================================================================
  describe("writeLinesToBuffer", () => {
    test("writes multiple lines to buffer", () => {
      const buffer = new TerminalBuffer(10, 3)
      writeLinesToBuffer(buffer, 0, 0, ["hello", "world", "test"])
      expect(buffer.getCell(0, 0).char).toBe("h")
      expect(buffer.getCell(0, 1).char).toBe("w")
      expect(buffer.getCell(0, 2).char).toBe("t")
    })

    test("stops at buffer height", () => {
      const buffer = new TerminalBuffer(10, 2)
      writeLinesToBuffer(buffer, 0, 0, ["line1", "line2", "line3"])
      expect(buffer.getCell(0, 0).char).toBe("l")
      expect(buffer.getCell(0, 1).char).toBe("l")
    })

    test("writes at offset position", () => {
      const buffer = new TerminalBuffer(10, 5)
      writeLinesToBuffer(buffer, 2, 1, ["hi", "there"])
      expect(buffer.getCell(2, 1).char).toBe("h")
      expect(buffer.getCell(3, 1).char).toBe("i")
      expect(buffer.getCell(2, 2).char).toBe("t")
    })

    test("writes with style", () => {
      const buffer = new TerminalBuffer(10, 2)
      writeLinesToBuffer(buffer, 0, 0, ["ab"], {
        fg: 196,
        bg: 45,
        attrs: { bold: true },
      })
      expect(buffer.getCell(0, 0).fg).toBe(196)
      expect(buffer.getCell(0, 0).bg).toBe(45)
      expect(buffer.getCell(0, 0).attrs.bold).toBe(true)
    })

    test("handles empty lines array", () => {
      const buffer = new TerminalBuffer(10, 2)
      writeLinesToBuffer(buffer, 0, 0, [])
      expect(buffer.getCell(0, 0).char).toBe(" ")
    })

    test("handles empty string in lines", () => {
      const buffer = new TerminalBuffer(10, 3)
      writeLinesToBuffer(buffer, 0, 0, ["hello", "", "world"])
      expect(buffer.getCell(0, 0).char).toBe("h")
      expect(buffer.getCell(0, 2).char).toBe("w")
    })

    test("writes CJK lines correctly", () => {
      const buffer = new TerminalBuffer(10, 2)
      writeLinesToBuffer(buffer, 0, 0, ["中文", "日本"])
      expect(buffer.getCell(0, 0).char).toBe("中")
      expect(buffer.getCell(0, 0).wide).toBe(true)
      expect(buffer.getCell(0, 1).char).toBe("日")
      expect(buffer.getCell(0, 1).wide).toBe(true)
    })
  })

  // ========================================================================
  // hasAnsi Tests
  // ========================================================================
  describe("hasAnsi", () => {
    test.each([
      ["\x1b[31mred\x1b[0m", true],
      ["plain text", false],
      ["\x1b[32mgreen", true],
      ["\x1b[1mbold", true],
      ["\x1b[38;5;196mcolor", true],
      ["\x1b[38;2;255;0;0mrgb", true],
      ["", false],
      ["\x1b[0m", true],
      ["\x1b[m", true],
      ["\x1b[31", false], // partial escape
    ])("hasAnsi(%j) = %s", (text, expected) => {
      expect(hasAnsi(text)).toBe(expected)
    })
  })

  // ========================================================================
  // parseAnsiText Tests
  // ========================================================================
  describe("parseAnsiText", () => {
    test("parses plain text as single segment", () => {
      const segments = parseAnsiText("hello")
      expect(segments).toHaveLength(1)
      expect(segments[0]!.text).toBe("hello")
    })

    test.each([
      ["\x1b[31mred\x1b[0m", { fg: 31 }],
      ["\x1b[1mbold\x1b[0m", { bold: true }],
      ["\x1b[2mdim\x1b[0m", { dim: true }],
      ["\x1b[3mitalic\x1b[0m", { italic: true }],
      ["\x1b[4munderline\x1b[0m", { underline: true }],
      ["\x1b[7minverse\x1b[0m", { inverse: true }],
      ["\x1b[44mblue bg\x1b[0m", { bg: 44 }],
      ["\x1b[91mbright red\x1b[0m", { fg: 91 }],
      ["\x1b[101mbright red bg\x1b[0m", { bg: 101 }],
    ])("parses %j with expected style", (input, expectedProps) => {
      const segments = parseAnsiText(input)
      expect(segments).toHaveLength(1)
      for (const [key, value] of Object.entries(expectedProps)) {
        expect(segments[0]![key as keyof (typeof segments)[0]]).toBe(value)
      }
    })

    test("parses 256-color foreground", () => {
      const segments = parseAnsiText("\x1b[38;5;196mcolor\x1b[0m")
      expect(segments).toHaveLength(1)
      expect(segments[0]!.fg).toBe(196)
    })

    test("parses 256-color background", () => {
      const segments = parseAnsiText("\x1b[48;5;27mbg\x1b[0m")
      expect(segments).toHaveLength(1)
      expect(segments[0]!.bg).toBe(27)
    })

    test("parses true color RGB foreground", () => {
      const segments = parseAnsiText("\x1b[38;2;255;128;64mrgb\x1b[0m")
      expect(segments).toHaveLength(1)
      const expectedFg = 0x1000000 | (255 << 16) | (128 << 8) | 64
      expect(segments[0]!.fg).toBe(expectedFg)
    })

    test("parses true color RGB background", () => {
      const segments = parseAnsiText("\x1b[48;2;100;150;200mbg\x1b[0m")
      expect(segments).toHaveLength(1)
      const expectedBg = 0x1000000 | (100 << 16) | (150 << 8) | 200
      expect(segments[0]!.bg).toBe(expectedBg)
    })

    test("parses multiple styled segments", () => {
      const segments = parseAnsiText("\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m")
      expect(segments).toHaveLength(3)
      expect(segments[0]!.text).toBe("red")
      expect(segments[0]!.fg).toBe(31)
      expect(segments[1]!.text).toBe(" ")
      expect(segments[2]!.text).toBe("green")
      expect(segments[2]!.fg).toBe(32)
    })

    test("handles reset (code 0)", () => {
      const segments = parseAnsiText("\x1b[1m\x1b[31mbold red\x1b[0mnormal")
      expect(segments).toHaveLength(2)
      expect(segments[0]!.bold).toBe(true)
      expect(segments[0]!.fg).toBe(31)
      expect(segments[1]!.text).toBe("normal")
      expect(segments[1]!.bold).toBeUndefined()
    })

    test("handles attribute disable codes", () => {
      const segments = parseAnsiText("\x1b[1mbold\x1b[22mnot bold")
      expect(segments).toHaveLength(2)
      expect(segments[0]!.bold).toBe(true)
      expect(segments[1]!.bold).toBe(false)
    })

    test("handles default foreground (code 39)", () => {
      const segments = parseAnsiText("\x1b[31mred\x1b[39mdefault")
      expect(segments).toHaveLength(2)
      expect(segments[0]!.fg).toBe(31)
      expect(segments[1]!.fg).toBeNull()
    })

    test("handles default background (code 49)", () => {
      const segments = parseAnsiText("\x1b[44mbg\x1b[49mdefault")
      expect(segments).toHaveLength(2)
      expect(segments[0]!.bg).toBe(44)
      expect(segments[1]!.bg).toBeNull()
    })

    test("handles BG_OVERRIDE_CODE", () => {
      const segments = parseAnsiText(`\x1b[${BG_OVERRIDE_CODE}mtext`)
      expect(segments).toHaveLength(1)
      expect(segments[0]!.bgOverride).toBe(true)
    })

    test("handles empty string", () => {
      const segments = parseAnsiText("")
      expect(segments).toHaveLength(0)
    })

    test("handles only ANSI codes with no content", () => {
      const segments = parseAnsiText("\x1b[31m\x1b[0m")
      expect(segments).toHaveLength(0)
    })

    test("handles combined codes in single sequence", () => {
      const segments = parseAnsiText("\x1b[1;31mbold red\x1b[0m")
      expect(segments).toHaveLength(1)
      expect(segments[0]!.bold).toBe(true)
      expect(segments[0]!.fg).toBe(31)
    })
  })

  // ========================================================================
  // normalizeText Tests
  // ========================================================================
  describe("normalizeText", () => {
    test.each([
      ["cafe\u0301", "café"], // e + combining acute -> composed
      ["hello world", "hello world"], // already normalized
      ["n\u0303", "ñ"], // n + combining tilde
      ["", ""],
      ["ASCII123", "ASCII123"],
      ["한글", "한글"],
    ])('normalizeText("%s") = "%s"', (input, expected) => {
      expect(normalizeText(input)).toBe(expected)
    })
  })

  // ========================================================================
  // getFirstCodePoint Tests
  // ========================================================================
  describe("getFirstCodePoint", () => {
    test.each([
      ["A", 65],
      ["é", 0x00e9],
      ["😀", 0x1f600], // surrogate pair
      ["中", 0x4e2d],
      ["", 0],
      ["hello", 104], // 'h'
      ["👨‍👩‍👧", 0x1f468], // ZWJ sequence - returns man
      ["🇺🇸", 0x1f1fa], // flag - Regional Indicator U
    ])('getFirstCodePoint("%s") = %d', (text, expected) => {
      expect(getFirstCodePoint(text)).toBe(expected)
    })
  })

  // ========================================================================
  // BG_OVERRIDE_CODE Constant Tests
  // ========================================================================
  describe("BG_OVERRIDE_CODE", () => {
    test("is defined as expected value", () => {
      expect(BG_OVERRIDE_CODE).toBe(9999)
    })

    test("is a number", () => {
      expect(typeof BG_OVERRIDE_CODE).toBe("number")
    })
  })
})
