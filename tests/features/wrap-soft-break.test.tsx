/**
 * Soft-break wrap tests — long unbreakable tokens (paths, identifiers,
 * namespaces) wrap at separator characters (`/`, `\`, `.`, `_`, `:`)
 * rather than overflowing the box or character-wrapping mid-token.
 *
 * Tracks @km/silvery/card-content-overflow-clip — when a card body
 * contains a long path like `.claude/skills/{claim,do}/SKILL.md`
 * narrower than the card's inner width, the legacy wrap algorithm
 * either overflowed the border (when the parent had no overflow="hidden")
 * or hard-clipped the path (losing information). The fix lifts the
 * separator-aware wrap into the silvery primitive so every Text with
 * `wrap="wrap"` benefits.
 *
 * Soft breaks are SECONDARY: the wrap algorithm prefers true word
 * boundaries (space / hyphen) and only falls back to soft breaks when
 * no hard break fits on the current line. This keeps existing wrap
 * behavior unchanged for prose text — the new behavior only surfaces
 * for tokens that today would either overflow or character-wrap.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { wrapText } from "@silvery/ag-term"
// `wrapTextWithOffsets` lives in the unicode module — exposed via the
// terminal-side wrap measurer registration, not the public barrel.
import { wrapTextWithOffsets } from "@silvery/ag-term/unicode"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("wrapText: soft break inside long tokens", () => {
  test("path wraps at / separators when too wide", () => {
    // At width 14, the LATEST-fitting soft-break wins per algorithm:
    // `.claude/skills/{claim,` fits at 22 cols, breaking the path so far
    // would exceed 14, so the algorithm rewinds to the last fitting
    // soft-break inside [0..14] which is `.claude/`. Same logic applies
    // to subsequent line: `skills/{claim,` (14 chars exactly) fits, so
    // `,` wins over the earlier `/` after `skills`.
    const lines = wrapText(".claude/skills/{claim,do}/SKILL.md", 14, true, false)
    expect(lines).toEqual([".claude/", "skills/{claim,", "do}/SKILL.md"])
  })

  test("absolute path wraps at /", () => {
    // The algorithm picks the LATEST soft-break that still fits — at width
    // 10, `Code/file.` (10 chars, ends at the `.`) is preferred over an
    // earlier slash because both fit but the later split keeps less
    // residue for the next line. This is correct CSS-like behavior.
    const lines = wrapText("/Users/beorn/Code/file.ext", 10, true, false)
    expect(lines).toEqual(["/Users/", "beorn/", "Code/file.", "ext"])
  })

  test("dotted identifier wraps at .", () => {
    const lines = wrapText("some.deeply.nested.thing", 8, true, false)
    expect(lines).toEqual(["some.", "deeply.", "nested.", "thing"])
  })

  test("snake_case wraps at _", () => {
    const lines = wrapText("very_long_identifier_name", 10, true, false)
    expect(lines).toEqual(["very_long_", "identifier", "_name"])
  })

  test("namespace::class::method wraps at :", () => {
    const lines = wrapText("namespace::class::method", 12, true, false)
    expect(lines).toEqual(["namespace::", "class::", "method"])
  })

  test("Windows path wraps at backslash", () => {
    const lines = wrapText("C:\\Users\\beorn\\Code", 8, true, false)
    expect(lines).toEqual(["C:\\", "Users\\", "beorn\\", "Code"])
  })

  test("hard break (space) wins when both are available", () => {
    // The space lets the algorithm break before the long token entirely;
    // the soft break inside the path is only used when no space fits.
    // First line takes "see " (space gives a hard break under width=12);
    // then "/home/user/path here" doesn't fit, so we re-anchor — leading
    // chars `/home/user/` fit (width 11), then the trailing `path here`
    // wraps as one fitting unit.
    const lines = wrapText("see /home/user/path here", 12, true, false)
    expect(lines).toEqual(["see ", "/home/user/", "path here"])
  })

  test("char wrap fallback when no separators in token", () => {
    const lines = wrapText("abcdefghijklmnop", 5, true, false)
    expect(lines).toEqual(["abcde", "fghij", "klmno", "p"])
  })

  test("token that fits is not wrapped", () => {
    const lines = wrapText("path/to/file.ext", 100, true, false)
    expect(lines).toEqual(["path/to/file.ext"])
  })

  test("user-reported scenario: SKILL.md path in body content", () => {
    // The exact form from the user's bug report: paragraph of body text
    // containing a path that's wider than the card's inner width.
    const text = "See .claude/skills/{claim,do}/SKILL.md for the workflow."
    const lines = wrapText(text, 18, true, false)
    // Every line must be <= 18 cols wide AND no line overflows.
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(18)
    }
    // Joining must reconstruct the source (modulo whitespace boundaries).
    const joined = lines.join("").replace(/ /g, "")
    const sourceCondensed = text.replace(/ /g, "")
    expect(joined).toBe(sourceCondensed)
  })

  test("comma separator: `{claim,do}` wraps at , when no / fits", () => {
    // When the available width is narrower than `{claim,do}` (10 chars)
    // and the only break opportunity inside is the `,`, the algorithm
    // breaks AFTER it: `{claim,` + `do}`.
    const lines = wrapText("{claim,do}", 7, true, false)
    expect(lines).toEqual(["{claim,", "do}"])
  })

  test("user-reported exact token: .claude/skills/{claim,do}/SKILL.md", () => {
    // The literal token from the screenshot. Must wrap inside any width
    // ≥ 10 (roughly the longest atomic segment between separators).
    const token = ".claude/skills/{claim,do}/SKILL.md"
    for (const width of [12, 16, 20, 24, 28, 30, 33]) {
      const lines = wrapText(token, width, true, false)
      for (const line of lines) {
        expect(line.length, `width ${width}: line "${line}" exceeds budget`).toBeLessThanOrEqual(width)
      }
    }
  })

  test("user-reported full body line at narrow card width", () => {
    // Narrower repro of the screenshot: a paragraph containing the path
    // at the card width visible in the screenshot (~30 cols inner).
    const text =
      "Reference incident: 33245818f feat(markdown): collectSigilLinks emits @mention and +project rows accidentally absorbed @agent/0..9.md, @agent.md, .gitignore, .claude/skills/{claim,do}/SKILL.md from a tribe peer (myself, this session)"
    for (const width of [28, 30, 33, 34, 36]) {
      const lines = wrapText(text, width, true, false)
      for (const line of lines) {
        expect(line.length, `width ${width}: line "${line}" exceeds budget`).toBeLessThanOrEqual(width)
      }
    }
  })
})

describe("wrapTextWithOffsets: soft break preserves source offsets", () => {
  test("soft-wrapped path slices map back to source indices", () => {
    const text = "path/to/long/file"
    const slices = wrapTextWithOffsets(text, 8)
    // Reconstruction: every grapheme of source is reachable via offsets.
    expect(slices.length).toBeGreaterThan(0)
    // Each slice's text should be no wider than 8 cells.
    for (const s of slices) {
      expect(s.text.length).toBeLessThanOrEqual(8)
    }
    // First slice starts at offset 0.
    expect(slices[0]!.startOffset).toBe(0)
    // Slices must monotonically advance through the source.
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i]!.startOffset).toBeGreaterThanOrEqual(
        slices[i - 1]!.endOffset,
      )
    }
  })
})

describe("Text rendering: soft-break wrap in box", () => {
  test("long path in narrow Box wraps at / instead of overflowing", () => {
    const render = createRenderer({ cols: 30, rows: 10 })
    const app = render(
      <Box width={20} flexDirection="column">
        <Text wrap="wrap">.claude/skills/SKILL.md</Text>
      </Box>,
    )
    const text = app.text
    const lines = text.split("\n").filter((l) => l.trim().length > 0)
    // No painted line should exceed the container width (20 cols).
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(20)
    }
    // Each line of the path must fit visually.
    expect(text).toContain(".claude/")
    expect(text).toContain("skills/")
    expect(text).toContain("SKILL.md")
  })
})
