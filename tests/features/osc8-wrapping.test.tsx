/**
 * OSC 8 Hyperlink Wrapping Tests
 *
 * Validates that OSC 8 hyperlink sequences are properly handled when text wraps.
 * Each wrapped line must be self-contained: open OSC 8 at start, close at end.
 * Without this fix, orphaned close sequences render as visible ']8;;\' text.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { wrapText, parseAnsiText } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"
import { Box, Text, Link } from "@silvery/ag-react"
import { formatTextLines } from "@silvery/ag-term/pipeline/render-text"

const OSC8_OPEN = (url: string) => `\x1b]8;;${url}\x1b\\`
const OSC8_CLOSE = "\x1b]8;;\x1b\\"

/** Count `]8;;` occurrences NOT immediately preceded by ESC — i.e. leaked. */
function malformedOsc8(out: string): number {
  // eslint-disable-next-line no-control-regex
  return [...out.matchAll(/\]8;;/g)].filter((m) => out[(m.index ?? 0) - 1] !== "\x1b").length
}

describe("wrapText: OSC 8 hyperlinks", () => {
  test("single-line link: no modification needed", () => {
    const text = `${OSC8_OPEN("https://example.com")}Hello${OSC8_CLOSE}`
    const lines = wrapText(text, 20)
    expect(lines).toEqual([text])
  })

  test("wrapped link: each line gets open and close", () => {
    const url = "https://example.com"
    const text = `${OSC8_OPEN(url)}Hello World${OSC8_CLOSE}`
    const lines = wrapText(text, 7)

    expect(lines.length).toBe(2)
    for (const line of lines) {
      expect(line).toContain(OSC8_OPEN(url))
      expect(line).toContain(OSC8_CLOSE)
    }
  })

  test("wrapped link: no visible escape characters", () => {
    const url = "https://example.com"
    const text = `${OSC8_OPEN(url)}Hello World${OSC8_CLOSE}`
    const lines = wrapText(text, 7)

    for (const line of lines) {
      const stripped = line.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      expect(stripped).not.toContain("]8;;")
      expect(stripped).not.toContain("\\")
    }
  })

  test("three-line wrap: all lines self-contained", () => {
    const url = "https://a.co"
    const text = `${OSC8_OPEN(url)}one two three${OSC8_CLOSE}`
    const lines = wrapText(text, 5)

    expect(lines.length).toBeGreaterThanOrEqual(3)
    for (const line of lines) {
      expect(line).toContain(OSC8_OPEN(url))
      expect(line).toContain(OSC8_CLOSE)
    }
  })

  test("text before and after link: only link portion has OSC 8", () => {
    const url = "https://x.co"
    const text = `Prefix ${OSC8_OPEN(url)}link text${OSC8_CLOSE} suffix`
    const lines = wrapText(text, 10)

    for (const line of lines) {
      const stripped = line.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      expect(stripped).not.toContain("]8;;")
    }
  })

  test("link text does not wrap: no change", () => {
    const url = "https://example.com"
    const text = `${OSC8_OPEN(url)}Hi${OSC8_CLOSE}`
    const lines = wrapText(text, 80)
    expect(lines).toEqual([text])
  })

  test("character wrap within link: OSC 8 state maintained", () => {
    const url = "https://x.co"
    const text = `${OSC8_OPEN(url)}abcdefghij${OSC8_CLOSE}`
    const lines = wrapText(text, 5)

    expect(lines.length).toBe(2)
    for (const line of lines) {
      expect(line).toContain(OSC8_OPEN(url))
      expect(line).toContain(OSC8_CLOSE)
    }
  })
})

