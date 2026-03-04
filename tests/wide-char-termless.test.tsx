/**
 * Tests for wide character ANSI output using termless (real terminal emulator).
 *
 * These tests verify that wide characters (CJK, emoji) rendered by inkx produce
 * correct terminal state when the ANSI output is fed through a real terminal
 * emulator (xterm.js). This catches output-phase bugs that virtual buffer tests
 * miss — such as incorrect cursor positioning after wide chars, missing
 * continuation cells, or broken incremental diffs involving wide characters.
 *
 * Uses termless with xterm.js backend to emulate a real terminal.
 *
 * Note on text matching: xterm.js represents wide characters as a main cell
 * (with the character) and a continuation cell (empty string). When reading
 * text via getText(), continuation cells produce spaces between wide chars.
 * So "廈門市" reads as "廈 門 市". We assert individual characters or use
 * cell-level assertions to avoid false failures from this representation.
 *
 * Note on emoji width: xterm.js may not classify all emoji as width-2
 * (depends on Unicode tables). We verify emoji content is present and
 * use cell-level assertions for CJK width where xterm.js is reliable.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { enterAlternateScreen } from "../src/output.js"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"
import { createTerminalFixture } from "@termless/test"

// ============================================================================
// Helpers
// ============================================================================

/** Create a termless terminal and enter alternate screen for fullscreen testing. */
function createTestTerminal(cols: number, rows: number) {
  const term = createTerminalFixture({
    cols,
    rows,
    scrollbackLimit: 0,
  })
  // Enter alternate screen to match fullscreen mode behavior
  term.feed(enterAlternateScreen())
  return term
}

/** Render an inkx component, get its buffer, produce ANSI, feed to termless. */
function renderToTerminal(element: React.ReactElement, opts: { cols: number; rows: number }) {
  const render = createRenderer({ cols: opts.cols, rows: opts.rows })
  const app = render(element)
  const buffer = app.lastBuffer()!
  const ansi = outputPhase(null, buffer)
  const term = createTestTerminal(opts.cols, opts.rows)
  term.feed(ansi)
  return { term, app, buffer }
}

// ============================================================================
// CJK character renders as wide (2 cells) with correct text
// ============================================================================

describe("CJK character renders as wide in termless", () => {
  test("single CJK character occupies 2 cells", () => {
    const term = createTestTerminal(20, 3)
    const buf = new TerminalBuffer(20, 3)

    buf.setCell(0, 0, { char: "\u4e2d", wide: true })
    buf.setCell(1, 0, { char: "", continuation: true })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term.cell(0, 0)).toBeWide()
    expect(term.screen).toContainText("\u4e2d")
  })

  test("multiple CJK characters each occupy 2 cells", () => {
    const term = createTestTerminal(20, 3)
    const buf = new TerminalBuffer(20, 3)

    // 廈門市 = 3 CJK chars = 6 display columns
    buf.setCell(0, 0, { char: "廈", wide: true })
    buf.setCell(1, 0, { char: "", continuation: true })
    buf.setCell(2, 0, { char: "門", wide: true })
    buf.setCell(3, 0, { char: "", continuation: true })
    buf.setCell(4, 0, { char: "市", wide: true })
    buf.setCell(5, 0, { char: "", continuation: true })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    // Each CJK char at even columns is wide
    expect(term.cell(0, 0)).toBeWide()
    expect(term.cell(0, 2)).toBeWide()
    expect(term.cell(0, 4)).toBeWide()
    // Each character is individually present
    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("門")
    expect(term.screen).toContainText("市")
  })
})

// ============================================================================
// Text after CJK is positioned correctly
// ============================================================================

describe("text after CJK character is positioned correctly", () => {
  test("ASCII after CJK starts at correct column offset", () => {
    const term = createTestTerminal(20, 3)
    const buf = new TerminalBuffer(20, 3)

    // "中A" — CJK at col 0-1, ASCII 'A' at col 2
    buf.setCell(0, 0, { char: "中", wide: true })
    buf.setCell(1, 0, { char: "", continuation: true })
    buf.setCell(2, 0, { char: "A" })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term.cell(0, 0)).toBeWide()
    expect(term.screen).toContainText("中")
    // Verify 'A' is at column 2, not drifted
    const cellA = term.row(0).cellAt(2)
    expect(cellA.text).toBe("A")
  })

  test("ASCII text after multiple CJK chars is not drifted", () => {
    const term = createTestTerminal(20, 3)
    const buf = new TerminalBuffer(20, 3)

    // "廈門X" — 2 CJK chars (4 display cols) then 'X' at col 4
    buf.setCell(0, 0, { char: "廈", wide: true })
    buf.setCell(1, 0, { char: "", continuation: true })
    buf.setCell(2, 0, { char: "門", wide: true })
    buf.setCell(3, 0, { char: "", continuation: true })
    buf.setCell(4, 0, { char: "X" })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    // Verify 'X' is at column 4 — no cursor drift
    const cellX = term.row(0).cellAt(4)
    expect(cellX.text).toBe("X")
  })
})

