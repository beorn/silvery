/**
 * Text Cursor Tests
 *
 * Tests for cursor ↔ visual position mapping in word-wrapped text:
 * getWrappedLines, cursorToRowCol, rowColToCursor, cursorMoveUp,
 * cursorMoveDown, countVisualLines.
 */

import { describe, expect, test } from "vitest"
import {
  countVisualLines,
  cursorMoveDown,
  cursorMoveUp,
  cursorToRowCol,
  getWrappedLines,
  rowColToCursor,
} from "../src/text-cursor.js"

// ============================================================================
// getWrappedLines
// ============================================================================

describe("getWrappedLines", () => {
  test("empty string produces single empty line", () => {
    const lines = getWrappedLines("", 10)
    expect(lines).toEqual([{ line: "", startOffset: 0 }])
  })

  test("single line that fits within width", () => {
    const lines = getWrappedLines("hello", 10)
    expect(lines).toEqual([{ line: "hello", startOffset: 0 }])
  })

  test("single line that wraps at word boundary", () => {
    // "hello world" at width 8 -> wrapText produces ["hello ", "world"]
    const lines = getWrappedLines("hello world", 8)
    expect(lines).toEqual([
      { line: "hello ", startOffset: 0 },
      { line: "world", startOffset: 6 },
    ])
  })

  test("multiple logical lines (newline separated)", () => {
    const lines = getWrappedLines("a\nb", 10)
    expect(lines).toEqual([
      { line: "a", startOffset: 0 },
      { line: "b", startOffset: 2 }, // +1 for "a", +1 for \n
    ])
  })

  test("multi-line with wrapping", () => {
    // "hello world\nfoo" at width 8
    // Line 0: "hello world" wraps to ["hello ", "world"]
    // Line 1: "foo" fits
    const lines = getWrappedLines("hello world\nfoo", 8)
    expect(lines).toEqual([
      { line: "hello ", startOffset: 0 },
      { line: "world", startOffset: 6 },
      { line: "foo", startOffset: 12 }, // 6 + 5 + 1(\n)
    ])
  })

  test("wrapWidth <= 0 returns single empty line", () => {
    expect(getWrappedLines("hello", 0)).toEqual([{ line: "", startOffset: 0 }])
    expect(getWrappedLines("hello", -1)).toEqual([{ line: "", startOffset: 0 }])
  })

  test("long word that exceeds wrapWidth (character wrap)", () => {
    // "abcdefghij" at width 4 -> character wrap: ["abcd", "efgh", "ij"]
    const lines = getWrappedLines("abcdefghij", 4)
    expect(lines).toEqual([
      { line: "abcd", startOffset: 0 },
      { line: "efgh", startOffset: 4 },
      { line: "ij", startOffset: 8 },
    ])
  })

  test("startOffset values account for newlines", () => {
    // "ab\ncd\nef" -> three logical lines, each 2 chars
    const lines = getWrappedLines("ab\ncd\nef", 10)
    expect(lines).toEqual([
      { line: "ab", startOffset: 0 },
      { line: "cd", startOffset: 3 }, // 2 + 1(\n)
      { line: "ef", startOffset: 6 }, // 3 + 2 + 1(\n)
    ])
  })

  test("startOffset values with wrapping and newlines combined", () => {
    // "abc def\nghijklmno" at width 5
    // Line 0: "abc def" wraps to ["abc ", "def"]
    // Line 1: "ghijklmno" wraps to ["ghijk", "lmno"]
    const lines = getWrappedLines("abc def\nghijklmno", 5)
    expect(lines).toEqual([
      { line: "abc ", startOffset: 0 },
      { line: "def", startOffset: 4 },
      { line: "ghijk", startOffset: 8 }, // 4 + 3 + 1(\n)
      { line: "lmno", startOffset: 13 },
    ])
  })

  test("multiple words wrapping across several visual lines", () => {
    // "hello beautiful world" at width 10
    const lines = getWrappedLines("hello beautiful world", 10)
    expect(lines).toEqual([
      { line: "hello ", startOffset: 0 },
      { line: "beautiful ", startOffset: 6 },
      { line: "world", startOffset: 16 },
    ])
  })

  test("text exactly fitting width does not wrap", () => {
    const lines = getWrappedLines("hello world", 11)
    expect(lines).toEqual([{ line: "hello world", startOffset: 0 }])
  })
})

