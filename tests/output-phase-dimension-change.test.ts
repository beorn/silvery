/**
 * Tests for output phase handling of buffer dimension changes.
 *
 * When prev and next buffers have different dimensions (e.g., terminal resize
 * without prevBuffer invalidation, or test renderer dimension changes), the
 * output phase must produce correct ANSI output. Stale cells from the old
 * buffer dimensions must not leak through.
 *
 * The core invariant: replaying the full render output and the incremental
 * output must produce identical terminal state.
 */
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { outputPhase, replayAnsiWithStyles } from "@silvery/ag-term/pipeline/output-phase"

/** Write a string into a buffer row starting at column x. */
function writeStr(buf: TerminalBuffer, x: number, y: number, text: string, fg?: number): void {
  for (let i = 0; i < text.length && x + i < buf.width; i++) {
    buf.setCell(x + i, y, { char: text[i]!, fg: fg ?? null })
  }
}

/** Fill a buffer row with a character. */
function fillRow(buf: TerminalBuffer, y: number, char: string, fg?: number): void {
  for (let x = 0; x < buf.width; x++) {
    buf.setCell(x, y, { char, fg: fg ?? null })
  }
}

/**
 * Verify that incremental ANSI output (prev→next) produces the same terminal
 * state as a fresh full render of next. Uses replayAnsiWithStyles as a
 * software VT to replay ANSI sequences.
 *
 * Simulates a real terminal dimension change:
 * 1. Terminal starts at prev dimensions, showing prev content
 * 2. Terminal resizes to next dimensions (content truncated/reflowed)
 * 3. Incremental ANSI output is applied to the now next-sized terminal
 *
 * The key insight: CUP positions beyond next's dimensions are clamped by the
 * terminal, so shrink-region cells in the diff output land at wrong positions
 * if not filtered or handled.
 */
function verifyIncrementalMatchesFresh(
  prev: TerminalBuffer,
  next: TerminalBuffer,
  description: string,
): void {
  // The terminal dimensions after the resize are next's dimensions
  const termW = next.width
  const termH = next.height

  // Fresh render: full render of next buffer (no prev)
  const freshOutput = outputPhase(null, next, "fullscreen")
  const freshScreen = replayAnsiWithStyles(termW, termH, freshOutput)

  // Incremental render: diff prev→next
  const incrOutput = outputPhase(prev, next, "fullscreen")

  // Replay on a terminal of NEXT's dimensions.
  // First render prev content (truncated to next's dimensions by the VT),
  // then apply incremental diff. This simulates: terminal was showing prev
  // content, resized to next dimensions, then incremental output arrives.
  const prevFullOutput = outputPhase(null, prev, "fullscreen")
  const incrScreen = replayAnsiWithStyles(termW, termH, prevFullOutput + incrOutput)

  // Compare: both screens must match within next's bounds
  const mismatches: string[] = []
  for (let y = 0; y < termH; y++) {
    for (let x = 0; x < termW; x++) {
      const freshCell = freshScreen[y]![x]!
      const incrCell = incrScreen[y]![x]!
      if (freshCell.char !== incrCell.char) {
        mismatches.push(`(${x},${y}): fresh='${freshCell.char}' incr='${incrCell.char}'`)
      }
    }
  }

  if (mismatches.length > 0) {
    // Build row context for first mismatch
    const firstY = parseInt(mismatches[0]!.match(/,(\d+)/)![1]!)
    const context: string[] = []
    for (let y = Math.max(0, firstY - 1); y <= Math.min(termH - 1, firstY + 2); y++) {
      let freshRow = ""
      let incrRow = ""
      for (let x = 0; x < termW; x++) {
        freshRow += freshScreen[y]![x]!.char
        incrRow += incrScreen[y]![x]!.char
      }
      context.push(`fresh row ${y}: |${freshRow}|`)
      context.push(`incr  row ${y}: |${incrRow}|`)
    }

    expect.fail(
      `${description}: ${mismatches.length} cell mismatches\n` +
        mismatches.slice(0, 10).join("\n") +
        `\n\nRow context:\n${context.join("\n")}`,
    )
  }
}

