/**
 * Matrix test: wide character ANSI output correctness across emoji categories.
 *
 * Two defensive measures prevent cursor drift when terminal wcwidth disagrees
 * with our buffer's width-2 assumption:
 * 1. OSC 66 wrapping — tells the terminal the exact width (requires terminal support)
 * 2. CUP cursor re-sync — emits explicit cursor position after every wide char
 *
 * This test verifies both measures work for ALL wide character categories,
 * not just the ones that happened to cause bugs first.
 *
 * Why not just compare fresh vs incremental in xterm.js? Because xterm.js
 * headless agrees with our width-2 assumption — both paths would be "wrong
 * the same way" and the test would pass. Instead, we verify the defensive
 * measures are present in the raw ANSI output.
 */
import { describe, test, expect } from "vitest"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { createOutputPhase, outputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { graphemeWidth } from "@silvery/ag-term/unicode"

const COLS = 80
const ROWS = 5

// OSC 66 pattern: ESC ] 66 ; w=2 ; <content> BEL
const OSC66_REGEX = /\x1b\]66;w=2;(.+?)\x07/g

// CUP pattern: ESC [ row ; col H
const CUP_REGEX = /\x1b\[(\d+);(\d+)H/g

/** Create output phase with text sizing enabled (simulates Ghostty/Kitty) */
function createTextSizedOutputPhase() {
  return createOutputPhase(
    { underlineStyles: true, underlineColor: true, colorTier: "truecolor" },
    { graphemeWidth, textSizingEnabled: true },
  )
}

/** Wide character categories that must be handled correctly */
const WIDE_CHARS: Array<{ name: string; char: string; description: string }> = [
  // Flag emoji (regional indicator sequences) — the original bug
  { name: "flag-CA", char: "🇨🇦", description: "Canadian flag" },
  { name: "flag-US", char: "🇺🇸", description: "US flag" },
  { name: "flag-GB", char: "🇬🇧", description: "UK flag" },
  { name: "flag-JP", char: "🇯🇵", description: "Japan flag" },

  // CJK characters
  { name: "cjk-han", char: "漢", description: "CJK Unified Ideograph" },
  { name: "cjk-katakana", char: "ア", description: "Katakana" },
  { name: "cjk-hangul", char: "한", description: "Korean Hangul" },

  // Fullwidth characters
  { name: "fullwidth-A", char: "Ａ", description: "Fullwidth Latin A" },
]

/** Check if a grapheme is wide (width 2) using Unicode ranges */
function isWideChar(char: string): boolean {
  if (/[\u{1F1E6}-\u{1F1FF}]{2}/u.test(char)) return true
  if (
    /[\u{2E80}-\u{9FFF}\u{AC00}-\u{D7AF}\u{F900}-\u{FAFF}\u{FE10}-\u{FE6F}\u{FF01}-\u{FF60}\u{FFE0}-\u{FFE6}\u{1F300}-\u{1F9FF}\u{20000}-\u{2FA1F}]/u.test(
      char,
    )
  )
    return true
  return false
}

/** Write a string into a buffer, handling wide chars */
function writeString(buf: TerminalBuffer, startX: number, y: number, text: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  let x = startX
  for (const { segment: char } of segmenter.segment(text)) {
    const wide = isWideChar(char)
    buf.setCell(x, y, { char, wide, fg: null })
    if (wide) {
      buf.setCell(x + 1, y, { char: "", continuation: true, fg: null })
      x += 2
    } else {
      x += 1
    }
  }
  return x
}

describe("output-phase wide char matrix", () => {
  describe("OSC 66 wrapping (text sizing enabled)", () => {
    const render = createTextSizedOutputPhase()

    test.each(WIDE_CHARS)(
      "$name ($description) is wrapped in OSC 66 in fresh render",
      ({ char }) => {
        const buf = new TerminalBuffer(COLS, ROWS)
        writeString(buf, 0, 0, `A${char}B`)

        const ansi = render(null, buf, "fullscreen")
        const matches = [...ansi.matchAll(OSC66_REGEX)]
        const wrappedChars = matches.map((m) => m[1])

        expect(wrappedChars).toContain(char)
      },
    )

    test.each(WIDE_CHARS)(
      "$name ($description) is wrapped in OSC 66 in incremental render",
      ({ char }) => {
        const render2 = createTextSizedOutputPhase()
        const prev = new TerminalBuffer(COLS, ROWS)
        writeString(prev, 0, 0, "A  B")
        prev.resetDirtyRows()

        const next = prev.clone()
        next.setCell(1, 0, { char, wide: true, fg: null })
        next.setCell(2, 0, { char: "", continuation: true, fg: null })

        const incrAnsi = render2(prev, next, "fullscreen")
        const matches = [...incrAnsi.matchAll(OSC66_REGEX)]
        const wrappedChars = matches.map((m) => m[1])

        expect(wrappedChars).toContain(char)
      },
    )

    test("ASCII characters are NOT wrapped in OSC 66", () => {
      const buf = new TerminalBuffer(COLS, ROWS)
      writeString(buf, 0, 0, "Hello World")

      const ansi = render(null, buf, "fullscreen")
      const matches = [...ansi.matchAll(OSC66_REGEX)]
      expect(matches).toHaveLength(0)
    })
  })

  describe("CUP cursor re-sync after wide chars (belt-and-suspenders)", () => {
    test.each(WIDE_CHARS)(
      "$name ($description): CUP emitted after wide char in fresh render",
      ({ char }) => {
        const buf = new TerminalBuffer(COLS, ROWS)
        writeString(buf, 0, 0, `A${char}B`)

        // Use bare outputPhase (no text sizing) — CUP re-sync is independent
        const ansi = outputPhase(null, buf, "fullscreen")

        // After wide char at cols 1-2, CUP should position cursor at col 4 (1-indexed)
        // CUP format: ESC [ row ; col H
        const cups = [...ansi.matchAll(CUP_REGEX)]
        const cupCols = cups.map((m) => Number(m[2]))

        // The re-sync CUP should target column 4 (0-indexed col 3 = 1-indexed col 4)
        expect(cupCols).toContain(4)
      },
    )

    test("CUP column is correct for multiple wide chars", () => {
      const buf = new TerminalBuffer(COLS, ROWS)
      // "A🇨🇦B漢C" — A(0), flag(1-2), B(3), han(4-5), C(6)
      writeString(buf, 0, 0, "A🇨🇦B漢C")

      const ansi = outputPhase(null, buf, "fullscreen")
      const cups = [...ansi.matchAll(CUP_REGEX)]
      const cupCols = cups.map((m) => Number(m[2]))

      // After flag emoji at cols 1-2: CUP to col 4 (1-indexed)
      expect(cupCols).toContain(4)
      // After han at cols 4-5: CUP to col 7 (1-indexed)
      expect(cupCols).toContain(7)
    })
  })

  describe("xterm.js cell positions (end-to-end)", () => {
    test.each(WIDE_CHARS)(
      "$name ($description): character after wide char at correct column",
      ({ char }) => {
        const buf = new TerminalBuffer(COLS, ROWS)
        writeString(buf, 0, 0, `A${char}B`)

        const ansi = outputPhase(null, buf, "fullscreen")
        const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
        term.feed(ansi)

        expect(term.getCell(0, 0)?.char).toBe("A")
        expect(term.getCell(0, 3)?.char).toBe("B")
        term.close()
      },
    )

    test("mixed wide chars maintain correct positions", () => {
      const buf = new TerminalBuffer(COLS, ROWS)
      writeString(buf, 0, 0, "A🇨🇦B漢C한D")

      const ansi = outputPhase(null, buf, "fullscreen")
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
      term.feed(ansi)

      expect(term.getCell(0, 0)?.char).toBe("A")
      // flag at 1-2, B at 3
      expect(term.getCell(0, 3)?.char).toBe("B")
      // han at 4-5, C at 6
      expect(term.getCell(0, 6)?.char).toBe("C")
      // hangul at 7-8, D at 9
      expect(term.getCell(0, 9)?.char).toBe("D")

      term.close()
    })
  })

  describe("incremental render matches fresh render", () => {
    test.each(WIDE_CHARS)(
      "$name ($description): incremental after change matches fresh",
      ({ char }) => {
        const prev = new TerminalBuffer(COLS, ROWS)
        writeString(prev, 0, 0, `A${char}BXYZ`)
        prev.resetDirtyRows()

        const next = prev.clone()
        writeString(next, 4, 0, "QRS")

        const initialAnsi = outputPhase(null, prev, "fullscreen")
        const incrAnsi = outputPhase(prev, next, "fullscreen")
        const freshAnsi = outputPhase(null, next, "fullscreen")

        const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
        termIncr.feed(initialAnsi)
        termIncr.feed(incrAnsi)

        const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
        termFresh.feed(freshAnsi)

        for (let x = 0; x < 20; x++) {
          expect(termIncr.getCell(0, x)?.char, `col ${x}`).toBe(termFresh.getCell(0, x)?.char)
        }

        termIncr.close()
        termFresh.close()
      },
    )
  })
})
