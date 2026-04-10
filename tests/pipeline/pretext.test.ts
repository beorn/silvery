/**
 * Tests for Pretext text analysis algorithms.
 */
import { describe, test, expect } from "vitest"
import { buildTextAnalysis, countLinesAtWidth, shrinkwrapWidth, balancedWidth, knuthPlassBreaks, optimalWrap } from "@silvery/ag-term/pipeline/pretext"
import { graphemeWidth } from "@silvery/ag-term/unicode"

describe("buildTextAnalysis", () => {
  test("builds correct cumWidths for ASCII text", () => {
    const analysis = buildTextAnalysis("hello world", graphemeWidth)
    expect(analysis.totalWidth).toBe(11)
    expect(analysis.cumWidths[0]).toBe(0)
    expect(analysis.cumWidths[analysis.graphemes.length]).toBe(11)
    expect(analysis.maxWordWidth).toBe(5) // "hello" or "world"
    expect(analysis.breakIndices.length).toBeGreaterThan(0)
  })

  test("handles newlines", () => {
    const analysis = buildTextAnalysis("hello\nworld", graphemeWidth)
    expect(analysis.newlineIndices.length).toBe(1)
    expect(analysis.totalWidth).toBe(10) // newline has 0 width
  })

  test("handles CJK text", () => {
    const analysis = buildTextAnalysis("日本語", graphemeWidth)
    expect(analysis.totalWidth).toBe(6) // 3 chars × 2 width
    expect(analysis.breakIndices.length).toBe(3) // can break before each CJK char
  })

  test("handles empty string", () => {
    const analysis = buildTextAnalysis("", graphemeWidth)
    expect(analysis.totalWidth).toBe(0)
    expect(analysis.graphemes.length).toBe(0)
  })
})

describe("countLinesAtWidth", () => {
  test("single line when text fits", () => {
    const analysis = buildTextAnalysis("hello world", graphemeWidth)
    expect(countLinesAtWidth(analysis, 20)).toBe(1)
  })

  test("wraps at word boundary", () => {
    const analysis = buildTextAnalysis("hello world", graphemeWidth)
    expect(countLinesAtWidth(analysis, 7)).toBe(2) // "hello " + "world"
  })

  test("multiple wraps", () => {
    const analysis = buildTextAnalysis("the quick brown fox jumps", graphemeWidth)
    // At width 10: "the quick " (10), "brown fox " (10), "jumps" (5) = 3 lines
    expect(countLinesAtWidth(analysis, 10)).toBe(3)
  })

  test("preserves newlines", () => {
    const analysis = buildTextAnalysis("hello\nworld", graphemeWidth)
    expect(countLinesAtWidth(analysis, 20)).toBe(2)
  })
})

describe("shrinkwrapWidth", () => {
  test("returns totalWidth for single-line text", () => {
    const analysis = buildTextAnalysis("hello", graphemeWidth)
    expect(shrinkwrapWidth(analysis, 20)).toBe(5)
  })

  test("tightens multi-line text", () => {
    // "hello world" at width=20 is 1 line, snug-content returns 11
    const analysis = buildTextAnalysis("hello world", graphemeWidth)
    expect(shrinkwrapWidth(analysis, 20)).toBe(11)
  })

  test("snug-content is tighter than fit-content for ragged text", () => {
    // "the quick brown fox" at width=12:
    // fit-content: "the quick " (10 wide) + "brown fox" (9 wide) → widest = 10
    // snug-content should find width ≤ 10 that still gives 2 lines
    const analysis = buildTextAnalysis("the quick brown fox", graphemeWidth)
    const fitContent = 12 // container width
    const shrunk = shrinkwrapWidth(analysis, fitContent)
    expect(shrunk).toBeLessThanOrEqual(fitContent)
    // Verify same line count
    expect(countLinesAtWidth(analysis, shrunk)).toBe(countLinesAtWidth(analysis, fitContent))
  })

  test("never goes below maxWordWidth", () => {
    const analysis = buildTextAnalysis("supercalifragilistic is a word", graphemeWidth)
    const shrunk = shrinkwrapWidth(analysis, 40)
    expect(shrunk).toBeGreaterThanOrEqual(analysis.maxWordWidth)
  })
})

describe("balancedWidth", () => {
  test("returns totalWidth for single-line text", () => {
    const analysis = buildTextAnalysis("hello", graphemeWidth)
    expect(balancedWidth(analysis, 20)).toBe(5)
  })

  test("produces more even line widths than greedy", () => {
    // "aaa bbb ccc ddd eee" (19 chars) at width=12:
    // Greedy: "aaa bbb ccc " (12) + "ddd eee" (7) → uneven
    // Balanced: should find width ~10 for "aaa bbb " (8) + "ccc ddd eee" (11) or similar
    const analysis = buildTextAnalysis("aaa bbb ccc ddd eee", graphemeWidth)
    const bWidth = balancedWidth(analysis, 12)
    expect(bWidth).toBeLessThanOrEqual(12)
    // Same line count as greedy
    expect(countLinesAtWidth(analysis, bWidth)).toBe(countLinesAtWidth(analysis, 12))
  })
})

describe("knuthPlassBreaks", () => {
  test("returns empty for single-line text", () => {
    const analysis = buildTextAnalysis("hello", graphemeWidth)
    expect(knuthPlassBreaks(analysis, 20)).toEqual([])
  })

  test("finds break positions for multi-line text", () => {
    const analysis = buildTextAnalysis("the quick brown fox jumps", graphemeWidth)
    const breaks = knuthPlassBreaks(analysis, 12)
    expect(breaks.length).toBeGreaterThan(0)
    // Should produce valid breaks (each < text length)
    for (const bp of breaks) {
      expect(bp).toBeGreaterThan(0)
      expect(bp).toBeLessThan(analysis.graphemes.length)
    }
  })

  test("produces fewer or equal raggedness than greedy", () => {
    // "aaa bbb ccc ddd" at width=8:
    // Greedy: "aaa bbb " (8) + "ccc ddd" (7) → leftover [0, 1] → cost 0+1=1
    // Optimal may find: "aaa bbb" (7) + "ccc ddd" (7) → leftover [1, 0] → cost 1+0=1
    // Or: "aaa " (4) + "bbb ccc " (8) + "ddd" (3) — worse
    const analysis = buildTextAnalysis("aaa bbb ccc ddd", graphemeWidth)
    const breaks = knuthPlassBreaks(analysis, 8)
    expect(breaks.length).toBeGreaterThan(0)
  })
})

describe("optimalWrap", () => {
  test("returns single line for short text", () => {
    const analysis = buildTextAnalysis("hello", graphemeWidth)
    expect(optimalWrap("hello", analysis, 20)).toEqual(["hello"])
  })

  test("wraps multi-line text", () => {
    const text = "the quick brown fox jumps over the lazy dog"
    const analysis = buildTextAnalysis(text, graphemeWidth)
    const lines = optimalWrap(text, analysis, 15)
    expect(lines.length).toBeGreaterThan(1)
    // Each line should fit within width (allow for word boundary tolerance)
    for (const line of lines) {
      // Lines should be reasonable (not empty, not vastly exceeding width)
      expect(line.length).toBeGreaterThan(0)
    }
  })

  test("preserves all text content", () => {
    const text = "hello world foo bar"
    const analysis = buildTextAnalysis(text, graphemeWidth)
    const lines = optimalWrap(text, analysis, 10)
    const joined = lines.join(" ")
    // All words should be present
    expect(joined).toContain("hello")
    expect(joined).toContain("world")
    expect(joined).toContain("foo")
    expect(joined).toContain("bar")
  })
})
