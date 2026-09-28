/**
 * Viewport height boundary tests for the output phase.
 *
 * The zoom garble bug was never caught because all test fixtures used small
 * node trees that always fit in the test terminal. When buffer content exceeded
 * terminal height, bufferToAnsi wrote past the terminal's last row, causing
 * the alternate screen to scroll and desynchronizing prevBuffer.
 *
 * The fix caps fullscreen output at termRows. These tests verify correct
 * behavior at the boundary: rows-1, rows, rows+1, 2*rows.
 */
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, test, expect, vi } from "vitest"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { IncrementalRenderMismatchError } from "@silvery/ag-term/errors"
import {
  createOutputPhase,
  outputPhase,
  type OutputContext,
} from "@silvery/ag-term/pipeline/output-phase"
import { verifyOutputEquivalence } from "@silvery/ag-term/pipeline/output-verify"
import { preloadStrictTerminalBackends } from "@silvery/ag-term/strict-terminal-backends"
import { graphemeWidth } from "@silvery/ag-term/unicode"

const COLS = 80

/**
 * Fill buffer rows with distinct content so each row is identifiable.
 * Row y gets "Row <y>" left-aligned.
 */
function fillBuffer(buf: TerminalBuffer, startRow: number, endRow: number): void {
  for (let y = startRow; y < endRow; y++) {
    const text = `Row ${y}`
    for (let x = 0; x < text.length && x < buf.width; x++) {
      buf.setCell(x, y, { char: text[x]! })
    }
  }
}

/**
 * Read a row from the xterm.js terminal as a string.
 */
function readTermRow(term: ReturnType<typeof createTerminal>, row: number): string {
  const line = term.getLine(row)
  return line
    .map((c) => c.char)
    .join("")
    .trimEnd()
}

/**
 * Compare two terminals cell-by-cell and return mismatch descriptions.
 */
function compareCells(
  termA: ReturnType<typeof createTerminal>,
  termB: ReturnType<typeof createTerminal>,
  rows: number,
  cols: number,
): string[] {
  const mismatches: string[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = termA.getCell(y, x)
      const b = termB.getCell(y, x)
      if (a?.char !== b?.char) {
        mismatches.push(`(${x},${y}): a='${a?.char}' b='${b?.char}'`)
      }
    }
  }
  return mismatches
}