// ============================================================================
// Emoji renders correctly
// ============================================================================

describe("emoji renders correctly in termless", () => {
  test("single emoji renders and text after it is present", () => {
    const term = createTestTerminal(20, 3)
    const buf = new TerminalBuffer(20, 3)

    buf.setCell(0, 0, { char: "🌍", wide: true })
    buf.setCell(1, 0, { char: "", continuation: true })
    buf.setCell(2, 0, { char: "Z" })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term.screen).toContainText("🌍")
    expect(term.screen).toContainText("Z")
  })

  test("emoji followed by ASCII text does not drift", () => {
    const term = createTestTerminal(20, 3)
    const buf = new TerminalBuffer(20, 3)

    // "🌍 ok" — emoji at col 0-1, space at 2, 'o' at 3, 'k' at 4
    buf.setCell(0, 0, { char: "🌍", wide: true })
    buf.setCell(1, 0, { char: "", continuation: true })
    buf.setCell(2, 0, { char: " " })
    buf.setCell(3, 0, { char: "o" })
    buf.setCell(4, 0, { char: "k" })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term.screen).toContainText("🌍")
    expect(term.screen).toContainText("ok")
    // Verify 'o' and 'k' are adjacent and in the right order.
    // xterm.js may render emoji as width-1 or width-2 depending on its
    // Unicode tables, so we find 'o' dynamically rather than hardcoding col.
    const rowText = term.row(0).getText()
    const oIdx = rowText.indexOf("ok")
    expect(oIdx).toBeGreaterThan(0)
  })
})

// ============================================================================
// Mixed ASCII + CJK + emoji in same line
// ============================================================================

describe("mixed ASCII + CJK + emoji in same line", () => {
  test("ASCII, CJK, and emoji interleaved on one row", () => {
    const term = createTestTerminal(30, 3)
    const buf = new TerminalBuffer(30, 3)

    // "Hi 中 🌍 ok"
    // H=0, i=1, sp=2, 中=3-4, sp=5, 🌍=6-7, sp=8, o=9, k=10
    buf.setCell(0, 0, { char: "H" })
    buf.setCell(1, 0, { char: "i" })
    buf.setCell(2, 0, { char: " " })
    buf.setCell(3, 0, { char: "中", wide: true })
    buf.setCell(4, 0, { char: "", continuation: true })
    buf.setCell(5, 0, { char: " " })
    buf.setCell(6, 0, { char: "🌍", wide: true })
    buf.setCell(7, 0, { char: "", continuation: true })
    buf.setCell(8, 0, { char: " " })
    buf.setCell(9, 0, { char: "o" })
    buf.setCell(10, 0, { char: "k" })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term.screen).toContainText("Hi")
    expect(term.screen).toContainText("中")
    expect(term.screen).toContainText("🌍")
    expect(term.screen).toContainText("ok")

    // CJK character is wide
    expect(term.cell(0, 3)).toBeWide()
    // Verify text positions: 'ok' appears after the emoji section
    const rowText = term.row(0).getText()
    expect(rowText).toContain("ok")
    // 'ok' should appear after the emoji, not before
    const hiIdx = rowText.indexOf("Hi")
    const okIdx = rowText.indexOf("ok")
    expect(okIdx).toBeGreaterThan(hiIdx)
  })

  test("mixed content via inkx component", () => {
    const { term } = renderToTerminal(<Text>Hello 中文 🌍 World</Text>, { cols: 40, rows: 3 })

    expect(term.screen).toContainText("Hello")
    expect(term.screen).toContainText("World")
    expect(term.screen).toContainText("🌍")
    expect(term.screen).toContainText("中")
  })
})

// ============================================================================
// Wide char at end of line
// ============================================================================