// ============================================================================
// cursorToRowCol
// ============================================================================

describe("cursorToRowCol", () => {
  test("cursor at start (offset 0)", () => {
    expect(cursorToRowCol("hello", 0, 10)).toEqual({ row: 0, col: 0 })
  })

  test("cursor at end (offset = text.length)", () => {
    expect(cursorToRowCol("hello", 5, 10)).toEqual({ row: 0, col: 5 })
  })

  test("cursor in middle of single line", () => {
    expect(cursorToRowCol("hello", 3, 10)).toEqual({ row: 0, col: 3 })
  })

  test("cursor after newline (second logical line)", () => {
    // "a\nb" -> cursor 2 is start of "b"
    expect(cursorToRowCol("a\nb", 2, 10)).toEqual({ row: 1, col: 0 })
    expect(cursorToRowCol("a\nb", 3, 10)).toEqual({ row: 1, col: 1 })
  })

  test("cursor within word-wrapped continuation line", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor 7 is 'o' in "world" (offset 6 + col 1)
    expect(cursorToRowCol("hello world", 7, 8)).toEqual({ row: 1, col: 1 })
    expect(cursorToRowCol("hello world", 9, 8)).toEqual({ row: 1, col: 3 })
  })

  test("cursor at exact wrap boundary", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor 6 is the last position on the first visual line (the trailing space)
    expect(cursorToRowCol("hello world", 6, 8)).toEqual({ row: 0, col: 6 })
  })

  test("wrapWidth <= 0 returns row 0 col 0", () => {
    expect(cursorToRowCol("hello", 3, 0)).toEqual({ row: 0, col: 0 })
    expect(cursorToRowCol("hello", 3, -1)).toEqual({ row: 0, col: 0 })
  })

  test("cursor beyond text length", () => {
    // Falls through all lines, returns last row col 0
    expect(cursorToRowCol("hello", 100, 10)).toEqual({ row: 0, col: 0 })
  })

  test("empty text", () => {
    expect(cursorToRowCol("", 0, 10)).toEqual({ row: 0, col: 0 })
  })

  test("cursor on each character of a newline-separated text", () => {
    // "ab\ncd" offsets: a=0, b=1, \n=_, c=2, d=3
    expect(cursorToRowCol("ab\ncd", 0, 10)).toEqual({ row: 0, col: 0 })
    expect(cursorToRowCol("ab\ncd", 1, 10)).toEqual({ row: 0, col: 1 })
    expect(cursorToRowCol("ab\ncd", 2, 10)).toEqual({ row: 0, col: 2 })
    expect(cursorToRowCol("ab\ncd", 3, 10)).toEqual({ row: 1, col: 0 })
    expect(cursorToRowCol("ab\ncd", 4, 10)).toEqual({ row: 1, col: 1 })
  })

  test("multi-wrap: three visual lines from one logical line", () => {
    // "hello beautiful world" at width 10 -> ["hello ", "beautiful ", "world"]
    // Note: for non-last wrapped lines, cursor at lineLen stays on the same row.
    // Transition to the next row happens at lineLen + 1.
    expect(cursorToRowCol("hello beautiful world", 0, 10)).toEqual({ row: 0, col: 0 })
    expect(cursorToRowCol("hello beautiful world", 6, 10)).toEqual({ row: 0, col: 6 }) // end of "hello "
    expect(cursorToRowCol("hello beautiful world", 7, 10)).toEqual({ row: 1, col: 1 }) // first char of "beautiful "
    expect(cursorToRowCol("hello beautiful world", 16, 10)).toEqual({ row: 1, col: 10 }) // end of "beautiful "
    expect(cursorToRowCol("hello beautiful world", 17, 10)).toEqual({ row: 2, col: 1 }) // first char of "world"
    expect(cursorToRowCol("hello beautiful world", 21, 10)).toEqual({ row: 2, col: 5 })
  })
})

// ============================================================================
// rowColToCursor
// ============================================================================

