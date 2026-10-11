/**
 * Pre-enrollment security audit (hh 28598 slice c): syntax highlighting of
 * untrusted source.
 *
 * `highlight(code, lang)` used to hand the whole string to a TextMate grammar
 * with no bound on size or line length. Hostile markdown of a few MB blocked
 * the event loop for ~21 s (audit F6). The contract: oversize or over-long-line
 * input falls back to plain tokens; source text is preserved; small input still
 * highlights. Thresholds match the bound in `@silvery/syntax` (256 KiB / 4000
 * chars). Do not add a wall-clock 10k-line markdown case — the bound is the
 * owner, and that fixture is the finding, not the regression.
 *
 * @failure Untrusted source of a few MB or one huge line runs unbounded Shiki
 *   and freezes the event loop for tens of seconds.
 * @level l2
 * @consumer @silvery/syntax highlight (hh 28598 F6)
 * @testonly none
 */

import { describe, expect, test } from "vitest"
import { highlight, type TokenLine } from "../../packages/syntax/src/index"

/** Must match packages/syntax/src/index.ts MAX_HIGHLIGHT_CHARS. */
const MAX_HIGHLIGHT_CHARS = 256 * 1024
/** Must match packages/syntax/src/index.ts MAX_HIGHLIGHT_LINE_CHARS. */
const MAX_HIGHLIGHT_LINE_CHARS = 4000

const COLORED = "const x = 1"

function sourceOf(lines: TokenLine[]): string {
  return lines.map((line) => line.tokens.map((t) => t.text).join("")).join("\n")
}

function hasColor(lines: TokenLine[]): boolean {
  return lines.some((line) => line.tokens.some((t) => t.color))
}

describe("syntax highlighting bound on untrusted input", () => {
  test("small typescript still highlights", async () => {
    const lines = await highlight(COLORED, "typescript")
    expect(hasColor(lines), "control: tiny typescript must still be highlighted").toBe(true)
    expect(sourceOf(lines)).toBe(COLORED)
  })

  test("a body over 256 KiB of short lines falls back to plain tokens", async () => {
    const line = "const x = 1\n"
    const count = Math.floor(MAX_HIGHLIGHT_CHARS / line.length) + 1
    const code = line.repeat(count)
    expect(code.length).toBeGreaterThan(MAX_HIGHLIGHT_CHARS)

    const lines = await highlight(code, "typescript")
    expect(hasColor(lines), "oversize body must not run the grammar").toBe(false)
    expect(sourceOf(lines)).toBe(code)
  })

  test("one line longer than 4000 chars falls back to plain tokens", async () => {
    const prefix = "const x = 1; "
    const code = prefix + "x".repeat(MAX_HIGHLIGHT_LINE_CHARS)
    expect(code.length).toBeGreaterThan(MAX_HIGHLIGHT_LINE_CHARS)
    expect(code.length).toBeLessThan(MAX_HIGHLIGHT_CHARS)

    const lines = await highlight(code, "typescript")
    expect(hasColor(lines), "over-long line must not run the grammar").toBe(false)
    expect(sourceOf(lines)).toBe(code)
    expect(lines).toHaveLength(1)
  })

  test("a line at the 4000-char cap still highlights", async () => {
    const prefix = "const x = 1; "
    const code = prefix + "x".repeat(MAX_HIGHLIGHT_LINE_CHARS - prefix.length)
    expect(code.length).toBe(MAX_HIGHLIGHT_LINE_CHARS)

    const lines = await highlight(code, "typescript")
    expect(hasColor(lines), "a line at the cap must still be highlighted").toBe(true)
    expect(sourceOf(lines)).toBe(code)
  })
})