describe("output phase: buffer dimension changes", () => {
  test("width shrink: stale cells in old right strip must be cleared", () => {
    // Prev: 12 cols wide with content
    const prev = new TerminalBuffer(12, 5)
    for (let y = 0; y < 5; y++) {
      writeStr(prev, 0, y, "AABBCCDDEE!!", y + 1)
    }

    // Next: 8 cols wide with different content
    const next = new TerminalBuffer(8, 5)
    for (let y = 0; y < 5; y++) {
      writeStr(next, 0, y, "XXYYZZWW", y + 1)
    }

    verifyIncrementalMatchesFresh(prev, next, "width shrink 12→8")
  })

  test("height shrink: stale cells in old bottom strip must be cleared", () => {
    // Prev: 10 rows tall with content
    const prev = new TerminalBuffer(10, 8)
    for (let y = 0; y < 8; y++) {
      writeStr(prev, 0, y, `Row${y}____`, y + 1)
    }

    // Next: 5 rows tall with different content
    const next = new TerminalBuffer(10, 5)
    for (let y = 0; y < 5; y++) {
      writeStr(next, 0, y, `New${y}____`, y + 1)
    }

    verifyIncrementalMatchesFresh(prev, next, "height shrink 8→5")
  })

  test("width+height shrink: corner cells must be cleared", () => {
    // Prev: 15x10 with content everywhere
    const prev = new TerminalBuffer(15, 10)
    for (let y = 0; y < 10; y++) {
      fillRow(prev, y, String.fromCharCode(65 + y), y + 1)
    }

    // Next: 10x6 with new content
    const next = new TerminalBuffer(10, 6)
    for (let y = 0; y < 6; y++) {
      fillRow(next, y, String.fromCharCode(97 + y), y + 1)
    }

    verifyIncrementalMatchesFresh(prev, next, "width+height shrink 15x10→10x6")
  })

  test("width growth: new right strip must show next content", () => {
    // Prev: 8 cols wide
    const prev = new TerminalBuffer(8, 5)
    for (let y = 0; y < 5; y++) {
      writeStr(prev, 0, y, "AABBCCDD", y + 1)
    }

    // Next: 12 cols wide with new content in expanded area
    const next = new TerminalBuffer(12, 5)
    for (let y = 0; y < 5; y++) {
      writeStr(next, 0, y, "XXYYZZWWVVUU", y + 1)
    }

    verifyIncrementalMatchesFresh(prev, next, "width growth 8→12")
  })

  test("width+height growth: corner cells must show next content", () => {
    // Prev: 8x4
    const prev = new TerminalBuffer(8, 4)
    for (let y = 0; y < 4; y++) {
      fillRow(prev, y, String.fromCharCode(65 + y), y + 1)
    }

    // Next: 12x7
    const next = new TerminalBuffer(12, 7)
    for (let y = 0; y < 7; y++) {
      fillRow(next, y, String.fromCharCode(97 + y), y + 1)
    }

    verifyIncrementalMatchesFresh(prev, next, "width+height growth 8x4→12x7")
  })

  test("mixed: width grows, height shrinks", () => {
    // Prev: 8x8
    const prev = new TerminalBuffer(8, 8)
    for (let y = 0; y < 8; y++) {
      fillRow(prev, y, String.fromCharCode(65 + y), y + 1)
    }

    // Next: 12x4 (wider but shorter)
    const next = new TerminalBuffer(12, 4)
    for (let y = 0; y < 4; y++) {
      fillRow(next, y, String.fromCharCode(97 + y), y + 1)
    }

    verifyIncrementalMatchesFresh(prev, next, "mixed: width grows 8→12, height shrinks 8→4")
  })

  test("mixed: width shrinks, height grows", () => {
    // Prev: 12x4
    const prev = new TerminalBuffer(12, 4)
    for (let y = 0; y < 4; y++) {
      fillRow(prev, y, String.fromCharCode(65 + y), y + 1)
    }

    // Next: 8x8 (narrower but taller)
    const next = new TerminalBuffer(8, 8)
    for (let y = 0; y < 8; y++) {
      fillRow(next, y, String.fromCharCode(97 + y), y + 1)
    }

    verifyIncrementalMatchesFresh(prev, next, "mixed: width shrinks 12→8, height grows 4→8")
  })

  test("significant width change simulating column layout change (zoom)", () => {
    // Simulates zoom-out: prev has 1 column of detailed content,
    // next has 3 columns of summary content at different widths
    const prev = new TerminalBuffer(80, 24)
    // Single detailed column filling most of the width
    for (let y = 0; y < 24; y++) {
      const line = `Detailed view row ${y}: lots of content here filling the entire width of the screen`
      writeStr(prev, 0, y, line.slice(0, 80), 7)
    }

    // Next: same dimensions but completely different content layout
    const next = new TerminalBuffer(80, 24)
    // Three columns with borders
    for (let y = 0; y < 24; y++) {
      writeStr(next, 0, y, "│", 8)
      writeStr(next, 1, y, `Col1 r${y}`.padEnd(24), 7)
      writeStr(next, 25, y, "│", 8)
      writeStr(next, 26, y, `Col2 r${y}`.padEnd(25), 7)
      writeStr(next, 51, y, "│", 8)
      writeStr(next, 52, y, `Col3 r${y}`.padEnd(28), 7)
    }

    verifyIncrementalMatchesFresh(prev, next, "zoom-out column layout change")
  })
})