describe("rowColToCursor", () => {
  test("row 0 col 0 returns offset 0", () => {
    expect(rowColToCursor("hello world", 0, 0, 8)).toBe(0)
  })

  test("row 0 various cols return correct offset", () => {
    expect(rowColToCursor("hello world", 0, 3, 8)).toBe(3)
    expect(rowColToCursor("hello world", 0, 5, 8)).toBe(5)
  })

  test("row on second wrapped line includes offset", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // row 1 starts at offset 6
    expect(rowColToCursor("hello world", 1, 0, 8)).toBe(6)
    expect(rowColToCursor("hello world", 1, 3, 8)).toBe(9)
  })

  test("row on second logical line includes newline", () => {
    // "a\nb" -> row 1 starts at offset 2
    expect(rowColToCursor("a\nb", 1, 0, 10)).toBe(2)
    expect(rowColToCursor("a\nb", 1, 1, 10)).toBe(3)
  })

  test("col exceeding line length is clamped", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // row 1 is "world" (length 5), col 99 clamps to 5
    expect(rowColToCursor("hello world", 1, 99, 8)).toBe(11) // 6 + 5
  })

  test("negative row returns 0", () => {
    expect(rowColToCursor("hello world", -1, 5, 8)).toBe(0)
  })

  test("row beyond last returns text.length", () => {
    expect(rowColToCursor("hello world", 99, 0, 8)).toBe(11)
  })

  test("col clamped on short line", () => {
    // "a\nb" -> row 0 is "a" (length 1), col 5 clamps to 1
    expect(rowColToCursor("a\nb", 0, 5, 10)).toBe(1)
  })
})

// ============================================================================
// cursorMoveUp
// ============================================================================

describe("cursorMoveUp", () => {
  test("at first visual line returns null (boundary)", () => {
    expect(cursorMoveUp("hello world", 0, 8)).toBeNull()
    expect(cursorMoveUp("hello world", 5, 8)).toBeNull()
  })

  test("second visual line moves to first with correct column", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor 7 is row 1 col 1 -> move up -> row 0 col 1 -> offset 1
    expect(cursorMoveUp("hello world", 7, 8)).toBe(1)
  })

  test("move up preserves column when line is long enough", () => {
    // cursor at "world"[4] = offset 10, row 1 col 4
    // move up -> row 0 col 4 -> offset 4
    expect(cursorMoveUp("hello world", 10, 8)).toBe(4)
  })

  test("move up from end of second line clamps to first line length", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor 11 is row 1 col 5 -> move up -> row 0 col 5 -> offset 5
    expect(cursorMoveUp("hello world", 11, 8)).toBe(5)
  })

  test("stickyX on short line clamps to line length", () => {
    // "abcdefgh\nab\nabcdefgh" at width 20
    // Lines: ["abcdefgh", "ab", "abcdefgh"] (offsets 0, 9, 12)
    // cursor on row 2 col 5 (offset 17), stickyX=5
    // move up -> row 1 "ab" (length 2) -> clamps to 2 -> offset 11
    expect(cursorMoveUp("abcdefgh\nab\nabcdefgh", 17, 20, 5)).toBe(11)
  })

  test("across logical line boundary (wrapped line to previous logical line)", () => {
    // "hello world\nfoo" at width 8 -> ["hello ", "world", "foo"]
    // cursor on "foo" (row 2, offset 12), move up -> "world" (row 1)
    expect(cursorMoveUp("hello world\nfoo", 12, 8)).toBe(6) // row 1 col 0
  })

  test("wrapWidth <= 0: cursor > 0 returns 0", () => {
    expect(cursorMoveUp("hello world", 5, 0)).toBe(0)
  })

  test("wrapWidth <= 0: cursor 0 returns null", () => {
    expect(cursorMoveUp("hello world", 0, 0)).toBeNull()
  })

  test("multiple wrapped lines: move from line 3 to line 2", () => {
    // "hello beautiful world" at width 10 -> ["hello ", "beautiful ", "world"]
    // cursor on "world" (row 2, offset 16), move up -> "beautiful " (row 1)
    expect(cursorMoveUp("hello beautiful world", 16, 10)).toBe(6) // row 1 col 0
  })

  test("uses stickyX instead of current column", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor at row 1 col 1 (offset 7), stickyX = 5
    // move up -> row 0 col 5 -> offset 5
    expect(cursorMoveUp("hello world", 7, 8, 5)).toBe(5)
  })
})

