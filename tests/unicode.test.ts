/**
 * Unicode Tests
 *
 * Tests for Unicode handling: grapheme segmentation, display width,
 * text manipulation, and buffer writing.
 */

import { describe, expect, test } from "bun:test";
import { TerminalBuffer } from "../src/buffer.js";
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
} from "../src/unicode.js";

describe("Unicode", () => {
  describe("splitGraphemes", () => {
    test("splits ASCII text", () => {
      expect(splitGraphemes("hello")).toEqual(["h", "e", "l", "l", "o"]);
    });

    test("splits CJK characters", () => {
      expect(splitGraphemes("한국어")).toEqual(["한", "국", "어"]);
    });

    test("handles combining characters", () => {
      // e + combining acute accent
      const cafe = "cafe\u0301";
      const graphemes = splitGraphemes(cafe);
      expect(graphemes).toHaveLength(4);
      expect(graphemes[3]).toBe("e\u0301");
    });

    test("handles emoji", () => {
      expect(splitGraphemes("😀🎉")).toEqual(["😀", "🎉"]);
    });

    test("handles ZWJ emoji sequences", () => {
      // Family emoji (man + ZWJ + woman + ZWJ + girl)
      const family = "👨‍👩‍👧";
      const graphemes = splitGraphemes(family);
      expect(graphemes).toHaveLength(1);
    });
  });

  describe("graphemeCount", () => {
    test("counts ASCII", () => {
      expect(graphemeCount("hello")).toBe(5);
    });

    test("counts CJK", () => {
      expect(graphemeCount("한국어")).toBe(3);
    });

    test("counts combining as single grapheme", () => {
      expect(graphemeCount("cafe\u0301")).toBe(4);
    });
  });

  describe("displayWidth", () => {
    test("ASCII is 1 column each", () => {
      expect(displayWidth("hello")).toBe(5);
    });

    test("CJK is 2 columns each", () => {
      expect(displayWidth("한국어")).toBe(6);
    });

    test("emoji varies", () => {
      // Most emoji are 2 columns wide in modern terminals
      expect(displayWidth("😀")).toBeGreaterThanOrEqual(1);
    });

    test("combining chars are 0 width", () => {
      // Just the combining acute alone
      expect(displayWidth("\u0301")).toBe(0);
    });
  });

  describe("graphemeWidth", () => {
    test("ASCII grapheme is 1", () => {
      expect(graphemeWidth("A")).toBe(1);
    });

    test("CJK grapheme is 2", () => {
      expect(graphemeWidth("한")).toBe(2);
    });
  });

  describe("isWideGrapheme", () => {
    test("ASCII is not wide", () => {
      expect(isWideGrapheme("A")).toBe(false);
    });

    test("CJK is wide", () => {
      expect(isWideGrapheme("中")).toBe(true);
    });
  });

  describe("isZeroWidthGrapheme", () => {
    test("ASCII is not zero-width", () => {
      expect(isZeroWidthGrapheme("A")).toBe(false);
    });

    test("combining accent is zero-width", () => {
      expect(isZeroWidthGrapheme("\u0301")).toBe(true);
    });
  });

  describe("truncateText", () => {
    test("no truncation if fits", () => {
      expect(truncateText("hello", 10)).toBe("hello");
    });

    test("truncates with ellipsis", () => {
      expect(truncateText("hello world", 8)).toBe("hello w…");
    });

    test("handles CJK truncation", () => {
      const result = truncateText("한국어입니다", 7);
      expect(displayWidth(result)).toBeLessThanOrEqual(7);
      expect(result).toContain("…");
    });

    test("custom ellipsis", () => {
      expect(truncateText("hello world", 8, "...")).toBe("hello...");
    });

    test("empty when maxWidth too small", () => {
      expect(truncateText("hello", 0)).toBe("");
    });
  });

  describe("padText", () => {
    test("pads left (right-aligns content)", () => {
      expect(padText("hi", 5, "left")).toBe("hi   ");
    });

    test("pads right (left-aligns content)", () => {
      expect(padText("hi", 5, "right")).toBe("   hi");
    });

    test("pads center", () => {
      const padded = padText("hi", 6, "center");
      expect(padded).toBe("  hi  ");
    });

    test("no pad if already fits", () => {
      expect(padText("hello", 3)).toBe("hello");
    });

    test("handles CJK padding", () => {
      const padded = padText("한", 5, "left");
      expect(displayWidth(padded)).toBe(5);
    });
  });

  describe("wrapText", () => {
    test("wraps long text at word boundaries", () => {
      const lines = wrapText("hello world test", 6);
      // Word wrapping: breaks at spaces, keeps space at end of line
      expect(lines).toEqual(["hello ", "world ", "test"]);
    });

    test("preserves newlines by default", () => {
      const lines = wrapText("a\nb\nc", 10);
      expect(lines).toEqual(["a", "b", "c"]);
    });

    test("handles empty lines", () => {
      const lines = wrapText("a\n\nb", 10);
      expect(lines).toEqual(["a", "", "b"]);
    });

    test("wraps CJK correctly", () => {
      const lines = wrapText("한국어입니다", 5);
      // Each CJK char is 2 cols, so max 2 per line
      for (const line of lines) {
        expect(displayWidth(line)).toBeLessThanOrEqual(5);
      }
    });

    test("returns empty for width 0", () => {
      expect(wrapText("hello", 0)).toEqual([]);
    });
  });

  // ========================================================================
  // Word Wrapping Tests (km-0c2i)
  // Comprehensive tests for word-boundary wrapping behavior
  // ========================================================================
  describe("Word Wrapping (km-0c2i)", () => {
    describe("basic word boundary wrapping", () => {
      test("wraps at space boundaries", () => {
        const lines = wrapText("the quick brown fox", 10);
        // Should break at word boundaries
        expect(lines).toEqual(["the quick ", "brown fox"]);
      });

      test("wraps at hyphen boundaries", () => {
        const lines = wrapText("well-known fact", 8);
        // Should break after hyphen
        expect(lines).toEqual(["well-", "known ", "fact"]);
      });

      test("wraps multiple words correctly", () => {
        const lines = wrapText("one two three four five", 8);
        expect(lines).toEqual(["one two ", "three ", "four ", "five"]);
      });

      test("keeps word together when it fits", () => {
        const lines = wrapText("hello world", 11);
        // "hello world" is exactly 11 chars, should fit on one line
        expect(lines).toEqual(["hello world"]);
      });

      test("handles trailing space", () => {
        const lines = wrapText("hello ", 10);
        expect(lines).toEqual(["hello "]);
      });

      test("handles leading space", () => {
        const lines = wrapText(" hello", 10);
        expect(lines).toEqual([" hello"]);
      });
    });

    describe("character fallback for long words", () => {
      test("falls back to character wrap for word longer than width", () => {
        const lines = wrapText("supercalifragilistic", 5);
        // Must break mid-word
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(5);
        }
        // Should have multiple lines
        expect(lines.length).toBeGreaterThan(1);
      });

      test("wraps long word then continues with normal word wrap", () => {
        const lines = wrapText("supercalifragilistic is a word", 8);
        // First breaks the long word, then wraps remaining at word boundaries
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(8);
        }
      });

      test("handles single very long word", () => {
        const lines = wrapText("abcdefghij", 3);
        expect(lines).toEqual(["abc", "def", "ghi", "j"]);
      });
    });

    describe("CJK text (can break anywhere)", () => {
      test("CJK text breaks at any character boundary", () => {
        // CJK doesn't use spaces, so any character is a valid break point
        const lines = wrapText("中文测试文本", 5);
        // Each CJK char is 2 cols, so max 2 chars per line with width 5
        expect(lines.length).toBeGreaterThan(0);
        expect(lines[0]).toBe("中文");
        expect(displayWidth(lines[0] ?? "")).toBeLessThanOrEqual(5);
      });

      test("mixed CJK and ASCII wraps intelligently", () => {
        const lines = wrapText("Hello中文World", 7);
        // Should break before/after CJK characters
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(7);
        }
      });

      test("Japanese text breaks correctly", () => {
        const lines = wrapText("日本語テスト", 5);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(5);
        }
      });

      test("Korean text breaks correctly", () => {
        const lines = wrapText("안녕하세요세상", 6);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(6);
        }
      });
    });

    describe("preserving intentional line breaks", () => {
      test("preserves single newline", () => {
        const lines = wrapText("hello\nworld", 20);
        expect(lines).toEqual(["hello", "world"]);
      });

      test("preserves multiple newlines (empty lines)", () => {
        const lines = wrapText("hello\n\n\nworld", 20);
        expect(lines).toEqual(["hello", "", "", "world"]);
      });

      test("combines newlines with word wrapping", () => {
        const lines = wrapText("hello world\nfoo bar", 7);
        // First line wraps at word boundary, second line fits exactly
        expect(lines).toEqual(["hello ", "world", "foo bar"]);
      });

      test("preserveNewlines=false collapses newlines to spaces", () => {
        const lines = wrapText("hello\nworld", 20, false);
        expect(lines).toEqual(["hello world"]);
      });
    });

    describe("edge cases", () => {
      test("empty string", () => {
        const lines = wrapText("", 10);
        expect(lines).toEqual([""]);
      });

      test("single character", () => {
        const lines = wrapText("a", 10);
        expect(lines).toEqual(["a"]);
      });

      test("single space", () => {
        const lines = wrapText(" ", 10);
        expect(lines).toEqual([" "]);
      });

      test("only spaces", () => {
        const lines = wrapText("     ", 3);
        // Spaces are break points, so should wrap
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(3);
        }
      });

      test("width of 1", () => {
        const lines = wrapText("abc", 1);
        expect(lines).toEqual(["a", "b", "c"]);
      });

      test("width equals content width", () => {
        const lines = wrapText("hello", 5);
        expect(lines).toEqual(["hello"]);
      });

      test("consecutive spaces", () => {
        const lines = wrapText("hello  world", 8);
        // Should handle double space
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(8);
        }
      });

      test("tab characters as word boundaries", () => {
        const lines = wrapText("hello\tworld", 8);
        // Tab should be a break point
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(8);
        }
      });
    });

    describe("mixed content", () => {
      test("ASCII, CJK, and emoji mixed", () => {
        const lines = wrapText("Hello 中文 😀 World", 10);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(10);
        }
      });

      test("numbers and text", () => {
        const lines = wrapText("Count: 12345 items", 8);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(8);
        }
      });

      test("punctuation handling", () => {
        const lines = wrapText("Hello, world! How are you?", 10);
        // Punctuation stays with its word
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(10);
        }
      });
    });

    describe("hyphenation behavior", () => {
      test("breaks after hyphen in hyphenated word", () => {
        const lines = wrapText("self-contained unit", 10);
        // Should prefer break after hyphen
        expect(lines[0]).toContain("self-");
      });

      test("multiple hyphens in text", () => {
        const lines = wrapText("well-known well-tested", 8);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(8);
        }
      });

      test("hyphen at end of word", () => {
        const lines = wrapText("end- start", 6);
        expect(lines).toEqual(["end- ", "start"]);
      });
    });
  });

  describe("sliceByWidth", () => {
    test("slices ASCII", () => {
      expect(sliceByWidth("hello", 1, 4)).toBe("ell");
    });

    test("slices CJK", () => {
      expect(sliceByWidth("한국어", 0, 4)).toBe("한국");
    });

    test("slice from start", () => {
      expect(sliceByWidth("hello", 0, 3)).toBe("hel");
    });

    test("slice to end", () => {
      expect(sliceByWidth("hello", 2)).toBe("llo");
    });
  });

  describe("stripAnsi", () => {
    test("strips color codes", () => {
      expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
    });

    test("strips multiple codes", () => {
      expect(stripAnsi("\x1b[1m\x1b[32mbold green\x1b[0m")).toBe("bold green");
    });

    test("preserves plain text", () => {
      expect(stripAnsi("plain")).toBe("plain");
    });
  });

  describe("stripAnsi with extended codes", () => {
    test("strips extended SGR codes (underline styles)", () => {
      expect(stripAnsi("\x1b[4:3mwavy\x1b[4:0m")).toBe("wavy");
    });

    test("strips underline color codes", () => {
      expect(stripAnsi("\x1b[58:2::255:0:0mcolored\x1b[59m")).toBe("colored");
    });

    test("strips OSC 8 hyperlinks", () => {
      expect(
        stripAnsi("\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\"),
      ).toBe("link");
    });
  });

  describe("displayWidthAnsi", () => {
    test("ignores ANSI in width calculation", () => {
      expect(displayWidthAnsi("\x1b[31mhello\x1b[0m")).toBe(5);
    });
  });

  describe("truncateAnsi", () => {
    test("truncates after stripping ANSI", () => {
      const result = truncateAnsi("\x1b[31mhello world\x1b[0m", 8);
      expect(result).toBe("hello w…");
    });
  });

  describe("measureText", () => {
    test("measures single line", () => {
      expect(measureText("hello")).toEqual({ width: 5, height: 1 });
    });

    test("measures multi-line", () => {
      expect(measureText("hello\nworld!")).toEqual({ width: 6, height: 2 });
    });

    test("measures CJK", () => {
      expect(measureText("한국어")).toEqual({ width: 6, height: 1 });
    });
  });

  describe("hasWideCharacters", () => {
    test("false for ASCII", () => {
      expect(hasWideCharacters("hello")).toBe(false);
    });

    test("true for CJK", () => {
      expect(hasWideCharacters("hello 한국어")).toBe(true);
    });
  });

  describe("hasZeroWidthCharacters", () => {
    test("false for normal text", () => {
      expect(hasZeroWidthCharacters("hello")).toBe(false);
    });

    test("true for standalone combining chars", () => {
      // A standalone combining character is zero-width
      expect(hasZeroWidthCharacters("\u0301")).toBe(true);
    });

    test("false when combining char merges with base", () => {
      // When combining char merges into grapheme, it's not detected separately
      // This is expected behavior since splitGraphemes groups them together
      expect(hasZeroWidthCharacters("cafe\u0301")).toBe(false);
    });
  });

  describe("isLikelyEmoji", () => {
    test("detects basic emoji", () => {
      expect(isLikelyEmoji("😀")).toBe(true);
    });

    test("detects ZWJ emoji", () => {
      expect(isLikelyEmoji("👨‍👩‍👧")).toBe(true);
    });

    test("false for ASCII", () => {
      expect(isLikelyEmoji("A")).toBe(false);
    });
  });

  describe("isCJK", () => {
    test("detects Chinese", () => {
      expect(isCJK("中")).toBe(true);
    });

    test("detects Japanese hiragana", () => {
      expect(isCJK("あ")).toBe(true);
    });

    test("detects Korean", () => {
      expect(isCJK("한")).toBe(true);
    });

    test("false for ASCII", () => {
      expect(isCJK("A")).toBe(false);
    });
  });

  // ========================================================================
  // CJK Character Width Tests (km-6lkh)
  // Comprehensive tests for double-width CJK character rendering
  // ========================================================================
  describe("CJK Character Width", () => {
    describe("Chinese characters (中文)", () => {
      test("Simplified Chinese characters are 2 columns", () => {
        expect(displayWidth("中")).toBe(2);
        expect(displayWidth("文")).toBe(2);
        expect(displayWidth("中文测试")).toBe(8);
      });

      test("Traditional Chinese characters are 2 columns", () => {
        expect(displayWidth("國")).toBe(2);
        expect(displayWidth("語")).toBe(2);
        expect(displayWidth("繁體中文")).toBe(8);
      });

      test("Chinese punctuation varies in width", () => {
        // Full-width punctuation
        expect(displayWidth("。")).toBe(2);
        expect(displayWidth("，")).toBe(2);
        expect(displayWidth("！")).toBe(2);
        expect(displayWidth("？")).toBe(2);
      });

      test("Chinese sentence renders correctly", () => {
        const sentence = "你好世界";
        expect(displayWidth(sentence)).toBe(8);
        expect(graphemeCount(sentence)).toBe(4);
      });
    });

    describe("Japanese characters (日本語)", () => {
      test("Hiragana characters are 2 columns", () => {
        expect(displayWidth("あ")).toBe(2);
        expect(displayWidth("い")).toBe(2);
        expect(displayWidth("ひらがな")).toBe(8);
      });

      test("Katakana characters are 2 columns", () => {
        expect(displayWidth("ア")).toBe(2);
        expect(displayWidth("イ")).toBe(2);
        expect(displayWidth("カタカナ")).toBe(8);
      });

      test("Kanji characters are 2 columns", () => {
        expect(displayWidth("日")).toBe(2);
        expect(displayWidth("本")).toBe(2);
        expect(displayWidth("日本語")).toBe(6);
      });

      test("Half-width Katakana are 1 column", () => {
        // Half-width katakana (U+FF61-U+FF9F)
        expect(displayWidth("ｱ")).toBe(1);
        expect(displayWidth("ｲ")).toBe(1);
      });

      test("Mixed Japanese text", () => {
        // "Tokyo" in mixed script: 東京（とうきょう）
        const mixed = "東京";
        expect(displayWidth(mixed)).toBe(4);
      });
    });

    describe("Korean characters (한국어)", () => {
      test("Hangul syllables are 2 columns", () => {
        expect(displayWidth("한")).toBe(2);
        expect(displayWidth("국")).toBe(2);
        expect(displayWidth("어")).toBe(2);
        expect(displayWidth("한국어")).toBe(6);
      });

      test("Hangul Jamo (conjoining letters) vary", () => {
        // Modern Hangul Jamo
        expect(displayWidth("ㄱ")).toBe(2); // Compatibility Jamo are wide
        expect(displayWidth("ㅏ")).toBe(2);
      });

      test("Korean sentence", () => {
        const sentence = "안녕하세요";
        expect(displayWidth(sentence)).toBe(10);
        expect(graphemeCount(sentence)).toBe(5);
      });
    });

    describe("Mixed CJK and ASCII text", () => {
      test("ASCII mixed with Chinese", () => {
        expect(displayWidth("Hello中文")).toBe(9); // 5 + 4
      });

      test("ASCII mixed with Japanese", () => {
        expect(displayWidth("Test日本語")).toBe(10); // 4 + 6
      });

      test("ASCII mixed with Korean", () => {
        expect(displayWidth("Hi한국어")).toBe(8); // 2 + 6
      });

      test("Numbers and CJK", () => {
        expect(displayWidth("2024年")).toBe(6); // 4 + 2
      });

      test("CJK with ASCII punctuation", () => {
        expect(displayWidth("中文.")).toBe(5); // 4 + 1
      });
    });

    describe("CJK in truncation scenarios", () => {
      test("truncates Chinese at character boundary", () => {
        const result = truncateText("中文测试", 5);
        // With ellipsis (1 col), we can fit 4 cols = 2 CJK chars
        expect(displayWidth(result)).toBeLessThanOrEqual(5);
        expect(result).toContain("…");
      });

      test("truncates Japanese preserving readability", () => {
        const result = truncateText("日本語です", 7);
        expect(displayWidth(result)).toBeLessThanOrEqual(7);
        expect(result).toContain("…");
      });

      test("truncates Korean correctly", () => {
        const result = truncateText("안녕하세요", 7);
        expect(displayWidth(result)).toBeLessThanOrEqual(7);
        expect(result).toContain("…");
      });

      test("truncates mixed CJK/ASCII", () => {
        const result = truncateText("Hello世界", 7);
        expect(displayWidth(result)).toBeLessThanOrEqual(7);
      });

      test("truncation handles odd width with CJK", () => {
        // Width 3: can fit 1 CJK char (2) + ellipsis (1)
        const result = truncateText("中文", 3);
        expect(displayWidth(result)).toBeLessThanOrEqual(3);
      });

      test("truncation at width 2 with CJK", () => {
        // Width 2: can only fit ellipsis or 1 CJK char
        const result = truncateText("中文", 2);
        expect(displayWidth(result)).toBeLessThanOrEqual(2);
      });
    });

    describe("CJK in wrapping scenarios", () => {
      test("wraps Chinese text correctly", () => {
        const lines = wrapText("中文测试文本", 5);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(5);
        }
      });

      test("wraps Japanese text correctly", () => {
        const lines = wrapText("日本語テスト", 5);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(5);
        }
      });

      test("wraps Korean text correctly", () => {
        const lines = wrapText("한국어테스트", 5);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(5);
        }
      });

      test("wraps mixed content", () => {
        const lines = wrapText("A中B文C", 4);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(4);
        }
      });
    });

    describe("CJK in padding scenarios", () => {
      test("pads Chinese text correctly", () => {
        const padded = padText("中文", 8, "left");
        expect(displayWidth(padded)).toBe(8);
      });

      test("centers CJK text", () => {
        const padded = padText("中", 6, "center");
        expect(displayWidth(padded)).toBe(6);
      });

      test("right-aligns CJK text", () => {
        const padded = padText("日本", 8, "right");
        expect(displayWidth(padded)).toBe(8);
      });
    });

    describe("CJK in slice scenarios", () => {
      test("slices Chinese text by width", () => {
        const result = sliceByWidth("中文测试", 0, 4);
        expect(result).toBe("中文");
        expect(displayWidth(result)).toBe(4);
      });

      test("slices from middle of CJK text", () => {
        const result = sliceByWidth("中文测试", 2, 6);
        expect(result).toBe("文测");
        expect(displayWidth(result)).toBe(4);
      });

      test("slices mixed CJK/ASCII", () => {
        const result = sliceByWidth("A中B文", 1, 4);
        expect(result).toBe("中B");
      });
    });

    describe("CJK buffer writing", () => {
      test("writes Chinese to buffer", () => {
        const buffer = new TerminalBuffer(10, 1);
        const endCol = writeTextToBuffer(buffer, 0, 0, "中文");
        expect(endCol).toBe(4);
        expect(buffer.getCell(0, 0).char).toBe("中");
        expect(buffer.getCell(0, 0).wide).toBe(true);
        expect(buffer.getCell(1, 0).continuation).toBe(true);
        expect(buffer.getCell(2, 0).char).toBe("文");
        expect(buffer.getCell(2, 0).wide).toBe(true);
        expect(buffer.getCell(3, 0).continuation).toBe(true);
      });

      test("writes Japanese to buffer", () => {
        const buffer = new TerminalBuffer(10, 1);
        const endCol = writeTextToBuffer(buffer, 0, 0, "あい");
        expect(endCol).toBe(4);
        expect(buffer.getCell(0, 0).wide).toBe(true);
        expect(buffer.getCell(2, 0).wide).toBe(true);
      });

      test("writes Korean to buffer", () => {
        const buffer = new TerminalBuffer(10, 1);
        const endCol = writeTextToBuffer(buffer, 0, 0, "한글");
        expect(endCol).toBe(4);
        expect(buffer.getCell(0, 0).wide).toBe(true);
        expect(buffer.getCell(2, 0).wide).toBe(true);
      });

      test("truncates CJK in buffer correctly", () => {
        const buffer = new TerminalBuffer(5, 1);
        writeTextTruncated(buffer, 0, 0, "中文测试", 5);
        // Should fit 2 CJK chars (4 cols) + ellipsis (1 col) = 5
        expect(buffer.getCell(4, 0).char).toBe("…");
      });

      test("handles CJK at buffer edge", () => {
        const buffer = new TerminalBuffer(3, 1);
        // Width 3 can fit 1 CJK char (2) + something
        writeTextTruncated(buffer, 0, 0, "中文", 3);
        expect(displayWidth(buffer.getCell(0, 0).char)).toBe(2);
      });
    });

    describe("CJK detection functions", () => {
      test("isCJK detects all CJK ranges", () => {
        // CJK Unified Ideographs
        expect(isCJK("中")).toBe(true);
        expect(isCJK("漢")).toBe(true);
        // Hiragana
        expect(isCJK("あ")).toBe(true);
        // Katakana
        expect(isCJK("ア")).toBe(true);
        // Hangul
        expect(isCJK("한")).toBe(true);
      });

      test("isWideGrapheme for CJK", () => {
        expect(isWideGrapheme("中")).toBe(true);
        expect(isWideGrapheme("あ")).toBe(true);
        expect(isWideGrapheme("한")).toBe(true);
      });

      test("hasWideCharacters detects CJK in string", () => {
        expect(hasWideCharacters("Hello中文World")).toBe(true);
        expect(hasWideCharacters("Hello World")).toBe(false);
      });
    });
  });

  // ========================================================================
  // Emoji and ZWJ Sequences Tests (km-lzto)
  // Comprehensive tests for emoji rendering including ZWJ sequences
  // ========================================================================
  describe("Emoji and ZWJ Sequences (km-lzto)", () => {
    describe("Simple emoji", () => {
      test("basic emoji are 2 columns", () => {
        expect(displayWidth("😀")).toBe(2);
        expect(displayWidth("🎉")).toBe(2);
        expect(displayWidth("🔥")).toBe(2);
      });

      test("heart emoji with variation selector", () => {
        // ❤️ is ❤ (U+2764) + variation selector (U+FE0F)
        expect(displayWidth("❤️")).toBe(2);
        expect(graphemeCount("❤️")).toBe(1);
      });

      test("multiple simple emoji", () => {
        expect(displayWidth("😀🎉🔥")).toBe(6);
        expect(graphemeCount("😀🎉🔥")).toBe(3);
      });

      test("emoji detection", () => {
        expect(isLikelyEmoji("😀")).toBe(true);
        expect(isLikelyEmoji("❤️")).toBe(true);
        expect(isLikelyEmoji("🔥")).toBe(true);
      });
    });

    describe("Skin tone modifiers", () => {
      test("waving hand with skin tone is single grapheme", () => {
        // 👋🏽 = 👋 (U+1F44B) + 🏽 (U+1F3FD)
        expect(graphemeCount("👋🏽")).toBe(1);
        expect(splitGraphemes("👋🏽")).toHaveLength(1);
      });

      test("skin tone emoji are 2 columns", () => {
        expect(displayWidth("👋🏽")).toBe(2);
        expect(displayWidth("👍🏻")).toBe(2);
        expect(displayWidth("✋🏿")).toBe(2);
      });

      test("multiple skin tone emoji", () => {
        expect(displayWidth("👋🏽👍🏻")).toBe(4);
        expect(graphemeCount("👋🏽👍🏻")).toBe(2);
      });

      test("all skin tone variants", () => {
        const skinTones = ["👋🏻", "👋🏼", "👋🏽", "👋🏾", "👋🏿"];
        for (const emoji of skinTones) {
          expect(graphemeCount(emoji)).toBe(1);
          expect(displayWidth(emoji)).toBe(2);
        }
      });
    });

    describe("ZWJ family sequences", () => {
      test("family emoji is single grapheme", () => {
        // 👨‍👩‍👧‍👦 = man + ZWJ + woman + ZWJ + girl + ZWJ + boy
        const family = "👨‍👩‍👧‍👦";
        expect(graphemeCount(family)).toBe(1);
        expect(splitGraphemes(family)).toHaveLength(1);
      });

      test("family emoji width", () => {
        const family = "👨‍👩‍👧‍👦";
        // ZWJ sequences are typically rendered as 2 columns
        expect(displayWidth(family)).toBe(2);
      });

      test("couple emoji sequences", () => {
        // 👨‍👩‍👧 = man + ZWJ + woman + ZWJ + girl
        const couple = "👨‍👩‍👧";
        expect(graphemeCount(couple)).toBe(1);
        expect(displayWidth(couple)).toBe(2);
      });

      test("professional ZWJ sequences", () => {
        // 👨‍💻 = man + ZWJ + laptop
        const manTech = "👨‍💻";
        expect(graphemeCount(manTech)).toBe(1);
        expect(displayWidth(manTech)).toBe(2);

        // 👩‍🔬 = woman + ZWJ + microscope
        const womanScientist = "👩‍🔬";
        expect(graphemeCount(womanScientist)).toBe(1);
        expect(displayWidth(womanScientist)).toBe(2);
      });

      test("rainbow flag ZWJ sequence", () => {
        // 🏳️‍🌈 = white flag + VS16 + ZWJ + rainbow
        const rainbow = "🏳️‍🌈";
        expect(graphemeCount(rainbow)).toBe(1);
        expect(displayWidth(rainbow)).toBe(2);
      });
    });

    describe("Flag sequences", () => {
      test("US flag is single grapheme", () => {
        // 🇺🇸 = Regional Indicator U + Regional Indicator S
        expect(graphemeCount("🇺🇸")).toBe(1);
        expect(splitGraphemes("🇺🇸")).toHaveLength(1);
      });

      test("flag emoji are 2 columns", () => {
        expect(displayWidth("🇺🇸")).toBe(2);
        expect(displayWidth("🇯🇵")).toBe(2);
        expect(displayWidth("🇬🇧")).toBe(2);
      });

      test("multiple flags", () => {
        expect(displayWidth("🇺🇸🇯🇵")).toBe(4);
        expect(graphemeCount("🇺🇸🇯🇵")).toBe(2);
      });

      test("flag detection (regional indicators not in emoji heuristic)", () => {
        // Note: isLikelyEmoji uses a simplified heuristic that doesn't
        // include regional indicator symbols (U+1F1E6-U+1F1FF)
        // Flags are correctly handled by grapheme segmentation though
        expect(isLikelyEmoji("🇺🇸")).toBe(false);
        expect(isLikelyEmoji("🇯🇵")).toBe(false);
      });
    });

    describe("Emoji in truncation scenarios", () => {
      test("truncates simple emoji", () => {
        const result = truncateText("😀🎉🔥", 5);
        expect(displayWidth(result)).toBeLessThanOrEqual(5);
        expect(result).toContain("…");
      });

      test("truncates emoji preserving grapheme boundaries", () => {
        // 6 cols total, truncate to 5 = 2 emoji (4 cols) + ellipsis (1)
        const result = truncateText("😀🎉🔥", 5);
        expect(graphemeCount(result.replace("…", ""))).toBeLessThanOrEqual(2);
      });

      test("truncates skin tone emoji correctly", () => {
        const result = truncateText("👋🏽👍🏻✋🏿", 5);
        expect(displayWidth(result)).toBeLessThanOrEqual(5);
        // Should not break skin tone sequence
        const graphemes = splitGraphemes(result.replace("…", ""));
        for (const g of graphemes) {
          // Each should be a complete emoji
          expect(displayWidth(g)).toBeGreaterThanOrEqual(1);
        }
      });

      test("truncates ZWJ family sequence correctly", () => {
        const family = "👨‍👩‍👧‍👦";
        // Family is 2 cols, so with ellipsis fits in 3
        const result = truncateText(`${family}🎉`, 3);
        expect(displayWidth(result)).toBeLessThanOrEqual(3);
      });

      test("truncates flag emoji correctly", () => {
        const result = truncateText("🇺🇸🇯🇵🇬🇧", 5);
        expect(displayWidth(result)).toBeLessThanOrEqual(5);
      });

      test("truncates mixed emoji and text", () => {
        const result = truncateText("Hello 😀 World", 10);
        expect(displayWidth(result)).toBeLessThanOrEqual(10);
      });

      test("truncates emoji at exact width boundary", () => {
        // Exactly 4 cols = 2 emoji, should not truncate
        expect(truncateText("😀🎉", 4)).toBe("😀🎉");
      });

      test("handles emoji when maxWidth equals emoji width", () => {
        // Width 2 = 1 emoji, no room for ellipsis
        const result = truncateText("😀🎉", 2);
        expect(displayWidth(result)).toBeLessThanOrEqual(2);
      });
    });

    describe("Emoji width calculation", () => {
      test("isWideGrapheme for emoji", () => {
        expect(isWideGrapheme("😀")).toBe(true);
        expect(isWideGrapheme("👋🏽")).toBe(true);
        expect(isWideGrapheme("🇺🇸")).toBe(true);
      });

      test("hasWideCharacters detects emoji in string", () => {
        expect(hasWideCharacters("Hello 😀 World")).toBe(true);
        expect(hasWideCharacters("Hello World")).toBe(false);
      });

      test("measureText with emoji", () => {
        expect(measureText("😀🎉")).toEqual({ width: 4, height: 1 });
        expect(measureText("Hi 👋🏽")).toEqual({ width: 5, height: 1 });
      });

      test("measureText with ZWJ sequence", () => {
        const family = "👨‍👩‍👧‍👦";
        expect(measureText(family)).toEqual({ width: 2, height: 1 });
      });

      test("measureText with flags", () => {
        expect(measureText("🇺🇸🇯🇵")).toEqual({ width: 4, height: 1 });
      });
    });

    describe("Emoji in wrapping scenarios", () => {
      test("wraps emoji correctly", () => {
        const lines = wrapText("😀🎉🔥💯", 5);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(5);
        }
      });

      test("wraps mixed emoji and text", () => {
        const lines = wrapText("Hi 😀 there 🎉", 6);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(6);
        }
      });

      test("wraps ZWJ sequences without breaking", () => {
        const family = "👨‍👩‍👧‍👦";
        const lines = wrapText(family + family + family, 5);
        // Each family is 2 cols, so 2 per line max in width 5
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(5);
          // Verify ZWJ sequences weren't broken
          const graphemes = splitGraphemes(line);
          for (const g of graphemes) {
            expect(graphemeCount(g)).toBe(1);
          }
        }
      });

      test("wraps flag sequences without breaking", () => {
        const lines = wrapText("🇺🇸🇯🇵🇬🇧🇫🇷", 5);
        for (const line of lines) {
          expect(displayWidth(line)).toBeLessThanOrEqual(5);
        }
      });
    });

    describe("Emoji in padding scenarios", () => {
      test("pads emoji text correctly", () => {
        const padded = padText("😀", 6, "left");
        expect(displayWidth(padded)).toBe(6);
      });

      test("centers emoji text", () => {
        const padded = padText("😀", 6, "center");
        expect(displayWidth(padded)).toBe(6);
      });

      test("right-aligns emoji text", () => {
        const padded = padText("🇺🇸", 6, "right");
        expect(displayWidth(padded)).toBe(6);
      });

      test("pads ZWJ sequence correctly", () => {
        const family = "👨‍👩‍👧‍👦";
        const padded = padText(family, 6, "left");
        expect(displayWidth(padded)).toBe(6);
      });
    });

    describe("Emoji in slice scenarios", () => {
      test("slices emoji by width", () => {
        const result = sliceByWidth("😀🎉🔥", 0, 4);
        expect(displayWidth(result)).toBeLessThanOrEqual(4);
      });

      test("slices from middle of emoji string", () => {
        const result = sliceByWidth("😀🎉🔥", 2, 4);
        // Starting at col 2, taking 2 cols = 1 emoji
        expect(result).toBe("🎉");
      });

      test("slices mixed emoji and ASCII", () => {
        const result = sliceByWidth("A😀B", 1, 3);
        // From col 1 (😀 starts), taking 2 cols
        expect(result).toBe("😀");
      });
    });

    describe("Emoji buffer writing", () => {
      test("writes simple emoji to buffer", () => {
        const buffer = new TerminalBuffer(10, 1);
        const endCol = writeTextToBuffer(buffer, 0, 0, "😀");
        expect(endCol).toBe(2);
        expect(buffer.getCell(0, 0).char).toBe("😀");
        expect(buffer.getCell(0, 0).wide).toBe(true);
        expect(buffer.getCell(1, 0).continuation).toBe(true);
      });

      test("writes skin tone emoji to buffer", () => {
        const buffer = new TerminalBuffer(10, 1);
        const endCol = writeTextToBuffer(buffer, 0, 0, "👋🏽");
        expect(endCol).toBe(2);
        expect(buffer.getCell(0, 0).char).toBe("👋🏽");
        expect(buffer.getCell(0, 0).wide).toBe(true);
      });

      test("writes ZWJ family to buffer", () => {
        const buffer = new TerminalBuffer(10, 1);
        const family = "👨‍👩‍👧‍👦";
        const endCol = writeTextToBuffer(buffer, 0, 0, family);
        expect(endCol).toBe(2);
        expect(buffer.getCell(0, 0).char).toBe(family);
        expect(buffer.getCell(0, 0).wide).toBe(true);
      });

      test("writes flag emoji to buffer", () => {
        const buffer = new TerminalBuffer(10, 1);
        const endCol = writeTextToBuffer(buffer, 0, 0, "🇺🇸");
        expect(endCol).toBe(2);
        expect(buffer.getCell(0, 0).char).toBe("🇺🇸");
        expect(buffer.getCell(0, 0).wide).toBe(true);
      });

      test("writes multiple emoji to buffer", () => {
        const buffer = new TerminalBuffer(10, 1);
        const endCol = writeTextToBuffer(buffer, 0, 0, "😀🎉");
        expect(endCol).toBe(4);
        expect(buffer.getCell(0, 0).char).toBe("😀");
        expect(buffer.getCell(2, 0).char).toBe("🎉");
      });

      test("truncates emoji in buffer correctly", () => {
        const buffer = new TerminalBuffer(5, 1);
        writeTextTruncated(buffer, 0, 0, "😀🎉🔥", 5);
        // Should fit 2 emoji (4 cols) + ellipsis (1 col) = 5
        expect(buffer.getCell(4, 0).char).toBe("…");
      });

      test("handles emoji at buffer edge", () => {
        const buffer = new TerminalBuffer(3, 1);
        writeTextTruncated(buffer, 0, 0, "😀🎉", 3);
        // Width 3 = 1 emoji (2 cols) + ellipsis (1 col)
        expect(buffer.getCell(0, 0).char).toBe("😀");
        expect(buffer.getCell(2, 0).char).toBe("…");
      });

      test("writes emoji with style", () => {
        const buffer = new TerminalBuffer(10, 1);
        writeTextToBuffer(buffer, 0, 0, "😀", {
          fg: 196,
          bg: null,
          attrs: { bold: true },
        });
        expect(buffer.getCell(0, 0).fg).toBe(196);
        expect(buffer.getCell(0, 0).attrs.bold).toBe(true);
      });
    });

    describe("Edge cases", () => {
      test("empty string", () => {
        expect(displayWidth("")).toBe(0);
        expect(graphemeCount("")).toBe(0);
      });

      test("emoji mixed with CJK", () => {
        const mixed = "你好😀世界";
        expect(displayWidth(mixed)).toBe(10); // 4 + 2 + 4
        expect(graphemeCount(mixed)).toBe(5);
      });

      test("emoji with ANSI codes", () => {
        const withAnsi = "\x1b[31m😀\x1b[0m";
        expect(displayWidthAnsi(withAnsi)).toBe(2);
      });

      test("keycap sequences", () => {
        // 1️⃣ = 1 + VS16 + combining enclosing keycap
        const keycap = "1️⃣";
        expect(graphemeCount(keycap)).toBe(1);
        // Width may vary by terminal, but should be reasonable
        expect(displayWidth(keycap)).toBeGreaterThanOrEqual(1);
      });

      test("emoji presentation selector", () => {
        // Some characters have text vs emoji presentation
        // ☺️ = smiling face + VS16 (emoji style)
        const emojiStyle = "☺️";
        expect(graphemeCount(emojiStyle)).toBe(1);
      });
    });
  });

  describe("writeTextToBuffer", () => {
    test("writes ASCII text", () => {
      const buffer = new TerminalBuffer(10, 1);
      const endCol = writeTextToBuffer(buffer, 0, 0, "hello");
      expect(endCol).toBe(5);
      expect(buffer.getCell(0, 0).char).toBe("h");
      expect(buffer.getCell(4, 0).char).toBe("o");
    });

    test("writes CJK with wide cells", () => {
      const buffer = new TerminalBuffer(10, 1);
      writeTextToBuffer(buffer, 0, 0, "한");
      expect(buffer.getCell(0, 0).char).toBe("한");
      expect(buffer.getCell(0, 0).wide).toBe(true);
      expect(buffer.getCell(1, 0).continuation).toBe(true);
    });

    test("writes with style", () => {
      const buffer = new TerminalBuffer(10, 1);
      writeTextToBuffer(buffer, 0, 0, "hi", {
        fg: 196,
        bg: null,
        attrs: { bold: true },
      });
      expect(buffer.getCell(0, 0).fg).toBe(196);
      expect(buffer.getCell(0, 0).attrs.bold).toBe(true);
    });

    test("combines zero-width chars with previous", () => {
      const buffer = new TerminalBuffer(10, 1);
      writeTextToBuffer(buffer, 0, 0, "e\u0301");
      expect(buffer.getCell(0, 0).char).toBe("e\u0301");
    });
  });

  describe("writeTextTruncated", () => {
    test("writes without truncation if fits", () => {
      const buffer = new TerminalBuffer(10, 1);
      writeTextTruncated(buffer, 0, 0, "hello", 10);
      expect(buffer.getCell(4, 0).char).toBe("o");
    });

    test("truncates with ellipsis", () => {
      const buffer = new TerminalBuffer(10, 1);
      writeTextTruncated(buffer, 0, 0, "hello world", 6);
      expect(buffer.getCell(5, 0).char).toBe("…");
    });
  });

  // ========================================================================
  // ANSI-aware Truncation Tests (km-jatd)
  // Tests for truncating styled text while handling ANSI escape sequences
  // ========================================================================
  describe("ANSI-aware Truncation (km-jatd)", () => {
    describe("basic styled text truncation", () => {
      test("truncates red text preserving content", () => {
        const styled = "\x1b[31mhello world\x1b[0m"; // red text
        const result = truncateAnsi(styled, 8);
        // Should truncate to 'hello w…' (8 visible chars)
        expect(result).toBe("hello w…");
        expect(displayWidthAnsi(result)).toBe(8);
      });

      test("truncates bold text", () => {
        const styled = "\x1b[1mhello world\x1b[0m"; // bold text
        const result = truncateAnsi(styled, 8);
        expect(result).toBe("hello w…");
      });

      test("truncates underlined text", () => {
        const styled = "\x1b[4mhello world\x1b[0m"; // underlined text
        const result = truncateAnsi(styled, 5);
        expect(result).toBe("hell…");
      });

      test("no truncation when styled text fits", () => {
        const styled = "\x1b[32mhi\x1b[0m"; // green "hi"
        const result = truncateAnsi(styled, 10);
        expect(result).toBe("hi");
      });
    });

    describe("Chalk-style nested formatting", () => {
      test("truncates bold+red nested styles", () => {
        // Bold + red: \x1b[1m\x1b[31m...\x1b[0m
        const styled = "\x1b[1m\x1b[31mhello world\x1b[0m";
        const result = truncateAnsi(styled, 8);
        expect(result).toBe("hello w…");
        expect(displayWidthAnsi(result)).toBe(8);
      });

      test("truncates deeply nested styles", () => {
        // Bold + underline + cyan
        const styled = "\x1b[1m\x1b[4m\x1b[36mdeep nesting\x1b[0m";
        const result = truncateAnsi(styled, 6);
        expect(result).toBe("deep …");
      });

      test("truncates multiple color changes mid-text", () => {
        // "red" in red, "blue" in blue
        const styled = "\x1b[31mred\x1b[0m \x1b[34mblue\x1b[0m";
        const result = truncateAnsi(styled, 6);
        // Should be "red b…" (6 visible chars)
        expect(result).toBe("red b…");
      });
    });

    describe("mixed styled and unstyled text", () => {
      test("truncates text with styled prefix", () => {
        const styled = "\x1b[31mhello\x1b[0m world";
        const result = truncateAnsi(styled, 8);
        expect(result).toBe("hello w…");
      });

      test("truncates text with styled suffix", () => {
        const styled = "hello \x1b[31mworld\x1b[0m";
        const result = truncateAnsi(styled, 8);
        expect(result).toBe("hello w…");
      });

      test("truncates text with styled middle", () => {
        const styled = "a \x1b[31mred\x1b[0m z";
        const result = truncateAnsi(styled, 5);
        expect(result).toBe("a re…");
      });

      test("handles unstyled text through ANSI function", () => {
        const plain = "hello world";
        const result = truncateAnsi(plain, 8);
        expect(result).toBe("hello w…");
      });
    });

    describe("ANSI reset code handling", () => {
      test("handles SGR reset \x1b[0m", () => {
        const styled = "\x1b[31mred\x1b[0m normal";
        const result = truncateAnsi(styled, 5);
        expect(result).toBe("red …");
      });

      test("handles SGR reset \x1b[m (short form)", () => {
        const styled = "\x1b[31mred\x1b[m normal";
        const result = truncateAnsi(styled, 5);
        expect(result).toBe("red …");
      });

      test("handles multiple resets", () => {
        const styled = "\x1b[31mred\x1b[0m\x1b[0m\x1b[0m";
        const result = truncateAnsi(styled, 3);
        expect(result).toBe("red");
      });
    });

    describe("no broken escape sequences in output", () => {
      test("output contains no partial escape sequences", () => {
        const styled = "\x1b[31mhello world\x1b[0m";
        const result = truncateAnsi(styled, 8);
        // Should not contain partial \x1b[ without closing m
        const partialEscapePattern = /\x1b\[[^m]*$/;
        expect(result).not.toMatch(partialEscapePattern);
      });

      test("output contains no orphaned escape character", () => {
        const styled = "\x1b[1m\x1b[31mbold red\x1b[0m";
        const result = truncateAnsi(styled, 5);
        // Should not end with bare \x1b
        expect(result).not.toMatch(/\x1b$/);
      });

      test("256-color codes do not leak", () => {
        // 256-color red: \x1b[38;5;196m
        const styled = "\x1b[38;5;196mhello world\x1b[0m";
        const result = truncateAnsi(styled, 8);
        expect(result).toBe("hello w…");
        // No partial escape sequence
        expect(result).not.toMatch(/\x1b\[[^m]*$/);
      });

      test("RGB true color codes do not leak", () => {
        // True color red: \x1b[38;2;255;0;0m
        const styled = "\x1b[38;2;255;0;0mhello world\x1b[0m";
        const result = truncateAnsi(styled, 8);
        expect(result).toBe("hello w…");
        expect(result).not.toMatch(/\x1b\[[^m]*$/);
      });
    });

    describe("edge cases", () => {
      test("empty styled text", () => {
        const styled = "\x1b[31m\x1b[0m";
        const result = truncateAnsi(styled, 5);
        expect(result).toBe("");
      });

      test("only ANSI codes, no content", () => {
        const styled = "\x1b[31m\x1b[1m\x1b[0m";
        const result = truncateAnsi(styled, 10);
        expect(result).toBe("");
      });

      test("truncation width 0", () => {
        const styled = "\x1b[31mhello\x1b[0m";
        const result = truncateAnsi(styled, 0);
        expect(result).toBe("");
      });

      test("truncation width 1 (only ellipsis)", () => {
        const styled = "\x1b[31mhello\x1b[0m";
        const result = truncateAnsi(styled, 1);
        expect(result).toBe("…");
      });

      test("styled text exactly at width limit", () => {
        const styled = "\x1b[31mhello\x1b[0m"; // 5 chars
        const result = truncateAnsi(styled, 5);
        expect(result).toBe("hello");
      });

      test("custom ellipsis with styled text", () => {
        const styled = "\x1b[31mhello world\x1b[0m";
        const result = truncateAnsi(styled, 8, "...");
        expect(result).toBe("hello...");
      });
    });

    describe("stripAnsi baseline verification", () => {
      test("strips single color code", () => {
        expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
      });

      test("strips nested codes", () => {
        expect(stripAnsi("\x1b[1m\x1b[31mbold red\x1b[0m")).toBe("bold red");
      });

      test("strips 256-color codes", () => {
        expect(stripAnsi("\x1b[38;5;196mcolor\x1b[0m")).toBe("color");
      });

      test("strips true color RGB codes", () => {
        expect(stripAnsi("\x1b[38;2;255;0;0mrgb\x1b[0m")).toBe("rgb");
      });

      test("strips background color codes", () => {
        expect(stripAnsi("\x1b[41mred bg\x1b[0m")).toBe("red bg");
      });

      test("handles text with no ANSI codes", () => {
        expect(stripAnsi("plain text")).toBe("plain text");
      });
    });

    describe("displayWidthAnsi verification", () => {
      test("calculates width ignoring single style", () => {
        expect(displayWidthAnsi("\x1b[31mhello\x1b[0m")).toBe(5);
      });

      test("calculates width ignoring multiple styles", () => {
        expect(displayWidthAnsi("\x1b[1m\x1b[31mhello\x1b[0m")).toBe(5);
      });

      test("calculates width with mixed styled segments", () => {
        expect(displayWidthAnsi("\x1b[31mred\x1b[0m \x1b[34mblue\x1b[0m")).toBe(
          8,
        ); // "red blue"
      });

      test("calculates width for CJK with ANSI", () => {
        expect(displayWidthAnsi("\x1b[31m中文\x1b[0m")).toBe(4);
      });
    });
  });

  // ========================================================================
  // writeLinesToBuffer Tests
  // ========================================================================
  describe("writeLinesToBuffer", () => {
    test("writes multiple lines to buffer", () => {
      const buffer = new TerminalBuffer(10, 3);
      writeLinesToBuffer(buffer, 0, 0, ["hello", "world", "test"]);
      expect(buffer.getCell(0, 0).char).toBe("h");
      expect(buffer.getCell(0, 1).char).toBe("w");
      expect(buffer.getCell(0, 2).char).toBe("t");
    });

    test("stops at buffer height", () => {
      const buffer = new TerminalBuffer(10, 2);
      writeLinesToBuffer(buffer, 0, 0, ["line1", "line2", "line3"]);
      // Only first 2 lines should be written
      expect(buffer.getCell(0, 0).char).toBe("l");
      expect(buffer.getCell(0, 1).char).toBe("l");
      // Row 2 doesn't exist (buffer height is 2)
    });

    test("writes at offset position", () => {
      const buffer = new TerminalBuffer(10, 5);
      writeLinesToBuffer(buffer, 2, 1, ["hi", "there"]);
      expect(buffer.getCell(2, 1).char).toBe("h");
      expect(buffer.getCell(3, 1).char).toBe("i");
      expect(buffer.getCell(2, 2).char).toBe("t");
    });

    test("writes with style", () => {
      const buffer = new TerminalBuffer(10, 2);
      writeLinesToBuffer(buffer, 0, 0, ["ab"], {
        fg: 196,
        bg: 45,
        attrs: { bold: true },
      });
      expect(buffer.getCell(0, 0).fg).toBe(196);
      expect(buffer.getCell(0, 0).bg).toBe(45);
      expect(buffer.getCell(0, 0).attrs.bold).toBe(true);
    });

    test("handles empty lines array", () => {
      const buffer = new TerminalBuffer(10, 2);
      writeLinesToBuffer(buffer, 0, 0, []);
      // Buffer should remain unchanged
      expect(buffer.getCell(0, 0).char).toBe(" ");
    });

    test("handles empty string in lines", () => {
      const buffer = new TerminalBuffer(10, 3);
      writeLinesToBuffer(buffer, 0, 0, ["hello", "", "world"]);
      expect(buffer.getCell(0, 0).char).toBe("h");
      // Empty line doesn't write anything
      expect(buffer.getCell(0, 2).char).toBe("w");
    });

    test("writes CJK lines correctly", () => {
      const buffer = new TerminalBuffer(10, 2);
      writeLinesToBuffer(buffer, 0, 0, ["中文", "日本"]);
      expect(buffer.getCell(0, 0).char).toBe("中");
      expect(buffer.getCell(0, 0).wide).toBe(true);
      expect(buffer.getCell(0, 1).char).toBe("日");
      expect(buffer.getCell(0, 1).wide).toBe(true);
    });
  });

  // ========================================================================
  // hasAnsi Tests
  // ========================================================================
  describe("hasAnsi", () => {
    test("returns true for text with ANSI codes", () => {
      expect(hasAnsi("\x1b[31mred\x1b[0m")).toBe(true);
    });

    test("returns false for plain text", () => {
      expect(hasAnsi("plain text")).toBe(false);
    });

    test("detects color codes", () => {
      expect(hasAnsi("\x1b[32mgreen")).toBe(true);
    });

    test("detects bold code", () => {
      expect(hasAnsi("\x1b[1mbold")).toBe(true);
    });

    test("detects 256-color codes", () => {
      expect(hasAnsi("\x1b[38;5;196mcolor")).toBe(true);
    });

    test("detects true color RGB codes", () => {
      expect(hasAnsi("\x1b[38;2;255;0;0mrgb")).toBe(true);
    });

    test("returns false for empty string", () => {
      expect(hasAnsi("")).toBe(false);
    });

    test("detects reset-only sequence", () => {
      expect(hasAnsi("\x1b[0m")).toBe(true);
    });

    test("detects short reset sequence", () => {
      expect(hasAnsi("\x1b[m")).toBe(true);
    });

    test("returns false for partial escape (no closing m)", () => {
      // \x1b[ without the final m and parameters isn't a valid SGR sequence
      expect(hasAnsi("\x1b[31")).toBe(false);
    });
  });

  // ========================================================================
  // parseAnsiText Tests
  // ========================================================================
  describe("parseAnsiText", () => {
    test("parses plain text as single segment", () => {
      const segments = parseAnsiText("hello");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.text).toBe("hello");
    });

    test("parses red text", () => {
      const segments = parseAnsiText("\x1b[31mred\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.text).toBe("red");
      expect(segments[0]!.fg).toBe(31);
    });

    test("parses bold text", () => {
      const segments = parseAnsiText("\x1b[1mbold\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.text).toBe("bold");
      expect(segments[0]!.bold).toBe(true);
    });

    test("parses dim text", () => {
      const segments = parseAnsiText("\x1b[2mdim\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.dim).toBe(true);
    });

    test("parses italic text", () => {
      const segments = parseAnsiText("\x1b[3mitalic\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.italic).toBe(true);
    });

    test("parses underlined text", () => {
      const segments = parseAnsiText("\x1b[4munderline\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.underline).toBe(true);
    });

    test("parses inverse text", () => {
      const segments = parseAnsiText("\x1b[7minverse\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.inverse).toBe(true);
    });

    test("parses background color", () => {
      const segments = parseAnsiText("\x1b[44mblue bg\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.bg).toBe(44);
    });

    test("parses bright foreground colors", () => {
      const segments = parseAnsiText("\x1b[91mbright red\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.fg).toBe(91);
    });

    test("parses bright background colors", () => {
      const segments = parseAnsiText("\x1b[101mbright red bg\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.bg).toBe(101);
    });

    test("parses 256-color foreground", () => {
      const segments = parseAnsiText("\x1b[38;5;196mcolor\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.fg).toBe(196);
    });

    test("parses 256-color background", () => {
      const segments = parseAnsiText("\x1b[48;5;27mbg\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.bg).toBe(27);
    });

    test("parses true color RGB foreground", () => {
      const segments = parseAnsiText("\x1b[38;2;255;128;64mrgb\x1b[0m");
      expect(segments).toHaveLength(1);
      // RGB is packed as 0x1000000 | (R << 16) | (G << 8) | B
      const expectedFg = 0x1000000 | (255 << 16) | (128 << 8) | 64;
      expect(segments[0]!.fg).toBe(expectedFg);
    });

    test("parses true color RGB background", () => {
      const segments = parseAnsiText("\x1b[48;2;100;150;200mbg\x1b[0m");
      expect(segments).toHaveLength(1);
      const expectedBg = 0x1000000 | (100 << 16) | (150 << 8) | 200;
      expect(segments[0]!.bg).toBe(expectedBg);
    });

    test("parses multiple styled segments", () => {
      const segments = parseAnsiText("\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m");
      expect(segments).toHaveLength(3);
      expect(segments[0]!.text).toBe("red");
      expect(segments[0]!.fg).toBe(31);
      expect(segments[1]!.text).toBe(" ");
      expect(segments[2]!.text).toBe("green");
      expect(segments[2]!.fg).toBe(32);
    });

    test("handles reset (code 0)", () => {
      const segments = parseAnsiText("\x1b[1m\x1b[31mbold red\x1b[0mnormal");
      expect(segments).toHaveLength(2);
      expect(segments[0]!.bold).toBe(true);
      expect(segments[0]!.fg).toBe(31);
      expect(segments[1]!.text).toBe("normal");
      expect(segments[1]!.bold).toBeUndefined();
    });

    test("handles attribute disable codes", () => {
      const segments = parseAnsiText("\x1b[1mbold\x1b[22mnot bold");
      expect(segments).toHaveLength(2);
      expect(segments[0]!.bold).toBe(true);
      expect(segments[1]!.bold).toBe(false);
    });

    test("handles default foreground (code 39)", () => {
      const segments = parseAnsiText("\x1b[31mred\x1b[39mdefault");
      expect(segments).toHaveLength(2);
      expect(segments[0]!.fg).toBe(31);
      expect(segments[1]!.fg).toBeNull();
    });

    test("handles default background (code 49)", () => {
      const segments = parseAnsiText("\x1b[44mbg\x1b[49mdefault");
      expect(segments).toHaveLength(2);
      expect(segments[0]!.bg).toBe(44);
      expect(segments[1]!.bg).toBeNull();
    });

    test("handles BG_OVERRIDE_CODE", () => {
      const segments = parseAnsiText(`\x1b[${BG_OVERRIDE_CODE}mtext`);
      expect(segments).toHaveLength(1);
      expect(segments[0]!.bgOverride).toBe(true);
    });

    test("handles empty string", () => {
      const segments = parseAnsiText("");
      expect(segments).toHaveLength(0);
    });

    test("handles only ANSI codes with no content", () => {
      const segments = parseAnsiText("\x1b[31m\x1b[0m");
      expect(segments).toHaveLength(0);
    });

    test("handles combined codes in single sequence", () => {
      // Combined: bold (1), red fg (31)
      const segments = parseAnsiText("\x1b[1;31mbold red\x1b[0m");
      expect(segments).toHaveLength(1);
      expect(segments[0]!.bold).toBe(true);
      expect(segments[0]!.fg).toBe(31);
    });
  });

  // ========================================================================
  // normalizeText Tests
  // ========================================================================
  describe("normalizeText", () => {
    test("normalizes NFC composed form", () => {
      // é can be represented as single codepoint (U+00E9) or
      // e (U+0065) + combining acute (U+0301)
      const decomposed = "cafe\u0301"; // e + combining acute
      const normalized = normalizeText(decomposed);
      // NFC should compose to single codepoint
      expect(normalized).toBe("café");
      expect(normalized.length).toBe(4); // 4 codepoints after NFC
    });

    test("preserves already normalized text", () => {
      const text = "hello world";
      expect(normalizeText(text)).toBe(text);
    });

    test("normalizes multiple combining characters", () => {
      // ñ can be n + combining tilde
      const decomposed = "n\u0303";
      const normalized = normalizeText(decomposed);
      expect(normalized).toBe("ñ");
    });

    test("handles empty string", () => {
      expect(normalizeText("")).toBe("");
    });

    test("handles ASCII-only text", () => {
      expect(normalizeText("ASCII123")).toBe("ASCII123");
    });

    test("normalizes Korean text", () => {
      // Korean can have compatibility forms
      const text = "한글";
      const normalized = normalizeText(text);
      expect(normalized).toBe("한글");
    });
  });

  // ========================================================================
  // getFirstCodePoint Tests
  // ========================================================================
  describe("getFirstCodePoint", () => {
    test("returns code point for ASCII", () => {
      expect(getFirstCodePoint("A")).toBe(65);
    });

    test("returns code point for BMP character", () => {
      // é (U+00E9)
      expect(getFirstCodePoint("é")).toBe(0x00e9);
    });

    test("returns code point for surrogate pair (emoji)", () => {
      // 😀 is U+1F600, requires surrogate pair in UTF-16
      expect(getFirstCodePoint("😀")).toBe(0x1f600);
    });

    test("returns code point for CJK character", () => {
      // 中 is U+4E2D
      expect(getFirstCodePoint("中")).toBe(0x4e2d);
    });

    test("returns 0 for empty string", () => {
      expect(getFirstCodePoint("")).toBe(0);
    });

    test("returns first code point of multi-char string", () => {
      expect(getFirstCodePoint("hello")).toBe(104); // 'h'
    });

    test("handles ZWJ sequence (returns first code point)", () => {
      // Family emoji: man + ZWJ + woman + ZWJ + girl
      const family = "👨‍👩‍👧";
      // Should return code point of first character (man)
      expect(getFirstCodePoint(family)).toBe(0x1f468);
    });

    test("handles flag emoji (regional indicator)", () => {
      // 🇺🇸 starts with U+1F1FA (Regional Indicator Symbol Letter U)
      expect(getFirstCodePoint("🇺🇸")).toBe(0x1f1fa);
    });
  });

  // ========================================================================
  // BG_OVERRIDE_CODE Constant Tests
  // ========================================================================
  describe("BG_OVERRIDE_CODE", () => {
    test("is defined as expected value", () => {
      expect(BG_OVERRIDE_CODE).toBe(9999);
    });

    test("is a number", () => {
      expect(typeof BG_OVERRIDE_CODE).toBe("number");
    });
  });
});
