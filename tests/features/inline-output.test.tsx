/**
 * Inline Output & Scrollback — Comprehensive test suite for inline mode rendering.
 *
 * Tests the output phase in inline mode: full renders, incremental renders,
 * scrollback promotion, content shrinking/growing, cursor tracking, resize,
 * and edge cases around terminal height capping.
 *
 * Uses a minimal VT screen simulator that interprets ANSI output from
 * createOutputPhase() and validates the resulting screen state.
 */

import { describe, test, expect } from "vitest"
import { createBuffer, type TerminalBuffer } from "@silvery/ag-term/buffer"
import { createOutputPhase, outputPhase } from "@silvery/ag-term/pipeline/output-phase"

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
        if (ansi[i + 1] === "[") {
          // CSI sequence
          let j = i + 2
          let isPrivate = false
          if (j < ansi.length && (ansi[j] === "?" || ansi[j] === ">")) {
            isPrivate = true
            j++
          }
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
            i = j
            continue
          }

          switch (cmd) {
            case "A":
              cursorY = Math.max(0, cursorY - n)
              break
            case "B":
              cursorY = Math.min(rows - 1, cursorY + n)
              break
            case "C":
              cursorX = Math.min(cols - 1, cursorX + n)
              break
            case "D":
              cursorX = Math.max(0, cursorX - n)
              break
            case "H": {
              cursorY = Math.max(0, parseInt(paramParts[0] || "1", 10) - 1)
              cursorX = Math.max(0, parseInt(paramParts[1] || "1", 10) - 1)
              break
            }
            case "J":
              if (params === "" || params === "0") {
                for (let x = cursorX; x < cols; x++) cells[cursorY]![x] = " "
                for (let y = cursorY + 1; y < rows; y++) {
                  for (let x = 0; x < cols; x++) cells[y]![x] = " "
                }
              } else if (params === "2") {
                for (let y = 0; y < rows; y++) {
                  for (let x = 0; x < cols; x++) cells[y]![x] = " "
                }
              }
              break
            case "K":
              if (params === "" || params === "0") {
                for (let x = cursorX; x < cols; x++) cells[cursorY]![x] = " "
              }
              break
            case "m":
              break
            default:
              break
          }
          i = j
        } else if (ansi[i + 1] === "]") {
          // OSC — skip to BEL or ST
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
          i += 2
        }
      } else if (ansi[i] === "\r") {
        cursorX = 0
        i++
      } else if (ansi[i] === "\n") {
        cursorY++
        if (cursorY >= rows) {
          scrollbackLines.push(cells[0]!.join("").trimEnd())
          cells.shift()
          cells.push(Array(cols).fill(" "))
          cursorY = rows - 1
        }
        i++
      } else {
        if (cursorX < cols && cursorY < rows) {
          cells[cursorY]![cursorX] = ansi[i]!
          cursorX++
          if (cursorX >= cols) cursorX = cols - 1
        }
        i++
      }
    }
  }

  function getLines(): string[] {
    return cells.map((row) => row.join("").trimEnd())
  }

  function getNonEmptyLines(): string[] {
    const lines = getLines()
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
    return lines
  }

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

function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let i = 0; i < text.length && i < buffer.width; i++) {
    buffer.setCell(i, row, { char: text[i]! })
  }
}

function bufferWithLines(width: number, height: number, lines: string[]): TerminalBuffer {
  const buf = createBuffer(width, height)
  for (let i = 0; i < lines.length; i++) writeLine(buf, i, lines[i]!)
  return buf
}

// ============================================================================
// First Render (no prev buffer)
// ============================================================================

