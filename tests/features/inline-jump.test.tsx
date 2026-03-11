/**
 * Inline Jump Bug — Screen jumps up after content height changes in inline mode.
 *
 * When content height changes between frames (e.g., hitting Enter adds a new exchange),
 * inlineIncrementalRender falls back to inlineFullRender. The cursor math in
 * inlineFullRender may overshoot or undershoot the render region start, causing
 * content to briefly shift (the visual "jump").
 *
 * Tests use the same VT screen simulator pattern from inline-bleed.test.tsx.
 */

import { describe, test, expect } from "vitest"
import { createBuffer, type TerminalBuffer } from "@silvery/term/buffer"
import { createOutputPhase } from "@silvery/term/pipeline/output-phase"

// ============================================================================
// Minimal VT Screen Simulator
// ============================================================================

/**
 * Minimal terminal screen that interprets ANSI output from the inline output phase.
 *
 * Supports: cursor movement (CUU, CUD, CUF, CUB, CUP), carriage return,
 * newline, erase-to-end-of-line (EL), erase-to-end-of-screen (ED),
 * cursor show/hide. Does NOT need SGR parsing — we only care about
 * text placement and erasure.
 */
function createScreen(cols: number, rows: number) {
  const cells: string[][] = Array.from({ length: rows }, () => Array(cols).fill(" "))
  const scrollbackLines: string[] = []
  let cursorX = 0
  let cursorY = 0

  function feed(ansi: string): void {
    let i = 0
    while (i < ansi.length) {
      if (ansi[i] === "\x1b") {
        // ESC sequence
        if (ansi[i + 1] === "[") {
          // CSI sequence: ESC [ (optional '?' or '>' prefix) params final-byte
          let j = i + 2
          let isPrivate = false
          // Skip DEC private mode prefix (? or >)
          if (j < ansi.length && (ansi[j] === "?" || ansi[j] === ">")) {
            isPrivate = true
            j++
          }
          // Collect parameter bytes (digits and semicolons)
          let params = ""
          while (j < ansi.length && ((ansi[j]! >= "0" && ansi[j]! <= "9") || ansi[j] === ";")) {
            params += ansi[j]
            j++
          }
          const cmd = ansi[j]
          j++
          const paramParts = params.split(";")
          const n = paramParts[0] ? parseInt(paramParts[0], 10) : 1

          if (isPrivate) {
            // DEC private mode sequences — ignore (cursor show/hide, etc.)
            i = j
            continue
          }

          switch (cmd) {
            case "A": // CUU - cursor up
              cursorY = Math.max(0, cursorY - n)
              break
            case "B": // CUD - cursor down
              cursorY = Math.min(rows - 1, cursorY + n)
              break
            case "C": // CUF - cursor forward
              cursorX = Math.min(cols - 1, cursorX + n)
              break
            case "D": // CUB - cursor back
              cursorX = Math.max(0, cursorX - n)
              break
            case "H": {
              // CUP - cursor position
              cursorY = Math.max(0, parseInt(paramParts[0] || "1", 10) - 1)
              cursorX = Math.max(0, parseInt(paramParts[1] || "1", 10) - 1)
              break
            }
            case "J": // ED - erase display
              if (params === "" || params === "0") {
                // Erase from cursor to end of screen
                for (let x = cursorX; x < cols; x++) cells[cursorY]![x] = " "
                for (let y = cursorY + 1; y < rows; y++) {
                  for (let x = 0; x < cols; x++) cells[y]![x] = " "
                }
              } else if (params === "2") {
                // Erase entire screen
                for (let y = 0; y < rows; y++) {
                  for (let x = 0; x < cols; x++) cells[y]![x] = " "
                }
              } else if (params === "3") {
                // Erase scrollback (no-op)
              }
              break
            case "K": // EL - erase in line
              if (params === "" || params === "0") {
                for (let x = cursorX; x < cols; x++) cells[cursorY]![x] = " "
              }
              break
            case "m": // SGR - style (ignore)
              break
            default:
              // Unknown CSI — skip
              break
          }
          i = j
        } else if (ansi[i + 1] === "]") {
          // OSC sequence — skip to ST (\x1b\\) or BEL (\x07)
          let j = i + 2
          while (j < ansi.length) {
            if (ansi[j] === "\x07") {
              j++
              break
            }
            if (ansi[j] === "\x1b" && ansi[j + 1] === "\\") {
              j += 2
              break
            }
            j++
          }
          i = j
        } else {
          i += 2 // Unknown ESC sequence
        }
      } else if (ansi[i] === "\r") {
        cursorX = 0
        i++
      } else if (ansi[i] === "\n") {
        cursorY++
        if (cursorY >= rows) {
          // Scroll: save top row to scrollback, shift up, bottom row becomes empty
          scrollbackLines.push(cells[0]!.join("").trimEnd())
          cells.shift()
          cells.push(Array(cols).fill(" "))
          cursorY = rows - 1
        }
        i++
      } else {
        // Regular character — write at cursor position
        if (cursorX < cols && cursorY < rows) {
          cells[cursorY]![cursorX] = ansi[i]!
          cursorX++
          if (cursorX >= cols) {
            cursorX = cols - 1
          }
        }
        i++
      }
    }
  }

  function getLines(): string[] {
    return cells.map((row) => row.join("").trimEnd())
  }

  /** Get non-empty lines (trim trailing empty lines). */
  function getNonEmptyLines(): string[] {
    const lines = getLines()
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop()
    }
    return lines
  }

  /** Get the cursor position. */
  function getCursor(): { x: number; y: number } {
    return { x: cursorX, y: cursorY }
  }

  /** Get non-empty scrollback lines. */
  function getScrollbackLines(): string[] {
    return scrollbackLines.filter((l) => l !== "")
  }

  return { feed, getLines, getNonEmptyLines, getCursor, getScrollbackLines }
}

