/**
 * SGR foreground color across wrapped lines.
 *
 * Sibling of the OSC 8 self-containment fix (`19654-osc-link-leak`,
 * `fixOsc8AcrossWrappedLines`). A nested `<Text color>` inside a wrapping
 * `<Text wrap>` encodes its fg as INLINE ANSI in the collected text
 * (render-text.ts `applyTextStyleAnsi`, push/pop). When the styled run wraps,
 * each output line is rendered independently from `baseStyle` — so a
 * continuation line that carries visible styled text but NOT the active fg SGR
 * renders in the DEFAULT color. The fg is silently dropped on every line after
 * the first.
 *
 * A single (non-nested) colored `<Text>` does NOT show the bug: its color is a
 * node-level `style.color` applied to every cell, independent of inline ANSI.
 *
 * Live repro (`@km/code/v0.2/19690-status-tuple-wrap-color`): an inline-code
 * status tuple `` `M @km/code/v0.2/<bead>.md` `` renders blue on `M` (first
 * line) and default on `@km/...` (continuation line) — only the first
 * wrapped line keeps the inline-code color.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { wrapText, parseAnsiText } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { formatTextLines } from "@silvery/ag-term/pipeline/render-text"

const FG_OPEN = "\x1b[38;2;100;203;139m"
const FG_CLOSE = "\x1b[39m"
// Any 38;2 (truecolor) or 38;5 (256) or 30-37/90-97 fg open code.
const FG_OPEN_RE = /\x1b\[(?:38[;:]|3[0-7]m|9[0-7]m)/

/** Lines that carry visible styled-run text (one of the styled words). */
function styledWordsOnLine(line: string, words: string[]): string[] {
  const stripped = line.replace(/\x1b\[[0-9;:]*m/g, "")
  return words.filter((w) => stripped.includes(w))
}

describe("wrapText: nested SGR fg self-containment", () => {
  test("single-line styled run is untouched", () => {
    const text = `${FG_OPEN}Hello${FG_CLOSE}`
    expect(wrapText(text, 20)).toEqual([text])
  })

  test("wrapped styled run re-opens the fg on every continuation line", () => {
    const words = ["alpha", "betagammadelta", "epsilon"]
    const text = `prefix ${FG_OPEN}${words.join(" ")}${FG_CLOSE} suffix`
    const lines = wrapText(text, 14)
    expect(lines.length).toBeGreaterThan(1) // must actually wrap inside the run

    for (const line of lines) {
      const styled = styledWordsOnLine(line, words)
      if (styled.length === 0) continue // prose-only line (prefix/suffix)
      expect(
        FG_OPEN_RE.test(line),
        `line carries styled text ${JSON.stringify(styled)} but no fg SGR open:\n${JSON.stringify(line)}`,
      ).toBe(true)
    }
  })

  test("parseAnsiText: each styled word keeps a non-null fg after wrap", () => {
    const words = ["alpha", "betagammadelta", "epsilon"]
    const text = `prefix ${FG_OPEN}${words.join(" ")}${FG_CLOSE} suffix`
    const lines = wrapText(text, 14)

    for (const line of lines) {
      for (const seg of parseAnsiText(line)) {
        const segWords = words.filter((w) => seg.text.includes(w))
        if (segWords.length === 0) continue
        expect(
          seg.fg != null,
          `segment ${JSON.stringify(seg.text)} (words ${JSON.stringify(segWords)}) lost its fg (fg=${seg.fg})`,
        ).toBe(true)
      }
    }
  })
})

describe("formatTextLines wrap='even' (optimalWrap, user-role prompts)", () => {
  // User-role messages render with wrap="even", which routes through the
  // Knuth-Plass optimalWrap path — a separate code path from greedy wrapText.
  test("re-opens the fg on every continuation line", () => {
    const words = ["alpha", "betagammadelta", "epsilon"]
    const collected = `prefix ${FG_OPEN}${words.join(" ")}${FG_CLOSE} suffix`
    const lines = formatTextLines(collected, 14, "even", undefined, true)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      for (const seg of parseAnsiText(line)) {
        const segWords = words.filter((w) => seg.text.includes(w))
        if (segWords.length === 0) continue
        expect(seg.fg != null, `even-wrap segment ${JSON.stringify(seg.text)} lost its fg`).toBe(
          true,
        )
      }
    }
  })
})

describe("rendered: nested colored Text keeps color across soft-wrap", () => {
  function coloredCellsForWord(
    app: { lines: string[]; cell: (x: number, y: number) => { fg: unknown; char: string } },
    word: string,
  ): { total: number; colored: number } {
    let total = 0
    let colored = 0
    for (let y = 0; y < app.lines.length; y++) {
      const line = app.lines[y] ?? ""
      const idx = line.indexOf(word)
      if (idx < 0) continue
      for (let x = idx; x < idx + word.length; x++) {
        total++
        if (app.cell(x, y).fg != null) colored++
      }
    }
    return { total, colored }
  }

  test("a nested <Text color> whose content wraps colors EVERY line", () => {
    const render = createRenderer({ cols: 24, rows: 8 })
    const app = render(
      <Box flexDirection="column" width={24}>
        <Text wrap="wrap">
          prefix <Text color="$fg-accent">alpha betagammadelta epsilon</Text> suffix
        </Text>
      </Box>,
    )
    // `betagammadelta` and `epsilon` land on continuation lines.
    for (const word of ["alpha", "betagammadelta", "epsilon"]) {
      const { total, colored } = coloredCellsForWord(app as never, word)
      expect(total, `word ${word} not found in render:\n${app.lines.join("\n")}`).toBeGreaterThan(0)
      expect(
        colored,
        `word ${word}: ${colored}/${total} cells colored — continuation lost the nested fg:\n${app.lines.join("\n")}`,
      ).toBe(total)
    }
    // Plain prose stays default.
    expect(coloredCellsForWord(app as never, "prefix").colored).toBe(0)
    expect(coloredCellsForWord(app as never, "suffix").colored).toBe(0)
  })
})