// ============================================================================
// cursorMoveDown
// ============================================================================

describe("cursorMoveDown", () => {
  test("at last visual line returns null (boundary)", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor on "world" (row 1) -> move down -> null
    expect(cursorMoveDown("hello world", 11, 8)).toBeNull()
    expect(cursorMoveDown("hello world", 7, 8)).toBeNull()
  })

  test("first visual line moves to second with correct column", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor 0 (row 0 col 0) -> move down -> row 1 col 0 -> offset 6
    expect(cursorMoveDown("hello world", 0, 8)).toBe(6)
  })

  test("move down preserves column when next line is long enough", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor 5 (row 0 col 5) -> move down -> row 1 col 5 -> offset 11
    expect(cursorMoveDown("hello world", 5, 8)).toBe(11)
  })

  test("stickyX on short line clamps to line length", () => {
    // "abcdefgh\nab" at width 20
    // Lines: ["abcdefgh", "ab"] (offsets 0, 9)
    // cursor on row 0 col 5 (offset 5), stickyX=5
    // move down -> row 1 "ab" (length 2) -> clamps to 2 -> offset 11
    expect(cursorMoveDown("abcdefgh\nab", 5, 20, 5)).toBe(11)
  })

  test("across logical line boundary", () => {
    // "a\nb" at width 10 -> ["a", "b"]
    // cursor on "a" (row 0 col 1, offset 1) -> move down -> row 1 col 1 -> offset 3
    expect(cursorMoveDown("a\nb", 1, 10)).toBe(3)
  })

  test("wrapWidth <= 0: cursor < text.length returns text.length", () => {
    expect(cursorMoveDown("hello world", 0, 0)).toBe(11)
  })

  test("wrapWidth <= 0: cursor = text.length returns null", () => {
    expect(cursorMoveDown("hello world", 11, 0)).toBeNull()
  })

  test("multiple wrapped lines: move from line 1 to line 2", () => {
    // "hello beautiful world" at width 10 -> ["hello ", "beautiful ", "world"]
    // cursor 6 maps to row 0 col 6 (end of "hello "), move down -> row 1 col 6 -> offset 12
    expect(cursorMoveDown("hello beautiful world", 6, 10)).toBe(12)
  })

  test("uses stickyX instead of current column", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor at row 0 col 0 (offset 0), stickyX = 3
    // move down -> row 1 col 3 -> offset 9
    expect(cursorMoveDown("hello world", 0, 8, 3)).toBe(9)
  })
})

// ============================================================================
// countVisualLines
// ============================================================================

describe("countVisualLines", () => {
  test("empty string returns 1", () => {
    expect(countVisualLines("", 10)).toBe(1)
  })

  test("single line no wrap returns 1", () => {
    expect(countVisualLines("hello", 10)).toBe(1)
  })

  test("single line with wrap returns 2+", () => {
    // "hello world" at width 8 wraps to 2 lines
    expect(countVisualLines("hello world", 8)).toBe(2)
  })

  test("multi-line sums wrapped lines", () => {
    // "hello world\nfoo" at width 8
    // "hello world" wraps to 2, "foo" is 1 -> total 3
    expect(countVisualLines("hello world\nfoo", 8)).toBe(3)
  })

  test("wrapWidth <= 0 returns 1", () => {
    expect(countVisualLines("hello", 0)).toBe(1)
    expect(countVisualLines("hello world", -1)).toBe(1)
  })

  test("multiple newlines", () => {
    expect(countVisualLines("a\nb\nc", 10)).toBe(3)
  })

  test("three visual lines from one logical line", () => {
    // "hello beautiful world" at width 10 -> 3 visual lines
    expect(countVisualLines("hello beautiful world", 10)).toBe(3)
  })
})

// ============================================================================
// Roundtrip: cursorToRowCol <-> rowColToCursor
// ============================================================================

