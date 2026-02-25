/**
 * Regression tests for ZWJ emoji handling in replayAnsiWithStyles.
 *
 * Root cause (2026-02-24): The grapheme combining loop in replayAnsiWithStyles
 * consumed ZWJ (U+200D) as combining, but the joinee character following ZWJ
 * (e.g., ♂ U+2642 in 🏃‍♂️) was NOT consumed — it didn't match any combining
 * range. This split ZWJ emoji across multiple screen columns, causing
 * progressive cursor drift in output verification.
 *
 * Fix: After consuming ZWJ, the next codepoint is always consumed as the
 * joinee, regardless of its Unicode category. Also added skin tone modifiers
 * (U+1F3FB-1F3FF) to the combining set.
 */
import { describe, test, expect } from "vitest"
import { replayAnsiWithStyles } from "../src/pipeline/output-phase.js"
import { graphemeWidth } from "../src/unicode.js"

/** Write a string at position (x,y) in ANSI: move cursor then write text. */
function ansiAt(x: number, y: number, text: string): string {
  return `\x1b[${y + 1};${x + 1}H${text}`
}

/** Extract chars from a screen row. */
function rowChars(screen: ReturnType<typeof replayAnsiWithStyles>, y: number): string {
  return screen[y]!.map((c) => c.char).join("")
}

describe("replayAnsiWithStyles — ZWJ emoji regression", () => {
  test("ZWJ person running (🏃‍♂️) occupies exactly 2 columns", () => {
    const emoji = "🏃‍♂️"  // U+1F3C3 + U+200D + U+2642 + U+FE0F
    expect(graphemeWidth(emoji)).toBe(2)

    const ansi = ansiAt(0, 0, `${emoji} after`)
    const screen = replayAnsiWithStyles(20, 1, ansi)

    // Emoji at col 0, continuation space at col 1, ' ' at col 2, 'a' at col 3
    expect(screen[0]![0]!.char).toBe(emoji)
    expect(screen[0]![1]!.char).toBe(" ")  // continuation cell
    expect(screen[0]![2]!.char).toBe(" ")  // actual space
    expect(screen[0]![3]!.char).toBe("a")
    expect(screen[0]![4]!.char).toBe("f")
  })

  test("ZWJ technologist (👨🏻‍💻) occupies exactly 2 columns", () => {
    const emoji = "👨🏻‍💻"  // U+1F468 + U+1F3FB + U+200D + U+1F4BB
    expect(graphemeWidth(emoji)).toBe(2)

    const ansi = ansiAt(0, 0, `${emoji}X`)
    const screen = replayAnsiWithStyles(10, 1, ansi)

    expect(screen[0]![0]!.char).toBe(emoji)
    expect(screen[0]![1]!.char).toBe(" ")  // continuation
    expect(screen[0]![2]!.char).toBe("X")
  })

  test("ZWJ weightlifter (🏋️‍♂️) occupies exactly 2 columns", () => {
    const emoji = "🏋️‍♂️"  // U+1F3CB + U+FE0F + U+200D + U+2642 + U+FE0F
    expect(graphemeWidth(emoji)).toBe(2)

    const ansi = ansiAt(0, 0, `${emoji}Z`)
    const screen = replayAnsiWithStyles(10, 1, ansi)

    expect(screen[0]![0]!.char).toBe(emoji)
    expect(screen[0]![1]!.char).toBe(" ")
    expect(screen[0]![2]!.char).toBe("Z")
  })

  test("flag emoji (🇨🇦) occupies exactly 2 columns", () => {
    const emoji = "🇨🇦"  // U+1F1E8 + U+1F1E6
    expect(graphemeWidth(emoji)).toBe(2)

    const ansi = ansiAt(0, 0, `${emoji}Y`)
    const screen = replayAnsiWithStyles(10, 1, ansi)

    expect(screen[0]![0]!.char).toBe(emoji)
    expect(screen[0]![1]!.char).toBe(" ")
    expect(screen[0]![2]!.char).toBe("Y")
  })

  test("skin tone modifier (👨🏻) stays as single grapheme", () => {
    const emoji = "👨🏻"  // U+1F468 + U+1F3FB
    expect(graphemeWidth(emoji)).toBe(2)

    const ansi = ansiAt(0, 0, `${emoji}W`)
    const screen = replayAnsiWithStyles(10, 1, ansi)

    expect(screen[0]![0]!.char).toBe(emoji)
    expect(screen[0]![1]!.char).toBe(" ")
    expect(screen[0]![2]!.char).toBe("W")
  })

  test("text presentation emoji with VS16 (☎️) occupies 2 columns", () => {
    const emoji = "☎️"  // U+260E + U+FE0F
    expect(graphemeWidth(emoji)).toBe(2)

    const ansi = ansiAt(0, 0, `${emoji}A`)
    const screen = replayAnsiWithStyles(10, 1, ansi)

    expect(screen[0]![0]!.char).toBe(emoji)
    expect(screen[0]![1]!.char).toBe(" ")
    expect(screen[0]![2]!.char).toBe("A")
  })

  test("multiple ZWJ emoji on same row don't cause drift", () => {
    const emoji1 = "🏃‍♂️"
    const emoji2 = "👨🏻‍💻"
    const emoji3 = "🏋️‍♂️"

    const ansi = ansiAt(0, 0, `${emoji1} ${emoji2} ${emoji3} end`)
    const screen = replayAnsiWithStyles(30, 1, ansi)

    // emoji1 at 0-1, space at 2, emoji2 at 3-4, space at 5, emoji3 at 6-7, space at 8, "end" at 9-11
    expect(screen[0]![0]!.char).toBe(emoji1)
    expect(screen[0]![2]!.char).toBe(" ")
    expect(screen[0]![3]!.char).toBe(emoji2)
    expect(screen[0]![5]!.char).toBe(" ")
    expect(screen[0]![6]!.char).toBe(emoji3)
    expect(screen[0]![8]!.char).toBe(" ")
    expect(screen[0]![9]!.char).toBe("e")
    expect(screen[0]![10]!.char).toBe("n")
    expect(screen[0]![11]!.char).toBe("d")
  })

  test("overwriting ZWJ emoji with spaces clears correctly", () => {
    // First write emoji, then overwrite with spaces
    const emoji = "🏃‍♂️"
    const ansi = ansiAt(0, 0, `${emoji}end`) + ansiAt(0, 0, "    ")
    const screen = replayAnsiWithStyles(10, 1, ansi)

    // All first 4 cols should be spaces after overwrite
    expect(screen[0]![0]!.char).toBe(" ")
    expect(screen[0]![1]!.char).toBe(" ")
    expect(screen[0]![2]!.char).toBe(" ")
    expect(screen[0]![3]!.char).toBe(" ")
  })

  test("complex ZWJ family emoji (👨‍👩‍👧‍👦) is single grapheme", () => {
    const emoji = "👨‍👩‍👧‍👦"  // family: man, woman, girl, boy (7 codepoints)
    const w = graphemeWidth(emoji)
    expect(w).toBe(2)

    const ansi = ansiAt(0, 0, `${emoji}X`)
    const screen = replayAnsiWithStyles(10, 1, ansi)

    expect(screen[0]![0]!.char).toBe(emoji)
    expect(screen[0]![1]!.char).toBe(" ")  // continuation
    expect(screen[0]![2]!.char).toBe("X")
  })

  test("mixed CJK + emoji doesn't cause drift", () => {
    // CJK characters are also 2-wide
    const ansi = ansiAt(0, 0, "日🏃‍♂️本")
    const screen = replayAnsiWithStyles(20, 1, ansi)

    // 日 at 0-1, 🏃‍♂️ at 2-3, 本 at 4-5
    expect(screen[0]![0]!.char).toBe("日")
    expect(screen[0]![2]!.char).toBe("🏃‍♂️")
    expect(screen[0]![4]!.char).toBe("本")
  })
})