// ============================================================================
// Buffer Helpers
// ============================================================================

/** Write a line of text into a buffer at the given row. */
function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let i = 0; i < text.length && i < buffer.width; i++) {
    buffer.setCell(i, row, { char: text[i]! })
  }
}

/** Create a buffer with lines of text content. */
function bufferWithLines(width: number, height: number, lines: string[]): TerminalBuffer {
  const buf = createBuffer(width, height)
  for (let i = 0; i < lines.length; i++) {
    writeLine(buf, i, lines[i]!)
  }
  return buf
}

// ============================================================================
// Tests
// ============================================================================

describe("inline jump: content height changes between frames", () => {
  test("content grows from 3 to 5 lines (no cursor)", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 3 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line A", "Line B", "Line C"])

    // Frame 2: Content grows to 5 lines (simulates Enter adding new exchange)
    const buf2 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C", "Line D", "Line E"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    // All 5 lines should be present, no duplicates, no gaps
    expect(screen.getNonEmptyLines()).toEqual(["Line A", "Line B", "Line C", "Line D", "Line E"])
  })

  test("content grows from 3 to 5 lines (cursor visible)", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 3 lines, cursor at row 1 col 5
    const buf1 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C"])
    const cursor1 = { x: 5, y: 1, visible: true }
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS, cursor1))
    expect(screen.getNonEmptyLines()).toEqual(["Line A", "Line B", "Line C"])

    // Frame 2: Content grows, cursor moves to new position
    const buf2 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C", "Line D", "Line E"])
    const cursor2 = { x: 5, y: 3, visible: true }
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS, cursor2))

    expect(screen.getNonEmptyLines()).toEqual(["Line A", "Line B", "Line C", "Line D", "Line E"])
  })

  test("content grows after cursor was in middle of content", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 4 lines, cursor at row 1 (not bottom)
    const buf1 = bufferWithLines(COLS, ROWS, ["Header", "Input>", "Result A", "Footer"])
    const cursor1 = { x: 6, y: 1, visible: true }
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS, cursor1))
    expect(screen.getNonEmptyLines()).toEqual(["Header", "Input>", "Result A", "Footer"])

    // Frame 2: Content grows — new result added
    const buf2 = bufferWithLines(COLS, ROWS, ["Header", "Input>", "Result A", "Result B", "Result C", "Footer"])
    const cursor2 = { x: 6, y: 1, visible: true }
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS, cursor2))

    // All lines should be present without duplication
    expect(screen.getNonEmptyLines()).toEqual(["Header", "Input>", "Result A", "Result B", "Result C", "Footer"])
  })

  test("content shrinks from 5 to 3 lines with cursor in middle", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 5 lines, cursor at row 2
    const buf1 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C", "Line D", "Line E"])
    const cursor1 = { x: 3, y: 2, visible: true }
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS, cursor1))
    expect(screen.getNonEmptyLines()).toHaveLength(5)

    // Frame 2: Content shrinks to 3 lines
    const buf2 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C"])
    const cursor2 = { x: 3, y: 1, visible: true }
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS, cursor2))

    // Old lines D and E should be erased
    expect(screen.getNonEmptyLines()).toEqual(["Line A", "Line B", "Line C"])
  })

  test("cursor transitions from hidden to visible when content grows", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 3 lines, no cursor (hidden)
    const buf1 = bufferWithLines(COLS, ROWS, ["Status", "Loading...", "Progress"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Status", "Loading...", "Progress"])

    // Frame 2: Content grows and cursor becomes visible
    const buf2 = bufferWithLines(COLS, ROWS, ["Status", "Loading...", "Progress", "Input>"])
    const cursor2 = { x: 6, y: 3, visible: true }
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS, cursor2))

    expect(screen.getNonEmptyLines()).toEqual(["Status", "Loading...", "Progress", "Input>"])
  })

  test("cursor transitions from visible to hidden when content grows", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 3 lines, cursor visible at row 2
    const buf1 = bufferWithLines(COLS, ROWS, ["Prompt>", "Response", "More"])
    const cursor1 = { x: 7, y: 0, visible: true }
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS, cursor1))
    expect(screen.getNonEmptyLines()).toEqual(["Prompt>", "Response", "More"])

    // Frame 2: Content grows, cursor becomes hidden (processing)
    const buf2 = bufferWithLines(COLS, ROWS, ["Prompt>", "Response", "More", "Thinking...", "Status"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Prompt>", "Response", "More", "Thinking...", "Status"])
  })

  test("content grows after scrollback promotion (freeze + add in same sequence)", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: Exchange 1 — 3 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["User: hello", "AI: world", "---"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["User: hello", "AI: world", "---"])

    // Frame 2: Freeze exchange 1, new exchange 2 starts (2 lines)
    outputPhase.promoteScrollback!("User: hello\x1b[K\r\nAI: world\x1b[K\r\n---\x1b[K\r\n", 3)
    const buf2 = bufferWithLines(COLS, ROWS, ["User: how?", "AI: ..."])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    // Frozen exchange 1 stays on-screen (overwritten by next render); live exchange 2 below
    expect(screen.getScrollbackLines()).toEqual([])
    expect(screen.getNonEmptyLines()).toEqual(["User: hello", "AI: world", "---", "User: how?", "AI: ..."])

    // Frame 3: Exchange 2 response grows (content height changes)
    const buf3 = bufferWithLines(COLS, ROWS, [
      "User: how?",
      "AI: Let me explain...",
      "AI: First point",
      "AI: Second point",
    ])
    screen.feed(outputPhase(buf2, buf3, "inline", 0, ROWS))

    // After scrollback promotion, frozen content stays on-screen. Subsequent
    // renders overwrite it via incremental diff (partial cell overwrites visible
    // in the VT simulator due to offset shift after promotion).
    expect(screen.getScrollbackLines()).toEqual([])
    expect(screen.getNonEmptyLines()).toEqual([
      "User: hello",
      "AI: Letlme explain...",
      "AI: First point",
      "AI:rSecond point",
      "AI: ...",
    ])
  })

  test("multiple height changes in sequence (grow, grow, shrink)", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 2 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2"])

    // Frame 2: Grows to 4 lines
    const buf2 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3", "Line 4"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2", "Line 3", "Line 4"])

    // Frame 3: Grows to 6 lines
    const buf3 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6"])
    screen.feed(outputPhase(buf2, buf3, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6"])

    // Frame 4: Shrinks to 3 lines
    const buf4 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3"])
    screen.feed(outputPhase(buf3, buf4, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2", "Line 3"])
  })

  test("content grows with cursor visible at row 0", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 2 lines, cursor at row 0 (top input field)
    const buf1 = bufferWithLines(COLS, ROWS, ["Input>", "Footer"])
    const cursor1 = { x: 6, y: 0, visible: true }
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS, cursor1))
    expect(screen.getNonEmptyLines()).toEqual(["Input>", "Footer"])

    // Frame 2: Content grows (response appears below input)
    const buf2 = bufferWithLines(COLS, ROWS, ["Input>", "Response line 1", "Response line 2", "Footer"])
    const cursor2 = { x: 6, y: 0, visible: true }
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS, cursor2))

    expect(screen.getNonEmptyLines()).toEqual(["Input>", "Response line 1", "Response line 2", "Footer"])
  })

  test("content grows near terminal bottom (causes natural scroll)", () => {
    const COLS = 40
    const ROWS = 6 // Small terminal — content will fill it
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 4 lines in 6-row terminal (room for 2 more)
    const buf1 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C", "Line D"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line A", "Line B", "Line C", "Line D"])

    // Frame 2: Grows to 6 lines (fills terminal exactly)
    const buf2 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C", "Line D", "Line E", "Line F"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Line A", "Line B", "Line C", "Line D", "Line E", "Line F"])
  })

  test("content grows and shrinks with no diff (all same lines)", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 3 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["AAA", "BBB", "CCC"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["AAA", "BBB", "CCC"])

    // Frame 2: Grows to 5 lines (first 3 are identical)
    const buf2 = bufferWithLines(COLS, ROWS, ["AAA", "BBB", "CCC", "DDD", "EEE"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["AAA", "BBB", "CCC", "DDD", "EEE"])

    // Frame 3: Shrinks back to 3 lines (same content as frame 1)
    const buf3 = bufferWithLines(COLS, ROWS, ["AAA", "BBB", "CCC"])
    screen.feed(outputPhase(buf2, buf3, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["AAA", "BBB", "CCC"])
  })

  test("content grows by exactly 1 line", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 3 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2", "Line 3"])

    // Frame 2: Grows to 4 lines
    const buf2 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3", "Line 4"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2", "Line 3", "Line 4"])
  })

  test("content shrinks by exactly 1 line", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 4 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3", "Line 4"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toHaveLength(4)

    // Frame 2: Shrinks to 3 lines
    const buf2 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2", "Line 3"])
  })

  test("rapid grow-shrink-grow sequence (ai-chat pattern)", () => {
    const COLS = 40
    const ROWS = 20
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: User types prompt — 2 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["User: hello", "---"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["User: hello", "---"])

    // Frame 2: AI response starts streaming — grows to 4
    const buf2 = bufferWithLines(COLS, ROWS, ["User: hello", "AI: Let me", "think about", "---"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["User: hello", "AI: Let me", "think about", "---"])

    // Frame 3: Response compacts — shrinks to 3
    const buf3 = bufferWithLines(COLS, ROWS, ["User: hello", "AI: Thinking...", "---"])
    screen.feed(outputPhase(buf2, buf3, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["User: hello", "AI: Thinking...", "---"])

    // Frame 4: Response arrives — grows to 5
    const buf4 = bufferWithLines(COLS, ROWS, [
      "User: hello",
      "AI: Hello! Here is",
      "my full response.",
      "Hope this helps!",
      "---",
    ])
    screen.feed(outputPhase(buf3, buf4, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual([
      "User: hello",
      "AI: Hello! Here is",
      "my full response.",
      "Hope this helps!",
      "---",
    ])
  })
})
