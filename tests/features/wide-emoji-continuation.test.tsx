/**
 * Regression: wide-grapheme continuation cells retain stale chars when the
 * leading wide grapheme MOVES to a new column across renders.
 *
 * Bead: @km/silvery/wide-emoji-continuation-cell-stale (13047)
 *
 * Symptom:
 *   `<Box justifyContent="flex-end"><Text>📋{n}</Text><Text>{suffix}</Text></Box>`
 *   render 1 (long suffix) then render 2 (shorter suffix). The whole group shifts
 *   right. 📋 lands at column X in render 2 but column X-2 in render 1. The
 *   continuation cell of 📋 (col X+1) lands at a column that held a narrow letter
 *   in render 1. The incremental diff DID mark (X, y) and (X+1, y) as changes
 *   in the diff pool, but the scatter emitter SKIPS the continuation change
 *   because the wide-char main was already emitted at column X in the same pass
 *   (`state.lastEmittedX === x - 1 && state.lastEmittedY === y`).
 *
 *   That skip is correct ONLY if the terminal also treats 📋 as width-2 —
 *   the terminal then auto-claims X+1 when it advanced past 📋. The defense
 *   against terminal-wcwidth-disagreement (CUP cursor re-sync after wide
 *   chars, OSC 66 wrapping) keeps the *cursor* in sync but does NOT erase the
 *   continuation column's stale glyph if the terminal previously had a narrow
 *   char at X+1 and now thinks 📋 is width-1.
 *
 * Root cause:
 *   diff-buffers.ts (the wide→narrow extra-emission branch) only handles the
 *   transition "wide at column N became narrow at column N." It does NOT
 *   handle "wide at column N moved to column N+k AND the OLD continuation
 *   column at N+1 must be repainted with the new content."
 *
 *   When the wide grapheme is at the same column in both prev and next, but
 *   prev had a narrow char at the column AFTER the wide and next now has the
 *   continuation cell there, the change IS in the pool (cellEquals detects
 *   the WIDE/CONTINUATION packed-metadata mismatch). The scatter emitter then
 *   skips the continuation change as "already covered by main."
 *
 *   That skip is the bug: under terminal-wcwidth disagreement (which the
 *   existing CUP resync was designed to recover from), the terminal does NOT
 *   auto-claim the continuation column. The continuation cell needs an
 *   explicit erase emission to overwrite the stale glyph.
 *
 * Fix: in diff-buffers.ts, when emitting a wide-char main cell change, also
 * force-mark the continuation column as a change with the actual continuation
 * cell (so the scatter emitter at least HAS the entry to emit if needed) AND
 * make the scatter emitter NOT skip the continuation when prev had a NARROW
 * char at the same position — only skip when prev was already a continuation
 * of the same wide char.
 *
 * The minimum-LOC fix is in diff-buffers.ts: when next[x] is wide and
 * prev[x] was NOT wide, force-emit a clear at x+1 too (mirror of the existing
 * wide→narrow branch but for narrow→wide-shift). The scatter emitter's
 * "skip continuation if main was just emitted" is then suppressed for
 * THIS continuation entry by giving it a sentinel that emitScatter handles.
 *
 * This file tests the OBSERVABLE behavior end-to-end via xterm.js: feed the
 * initial ANSI then the incremental ANSI, and assert the cell at the
 * continuation column does NOT contain a stale letter.
 */

import { describe, test, expect } from "vitest"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { outputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { replayAnsiWithStyles } from "@silvery/ag-term/pipeline/output-verify"

const COLS = 80
const ROWS = 3

/** Write a wide grapheme into the buffer at (x, y), occupying x and x+1. */
function writeWide(buf: TerminalBuffer, x: number, y: number, char: string): void {
  buf.setCell(x, y, { char, wide: true, fg: null })
  buf.setCell(x + 1, y, { char: "", continuation: true, fg: null })
}

/** Write a narrow string into the buffer starting at (x, y). */
function writeNarrow(buf: TerminalBuffer, x: number, y: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    buf.setCell(x + i, y, { char: text[i]!, fg: null })
  }
}