describe("wide char at end of line", () => {
  test("CJK at last two columns of the row", () => {
    const term = createTestTerminal(10, 3)
    const buf = new TerminalBuffer(10, 3)

    // Fill cols 0-7 with ASCII, CJK at cols 8-9
    for (let x = 0; x < 8; x++) {
      buf.setCell(x, 0, { char: "." })
    }
    buf.setCell(8, 0, { char: "中", wide: true })
    buf.setCell(9, 0, { char: "", continuation: true })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term.cell(0, 8)).toBeWide()
    expect(term.screen).toContainText("中")
  })

  test("emoji at last two columns does not wrap or corrupt", () => {
    const term = createTestTerminal(8, 3)
    const buf = new TerminalBuffer(8, 3)

    for (let x = 0; x < 6; x++) {
      buf.setCell(x, 0, { char: "A" })
    }
    buf.setCell(6, 0, { char: "🌍", wide: true })
    buf.setCell(7, 0, { char: "", continuation: true })

    const ansi = outputPhase(null, buf)
    term.feed(ansi)

    expect(term.screen).toContainText("🌍")
    expect(term.screen).toContainText("AAAAAA")
  })
})

// ============================================================================
// Incremental update: wide char to narrow and vice versa
// ============================================================================

describe("incremental update with wide/narrow transitions", () => {
  test("wide CJK replaced by narrow chars in diff render", () => {
    const term = createTestTerminal(20, 3)

    // Initial: wide char + ASCII
    const buf1 = new TerminalBuffer(20, 3)
    buf1.setCell(0, 0, { char: "中", wide: true })
    buf1.setCell(1, 0, { char: "", continuation: true })
    buf1.setCell(2, 0, { char: "X" })

    const ansi1 = outputPhase(null, buf1)
    term.feed(ansi1)
    expect(term.cell(0, 0)).toBeWide()
    expect(term.screen).toContainText("中")

    // Diff: replace wide char with two narrow chars
    const buf2 = new TerminalBuffer(20, 3)
    buf2.setCell(0, 0, { char: "a" })
    buf2.setCell(1, 0, { char: "b" })
    buf2.setCell(2, 0, { char: "X" })

    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    expect(term.screen).toContainText("ab")
    expect(term.screen).toContainText("X")
    // Wide char should be gone
    expect(term.screen.getText()).not.toContain("中")
  })

  test("narrow chars replaced by wide CJK in diff render", () => {
    const term = createTestTerminal(20, 3)

    // Initial: narrow chars
    const buf1 = new TerminalBuffer(20, 3)
    buf1.setCell(0, 0, { char: "a" })
    buf1.setCell(1, 0, { char: "b" })
    buf1.setCell(2, 0, { char: "X" })

    const ansi1 = outputPhase(null, buf1)
    term.feed(ansi1)
    expect(term.screen).toContainText("ab")

    // Diff: replace narrow with wide
    const buf2 = new TerminalBuffer(20, 3)
    buf2.setCell(0, 0, { char: "中", wide: true })
    buf2.setCell(1, 0, { char: "", continuation: true })
    buf2.setCell(2, 0, { char: "X" })

    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    expect(term.cell(0, 0)).toBeWide()
    expect(term.screen).toContainText("中")
    expect(term.screen).toContainText("X")
  })

  test("wide emoji changed to different emoji via diff", () => {
    const term = createTestTerminal(20, 3)

    // Initial: 🌍 + Z
    const buf1 = new TerminalBuffer(20, 3)
    buf1.setCell(0, 0, { char: "🌍", wide: true })
    buf1.setCell(1, 0, { char: "", continuation: true })
    buf1.setCell(2, 0, { char: "Z" })

    const ansi1 = outputPhase(null, buf1)
    term.feed(ansi1)
    expect(term.screen).toContainText("🌍")

    // Diff: 🌍 -> 🎉
    const buf2 = new TerminalBuffer(20, 3)
    buf2.setCell(0, 0, { char: "🎉", wide: true })
    buf2.setCell(1, 0, { char: "", continuation: true })
    buf2.setCell(2, 0, { char: "Z" })

    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    expect(term.screen).toContainText("🎉")
    expect(term.screen.getText()).not.toContain("🌍")
    expect(term.screen).toContainText("Z")
  })

  test("component-level wide-to-narrow transition via rerender", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })

    function App({ useCJK }: { useCJK: boolean }) {
      return (
        <Box flexDirection="row" width={40}>
          <Box width={20}>
            <Text>{useCJK ? "廈門 hello" : "plain text here"}</Text>
          </Box>
          <Box width={20}>
            <Text>right side</Text>
          </Box>
        </Box>
      )
    }

    // Render CJK version
    const app = render(<App useCJK={true} />)
    const buf1 = app.lastBuffer()!
    const ansi1 = outputPhase(null, buf1)

    const term = createTestTerminal(cols, rows)
    term.feed(ansi1)
    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("門")
    expect(term.screen).toContainText("right side")

    // Rerender to plain text and apply diff
    app.rerender(<App useCJK={false} />)
    const buf2 = app.lastBuffer()!
    const ansi2 = outputPhase(buf1, buf2)
    term.feed(ansi2)

    expect(term.screen).toContainText("plain text here")
    expect(term.screen).toContainText("right side")

    // Rerender back to CJK
    app.rerender(<App useCJK={true} />)
    const buf3 = app.lastBuffer()!
    const ansi3 = outputPhase(buf2, buf3)
    term.feed(ansi3)

    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("門")
    expect(term.screen).toContainText("right side")
  })
})

