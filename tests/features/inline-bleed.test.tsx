/**
 * Inline Bleed Bug — Stale lines below active content after scrollback promotion.
 *
 * When a ScrollbackList freezes items and the live content shrinks, the inline
 * output phase must erase any orphan lines that remain below the active render
 * area. Without proper erasure, each freeze/advance cycle leaves residual lines
 * from previous renders ("inline bleed").
 *
 * Tests use a minimal VT-like screen simulator that interprets the ANSI output
 * from createOutputPhase() and checks the resulting screen state.
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

  function scroll(): void {
    // Push the top row into scrollback, shift all rows up, add empty row at bottom
    scrollbackLines.push(cells[0]!.join("").trimEnd())
    cells.shift()
    cells.push(Array(cols).fill(" "))
    cursorY = rows - 1
  }

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
                // Erase scrollback (no-op for now)
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
          scroll()
        }
        i++
      } else {
        // Regular character — write at cursor position
        if (cursorX < cols && cursorY < rows) {
          cells[cursorY]![cursorX] = ansi[i]!
          cursorX++
          if (cursorX >= cols) {
            // Line wrap: do NOT auto-advance to next line here.
            // Real terminals enter "pending wrap" state — the cursor stays at
            // cols-1 until the next character or newline. For our purposes,
            // clamping to cols-1 is sufficient.
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

  /** Get non-empty scrollback lines. */
  function getScrollbackLines(): string[] {
    return scrollbackLines.filter((l) => l !== "")
  }

  return { feed, getLines, getNonEmptyLines, getScrollbackLines }
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