describe("wide-emoji continuation cell after layout shift (13047)", () => {
  test("Fixture A: emoji+suffix group shifted by sibling shrink — no stale char at old continuation column", () => {
    // Production-realistic 80-col terminal, flex-end group shifted by sibling shrink.
    //
    // prev: pad-left + "📋1" (3 cols) + "longsuffix" (10 cols) at far right.
    //   📋 at col 67, cont 68, '1' 69, 'longsuffix' 70..79.
    //
    // next: pad-left + "📋1" + "lon" (3 cols suffix). Group shifted right by 7.
    //   📋 at col 74, cont 75, '1' 76, 'lon' 77..79.
    const prev = new TerminalBuffer(COLS, ROWS)
    writeWide(prev, 67, 0, "📋")
    writeNarrow(prev, 69, 0, "1longsuffix")
    prev.resetDirtyRows()

    // First render → initial ANSI; prime the xterm backend.
    const initialAnsi = outputPhase(null, prev, "fullscreen")

    const next = prev.clone()
    // Clear the previous content in the row (matches what the layout pass
    // would do: render-text writes the new content over the old layout).
    for (let x = 0; x < COLS; x++) {
      next.setCell(x, 0, { char: " ", fg: null })
    }
    writeWide(next, 74, 0, "📋")
    writeNarrow(next, 76, 0, "1lon")

    const incrAnsi = outputPhase(prev, next, "fullscreen")

    const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    term.feed(initialAnsi)
    term.feed(incrAnsi)

    // The continuation column of the OLD emoji position (col 68) must NOT
    // contain a stale 'l' (or any letter from "longsuffix").
    // Old emoji at col 67-68, new emoji at col 74-75. Cols 67-73 should be
    // SPACES (the group shifted right; those cols are padding now).
    for (let x = 67; x <= 73; x++) {
      const c = term.getCell(0, x)?.char
      expect(c, `col ${x} in shifted-emoji frame should be space, got "${c}"`).toBe(" ")
    }

    // The new emoji should be at col 74.
    expect(term.getCell(0, 74)?.char).toBe("📋")
    // Col 76 should be '1', then 'l', 'o', 'n' at 77-79.
    expect(term.getCell(0, 76)?.char).toBe("1")
    expect(term.getCell(0, 77)?.char).toBe("l")
    expect(term.getCell(0, 78)?.char).toBe("o")
    expect(term.getCell(0, 79)?.char).toBe("n")

    term.close()
  })

  test("Fixture B: single-column shift exposes scatter-mode continuation stale", () => {
    // Smaller shift on a wider row — emoji moves by 1 col, suffix shrinks by 1.
    // Few enough cells differ that scatter / run-length mode is picked.
    //
    // prev (width 80): cols 0..69 = " ", 70 = 📋, 71 = cont, 72..76 = "start",
    //                  77..79 = "..."
    // next (width 80): cols 0..70 = " ", 71 = 📋, 72 = cont, 73..76 = "star",
    //                  77..79 = "..."
    const prev = new TerminalBuffer(COLS, ROWS)
    writeNarrow(prev, 0, 0, " ".repeat(70))
    writeWide(prev, 70, 0, "📋")
    writeNarrow(prev, 72, 0, "start...")
    prev.resetDirtyRows()

    const initialAnsi = outputPhase(null, prev, "fullscreen")

    const next = prev.clone()
    for (let x = 0; x < COLS; x++) {
      next.setCell(x, 0, { char: " ", fg: null })
    }
    writeNarrow(next, 0, 0, " ".repeat(71))
    writeWide(next, 71, 0, "📋")
    writeNarrow(next, 73, 0, "star...")

    const incrAnsi = outputPhase(prev, next, "fullscreen")

    const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    term.feed(initialAnsi)
    term.feed(incrAnsi)

    // Critical assertion: col 72 (new continuation column) MUST NOT be 's'
    // (the stale first letter of "start" from prev).
    const c72 = term.getCell(0, 72)?.char
    expect(["", " "], `col 72 (new continuation of 📋) must be cleared, got "${c72}"`).toContain(
      c72,
    )
    // The emoji is at col 71 in next.
    expect(term.getCell(0, 71)?.char).toBe("📋")
    // 'star' should appear at cols 73..76.
    expect(term.getCell(0, 73)?.char).toBe("s")
    expect(term.getCell(0, 74)?.char).toBe("t")
    expect(term.getCell(0, 75)?.char).toBe("a")
    expect(term.getCell(0, 76)?.char).toBe("r")

    term.close()
  })

  test("Fixture C: narrow→wide transition at same column emits the continuation cell change", () => {
    // Direct test of the diff-buffers behavior: if prev[x] is narrow and
    // next[x] is wide, the continuation cell at x+1 must be in the change set
    // (and the emitter must produce ANSI that clears whatever was previously
    // at x+1).
    //
    // prev (width 10): "abcdefghij" — all narrow.
    // next (width 10): "ab📋efghij" — emoji at col 2-3 replaces 'c' and 'd'.
    const W = 10
    const prev = new TerminalBuffer(W, 1)
    writeNarrow(prev, 0, 0, "abcdefghij")
    prev.resetDirtyRows()

    const initialAnsi = outputPhase(null, prev, "fullscreen")

    const next = prev.clone()
    writeWide(next, 2, 0, "📋")
    // Note: writeWide already cleared col 3 because the setCell wide-consistency
    // logic in buffer.ts forces the previous col 3 ('d') to be cleared.

    const incrAnsi = outputPhase(prev, next, "fullscreen")

    const term = createTerminal({ backend: createXtermBackend(), cols: W, rows: 1 })
    term.feed(initialAnsi)
    term.feed(incrAnsi)

    expect(term.getCell(0, 0)?.char).toBe("a")
    expect(term.getCell(0, 1)?.char).toBe("b")
    expect(term.getCell(0, 2)?.char).toBe("📋")
    // Col 3 should NOT be 'd' (stale).
    const c3 = term.getCell(0, 3)?.char
    expect(["", " "]).toContain(c3)
    expect(term.getCell(0, 4)?.char).toBe("e")

    term.close()
  })

  test("Fixture D: narrow→wide-shift continuation rescue space carries the wide char's style (STRICT col-0 default-style bug, 15566)", () => {
    // Bead: @km/silvery/15566-incremental-column-zero-default-style
    //
    // The narrow→wide-shift continuation rescue (Fixture A/B/C above) emits
    // an explicit CUP + space at the continuation column to erase a possible
    // stale glyph. The rescue did `\x1b[0m` (style reset) before the CUP, then
    // wrote the space WITHOUT re-applying any style — so the continuation cell
    // landed with DEFAULT fg/bg.
    //
    // On a FRESH render the continuation cell of a wide grapheme carries the
    // wide char's own style (the buffer stores the continuation cell with the
    // same fg/bg as its main cell). On a themed background — e.g. km's Nord
    // breadcrumb row, bg rgb(46,52,64) / fg rgb(197,203,215) — incremental
    // therefore diverged from fresh at the continuation column:
    //
    //   STRICT_OUTPUT style mismatch at (col,0) char=' ':
    //     fg: default vs rgb(46,52,64), bg: default vs rgb(197,203,215)
    //
    // This fixture reproduces the exact shape: a themed row where a wide
    // emoji replaces narrow text one column to the LEFT of where a narrow
    // char sat in prev, triggering the rescue, and asserts the rescued
    // continuation cell's STYLE matches a fresh render.
    const W = 16
    const FG = { r: 197, g: 203, b: 215 }
    const BG = { r: 46, g: 52, b: 64 }

    // prev: a themed row of narrow letters. Col 3 holds a narrow 'd'.
    const prev = new TerminalBuffer(W, 1)
    for (let x = 0; x < W; x++) {
      prev.setCell(x, 0, { char: "abcdefghijklmnop"[x]!, fg: FG, bg: BG })
    }
    prev.resetDirtyRows()

    const initialAnsi = outputPhase(null, prev, "fullscreen")

    // next: wide emoji 💼 at col 2 (occupying 2 + continuation 3), themed.
    // prev[2] was narrow 'c' (not wide) → narrow→wide-shift rescue fires for
    // the continuation cell at col 3.
    const next = prev.clone()
    next.setCell(2, 0, { char: "💼", wide: true, fg: FG, bg: BG })
    next.setCell(3, 0, { char: "", continuation: true, fg: FG, bg: BG })

    const incrAnsi = outputPhase(prev, next, "fullscreen")
    const freshAnsi = outputPhase(null, next, "fullscreen")

    const incr = replayAnsiWithStyles(W, 1, initialAnsi + incrAnsi)
    const fresh = replayAnsiWithStyles(W, 1, freshAnsi)

    // The continuation column (col 3) must have the SAME fg/bg as a fresh
    // render — the wide char's themed style, not default.
    expect(incr[0]![3]!.fg, "col 3 fg incremental-vs-fresh").toEqual(fresh[0]![3]!.fg)
    expect(incr[0]![3]!.bg, "col 3 bg incremental-vs-fresh").toEqual(fresh[0]![3]!.bg)

    // Whole-row style + char equivalence — incremental MUST match fresh.
    for (let x = 0; x < W; x++) {
      expect(incr[0]![x]!.char, `col ${x} char`).toBe(fresh[0]![x]!.char)
      expect(incr[0]![x]!.fg, `col ${x} fg`).toEqual(fresh[0]![x]!.fg)
      expect(incr[0]![x]!.bg, `col ${x} bg`).toEqual(fresh[0]![x]!.bg)
    }
  })
})