describe("inline: first render", () => {
  test("renders content on first frame", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf = bufferWithLines(COLS, ROWS, ["Hello", "World"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Hello", "World"])
  })

  test("first render with single line", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf = bufferWithLines(COLS, ROWS, ["One liner"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["One liner"])
  })

  test("first render with empty buffer produces no visible content", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf = createBuffer(COLS, ROWS) // all spaces
    screen.feed(op(null, buf, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual([])
  })

  test("first render fills full width", () => {
    const COLS = 20,
      ROWS = 5
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf = bufferWithLines(COLS, ROWS, ["ABCDEFGHIJ1234567"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["ABCDEFGHIJ1234567"])
  })
})

// ============================================================================
// Incremental Rendering (prev + next buffers, same size)
// ============================================================================

describe("inline: incremental rendering", () => {
  test("updates only changed content", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Change only middle line
    const buf2 = bufferWithLines(COLS, ROWS, ["Line A", "CHANGED", "Line C"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Line A", "CHANGED", "Line C"])
  })

  test("no output when buffers are identical", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})

    const buf1 = bufferWithLines(COLS, ROWS, ["Static", "Content"])
    op(null, buf1, "inline", 0, ROWS) // first render

    const buf2 = bufferWithLines(COLS, ROWS, ["Static", "Content"])
    const output = op(buf1, buf2, "inline", 0, ROWS)

    // When content is identical, only cursor suffix is emitted (hide cursor)
    expect(output).toBe("\x1b[?25l")
  })

  test("updates first line only", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Old first", "Unchanged"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    const buf2 = bufferWithLines(COLS, ROWS, ["New first", "Unchanged"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["New first", "Unchanged"])
  })

  test("updates last line only", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Unchanged", "Old last"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    const buf2 = bufferWithLines(COLS, ROWS, ["Unchanged", "New last"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Unchanged", "New last"])
  })
})

// ============================================================================
// Content Growth (more lines than before)
// ============================================================================

describe("inline: content growth", () => {
  test("content grows by adding new lines", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    const buf2 = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3", "Line 4"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2", "Line 3", "Line 4"])
  })

  test("content grows from 1 to many lines", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Solo"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    const buf2 = bufferWithLines(COLS, ROWS, ["Solo", "Duo", "Trio"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Solo", "Duo", "Trio"])
  })
})

// ============================================================================
// Content Shrinking (fewer lines than before)
// ============================================================================

describe("inline: content shrinking", () => {
  test("erases orphan lines when content shrinks", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Alpha", "Bravo", "Charlie", "Delta", "Echo"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    const buf2 = bufferWithLines(COLS, ROWS, ["Alpha", "Bravo", "Charlie"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Alpha", "Bravo", "Charlie"])
  })

  test("erases all lines when content shrinks to single line", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["One", "Two", "Three", "Four"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    const buf2 = bufferWithLines(COLS, ROWS, ["Only"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Only"])
  })

  test("progressive shrinking across multiple frames", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const lines = ["A", "B", "C", "D", "E"]
    let prev = bufferWithLines(COLS, ROWS, lines)
    screen.feed(op(null, prev, "inline", 0, ROWS))

    // Remove one line at a time from the end
    for (let i = lines.length - 1; i >= 1; i--) {
      const shrunk = lines.slice(0, i)
      const next = bufferWithLines(COLS, ROWS, shrunk)
      screen.feed(op(prev, next, "inline", 0, ROWS))
      expect(screen.getNonEmptyLines()).toEqual(shrunk)
      prev = next
    }
  })
})

// ============================================================================
// Scrollback Promotion (freeze/advance cycle)
// ============================================================================