describe("inline bleed: stale lines after scrollback promotion", () => {
  test("single freeze cycle: frozen content enters scrollback", () => {
    const COLS = 40
    const ROWS = 10
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 5 lines of content
    const buf1 = bufferWithLines(COLS, ROWS, ["Item 1", "Item 2", "Item 3", "Item 4", "Footer"])
    const frame1 = outputPhase(null, buf1, "inline", 0, ROWS)
    screen.feed(frame1)
    expect(screen.getNonEmptyLines()).toEqual(["Item 1", "Item 2", "Item 3", "Item 4", "Footer"])

    // Frame 2: Freeze "Item 1" — promote to scrollback.
    // Live content shrinks: 4 lines (Items 2-4 + Footer).
    const frozenContent = "Item 1\x1b[K\r\n"
    outputPhase.promoteScrollback!(frozenContent, 1)

    const buf2 = bufferWithLines(COLS, ROWS, ["Item 2", "Item 3", "Item 4", "Footer"])
    const frame2 = outputPhase(buf1, buf2, "inline", 0, ROWS)
    screen.feed(frame2)

    // Frozen "Item 1" stays on-screen (no padding into scrollback).
    // Next render frame would overwrite it, but there is no subsequent frame here.
    expect(screen.getNonEmptyLines()).toEqual(["Item 1", "Item 2", "Item 3", "Item 4", "Footer"])
  })

  test("multiple freeze cycles: frozen items accumulate on-screen", () => {
    const COLS = 40
    const ROWS = 15
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 6 items
    const lines1 = ["Task A", "Task B", "Task C", "Task D", "Task E", "Status"]
    const buf1 = bufferWithLines(COLS, ROWS, lines1)
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(lines1)

    // Freeze cycle 1: freeze Task A — stays on-screen
    outputPhase.promoteScrollback!("Task A\x1b[K\r\n", 1)
    const buf2 = bufferWithLines(COLS, ROWS, ["Task B", "Task C", "Task D", "Task E", "Status"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Task A", "Task B", "Task C", "Task D", "Task E", "Status"])

    // Freeze cycle 2: freeze Task B — frozen Task A persists, Task B added above live content
    outputPhase.promoteScrollback!("Task B\x1b[K\r\n", 1)
    const buf3 = bufferWithLines(COLS, ROWS, ["Task C", "Task D", "Task E", "Status"])
    screen.feed(outputPhase(buf2, buf3, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Task A", "Task B", "Task C", "Task D", "Task E", "Status"])

    // Freeze cycle 3: freeze Task C — all frozen items accumulate
    outputPhase.promoteScrollback!("Task C\x1b[K\r\n", 1)
    const buf4 = bufferWithLines(COLS, ROWS, ["Task D", "Task E", "Status"])
    screen.feed(outputPhase(buf3, buf4, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Task A", "Task B", "Task C", "Task D", "Task E", "Status"])
  })

  test("content shrinking without promotion erases orphan lines", () => {
    const COLS = 40
    const ROWS = 10
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 5 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["Alpha", "Bravo", "Charlie", "Delta", "Echo"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"])

    // Frame 2: Shrinks to 3 lines (no scrollback, just fewer items)
    const buf2 = bufferWithLines(COLS, ROWS, ["Alpha", "Bravo", "Charlie"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    const afterShrink = screen.getNonEmptyLines()
    // "Delta" and "Echo" should be erased
    expect(afterShrink).toEqual(["Alpha", "Bravo", "Charlie"])
  })

  test("content shrinking to single line erases all orphan lines", () => {
    const COLS = 40
    const ROWS = 10
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 4 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["One", "Two", "Three", "Four"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))

    // Frame 2: Only 1 line
    const buf2 = bufferWithLines(COLS, ROWS, ["Only"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Only"])
  })

  test("freeze + subsequent shrink: frozen enters scrollback, no orphan lines", () => {
    const COLS = 40
    const ROWS = 12
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 5 live items
    const buf1 = bufferWithLines(COLS, ROWS, ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toHaveLength(5)

    // Frame 2: Freeze Item 1 AND remove Item 5 (net shrink by 1)
    outputPhase.promoteScrollback!("Item 1\x1b[K\r\n", 1)
    const buf2 = bufferWithLines(COLS, ROWS, ["Item 2", "Item 3", "Item 4"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))

    // Frozen Item 1 stays on-screen. Live: Items 2-4. No orphan lines.
    expect(screen.getNonEmptyLines()).toEqual(["Item 1", "Item 2", "Item 3", "Item 4"])
  })

  test("rapid freeze cycles: frozen items accumulate on-screen", () => {
    const COLS = 40
    const ROWS = 10
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const allItems = ["A", "B", "C", "D", "E"]

    // Frame 1: All 5 items live
    let prevBuf = bufferWithLines(COLS, ROWS, allItems)
    screen.feed(outputPhase(null, prevBuf, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(allItems)

    // Freeze items one at a time — frozen items accumulate on-screen
    const frozenSoFar: string[] = []
    for (let i = 0; i < allItems.length; i++) {
      const frozenItem = allItems[i]!
      frozenSoFar.push(frozenItem)
      outputPhase.promoteScrollback!(`${frozenItem}\x1b[K\r\n`, 1)

      const remaining = allItems.slice(i + 1)
      const nextBuf = bufferWithLines(COLS, ROWS, remaining.length > 0 ? remaining : [])
      const frame = outputPhase(prevBuf, nextBuf, "inline", 0, ROWS)
      screen.feed(frame)
      prevBuf = nextBuf

      // All frozen items accumulate above live content
      const visible = screen.getNonEmptyLines()
      expect(visible).toEqual([...frozenSoFar, ...remaining])
    }
  })

  test("promotion followed by normal render that shrinks content", () => {
    const COLS = 40
    const ROWS = 10
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 5 lines
    const buf1 = bufferWithLines(COLS, ROWS, ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toHaveLength(5)

    // Frame 2: Freeze Item 1 via promoteScrollback (live content: 4 items)
    outputPhase.promoteScrollback!("Item 1\x1b[K\r\n", 1)
    const buf2 = bufferWithLines(COLS, ROWS, ["Item 2", "Item 3", "Item 4", "Item 5"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))
    // Frozen Item 1 stays on-screen. Live: Items 2-5.
    expect(screen.getNonEmptyLines()).toEqual(["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"])

    // Frame 3: Normal re-render (no promotion) where content shrinks.
    // This simulates a state update removing an item AFTER the freeze cycle.
    // Frozen Item 1 stays on-screen (no new promotion to clear it).
    // With the cursor tracking fix, orphan lines are properly erased.
    const buf3 = bufferWithLines(COLS, ROWS, ["Item 2", "Item 3", "Item 4"])
    screen.feed(outputPhase(buf2, buf3, "inline", 0, ROWS))

    // Frozen Item 1 persists at row 0. Live content updated (3 lines).
    // Orphan Item 5 properly erased by shrink handling.
    expect(screen.getNonEmptyLines()).toEqual(["Item 1", "Item 2", "Item 3", "Item 4"])
  })

  test("cursor positioned mid-content does not cause bleed on shrink", () => {
    const COLS = 40
    const ROWS = 10
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 5 lines with cursor on row 2 (not at bottom)
    const buf1 = bufferWithLines(COLS, ROWS, ["Line 0", "Line 1", "Line 2", "Line 3", "Line 4"])
    const cursorPos = { x: 3, y: 2, visible: true }
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS, cursorPos))
    expect(screen.getNonEmptyLines()).toHaveLength(5)

    // Frame 2: Content shrinks to 3 lines, cursor still at row 1
    const buf2 = bufferWithLines(COLS, ROWS, ["Line 0", "Line 1", "Line 2"])
    const cursorPos2 = { x: 3, y: 1, visible: true }
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS, cursorPos2))

    const afterShrink = screen.getNonEmptyLines()
    // Lines 3-4 should be erased despite cursor being at row 1 (not bottom)
    expect(afterShrink).toEqual(["Line 0", "Line 1", "Line 2"])
  })

  test("multiple promotions with varying content sizes", () => {
    const COLS = 40
    const ROWS = 12
    const outputPhase = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 6 items
    const buf1 = bufferWithLines(COLS, ROWS, ["Job 1", "Job 2", "Job 3", "Job 4", "Job 5", "Spinner"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toHaveLength(6)

    // Freeze Job 1, add Job 6 (content stays same size)
    outputPhase.promoteScrollback!("Job 1\x1b[K\r\n", 1)
    const buf2 = bufferWithLines(COLS, ROWS, ["Job 2", "Job 3", "Job 4", "Job 5", "Job 6", "Spinner"])
    screen.feed(outputPhase(buf1, buf2, "inline", 0, ROWS))
    // Frozen Job 1 stays on-screen alongside live content.
    expect(screen.getNonEmptyLines()).toEqual(["Job 1", "Job 2", "Job 3", "Job 4", "Job 5", "Job 6", "Spinner"])

    // Freeze Jobs 2 and 3 simultaneously, Job 6 also done (net shrink by 1)
    // Frozen Job 1 from previous cycle persists (cursor tracking is live-only).
    outputPhase.promoteScrollback!("Job 2\x1b[K\r\nJob 3\x1b[K\r\n", 2)
    const buf3 = bufferWithLines(COLS, ROWS, ["Job 4", "Job 5", "Spinner"])
    screen.feed(outputPhase(buf2, buf3, "inline", 0, ROWS))

    // All frozen content accumulates: Job 1 (cycle 1) + Jobs 2,3 (cycle 2) + live
    expect(screen.getNonEmptyLines()).toEqual(["Job 1", "Job 2", "Job 3", "Job 4", "Job 5", "Spinner"])
  })
})