describe("replayAnsiWithStyles — fuzz: random emoji sequences", () => {
  // Comprehensive set of emoji that exercise all combining paths
  const EMOJI_ZWJ = [
    "🏃‍♂️",    // person running + ZWJ + male
    "🏃‍♀️",    // person running + ZWJ + female
    "👨🏻‍💻",   // man technologist light skin
    "👩🏽‍🔬",   // woman scientist medium skin
    "🏋️‍♂️",   // man lifting weights
    "🧑‍🤝‍🧑",  // people holding hands
    "👨‍👩‍👧‍👦", // family
    "🏴‍☠️",    // pirate flag
    "🐻‍❄️",    // polar bear
  ]

  const EMOJI_FLAG = ["🇨🇦", "🇺🇸", "🇯🇵", "🇬🇧", "🇫🇷", "🇩🇪"]

  const EMOJI_SKIN = [
    "👨🏻", "👩🏼", "🧑🏽", "👶🏾", "🧓🏿",
  ]

  const EMOJI_VS16 = [
    "☎️", "✈️", "☕", "⚠️", "✅", "❌", "⭐", "🍽️",
  ]

  const EMOJI_SIMPLE = [
    "📱", "💻", "🎯", "📊", "💼", "📚", "🔧", "🌱", "🛒", "📦",
  ]

  const ALL_EMOJI = [...EMOJI_ZWJ, ...EMOJI_FLAG, ...EMOJI_SKIN, ...EMOJI_VS16, ...EMOJI_SIMPLE]

  test.each(ALL_EMOJI)("emoji %s: replay places at correct column and doesn't drift", (emoji) => {
    const w = graphemeWidth(emoji)
    const ansi = ansiAt(0, 0, `${emoji}X`)
    const screen = replayAnsiWithStyles(20, 1, ansi)

    expect(screen[0]![0]!.char).toBe(emoji)
    if (w > 1) {
      expect(screen[0]![1]!.char).toBe(" ")  // continuation
    }
    expect(screen[0]![w]!.char).toBe("X")
  })

  test("20 random emoji in sequence don't cause cumulative drift", () => {
    // Build a string of emoji separated by spaces, verify 'END' marker is at correct position
    let text = ""
    let expectedPos = 0
    for (let i = 0; i < 20; i++) {
      const emoji = ALL_EMOJI[i % ALL_EMOJI.length]!
      text += emoji + " "
      expectedPos += graphemeWidth(emoji) + 1  // emoji width + space
    }
    text += "END"

    const ansi = ansiAt(0, 0, text)
    const screen = replayAnsiWithStyles(200, 1, ansi)

    // Verify END is at the expected position (no cumulative drift)
    expect(screen[0]![expectedPos]!.char).toBe("E")
    expect(screen[0]![expectedPos + 1]!.char).toBe("N")
    expect(screen[0]![expectedPos + 2]!.char).toBe("D")
  })

  test("emoji with ANSI style codes don't break combining", () => {
    // Emoji wrapped in color codes should still be parsed as single graphemes
    const emoji = "🏃‍♂️"
    // ESC[32m = green, ESC[0m = reset
    const ansi = ansiAt(0, 0, `\x1b[32m${emoji}\x1b[0m end`)
    const screen = replayAnsiWithStyles(20, 1, ansi)

    expect(screen[0]![0]!.char).toBe(emoji)
    expect(screen[0]![1]!.char).toBe(" ")  // continuation
    expect(screen[0]![2]!.char).toBe(" ")  // actual space
    expect(screen[0]![3]!.char).toBe("e")
  })
})