describe("roundtrip", () => {
  test("every offset in a simple string roundtrips", () => {
    const text = "hello"
    for (let i = 0; i <= text.length; i++) {
      const { row, col } = cursorToRowCol(text, i, 10)
      expect(rowColToCursor(text, row, col, 10)).toBe(i)
    }
  })

  test("every offset in a wrapping string roundtrips", () => {
    const text = "hello world"
    for (let i = 0; i <= text.length; i++) {
      const { row, col } = cursorToRowCol(text, i, 8)
      expect(rowColToCursor(text, row, col, 8)).toBe(i)
    }
  })

  test("every offset in a multi-line string roundtrips", () => {
    const text = "ab\ncd"
    for (let i = 0; i <= text.length; i++) {
      const { row, col } = cursorToRowCol(text, i, 10)
      expect(rowColToCursor(text, row, col, 10)).toBe(i)
    }
  })

  test("every offset in a multi-line wrapping string roundtrips", () => {
    const text = "hello world\nfoo"
    for (let i = 0; i <= text.length; i++) {
      const { row, col } = cursorToRowCol(text, i, 8)
      const back = rowColToCursor(text, row, col, 8)
      expect(back).toBe(i)
    }
  })

  test("every offset with character-wrapped long word roundtrips", () => {
    const text = "abcdefghij"
    for (let i = 0; i <= text.length; i++) {
      const { row, col } = cursorToRowCol(text, i, 4)
      expect(rowColToCursor(text, row, col, 4)).toBe(i)
    }
  })
})

// ============================================================================
// stickyX behavior
// ============================================================================

describe("stickyX", () => {
  test("move down from wide line to short line clamps, then restores on next wide line", () => {
    // "abcdefgh\nab\nabcdefgh" at width 20
    // row 0: "abcdefgh" (offset 0, length 8)
    // row 1: "ab"       (offset 9, length 2)
    // row 2: "abcdefgh" (offset 12, length 8)
    const text = "abcdefgh\nab\nabcdefgh"
    const startCursor = 5 // row 0 col 5
    const stickyX = 5

    // Move down: row 0 -> row 1 ("ab", length 2), clamps to col 2
    const after1 = cursorMoveDown(text, startCursor, 20, stickyX)
    expect(after1).toBe(11) // offset 9 + 2 (clamped)

    // Move down again: row 1 -> row 2, stickyX restores to col 5
    const after2 = cursorMoveDown(text, after1!, 20, stickyX)
    expect(after2).toBe(17) // offset 12 + 5 (restored)
  })

  test("move up from wide line to short line clamps, then restores on next wide line", () => {
    const text = "abcdefgh\nab\nabcdefgh"
    const startCursor = 17 // row 2 col 5
    const stickyX = 5

    // Move up: row 2 -> row 1 ("ab", length 2), clamps to col 2
    const after1 = cursorMoveUp(text, startCursor, 20, stickyX)
    expect(after1).toBe(11) // offset 9 + 2

    // Move up again: row 1 -> row 0, stickyX restores to col 5
    const after2 = cursorMoveUp(text, after1!, 20, stickyX)
    expect(after2).toBe(5) // offset 0 + 5
  })

  test("without stickyX, uses current column", () => {
    // "hello world" at width 8 -> ["hello ", "world"]
    // cursor at row 0 col 3 (offset 3), no stickyX
    // move down -> row 1 col 3 -> offset 9
    expect(cursorMoveDown("hello world", 3, 8)).toBe(9)
  })

  test("stickyX across wrapped visual lines within same logical line", () => {
    // "hello beautiful world" at width 10 -> ["hello ", "beautiful ", "world"]
    // stickyX = 4, start at row 0 col 4 (offset 4)
    const text = "hello beautiful world"

    // Move down: row 0 -> row 1 "beautiful " col 4 -> offset 10
    const after1 = cursorMoveDown(text, 4, 10, 4)
    expect(after1).toBe(10) // 6 + 4

    // Move down: row 1 -> row 2 "world" col 4 -> offset 20
    const after2 = cursorMoveDown(text, after1!, 10, 4)
    expect(after2).toBe(20) // 16 + 4
  })
})

// ============================================================================
// Edge cases
// ============================================================================