describe("viewport height boundary", () => {
  describe("fullscreen fresh render", () => {
    test("buffer exactly at terminal height (rows == termRows)", () => {
      const TERM_ROWS = 10
      const buf = new TerminalBuffer(COLS, TERM_ROWS)
      fillBuffer(buf, 0, TERM_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      term.close()
    })

    test("buffer one row short (rows-1): unused last row", () => {
      const TERM_ROWS = 10
      const buf = new TerminalBuffer(COLS, TERM_ROWS)
      fillBuffer(buf, 0, TERM_ROWS - 1)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      for (let y = 0; y < TERM_ROWS - 1; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      // Last row should be empty (unfilled)
      expect(readTermRow(term, TERM_ROWS - 1)).toBe("")
      term.close()
    })

    test("buffer one row over (rows+1): caps output at termRows, no scroll", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = TERM_ROWS + 1
      const buf = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf, 0, BUF_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      // Only first TERM_ROWS rows should be visible (capped)
      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      // Row 0 should still be Row 0 (not scrolled away)
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })

    test("buffer double terminal height (2*rows): caps at termRows, first rows visible", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = TERM_ROWS * 2
      const buf = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf, 0, BUF_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })
  })

  describe("fullscreen incremental render with overflow", () => {
    test("incremental render after content overflows terminal: matches fresh", () => {
      // The exact zoom garble scenario:
      // 1. First render with buffer larger than terminal
      // 2. Change some cells
      // 3. Incremental render (outputPhase with prev buffer)
      // 4. Compare with fresh render through xterm.js
      const TERM_ROWS = 10
      const BUF_ROWS = 15
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)

      const initialAnsi = outputPhase(null, prev, "fullscreen", 0, TERM_ROWS)

      // Modify some cells in the visible area
      const next = prev.clone()
      const changed = "CHANGED"
      for (let x = 0; x < changed.length; x++) {
        next.setCell(x, 3, { char: changed[x]! })
      }

      const incrAnsi = outputPhase(prev, next, "fullscreen", 0, TERM_ROWS)
      const freshAnsi = outputPhase(null, next, "fullscreen", 0, TERM_ROWS)

      const termIncr = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termIncr.feed(initialAnsi)
      termIncr.feed(incrAnsi)

      const termFresh = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termFresh.feed(freshAnsi)

      const mismatches = compareCells(termIncr, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)
      expect(readTermRow(termIncr, 3)).toContain("CHANGED")

      termIncr.close()
      termFresh.close()
    })

    test("incremental render with changes in overflow region: no ghost pixels", () => {
      // Changes beyond termRows should be silently ignored (clamped)
      const TERM_ROWS = 10
      const BUF_ROWS = 15
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)

      const initialAnsi = outputPhase(null, prev, "fullscreen", 0, TERM_ROWS)

      // Modify cells BEYOND terminal height (row 12)
      const next = prev.clone()
      const changed = "OVERFLOW"
      for (let x = 0; x < changed.length; x++) {
        next.setCell(x, 12, { char: changed[x]! })
      }

      const incrAnsi = outputPhase(prev, next, "fullscreen", 0, TERM_ROWS)
      const freshAnsi = outputPhase(null, next, "fullscreen", 0, TERM_ROWS)

      const termIncr = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termIncr.feed(initialAnsi)
      termIncr.feed(incrAnsi)

      const termFresh = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termFresh.feed(freshAnsi)

      const mismatches = compareCells(termIncr, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)
      expect(readTermRow(termIncr, 0)).toContain("Row 0")

      termIncr.close()
      termFresh.close()
    })

    test("multiple incremental renders with overflowing buffer stay consistent", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = 20

      const buf1 = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf1, 0, BUF_ROWS)
      const render1 = outputPhase(null, buf1, "fullscreen", 0, TERM_ROWS)

      const buf2 = buf1.clone()
      for (let x = 0; x < 5; x++) buf2.setCell(x, 2, { char: "AAAAA"[x]! })
      const render2 = outputPhase(buf1, buf2, "fullscreen", 0, TERM_ROWS)

      const buf3 = buf2.clone()
      for (let x = 0; x < 5; x++) buf3.setCell(x, 5, { char: "BBBBB"[x]! })
      const render3 = outputPhase(buf2, buf3, "fullscreen", 0, TERM_ROWS)

      const termIncr = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termIncr.feed(render1)
      termIncr.feed(render2)
      termIncr.feed(render3)

      const termFresh = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termFresh.feed(outputPhase(null, buf3, "fullscreen", 0, TERM_ROWS))

      const mismatches = compareCells(termIncr, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)
      expect(readTermRow(termIncr, 2)).toContain("AAAAA")
      expect(readTermRow(termIncr, 5)).toContain("BBBBB")

      termIncr.close()
      termFresh.close()
    })
  })

  describe("zoom transition (buffer height changes)", () => {
    test("buffer grows beyond terminal then shrinks back: incremental is correct", () => {
      const TERM_ROWS = 10

      // Frame 1: buffer fits terminal
      const buf1 = new TerminalBuffer(COLS, TERM_ROWS)
      fillBuffer(buf1, 0, TERM_ROWS)
      const render1 = outputPhase(null, buf1, "fullscreen", 0, TERM_ROWS)

      // Frame 2: buffer grows beyond terminal (zoom in scenario)
      // Different buffer dimensions → triggers fresh render path
      const buf2 = new TerminalBuffer(COLS, TERM_ROWS + 5)
      fillBuffer(buf2, 0, TERM_ROWS + 5)
      const render2 = outputPhase(null, buf2, "fullscreen", 0, TERM_ROWS)

      // Frame 3: buffer shrinks back to terminal height
      const buf3 = new TerminalBuffer(COLS, TERM_ROWS)
      fillBuffer(buf3, 0, TERM_ROWS)
      const render3 = outputPhase(null, buf3, "fullscreen", 0, TERM_ROWS)

      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(render1)
      term.feed(render2)
      term.feed(render3)

      const termFresh = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termFresh.feed(outputPhase(null, buf3, "fullscreen", 0, TERM_ROWS))

      const mismatches = compareCells(term, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)

      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }

      term.close()
      termFresh.close()
    })

    test("incremental render after overflow with same-size buffer: no desync", () => {
      // Same buffer dimensions, content changes, buffer larger than terminal throughout
      const TERM_ROWS = 10
      const BUF_ROWS = 15

      const buf1 = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf1, 0, BUF_ROWS)
      const render1 = outputPhase(null, buf1, "fullscreen", 0, TERM_ROWS)

      const buf2 = buf1.clone()
      const text2 = "Frame2-Row1"
      for (let x = 0; x < text2.length; x++) buf2.setCell(x, 1, { char: text2[x]! })
      const render2 = outputPhase(buf1, buf2, "fullscreen", 0, TERM_ROWS)

      const buf3 = buf2.clone()
      const text3 = "Frame3-Row7"
      for (let x = 0; x < text3.length; x++) buf3.setCell(x, 7, { char: text3[x]! })
      const render3 = outputPhase(buf2, buf3, "fullscreen", 0, TERM_ROWS)

      const buf4 = buf3.clone()
      const text4 = "Frame4-Row9"
      for (let x = 0; x < text4.length; x++) buf4.setCell(x, 9, { char: text4[x]! })
      const render4 = outputPhase(buf3, buf4, "fullscreen", 0, TERM_ROWS)

      const termIncr = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termIncr.feed(render1)
      termIncr.feed(render2)
      termIncr.feed(render3)
      termIncr.feed(render4)

      const termFresh = createTerminal({
        backend: createXtermBackend(),
        cols: COLS,
        rows: TERM_ROWS,
      })
      termFresh.feed(outputPhase(null, buf4, "fullscreen", 0, TERM_ROWS))

      const mismatches = compareCells(termIncr, termFresh, TERM_ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)

      expect(readTermRow(termIncr, 1)).toContain("Frame2-Row1")
      expect(readTermRow(termIncr, 7)).toContain("Frame3-Row7")
      expect(readTermRow(termIncr, 9)).toContain("Frame4-Row9")

      termIncr.close()
      termFresh.close()
    })
  })

  describe("resize smaller while content at full height", () => {
    test("terminal shrinks: output capped to new smaller height", () => {
      const ORIG_ROWS = 15
      const SHRUNK_ROWS = 8

      const buf = new TerminalBuffer(COLS, ORIG_ROWS)
      fillBuffer(buf, 0, ORIG_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, SHRUNK_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: SHRUNK_ROWS })
      term.feed(ansi)

      for (let y = 0; y < SHRUNK_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })

    test("resize smaller after incremental renders: no stale content", () => {
      const ORIG_ROWS = 12
      const SHRUNK_ROWS = 6

      // Initial render at original size
      const buf1 = new TerminalBuffer(COLS, ORIG_ROWS)
      fillBuffer(buf1, 0, ORIG_ROWS)

      // After resize, fresh render capped to smaller terminal
      const ansi = outputPhase(null, buf1, "fullscreen", 0, SHRUNK_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: SHRUNK_ROWS })
      term.feed(ansi)

      for (let y = 0; y < SHRUNK_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      term.close()
    })
  })

  describe("edge cases", () => {
    test("termRows = 1: single visible row", () => {
      const TERM_ROWS = 1
      const BUF_ROWS = 5
      const buf = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf, 0, BUF_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen", 0, TERM_ROWS)
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(ansi)

      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })

    test("no termRows cap (undefined): renders all rows", () => {
      const BUF_ROWS = 10
      const buf = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(buf, 0, BUF_ROWS)

      const ansi = outputPhase(null, buf, "fullscreen")
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: BUF_ROWS })
      term.feed(ansi)

      for (let y = 0; y < BUF_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      term.close()
    })

    test("termRows equals buffer height: no capping needed", () => {
      const ROWS = 10
      const buf = new TerminalBuffer(COLS, ROWS)
      fillBuffer(buf, 0, ROWS)

      const ansiCapped = outputPhase(null, buf, "fullscreen", 0, ROWS)
      const ansiUncapped = outputPhase(null, buf, "fullscreen")

      const termCapped = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
      termCapped.feed(ansiCapped)

      const termUncapped = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
      termUncapped.feed(ansiUncapped)

      const mismatches = compareCells(termCapped, termUncapped, ROWS, COLS)
      expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)

      termCapped.close()
      termUncapped.close()
    })

    test("incremental render clamping: changes at row termRows-1 are included", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = 15
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)

      const initialAnsi = outputPhase(null, prev, "fullscreen", 0, TERM_ROWS)

      // Change the last visible row (row 9, the boundary)
      const next = prev.clone()
      const text = "BOUNDARY"
      for (let x = 0; x < text.length; x++) next.setCell(x, TERM_ROWS - 1, { char: text[x]! })

      const incrAnsi = outputPhase(prev, next, "fullscreen", 0, TERM_ROWS)

      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(initialAnsi)
      term.feed(incrAnsi)

      expect(readTermRow(term, TERM_ROWS - 1)).toContain("BOUNDARY")
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })

    test("incremental render clamping: changes at row termRows are excluded", () => {
      const TERM_ROWS = 10
      const BUF_ROWS = 15
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)

      const initialAnsi = outputPhase(null, prev, "fullscreen", 0, TERM_ROWS)

      // Change exactly at row termRows (the first invisible row)
      const next = prev.clone()
      const text = "INVISIBLE"
      for (let x = 0; x < text.length; x++) next.setCell(x, TERM_ROWS, { char: text[x]! })

      const incrAnsi = outputPhase(prev, next, "fullscreen", 0, TERM_ROWS)

      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
      term.feed(initialAnsi)
      term.feed(incrAnsi)

      // Visible rows should be unchanged from initial render
      for (let y = 0; y < TERM_ROWS; y++) {
        expect(readTermRow(term, y)).toContain(`Row ${y}`)
      }
      expect(readTermRow(term, 0)).toContain("Row 0")
      term.close()
    })
  })
})

