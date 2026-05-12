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
    // First line takes "see" (the trailing space is the break boundary
    // itself and is consumed by the rewind — see
    // @km/tui/softwrap-leading-space-on-wrap); then "/home/user/path
    // here" doesn't fit, so we re-anchor — leading chars `/home/user/`
    // fit (width 11), then the trailing `path here` wraps as one fitting
    // unit.
    const lines = wrapText("see /home/user/path here", 12, true, false)
    expect(lines).toEqual(["see", "/home/user/", "path here"])
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
        expect(line.length, `width ${width}: line "${line}" exceeds budget`).toBeLessThanOrEqual(
          width,
        )
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
        expect(line.length, `width ${width}: line "${line}" exceeds budget`).toBeLessThanOrEqual(
          width,
        )
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
      expect(slices[i]!.startOffset).toBeGreaterThanOrEqual(slices[i - 1]!.endOffset)
    }
  })

  test("word-boundary wrap rewind drops trailing space from slice text (@km/tui/softwrap-leading-space-on-wrap)", () => {
    // When a wrap occurs mid-word, the algorithm rewinds to the last
    // fitting word boundary. The trailing space at that boundary lives
    // in `currentLine` but is the boundary character itself — the next
    // slice's `startOffset` already jumps past it. The slice `text`
    // must match: no trailing space (parity with `wrapTextWithMeasurer`
    // which calls `trimEnd()` in trim mode).
    const slices = wrapTextWithOffsets("board, visible as column", 10)
    // Width 10 forces a break after "board,". The space at position 6
    // is the last word boundary — the next slice must NOT start with it,
    // and the prior slice must NOT end with it.
    expect(slices.map((s) => s.text)).not.toContain(" visible")
    for (const s of slices) {
      expect(s.text).not.toMatch(/^\s/)
      expect(s.text).not.toMatch(/\s$/)
    }
  })
})