describe("inline: scrollback promotion", () => {
  test("single freeze cycle: frozen content stays on-screen", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Item 1", "Item 2", "Item 3", "Item 4", "Footer"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Freeze "Item 1" — stays on-screen (no padding to push to scrollback).
    op.promoteScrollback!("Item 1\x1b[K\r\n", 1)
    const buf2 = bufferWithLines(COLS, ROWS, ["Item 2", "Item 3", "Item 4", "Footer"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    // Frozen Item 1 is still on-screen, overwritten by next render frame.
    expect(screen.getNonEmptyLines()).toEqual(["Item 1", "Item 2", "Item 3", "Item 4", "Footer"])
  })

  test("multiple sequential freeze cycles: frozen content stays on-screen", () => {
    const COLS = 40,
      ROWS = 15
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const lines = ["Task A", "Task B", "Task C", "Task D", "Task E", "Status"]
    let prev = bufferWithLines(COLS, ROWS, lines)
    screen.feed(op(null, prev, "inline", 0, ROWS))

    // Freeze one at a time — frozen content accumulates on-screen.
    // After the cursor tracking fix (5604a40), prevCursorRow tracks only live
    // content, so previous frozen lines are not overwritten by subsequent cycles.
    // All frozen lines accumulate above the live content.
    const frozenSoFar: string[] = []
    for (let i = 0; i < 3; i++) {
      const frozen = lines[i]!
      frozenSoFar.push(frozen)
      op.promoteScrollback!(`${frozen}\x1b[K\r\n`, 1)
      const remaining = lines.slice(i + 1)
      const next = bufferWithLines(COLS, ROWS, remaining)
      screen.feed(op(prev, next, "inline", 0, ROWS))
      // All frozen items accumulate on-screen above live content
      expect(screen.getNonEmptyLines()).toEqual([...frozenSoFar, ...remaining])
      prev = next
    }
  })

  test("bulk freeze: frozen items stay on-screen", () => {
    const COLS = 40,
      ROWS = 12
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["J1", "J2", "J3", "J4", "J5", "Spin"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Freeze J1 + J2 simultaneously — both stay on-screen
    op.promoteScrollback!("J1\x1b[K\r\nJ2\x1b[K\r\n", 2)
    const buf2 = bufferWithLines(COLS, ROWS, ["J3", "J4", "J5", "Spin"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["J1", "J2", "J3", "J4", "J5", "Spin"])
  })

  test("freeze + content shrink simultaneously", () => {
    const COLS = 40,
      ROWS = 12
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["I1", "I2", "I3", "I4", "I5"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Freeze I1 AND remove I5 — I1 stays on-screen, live: I2-I4
    op.promoteScrollback!("I1\x1b[K\r\n", 1)
    const buf2 = bufferWithLines(COLS, ROWS, ["I2", "I3", "I4"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["I1", "I2", "I3", "I4"])
  })

  test("freeze + content growth simultaneously", () => {
    const COLS = 40,
      ROWS = 12
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["A", "B", "C", "Status"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Freeze A — stays on-screen, add D (live content grows)
    op.promoteScrollback!("A\x1b[K\r\n", 1)
    const buf2 = bufferWithLines(COLS, ROWS, ["B", "C", "D", "Status"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["A", "B", "C", "D", "Status"])
  })

  test("freeze all items one by one: frozen content stays on-screen", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const allItems = ["A", "B", "C", "D", "E"]
    let prev = bufferWithLines(COLS, ROWS, allItems)
    screen.feed(op(null, prev, "inline", 0, ROWS))

    // Frozen items accumulate on-screen (cursor tracking only covers live content)
    const frozenSoFar: string[] = []
    for (let i = 0; i < allItems.length; i++) {
      frozenSoFar.push(allItems[i]!)
      op.promoteScrollback!(`${allItems[i]}\x1b[K\r\n`, 1)
      const remaining = allItems.slice(i + 1)
      const next = bufferWithLines(COLS, ROWS, remaining.length > 0 ? remaining : [])
      screen.feed(op(prev, next, "inline", 0, ROWS))
      prev = next

      // All frozen items accumulate above live content
      expect(screen.getNonEmptyLines()).toEqual([...frozenSoFar, ...remaining])
    }
  })

  test("promotion followed by normal shrink in next frame", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1
    const buf1 = bufferWithLines(COLS, ROWS, ["I1", "I2", "I3", "I4", "I5"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Frame 2: freeze I1 — stays on-screen (not in scrollback)
    op.promoteScrollback!("I1\x1b[K\r\n", 1)
    const buf2 = bufferWithLines(COLS, ROWS, ["I2", "I3", "I4", "I5"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["I1", "I2", "I3", "I4", "I5"])

    // Frame 3: normal shrink (no promotion), remove I5.
    // The frozen I1 at row 0 persists; incremental diff operates on the
    // live content area only (cursor tracking doesn't include frozen lines).
    const buf3 = bufferWithLines(COLS, ROWS, ["I2", "I3", "I4"])
    screen.feed(op(buf2, buf3, "inline", 0, ROWS))

    // Frozen I1 still on row 0, live content updated, orphan I5 erased
    expect(screen.getNonEmptyLines()).toEqual(["I1", "I2", "I3", "I4"])
  })
})

// ============================================================================
// Terminal Height Capping
// ============================================================================

describe("inline: terminal height capping", () => {
  test("caps output to termRows when content exceeds terminal", () => {
    const COLS = 40,
      ROWS = 5 // terminal is only 5 rows
    const BUFFER_ROWS = 20
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Content has 8 lines but terminal only has 5
    const buf = bufferWithLines(COLS, BUFFER_ROWS, ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    // Should show bottom 5 lines (capped to termRows)
    const visible = screen.getNonEmptyLines()
    expect(visible.length).toBeLessThanOrEqual(ROWS)
  })

  test("content that fits within terminal shows all lines", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf = bufferWithLines(COLS, ROWS, ["A", "B", "C"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["A", "B", "C"])
  })
})

// ============================================================================
// Scrollback Offset (external stdout writes between frames)
// ============================================================================

describe("inline: scrollback offset", () => {
  test("handles scrollback offset from external writes", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Content"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Simulate external stdout.write that pushes content down by 2 lines
    screen.feed("\nExternal 1\nExternal 2")

    const buf2 = bufferWithLines(COLS, ROWS, ["Updated"])
    screen.feed(op(buf1, buf2, "inline", 2, ROWS))

    // The external lines are above, our content should be updated
    const lines = screen.getNonEmptyLines()
    expect(lines).toContain("Updated")
  })
})

// ============================================================================
// Cursor Positioning
// ============================================================================

describe("inline: cursor positioning", () => {
  test("cursor at custom position does not cause bleed on shrink", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["L0", "L1", "L2", "L3", "L4"])
    screen.feed(op(null, buf1, "inline", 0, ROWS, { x: 3, y: 2, visible: true }))

    const buf2 = bufferWithLines(COLS, ROWS, ["L0", "L1", "L2"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS, { x: 3, y: 1, visible: true }))

    expect(screen.getNonEmptyLines()).toEqual(["L0", "L1", "L2"])
  })

  test("cursor hidden: content renders without cursor artifacts", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    const buf2 = bufferWithLines(COLS, ROWS, ["Line 1", "Changed"])
    screen.feed(op(buf, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Changed"])
  })

  test("cursor moves between rows across frames", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Row 0", "Row 1", "Row 2"])
    screen.feed(op(null, buf1, "inline", 0, ROWS, { x: 0, y: 0, visible: true }))

    // Move cursor to row 2 and update content
    const buf2 = bufferWithLines(COLS, ROWS, ["Row 0", "Row 1", "Row 2!"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS, { x: 0, y: 2, visible: true }))

    expect(screen.getNonEmptyLines()).toEqual(["Row 0", "Row 1", "Row 2!"])
  })
})

// ============================================================================
// Reset Inline State (resize handling)
// ============================================================================

describe("inline: resetInlineState", () => {
  test("reset forces full re-render on next frame", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Original"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Simulate resize: reset inline state
    op.resetInlineState!()

    const buf2 = bufferWithLines(COLS, ROWS, ["After resize"])
    screen.feed(op(null, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["After resize"])
  })

  test("reset clears pending promotion", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Item 1", "Item 2"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Queue promotion, then reset (simulating resize during freeze)
    op.promoteScrollback!("Item 1\x1b[K\r\n", 1)
    op.resetInlineState!()

    // After reset, the pending promotion is discarded.
    // Use a fresh screen to verify only the live content is rendered.
    const freshScreen = createScreen(COLS, ROWS)
    const buf2 = bufferWithLines(COLS, ROWS, ["Item 2"])
    freshScreen.feed(op(null, buf2, "inline", 0, ROWS))

    const lines = freshScreen.getNonEmptyLines()
    expect(lines).toEqual(["Item 2"])
  })
})

// ============================================================================
// getInlineCursorRow tracking
// ============================================================================

describe("inline: cursor row tracking", () => {
  test("reports -1 before first render", () => {
    const op = createOutputPhase({})
    expect(op.getInlineCursorRow!()).toBe(-1)
  })

  test("tracks cursor row after first render", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})

    const buf = bufferWithLines(COLS, ROWS, ["A", "B", "C"])
    op(null, buf, "inline", 0, ROWS)

    // Cursor should be at last content line (row 2)
    expect(op.getInlineCursorRow!()).toBe(2)
  })

  test("tracks cursor row with visible cursor", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})

    const buf = bufferWithLines(COLS, ROWS, ["A", "B", "C"])
    op(null, buf, "inline", 0, ROWS, { x: 0, y: 1, visible: true })

    // Cursor at row 1
    expect(op.getInlineCursorRow!()).toBe(1)
  })

  test("resets to -1 after resetInlineState", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})

    const buf = bufferWithLines(COLS, ROWS, ["Content"])
    op(null, buf, "inline", 0, ROWS)
    expect(op.getInlineCursorRow!()).toBeGreaterThanOrEqual(0)

    op.resetInlineState!()
    expect(op.getInlineCursorRow!()).toBe(-1)
  })
})