// ============================================================================
// Wide char in a Box with border
// ============================================================================

describe("wide char in Box with border", () => {
  test("CJK text inside bordered box renders correctly", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="single" width={20}>
        <Text>廈門市</Text>
      </Box>,
      { cols: 30, rows: 5 },
    )

    // Each CJK char present
    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("門")
    expect(term.screen).toContainText("市")
    // Border characters should be present
    expect(term.screen).toContainText("│")
  })

  test("CJK and bordered box side by side", () => {
    const { term } = renderToTerminal(
      <Box flexDirection="row" width={60}>
        <Box width={30}>
          <Text>項目名稱：廈門大廈報表清理</Text>
        </Box>
        <Box width={30} borderStyle="single">
          <Text>card content</Text>
        </Box>
      </Box>,
      { cols: 60, rows: 5 },
    )

    // CJK chars are individually present
    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("門")
    expect(term.screen).toContainText("card content")
    // Border should render without corruption from CJK continuation cells
    expect(term.screen).toContainText("│")
  })

  test("emoji inside double-bordered box", () => {
    const { term } = renderToTerminal(
      <Box borderStyle="double" width={20}>
        <Text>🌍 World</Text>
      </Box>,
      { cols: 30, rows: 5 },
    )

    expect(term.screen).toContainText("🌍")
    expect(term.screen).toContainText("World")
    expect(term.screen).toContainText("║")
  })
})

// ============================================================================
// Multi-row with mixed wide characters
// ============================================================================

describe("multi-row with mixed wide characters", () => {
  test("CJK text on multiple rows renders correctly", () => {
    const { term } = renderToTerminal(
      <Box flexDirection="column" width={40}>
        <Text>第一行：廈門大廈</Text>
        <Text>第二行：報表清理</Text>
        <Text>Third line: ASCII</Text>
      </Box>,
      { cols: 40, rows: 5 },
    )

    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("報")
    expect(term.screen).toContainText("Third line: ASCII")
  })

  test("three-column layout with CJK, emoji, and ASCII", () => {
    const { term } = renderToTerminal(
      <Box flexDirection="row" width={60}>
        <Box width={20}>
          <Text>廈門市</Text>
        </Box>
        <Box width={20}>
          <Text>🌍 Earth</Text>
        </Box>
        <Box width={20}>
          <Text>Hello World</Text>
        </Box>
      </Box>,
      { cols: 60, rows: 3 },
    )

    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("🌍")
    expect(term.screen).toContainText("Earth")
    expect(term.screen).toContainText("Hello World")
  })
})

// ============================================================================
// Incremental: component-level multi-frame consistency
// ============================================================================