describe("Link component: OSC 8 wrapping in rendered output", () => {
  test("wrapped Link text renders without visible escape characters", () => {
    const render = createRenderer({ cols: 10, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com" wrap="wrap">
          Hello World Link
        </Link>
      </Box>,
    )

    const text = app.text
    expect(text).not.toContain("]8;;")
    expect(text).not.toContain("\\")
    expect(text).toContain("Hello")
  })

  test("truncated Link text retains its hyperlink target", () => {
    const href = "https://example.com/repo/.bays/B1"
    const render = createRenderer({ cols: 8, rows: 2 })
    const app = render(
      <Box width={8} overflow="hidden">
        <Text minWidth={0} maxWidth="100%" wrap="truncate">
          <Link href={href}>/repo/.bays/B1</Link>
        </Text>
      </Box>,
    )

    expect(app.text).toContain("…")
    expect(app.ansi).toContain(href)
    expect(malformedOsc8(app.ansi)).toBe(0)
  })
})

/**
 * Regression: `@km/code/v0.2/19654-osc-link-leak`.
 *
 * `wrap="even"` routes through `optimalWrap` (Knuth-Plass), the one multi-line
 * wrap mode that did NOT run the per-line OSC 8 self-containment fix-up that the
 * greedy `wrap`/`wrap-truncate` paths bake in. When a link broke mid-run, a
 * continuation line carried an OSC 8 CLOSE with no matching OPEN. `parseAnsiText`
 * recorded zero hyperlink ranges and fell back to the un-stripped source text,
 * leaking `]8;;\` as literal cells (seen on Ghostty as
 * `…CommandPermissionPromptRenderer.tsx]8;;\`).
 *
 * km repro: `apps/silvercode` user-role prompts default to `wrap="even"`.
 */
describe("19654 — wrap='even' (optimalWrap) OSC 8 self-containment", () => {
  // A long file path that forces the linked run across wrap boundaries at the
  // failing widths (cols=44 was the live Ghostty repro). Realistic-scale: the
  // full collected run is ~150 chars with interleaved SGR + OSC 8 framing.
  const LONG =
    "apps/silvercode/src/components/permission/prompts/CommandPermissionPromptRenderer.tsx"
  const HREF = `file:///w/km/${LONG}`

  // Mirrors LinkifiedText's collected output: SGR fg around an OSC 8 open/close
  // pair wrapping the visible path, surrounded by plain prose.
  const collected = `open \x1b[38;2;100;203;139m${OSC8_OPEN(HREF)}${LONG}${OSC8_CLOSE}\x1b[39m now`

  test("formatTextLines wrap='even' keeps every wrapped line self-contained (cols=44)", () => {
    const lines = formatTextLines(collected, 44, "even", undefined, true)
    expect(lines.length).toBeGreaterThan(1) // must actually wrap
    for (const line of lines) {
      const stripped = line.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      expect(stripped).not.toContain("]8;;")
    }
    // Parsing each line as the renderer does must never surface literal OSC 8.
    for (const line of lines) {
      for (const seg of parseAnsiText(line)) {
        expect(seg.text).not.toContain("]8;;")
      }
    }
  })

  test("formatTextLines wrap='even' re-opens the hyperlink on continuation lines", () => {
    const lines = formatTextLines(collected, 44, "even", undefined, true)
    const joined = lines.join("")
    // Every continuation line that shows linked text re-opens + closes the link,
    // so opens and closes balance across the wrapped block.
    const opens = (joined.match(/\x1b\]8;;[^\x07\x1b]+(?:\x1b\\|\x07)/g) ?? []).length
    const closes = (joined.match(/\x1b\]8;;(?:\x1b\\|\x07)/g) ?? []).length
    expect(opens).toBeGreaterThan(0)
    expect(opens).toBe(closes)
  })

  test("narrower even-wrap width still self-contained (cols=36)", () => {
    const lines = formatTextLines(collected, 36, "even", undefined, true)
    for (const line of lines) {
      for (const seg of parseAnsiText(line)) {
        expect(seg.text).not.toContain("]8;;")
      }
    }
  })

  // Pipeline-level proof: render a real <Link wrap="even"> and assert the
  // consumer-visible text/ansi never carries a leaked terminator. This is the
  // exact surface km saw (createRenderer's plain text painted `]8;;\`).
  test("rendered <Link wrap='even'> emits no literal OSC 8 (cols=44)", () => {
    const render = createRenderer({ cols: 44, rows: 20 })
    const app = render(
      <Box flexDirection="column">
        <Text wrap="even">
          open <Link href={HREF}>{LONG}</Link> now
        </Text>
      </Box>,
    )
    expect(app.text).not.toContain("]8;;")
    expect(malformedOsc8(app.ansi)).toBe(0)
    // The link text itself still renders.
    expect(app.text).toContain("CommandPermissionPromptRenderer.tsx")
  })
})