describe("edge cases", () => {
  test("empty text: all operations handle gracefully", () => {
    expect(getWrappedLines("", 10)).toEqual([{ line: "", startOffset: 0 }])
    expect(cursorToRowCol("", 0, 10)).toEqual({ row: 0, col: 0 })
    expect(rowColToCursor("", 0, 0, 10)).toBe(0)
    expect(cursorMoveUp("", 0, 10)).toBeNull()
    expect(cursorMoveDown("", 0, 10)).toBeNull()
    expect(countVisualLines("", 10)).toBe(1)
  })

  test("single character text", () => {
    expect(getWrappedLines("a", 10)).toEqual([{ line: "a", startOffset: 0 }])
    expect(cursorToRowCol("a", 0, 10)).toEqual({ row: 0, col: 0 })
    expect(cursorToRowCol("a", 1, 10)).toEqual({ row: 0, col: 1 })
    expect(cursorMoveDown("a", 0, 10)).toBeNull()
    expect(cursorMoveUp("a", 0, 10)).toBeNull()
  })

  test("only newlines", () => {
    // "\n\n" -> three logical lines: "", "", ""
    const lines = getWrappedLines("\n\n", 10)
    expect(lines).toEqual([
      { line: "", startOffset: 0 },
      { line: "", startOffset: 1 },
      { line: "", startOffset: 2 },
    ])
    expect(countVisualLines("\n\n", 10)).toBe(3)
  })

  test("cursorMoveDown from first to second empty line", () => {
    // "\n" -> ["", ""]
    expect(cursorMoveDown("\n", 0, 10)).toBe(1)
  })

  test("cursorMoveUp from second to first empty line", () => {
    // "\n" -> ["", ""]
    expect(cursorMoveUp("\n", 1, 10)).toBe(0)
  })

  test("text exactly at width boundary does not produce extra line", () => {
    // "abcd" at width 4 is exactly one line
    expect(getWrappedLines("abcd", 4)).toEqual([{ line: "abcd", startOffset: 0 }])
    expect(countVisualLines("abcd", 4)).toBe(1)
  })

  test("text one character over width wraps", () => {
    // "abcde" at width 4 -> character wrap: ["abcd", "e"]
    const lines = getWrappedLines("abcde", 4)
    expect(lines).toEqual([
      { line: "abcd", startOffset: 0 },
      { line: "e", startOffset: 4 },
    ])
  })

  test("cursorToRowCol handles cursor at newline position", () => {
    // "a\nb" -> cursor 1 is at end of "a" (before the newline)
    expect(cursorToRowCol("a\nb", 1, 10)).toEqual({ row: 0, col: 1 })
  })

  test("wrapWidth = 1 wraps every character", () => {
    const lines = getWrappedLines("abc", 1)
    expect(lines).toEqual([
      { line: "a", startOffset: 0 },
      { line: "b", startOffset: 1 },
      { line: "c", startOffset: 2 },
    ])
  })

  test("navigating through character-wrapped long word", () => {
    // "abcdefghij" at width 4 -> ["abcd", "efgh", "ij"]
    // Note: for non-last wrapped lines, cursor at lineLen stays on same row.
    // cursor 4 = row 0 col 4, cursor 8 = row 1 col 4
    const text = "abcdefghij"

    // Move down from row 0 col 2 (offset 2)
    const down1 = cursorMoveDown(text, 2, 4)
    expect(down1).toBe(6) // row 1 col 2

    // Move down from row 1 col 2 (offset 6)
    const down2 = cursorMoveDown(text, 6, 4)
    expect(down2).toBe(10) // row 2 col 2 -> clamped to "ij" length 2

    // cursor 8 = row 1 col 4 (NOT row 2), so moveDown goes to row 2
    expect(cursorMoveDown(text, 8, 4)).toBe(10) // row 2 col min(4,2) = 2 -> offset 10

    // cursor 9 = row 2 col 1 (last row) -> moveDown returns null
    expect(cursorMoveDown(text, 9, 4)).toBeNull()

    // Move up from row 2 col 1 (offset 9) -> row 1 col 1 (offset 5)
    expect(cursorMoveUp(text, 9, 4)).toBe(5)

    // Move up from start of "ij" area: cursor 8 = row 1 col 4
    // move up -> row 0 col 4 -> offset 4
    expect(cursorMoveUp(text, 8, 4)).toBe(4)
  })
})