describe("multi-frame incremental consistency with wide chars", () => {
  test("multiple rerenders with CJK text accumulate correctly", () => {
    const cols = 60
    const rows = 5
    const render = createRenderer({ cols, rows })

    function App({ lang }: { lang: "zh" | "ja" | "ko" | "en" }) {
      const texts: Record<string, string> = {
        zh: "廈門大廈 報表清理",
        ja: "東京タワー 展望台",
        ko: "서울특별시 강남구",
        en: "Hello World Test",
      }
      return (
        <Box flexDirection="row" width={60}>
          <Box width={30}>
            <Text>{texts[lang]}</Text>
          </Box>
          <Box width={30}>
            <Text>Lang: {lang}</Text>
          </Box>
        </Box>
      )
    }

    const term = createTestTerminal(cols, rows)

    // Frame 1: Chinese
    const app = render(<App lang="zh" />)
    let prevBuf = app.lastBuffer()!
    term.feed(outputPhase(null, prevBuf))
    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("Lang: zh")

    // Frame 2: Japanese
    app.rerender(<App lang="ja" />)
    let nextBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, nextBuf))
    prevBuf = nextBuf
    expect(term.screen).toContainText("東")
    expect(term.screen).toContainText("タ")
    expect(term.screen).toContainText("Lang: ja")
    // Old Chinese chars should be gone
    expect(term.screen.getText()).not.toContain("廈")

    // Frame 3: Korean
    app.rerender(<App lang="ko" />)
    nextBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, nextBuf))
    prevBuf = nextBuf
    expect(term.screen).toContainText("서")
    expect(term.screen).toContainText("Lang: ko")

    // Frame 4: English (wide -> narrow)
    app.rerender(<App lang="en" />)
    nextBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, nextBuf))
    prevBuf = nextBuf
    expect(term.screen).toContainText("Hello World Test")
    expect(term.screen).toContainText("Lang: en")

    // Frame 5: Back to Chinese (narrow -> wide)
    app.rerender(<App lang="zh" />)
    nextBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, nextBuf))
    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("Lang: zh")
  })

  test("emoji appearing and disappearing across frames", () => {
    const cols = 30
    const rows = 3
    const render = createRenderer({ cols, rows })

    function App({ showEmoji }: { showEmoji: boolean }) {
      return <Text>{showEmoji ? "🌍 active" : "   idle  "}</Text>
    }

    const term = createTestTerminal(cols, rows)

    // Frame 1: emoji visible
    const app = render(<App showEmoji={true} />)
    let prevBuf = app.lastBuffer()!
    term.feed(outputPhase(null, prevBuf))
    expect(term.screen).toContainText("active")

    // Frame 2: emoji gone (wide -> narrow)
    app.rerender(<App showEmoji={false} />)
    let nextBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, nextBuf))
    prevBuf = nextBuf
    expect(term.screen).toContainText("idle")

    // Frame 3: emoji back (narrow -> wide)
    app.rerender(<App showEmoji={true} />)
    nextBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, nextBuf))
    expect(term.screen).toContainText("active")
  })
})

// ============================================================================
// Adjacent containers: CJK + bordered box (the Asana vault scenario)
// ============================================================================

describe("adjacent containers with CJK and borders", () => {
  test("CJK text near boundary with bordered sibling", () => {
    const cols = 60
    const rows = 5
    const render = createRenderer({ cols, rows })

    // This is the exact Asana import scenario that caught real bugs:
    // CJK text fills to near column boundary, adjacent bordered box starts
    const app = render(
      <Box flexDirection="row" width={60}>
        <Box width={30}>
          <Text>項目名稱：廈門大廈報表清理</Text>
        </Box>
        <Box width={30} borderStyle="single">
          <Text>card content</Text>
        </Box>
      </Box>,
    )

    const buf = app.lastBuffer()!
    const ansi = outputPhase(null, buf)
    const term = createTestTerminal(cols, rows)
    term.feed(ansi)

    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("card content")
    // Border should not be corrupted by CJK continuation cells
    expect(term.screen).toContainText("│")
  })

  test("incremental update of bordered box next to CJK", () => {
    const cols = 60
    const rows = 5
    const render = createRenderer({ cols, rows })

    function App({ status }: { status: string }) {
      return (
        <Box flexDirection="row" width={60}>
          <Box width={30}>
            <Text>項目名稱：廈門大廈報表清理</Text>
          </Box>
          <Box width={30} borderStyle="single">
            <Text>Status: {status}</Text>
          </Box>
        </Box>
      )
    }

    const term = createTestTerminal(cols, rows)

    // Frame 1
    const app = render(<App status="pending" />)
    let prevBuf = app.lastBuffer()!
    term.feed(outputPhase(null, prevBuf))
    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("Status: pending")

    // Frame 2: only the right box changes
    app.rerender(<App status="done" />)
    const nextBuf = app.lastBuffer()!
    term.feed(outputPhase(prevBuf, nextBuf))

    expect(term.screen).toContainText("廈")
    expect(term.screen).toContainText("Status: done")
    expect(term.screen.getText()).not.toContain("pending")
  })
})