describe("wrapText (rendering path): trailing space dropped on rewind, trim-independent (@km/tui/softwrap-leading-space-on-wrap)", () => {
  // Regression: body text inside a card with `backgroundColor` propagates
  // `inheritedBg`, which causes `formatTextLines` to call wrap with
  // `trim=false`. Both rewind paths (hard-break and soft-break) in
  // `wrapTextWithMeasurer` must still drop trailing whitespace from the
  // pushed line. Previously the `if (trim) lineToAdd = lineToAdd.trimEnd()`
  // guard meant body cards (the common case) kept trailing spaces, which
  // visibly inflated line width and showed up as a "leading space on the
  // continuation line" when the wrapped output landed inside a colored Box.

  test("hard-break rewind path: no trailing space on wrapped lines (trim=false)", () => {
    const lines = wrapText("board, visible as column", 10, true, false)
    for (const line of lines) {
      expect(line).not.toMatch(/\s$/)
      expect(line).not.toMatch(/^\s/)
    }
    expect(lines).not.toContain(" visible")
    expect(lines).not.toContain("board, ")
  })

  test("soft-break rewind path: no trailing space on wrapped lines (trim=false)", () => {
    // Path-style soft break: `some/path/file.ext` should wrap at `/`
    // with no trailing space carried into the line text.
    const lines = wrapText("foo bar/baz/qux/quux", 8, true, false)
    for (const line of lines) {
      expect(line).not.toMatch(/\s$/)
      expect(line).not.toMatch(/^\s/)
    }
  })

  test("trim=true and trim=false produce trimmed line ends (parity)", () => {
    const text = "alpha bravo, charlie delta echo"
    const linesTrim = wrapText(text, 12, true, true)
    const linesNoTrim = wrapText(text, 12, true, false)
    for (const line of linesTrim) expect(line).not.toMatch(/\s$/)
    for (const line of linesNoTrim) expect(line).not.toMatch(/\s$/)
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

  test("body-card regression: Box with backgroundColor does not leak trailing-space chrome (@km/tui/softwrap-leading-space-on-wrap)", () => {
    // Models a km-tui body card: Box has backgroundColor (sets
    // `inheritedBg`, which propagates `trim=false` into formatTextLines).
    // Before fix: the rewind path skipped `trimEnd()` because trim=false,
    // so wrapped lines kept a trailing space. Rendered inside a colored
    // Box, that trailing space painted as visible bg chrome — the user
    // saw it as a "leading space" on the continuation line.
    const render = createRenderer({ cols: 30, rows: 10 })
    const app = render(
      <Box width={12} backgroundColor="blue" flexDirection="column">
        <Text wrap="wrap">board, visible as column</Text>
      </Box>,
    )
    const text = app.text
    // No painted body line should start or end with whitespace runs
    // that come from the wrap algorithm. (Trailing right-pad inside the
    // box is the box's chrome, not text content — we check the wrapped
    // text BEFORE pad by reading the rendered visible width.)
    const visibleLines = text
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
    for (const line of visibleLines) {
      // No leading whitespace on continuation lines from wrap rewind.
      expect(line).not.toMatch(/^\s/)
    }
  })
})

/**
 * `wrap="wrap-truncate"` — body-text wrap with ellipsis fallback for atomic
 * tokens that have no soft-break separators. Tracks
 * `@km/silvery/card-body-truncate-ellipsis`.
 *
 * CSS-equivalent: `white-space: normal` + `overflow-wrap: break-word`
 * + `text-overflow: ellipsis` — the wrap algorithm prefers word and
 * separator boundaries, but when a single token can't break and would
 * otherwise character-wrap, it ellipsis-truncates THAT line instead. The
 * remainder of the unbreakable token is dropped; subsequent text after
 * the next word boundary continues wrapping normally.
 *
 * Compare with `wrap="wrap"` (character-wrap fallback, preserves all
 * content) and `wrap="truncate"` (single-line, truncates the whole text).
 */
describe('wrapText: wrap-truncate mode (atomic-overflow → "…" instead of char-wrap)', () => {
  test("atomic over-long token: ends with … instead of char-wrap", () => {
    // 28 a's at width 10 — no soft break. wrap mode would char-wrap into
    // ["aaaaaaaaaa", "aaaaaaaaaa", "aaaaaaaa"]. wrap-truncate emits one
    // line ending with the ellipsis and drops the rest.
    const lines = wrapText("aaaaaaaaaaaaaaaaaaaaaaaaaaaa", 10, true, false, true)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe("aaaaaaaaa…")
    expect(lines[0]!.endsWith("…")).toBe(true)
    expect(lines[0]!.length).toBeLessThanOrEqual(10)
  })

  test("ellipsis is the single Unicode char, not three dots", () => {
    const lines = wrapText("verylongidentifier", 8, true, false, true)
    expect(lines).toHaveLength(1)
    // Single … (HORIZONTAL ELLIPSIS), never "..."
    expect(lines[0]!.endsWith("…")).toBe(true)
    expect(lines[0]!.endsWith("...")).toBe(false)
  })

  test("path with separators still wraps normally — truncate only kicks in for atomic", () => {
    // wrap mode: ["path/", "to/", "file"]. wrap-truncate: same — soft
    // breaks let the wrap proceed without falling through to truncate.
    const linesPlain = wrapText("path/to/file", 6, true, false, false)
    const linesTrunc = wrapText("path/to/file", 6, true, false, true)
    expect(linesTrunc).toEqual(linesPlain)
  })

  test("text after atomic token continues wrapping after a word boundary", () => {
    // The atomic token gets ellipsis-truncated, but the trailing " more"
    // is a separate word and wraps normally on the next line. Confirms
    // that wrap-truncate scopes ellipsis to the offending atomic token,
    // not the entire text.
    const lines = wrapText("aaaaaaaaaaaaaaaaaaaa more", 10, true, false, true)
    // First line: truncated atomic token with ellipsis.
    expect(lines[0]!.endsWith("…")).toBe(true)
    expect(lines[0]!.length).toBeLessThanOrEqual(10)
    // Second line: the surviving word.
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines.some((l) => l.includes("more"))).toBe(true)
  })

  test("normal multi-word text wraps identically to wrap mode", () => {
    const text = "the quick brown fox jumps over the lazy dog"
    const linesPlain = wrapText(text, 12, true, false, false)
    const linesTrunc = wrapText(text, 12, true, false, true)
    expect(linesTrunc).toEqual(linesPlain)
  })

  test("token that fits is not truncated", () => {
    const lines = wrapText("aaaaaaaaaa", 100, true, false, true)
    expect(lines).toEqual(["aaaaaaaaaa"])
  })

  test("paragraph mixing wrappable + atomic tokens wraps the wrappable, truncates the atomic", () => {
    // The path wraps at separators; the atomic identifier on its own
    // line gets truncated.
    const text = "see path/to/file and also veryverylongnoseparator after"
    const lines = wrapText(text, 14, true, false, true)
    // No line exceeds 14 cols.
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(14)
    }
    // The atomic token's line ends with the ellipsis.
    const truncatedLine = lines.find((l) => l.endsWith("…"))
    expect(truncatedLine).toBeDefined()
  })
})

describe("Text rendering: wrap-truncate in box", () => {
  test("atomic token in narrow Box renders ending with …", () => {
    const render = createRenderer({ cols: 30, rows: 10 })
    const app = render(
      <Box width={12} flexDirection="column">
        <Text wrap="wrap-truncate">aaaaaaaaaaaaaaaaaaaaaaaaaaaa</Text>
      </Box>,
    )
    const text = app.text
    // Some painted line ends with the ellipsis.
    const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""))
    const ellipsisLine = lines.find((l) => l.endsWith("…"))
    expect(ellipsisLine, `expected one line ending with … in:\n${text}`).toBeDefined()
    expect(ellipsisLine!.length).toBeLessThanOrEqual(12)
    // No painted line exceeds container width (12).
    const visibleLines = lines.filter((l) => l.length > 0)
    for (const line of visibleLines) {
      expect(line.length).toBeLessThanOrEqual(12)
    }
  })

  test("path-style content in Box still wraps at separators (wrap-truncate is superset)", () => {
    const render = createRenderer({ cols: 30, rows: 10 })
    const app = render(
      <Box width={20} flexDirection="column">
        <Text wrap="wrap-truncate">.claude/skills/SKILL.md</Text>
      </Box>,
    )
    const text = app.text
    expect(text).toContain(".claude/")
    expect(text).toContain("skills/")
    expect(text).toContain("SKILL.md")
    // No ellipsis was needed — the path soft-broke cleanly.
    expect(text.includes("…")).toBe(false)
  })
})