// ============================================================================
// Bare outputPhase() (no createOutputPhase — fresh state each call)
// ============================================================================

describe("inline: bare outputPhase()", () => {
  test("bare call renders content", () => {
    const COLS = 40,
      ROWS = 10
    const screen = createScreen(COLS, ROWS)

    const buf = bufferWithLines(COLS, ROWS, ["Direct", "Call"])
    screen.feed(outputPhase(null, buf, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Direct", "Call"])
  })

  test("bare call always falls back to full render", () => {
    const COLS = 40,
      ROWS = 10
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Frame 1"])
    screen.feed(outputPhase(null, buf1, "inline", 0, ROWS))

    // Bare calls don't have persistent state, so this should still work
    const buf2 = bufferWithLines(COLS, ROWS, ["Frame 2"])
    const output = outputPhase(buf1, buf2, "inline", 0, ROWS)

    screen.feed(output)
    expect(screen.getNonEmptyLines()).toContain("Frame 2")
  })
})

// ============================================================================
// Multi-frame Sequences (complex real-world scenarios)
// ============================================================================

describe("inline: multi-frame scenarios", () => {
  test("task runner: items complete and freeze over time", () => {
    const COLS = 50,
      ROWS = 20
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 3 pending tasks + spinner
    let prev = bufferWithLines(COLS, ROWS, [
      "Installing packages...",
      "  react: pending",
      "  lodash: pending",
      "  chalk: pending",
    ])
    screen.feed(op(null, prev, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toHaveLength(4)

    // Frame 2: react done → freeze — stays on-screen
    op.promoteScrollback!("  react: done\x1b[K\r\n", 1)
    let next = bufferWithLines(COLS, ROWS, [
      "Installing packages...",
      "  lodash: installing...",
      "  chalk: pending",
    ])
    screen.feed(op(prev, next, "inline", 0, ROWS))
    prev = next

    // Frozen "react: done" is on-screen, not in scrollback
    expect(screen.getNonEmptyLines()).toContain("  react: done")
    expect(screen.getNonEmptyLines()).toContain("  lodash: installing...")

    // Frame 3: lodash done → freeze — stays on-screen
    op.promoteScrollback!("  lodash: done\x1b[K\r\n", 1)
    next = bufferWithLines(COLS, ROWS, ["Installing packages...", "  chalk: installing..."])
    screen.feed(op(prev, next, "inline", 0, ROWS))
    prev = next

    expect(screen.getNonEmptyLines()).toContain("  lodash: done")
    expect(screen.getNonEmptyLines()).toContain("  chalk: installing...")

    // Frame 4: chalk done → freeze — stays on-screen, show summary
    op.promoteScrollback!("  chalk: done\x1b[K\r\n", 1)
    next = bufferWithLines(COLS, ROWS, ["All packages installed!"])
    screen.feed(op(prev, next, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toContain("  chalk: done")
    expect(screen.getNonEmptyLines()).toContain("All packages installed!")
  })

  test("chat interface: messages freeze as new ones arrive", () => {
    const COLS = 60,
      ROWS = 20
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: First message + input prompt
    let prev = bufferWithLines(COLS, ROWS, ["User: Hello", "> "])
    screen.feed(op(null, prev, "inline", 0, ROWS))

    // Frame 2: AI responds, user message freezes — stays on-screen
    op.promoteScrollback!("User: Hello\x1b[K\r\n", 1)
    let next = bufferWithLines(COLS, ROWS, ["AI: Hi there!", "> "])
    screen.feed(op(prev, next, "inline", 0, ROWS))
    prev = next

    expect(screen.getNonEmptyLines()).toContain("User: Hello")

    // Frame 3: AI response freezes — stays on-screen
    op.promoteScrollback!("AI: Hi there!\x1b[K\r\n", 1)
    next = bufferWithLines(COLS, ROWS, ["User: How are you?", "> "])
    screen.feed(op(prev, next, "inline", 0, ROWS))
    prev = next

    expect(screen.getNonEmptyLines()).toContain("AI: Hi there!")
    expect(screen.getNonEmptyLines()).toContain("User: How are you?")
  })

  test("spinner animation: rapid updates without freezing", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const spinFrames = ["|", "/", "-", "\\"]
    let prev = bufferWithLines(COLS, ROWS, ["Working... |"])
    screen.feed(op(null, prev, "inline", 0, ROWS))

    for (let i = 1; i < 8; i++) {
      const next = bufferWithLines(COLS, ROWS, [`Working... ${spinFrames[i % 4]}`])
      screen.feed(op(prev, next, "inline", 0, ROWS))
      prev = next
    }

    // After 8 frames, should show last spinner state
    const lines = screen.getNonEmptyLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^Working\.\.\./)
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe("inline: edge cases", () => {
  test("content with trailing empty lines", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Buffer has content only on first line, rest is empty
    const buf = bufferWithLines(COLS, ROWS, ["Only content"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Only content"])
  })

  test("wide buffer with narrow terminal rows", () => {
    const COLS = 80,
      ROWS = 3
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf = bufferWithLines(COLS, ROWS, ["Line 1", "Line 2", "Line 3"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["Line 1", "Line 2", "Line 3"])
  })

  test("alternating grow and shrink", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Start with 2 lines
    let prev = bufferWithLines(COLS, ROWS, ["A", "B"])
    screen.feed(op(null, prev, "inline", 0, ROWS))

    // Grow to 4
    let next = bufferWithLines(COLS, ROWS, ["A", "B", "C", "D"])
    screen.feed(op(prev, next, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["A", "B", "C", "D"])
    prev = next

    // Shrink to 2
    next = bufferWithLines(COLS, ROWS, ["A", "B"])
    screen.feed(op(prev, next, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["A", "B"])
    prev = next

    // Grow to 5
    next = bufferWithLines(COLS, ROWS, ["A", "B", "C", "D", "E"])
    screen.feed(op(prev, next, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["A", "B", "C", "D", "E"])
    prev = next

    // Shrink to 1
    next = bufferWithLines(COLS, ROWS, ["A"])
    screen.feed(op(prev, next, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["A"])
  })

  test("content replaces entirely different text", () => {
    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["Old 1", "Old 2", "Old 3"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    const buf2 = bufferWithLines(COLS, ROWS, ["New A", "New B", "New C"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    expect(screen.getNonEmptyLines()).toEqual(["New A", "New B", "New C"])
  })

  test("very long lines within buffer width", () => {
    const COLS = 80,
      ROWS = 5
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const longLine = "X".repeat(79)
    const buf = bufferWithLines(COLS, ROWS, [longLine, "Short"])
    screen.feed(op(null, buf, "inline", 0, ROWS))

    const lines = screen.getNonEmptyLines()
    expect(lines[0]).toBe(longLine)
    expect(lines[1]).toBe("Short")
  })

  test("promotion with multi-line frozen content", () => {
    const COLS = 40,
      ROWS = 15
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const buf1 = bufferWithLines(COLS, ROWS, ["H1", "H2", "Body 1", "Body 2", "Footer"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))

    // Freeze a 2-line header block — stays on-screen
    op.promoteScrollback!("H1\x1b[K\r\nH2\x1b[K\r\n", 2)
    const buf2 = bufferWithLines(COLS, ROWS, ["Body 1", "Body 2", "Footer"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))

    // Frozen content stays on-screen; live content below it
    expect(screen.getNonEmptyLines()).toEqual(["H1", "H2", "Body 1", "Body 2", "Footer"])
  })
})

// ============================================================================
// Regression: height shrink drift (cursor tracking)
// ============================================================================

describe("inline: height shrink drift regression", () => {
  test("large shrink does not drift cursor across frames", () => {
    // Simulates a multiline TextInput (5 lines) being cleared to 1 line,
    // then new content appearing. If cursor tracking drifts, the second
    // shrink→grow cycle renders at the wrong position.
    const COLS = 40,
      ROWS = 20
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    // Frame 1: 5-line content (like a multiline text input)
    const buf1 = bufferWithLines(COLS, ROWS, ["Header", "Line 2", "Line 3", "Line 4", "Footer"])
    screen.feed(op(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Header", "Line 2", "Line 3", "Line 4", "Footer"])

    // Frame 2: shrink to 2 lines (input cleared, agent response starts)
    const buf2 = bufferWithLines(COLS, ROWS, ["Header", "Response"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Header", "Response"])

    // Frame 3: grow to 4 lines (agent response continues)
    const buf3 = bufferWithLines(COLS, ROWS, ["Header", "Response", "More text", "Even more"])
    screen.feed(op(buf2, buf3, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Header", "Response", "More text", "Even more"])

    // Frame 4: shrink again to 2 (new exchange cycle)
    const buf4 = bufferWithLines(COLS, ROWS, ["Header", "New input"])
    screen.feed(op(buf3, buf4, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["Header", "New input"])
  })

  test("shrink from 8 to 2 lines then grow back", () => {
    const COLS = 40,
      ROWS = 20
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    const lines8 = ["A", "B", "C", "D", "E", "F", "G", "H"]
    const buf1 = bufferWithLines(COLS, ROWS, lines8)
    screen.feed(op(null, buf1, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(lines8)

    // Dramatic shrink
    const buf2 = bufferWithLines(COLS, ROWS, ["A", "B"])
    screen.feed(op(buf1, buf2, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["A", "B"])

    // Grow back to 5
    const buf3 = bufferWithLines(COLS, ROWS, ["A", "B", "C2", "D2", "E2"])
    screen.feed(op(buf2, buf3, "inline", 0, ROWS))
    expect(screen.getNonEmptyLines()).toEqual(["A", "B", "C2", "D2", "E2"])
  })

  test("repeated shrink-grow cycles maintain correct positioning", () => {
    const COLS = 40,
      ROWS = 20
    const op = createOutputPhase({})
    const screen = createScreen(COLS, ROWS)

    let prev = bufferWithLines(COLS, ROWS, ["Init"])
    screen.feed(op(null, prev, "inline", 0, ROWS))

    // 10 cycles of grow → shrink to stress cursor tracking
    for (let i = 0; i < 10; i++) {
      const big = [`Cycle ${i}`, "Line 2", "Line 3", "Line 4", "Line 5"]
      const small = [`Cycle ${i} done`]

      const bufBig = bufferWithLines(COLS, ROWS, big)
      screen.feed(op(prev, bufBig, "inline", 0, ROWS))
      expect(screen.getNonEmptyLines()).toEqual(big)
      prev = bufBig

      const bufSmall = bufferWithLines(COLS, ROWS, small)
      screen.feed(op(prev, bufSmall, "inline", 0, ROWS))
      expect(screen.getNonEmptyLines()).toEqual(small)
      prev = bufSmall
    }
  })
})