/**
 * The STRICT output oracles judge fullscreen output against the terminal it
 * was written for. Fullscreen output never addresses a row at or below
 * `termRows`: the first render and every full render are capped, and the
 * diff drops changes below the cap. A buffer taller than the terminal is a
 * supported state (the root is content-sized), and only its top `termRows`
 * rows are ever on screen.
 *
 * Live case, 2026-09-28: `yrd watch` laid out 149 rows in a 200x40 alternate
 * screen. Its clock (row 0) and a runner duration (row 129) ticked in one
 * frame. The diff wrote the clock and correctly dropped row 129, but the vt100
 * oracle replayed an uncapped 149-row fresh frame into a 149-row terminal and
 * threw `STRICT_OUTPUT char mismatch at (40,129)`.
 */
describe("STRICT oracles at the fullscreen viewport cap", () => {
  const TERM_ROWS = 10
  const BUF_ROWS = 25
  const STRICT_VARS = ["SILVERY_STRICT", "SILVERY_STRICT_ACCUMULATE", "SILVERY_STRICT_TERMINAL"]
  let saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved = Object.fromEntries(STRICT_VARS.map((name) => [name, process.env[name]]))
  })
  afterEach(() => {
    for (const name of STRICT_VARS) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  function writeText(buf: TerminalBuffer, y: number, text: string): void {
    for (let x = 0; x < text.length; x++) buf.setCell(x, y, { char: text[x]! })
  }

  /** yrd's frame in miniature: the clock on row 0, a duration below the terminal. */
  function tickingFrames(): { prev: TerminalBuffer; next: TerminalBuffer } {
    const prev = new TerminalBuffer(COLS, BUF_ROWS)
    fillBuffer(prev, 0, BUF_ROWS)
    writeText(prev, 0, "Row 0 clock 00:54:20")
    writeText(prev, 20, "Row 20 provisioning 2:01")
    const next = prev.clone()
    writeText(next, 0, "Row 0 clock 00:54:21")
    writeText(next, 20, "Row 20 provisioning 2:02")
    return { prev, next }
  }

  /** What a real TERM_ROWS-row terminal shows after `frames`, vs a fresh frame of `next`. */
  function expectTerminalMatchesFresh(frames: string[], next: TerminalBuffer): string[] {
    const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
    for (const frame of frames) termIncr.feed(frame)
    const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: TERM_ROWS })
    termFresh.feed(outputPhase(null, next, "fullscreen", 0, TERM_ROWS))
    // An erased cell reads '' and a written space ' '; they look the same, and
    // SILVERY_STRICT_TERMINAL compares them the same way (`char || " "`).
    const mismatches: string[] = []
    for (let y = 0; y < TERM_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const a = termIncr.getCell(y, x)?.char || " "
        const b = termFresh.getCell(y, x)?.char || " "
        if (a !== b) mismatches.push(`(${x},${y}): incremental='${a}' fresh='${b}'`)
      }
    }
    const shown = Array.from({ length: TERM_ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) => termIncr.getCell(y, x)?.char || " ")
        .join("")
        .trimEnd(),
    )
    termIncr.close()
    termFresh.close()
    expect(mismatches, `Cell mismatches:\n${mismatches.join("\n")}`).toHaveLength(0)
    return shown
  }

  test("vt100: a frame changing a visible row and a row below the terminal verifies", () => {
    process.env.SILVERY_STRICT = "1"
    const render = createOutputPhase({})
    const { prev, next } = tickingFrames()
    const first = render(null, prev, "fullscreen", 0, TERM_ROWS)
    const incr = render(prev, next, "fullscreen", 0, TERM_ROWS)
    expect(expectTerminalMatchesFresh([first, incr], next)[0]).toContain("00:54:21")
  })

  test("accumulate: replays the frames into the terminal they were written for", () => {
    process.env.SILVERY_STRICT = "0"
    process.env.SILVERY_STRICT_ACCUMULATE = "1"
    const render = createOutputPhase({})
    const { prev, next } = tickingFrames()
    const first = render(null, prev, "fullscreen", 0, TERM_ROWS)
    const incr = render(prev, next, "fullscreen", 0, TERM_ROWS)
    expect(expectTerminalMatchesFresh([first, incr], next)[0]).toContain("00:54:21")
  })

  // STRICT=0 asks only the real terminal; STRICT=1 adds the vt100 oracle, which
  // must reach the same verdict because it now models the same clamped region.
  test.each(["0", "1"])(
    "native scroll (SILVERY_STRICT=%s): a region reaching below the terminal scrolls only the rows on screen",
    (strict) => {
      // A log that spans the terminal's last row shifts up one line. The scroll
      // region must end at the terminal's last row: a real terminal clamps
      // `DECSTBM 4;25` on a 10-row screen to rows 4..10, so SU pulls a blank line
      // into row 10, and the diff must repaint that row from the buffer.
      process.env.SILVERY_STRICT = strict
      const render = createOutputPhase({})
      const prev = new TerminalBuffer(COLS, BUF_ROWS)
      fillBuffer(prev, 0, BUF_ROWS)
      const first = render(null, prev, "fullscreen", 0, TERM_ROWS)
      const next = prev.clone()
      for (let y = 3; y < BUF_ROWS - 1; y++) {
        for (let x = 0; x < 12; x++) next.setCell(x, y, { char: " " })
        writeText(next, y, `Row ${y + 1}`)
      }
      for (let x = 0; x < 12; x++) next.setCell(x, BUF_ROWS - 1, { char: " " })
      writeText(next, BUF_ROWS - 1, "new tail")
      const incr = render(prev, next, "fullscreen", 0, TERM_ROWS)
      // The frame takes the native scroll path, and its region ends on screen.
      expect(incr).toContain(`\x1b[4;${TERM_ROWS}r`)
      expect(incr).not.toContain(`\x1b[4;${BUF_ROWS}r`)
      const shown = expectTerminalMatchesFresh([first, incr], next)
      expect(shown[TERM_ROWS - 1]).toBe(`Row ${TERM_ROWS}`)
    },
  )

  test("xterm: the persistent emulator has the terminal's rows, not the buffer's", async () => {
    await preloadStrictTerminalBackends()
    process.env.SILVERY_STRICT = "0"
    process.env.SILVERY_STRICT_TERMINAL = "xterm"
    const render = createOutputPhase({})
    const { prev, next } = tickingFrames()
    const first = render(null, prev, "fullscreen", 0, TERM_ROWS)
    const incr = render(prev, next, "fullscreen", 0, TERM_ROWS)
    expect(expectTerminalMatchesFresh([first, incr], next)[0]).toContain("00:54:21")
  })

  describe("the capped vt100 oracle stays strict", () => {
    const ctx: OutputContext = {
      caps: {
        underlineStyles: ["single", "double", "curly", "dotted", "dashed"],
        underlineColor: true,
        overline: true,
        colorLevel: "truecolor",
      },
      measurer: null,
      sgrCache: new Map(),
      transitionCache: new Map(),
      mode: "fullscreen",
      termRows: TERM_ROWS,
    }
    const renderFull = (buf: TerminalBuffer, _ctx: OutputContext, maxRows?: number): string =>
      outputPhase(null, buf, "fullscreen", 0, maxRows)
    const verify = (prev: TerminalBuffer, next: TerminalBuffer, incr: string): void =>
      verifyOutputEquivalence(
        prev,
        next,
        incr,
        ctx,
        renderFull,
        (g) => graphemeWidth(g),
        () => false,
        TERM_ROWS,
      )

    test("throws when the incremental frame drops a visible change", () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {})
      const { prev, next } = tickingFrames()
      expect(() => verify(prev, next, "")).toThrow(/STRICT_OUTPUT char mismatch at \(19,0\)/)
      expect(logged).toHaveBeenCalled()
    })

    test("throws on a write addressed below the terminal, which a real terminal clamps to its last row", () => {
      const { prev, next } = tickingFrames()
      // What an unfiltered diff would emit: the clock, then row 20 (1-based 21).
      const unfiltered = "\x1b[1;20H1\x1b[21;24H2"
      const logged = vi.spyOn(console, "error").mockImplementation(() => {})
      let thrown: unknown
      try {
        verify(prev, next, unfiltered)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(IncrementalRenderMismatchError)
      const message = (thrown as Error).message
      expect(message).toMatch(/STRICT_OUTPUT char mismatch at \(23,9\)/)
      expect(logged).toHaveBeenCalled()
      // The dump says which window was judged: 10 rows of a 25-row buffer.
      const dir = /Artifacts: (\S+)/.exec(message)?.[1]
      expect(dir, message).toBeTruthy()
      const meta = JSON.parse(readFileSync(`${dir}/meta.json`, "utf-8")) as Record<string, unknown>
      expect(meta.viewportRows).toBe(TERM_ROWS)
      expect(meta.termRows).toBe(TERM_ROWS)
      expect(meta.nextSize).toEqual({ width: COLS, height: BUF_ROWS })
    })
  })
})
