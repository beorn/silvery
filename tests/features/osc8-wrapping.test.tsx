/**
 * OSC 8 Hyperlink Wrapping Tests
 *
 * Validates that OSC 8 hyperlink sequences are properly handled when text wraps.
 * Each wrapped line must be self-contained: open OSC 8 at start, close at end.
 * Without this fix, orphaned close sequences render as visible ']8;;\' text.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { wrapText } from "@silvery/react"
import { createRenderer } from "@silvery/test"
import { Box, Text, Link } from "@silvery/react"

const OSC8_OPEN = (url: string) => `\x1b]8;;${url}\x1b\\`
const OSC8_CLOSE = "\x1b]8;;\x1b\\"

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

    // "Hello " fits on line 1, "World" on line 2
    // Each line should have its own OSC 8 open/close
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

    // No visible ']8;;' text should appear in any line
    for (const line of lines) {
      // Strip all valid OSC 8 sequences, then check nothing looks like a broken one
      const stripped = line.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      expect(stripped).not.toContain("]8;;")
      expect(stripped).not.toContain("\\")
    }
  })

  test("three-line wrap: all lines self-contained", () => {
    const url = "https://a.co"
    const text = `${OSC8_OPEN(url)}one two three${OSC8_CLOSE}`
    const lines = wrapText(text, 5)

    // Should wrap into ~3 lines
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

    // First line has prefix, may or may not have link start
    // Key assertion: no orphaned close sequences
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
    // A very long word that must character-wrap
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

    // The rendered text should show "Hello" and "World" etc. but NO ']8;;\' fragments
    const text = app.text
    expect(text).not.toContain("]8;;")
    expect(text).not.toContain("\\")
    expect(text).toContain("Hello")
  })
})
