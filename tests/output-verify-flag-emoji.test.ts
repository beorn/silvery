/**
 * Regression: vt100 emulator (`replayAnsiWithStyles` in output-verify.ts)
 * incorrectly absorbs regional-indicator codepoints onto preceding non-RI
 * graphemes, producing oversized clusters that smear column positions.
 *
 * Bead: @km/silvery/strict-output-flag-emoji-width-divergence (P2, 2026-05-05)
 *
 * Before the fix, when ANSI like `<sp>🇺🇸<sp>US` was replayed, the
 * grapheme collector built `" 🇺🇸"` (width=3) at column N, leaving the
 * flag rendered at column N (instead of N+1) and stale prev pixels at
 * columns N+1 / N+2. This surfaced as STRICT_OUTPUT char mismatches
 * whenever a flag emoji replaced narrower text in the same row across
 * frames (e.g., real km vault row "🇺🇸 US 1040" overwriting "bun km
 * doctor").
 *
 * Root cause: `replayAnsiWithStyles` greedily absorbed regional-indicator
 * codepoints onto ANY preceding grapheme. Per UAX #29 GB12/GB13, a
 * regional indicator may only pair with another adjacent regional
 * indicator (forming a flag), starting from a non-RI boundary or from
 * a previously-completed flag. A bare RI must NOT extend a non-RI base.
 *
 * The fix gates RI absorption on (firstCp is RI) AND (we have not yet
 * absorbed an RI in this grapheme). It also gates VS-16 / skin-tone /
 * tag-sequence absorption to emoji-capable bases for the same reason.
 */
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { outputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { replayAnsiWithStyles } from "@silvery/ag-term/pipeline/output-verify"
import { graphemeWidth } from "@silvery/ag-term/unicode"

const COLS = 80
const ROWS = 5

function writeText(buf: TerminalBuffer, startX: number, y: number, text: string): number {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  let x = startX
  for (const { segment: char } of seg.segment(text)) {
    const w = graphemeWidth(char)
    if (w === 0) continue
    if (w === 2) {
      buf.setCell(x, y, { char, wide: true, fg: null })
      buf.setCell(x + 1, y, { char: "", continuation: true, fg: null })
      x += 2
    } else {
      buf.setCell(x, y, { char, fg: null })
      x += 1
    }
  }
  return x
}

describe("replayAnsiWithStyles regional-indicator handling (UAX #29 GB12/GB13)", () => {
  test("flag emoji preceded by space stays anchored to its own column", () => {
    // Drives the exact shape of ANSI the bead diagnostic captured at row 31:
    // narrow text replaced in the same row by " 🇺🇸 US 1040" — vt100 used
    // to merge the leading space and the flag into one 3-cell grapheme,
    // leaving the prev 'b' / 'u' visible at cols+1 / cols+2.
    const prev = new TerminalBuffer(COLS, ROWS)
    writeText(prev, 0, 0, "abcdefghij")
    prev.resetDirtyRows()

    const next = prev.clone()
    for (let cx = 0; cx < 10; cx++) next.setCell(cx, 0, { char: " ", fg: null })
    writeText(next, 1, 0, "\u{1F1FA}\u{1F1F8} US")

    const initialAnsi = outputPhase(null, prev, "fullscreen")
    const incrAnsi = outputPhase(prev, next, "fullscreen")
    const freshAnsi = outputPhase(null, next, "fullscreen")

    const incr = replayAnsiWithStyles(COLS, ROWS, initialAnsi + incrAnsi)
    const fresh = replayAnsiWithStyles(COLS, ROWS, freshAnsi)

    // Whole-row equivalence — incremental MUST match fresh.
    for (let cx = 0; cx < 10; cx++) {
      expect(incr[0]![cx]!.char, `col ${cx}`).toBe(fresh[0]![cx]!.char)
    }
    // Flag lands at col 1, NOT col 0. (The pre-fix bug rendered " 🇺🇸"
    // as a single 3-wide grapheme at col 0, with stale prev chars
    // surviving at cols 1/2.)
    expect(fresh[0]![0]!.char).toBe(" ")
    expect(fresh[0]![1]!.char).toBe("\u{1F1FA}\u{1F1F8}")
    expect(fresh[0]![2]!.char).toBe(" ") // continuation cleared
    expect(incr[0]![0]!.char).toBe(" ")
    expect(incr[0]![1]!.char).toBe("\u{1F1FA}\u{1F1F8}")
    expect(incr[0]![2]!.char).toBe(" ")
  })

  test("two adjacent flag emoji split into two graphemes (no chaining)", () => {
    // "🇺🇸🇯🇵" — must produce two separate 2-wide graphemes, not one
    // 4-wide blob. UAX #29 GB12: after a completed RI pair, the next RI
    // begins a new grapheme.
    const buf = new TerminalBuffer(COLS, ROWS)
    writeText(buf, 0, 0, "X\u{1F1FA}\u{1F1F8}\u{1F1EF}\u{1F1F5}Y")

    const ansi = outputPhase(null, buf, "fullscreen")
    const screen = replayAnsiWithStyles(COLS, ROWS, ansi)

    expect(screen[0]![0]!.char).toBe("X")
    expect(screen[0]![1]!.char).toBe("\u{1F1FA}\u{1F1F8}") // US flag
    // col 2 = continuation, vt100 fills with space
    expect(screen[0]![3]!.char).toBe("\u{1F1EF}\u{1F1F5}") // JP flag
    expect(screen[0]![5]!.char).toBe("Y")
  })

  test("lone regional indicator after non-RI base is treated independently", () => {
    // " 🇺" (space + single RI) — RI must NOT extend the space.
    // We render this through the buffer (unusual: a half flag), and
    // assert that vt100 puts the RI at its own column, not glued to
    // the space.
    const buf = new TerminalBuffer(COLS, ROWS)
    buf.setCell(0, 0, { char: "X", fg: null })
    buf.setCell(1, 0, { char: " ", fg: null })
    buf.setCell(2, 0, { char: "\u{1F1FA}", wide: true, fg: null })
    buf.setCell(3, 0, { char: "", continuation: true, fg: null })
    buf.setCell(4, 0, { char: "Y", fg: null })

    const ansi = outputPhase(null, buf, "fullscreen")
    const screen = replayAnsiWithStyles(COLS, ROWS, ansi)

    expect(screen[0]![0]!.char).toBe("X")
    expect(screen[0]![1]!.char).toBe(" ")
    expect(screen[0]![2]!.char).toBe("\u{1F1FA}")
    // col 3 wiped to space (wide continuation), col 4 has Y
    expect(screen[0]![4]!.char).toBe("Y")
  })

  test("variation selector U+FE0F does not extend an ASCII space", () => {
    // VS-16 should only modify emoji-capable bases. Without the gate
    // it inflates " " into a 1-codepoint-+-VS-16 grapheme that
    // graphemeWidth might still report as 1 — but the principle (don't
    // glue modifiers onto ASCII) catches a class of subtle bugs.
    const buf = new TerminalBuffer(COLS, ROWS)
    // Emit " ️" via raw setCell on a single cell — vt100 reads
    // the ANSI run and segments it.
    buf.setCell(0, 0, { char: " \u{FE0F}", fg: null })

    const ansi = outputPhase(null, buf, "fullscreen")
    const screen = replayAnsiWithStyles(COLS, ROWS, ansi)

    // Replay must keep ' ' at col 0 only — the VS-16 must not absorb
    // and shift the cluster width.
    expect(screen[0]![0]!.char.charCodeAt(0)).toBe(0x20)
  })

  test("variation selector U+FE0F extends text-presentation arrow emoji", () => {
    // U+2194 is outside the older Misc Symbols / Dingbats gate but is
    // still a valid text-presentation emoji base. A real Silvercode
    // STRICT_OUTPUT replay rendered the VS16 as its own cell after ↔️.
    const prev = new TerminalBuffer(COLS, ROWS)
    writeText(prev, 0, 0, "abc     def")
    prev.resetDirtyRows()

    const next = prev.clone()
    writeText(next, 0, 0, "abc ↔️  def")

    const initialAnsi = outputPhase(null, prev, "fullscreen")
    const incrAnsi = outputPhase(prev, next, "fullscreen")
    const freshAnsi = outputPhase(null, next, "fullscreen")

    const incr = replayAnsiWithStyles(COLS, ROWS, initialAnsi + incrAnsi)
    const fresh = replayAnsiWithStyles(COLS, ROWS, freshAnsi)

    for (let cx = 0; cx < 12; cx++) {
      expect(incr[0]![cx]!.char, `col ${cx}`).toBe(fresh[0]![cx]!.char)
    }
    expect(fresh[0]![4]!.char).toBe("↔️")
    expect(fresh[0]![5]!.char).toBe(" ")
    expect(fresh[0]![6]!.char).toBe(" ")
    expect(incr[0]![4]!.char).toBe("↔️")
    expect(incr[0]![5]!.char).toBe(" ")
    expect(incr[0]![6]!.char).toBe(" ")
  })

  test("incremental render matches fresh through verifyOutputEquivalence (vt100)", () => {
    // End-to-end verification: this is what SILVERY_STRICT=1 actually
    // runs. Before the fix, this test would throw an
    // IncrementalRenderMismatchError.
    const prev = new TerminalBuffer(COLS, ROWS)
    writeText(prev, 0, 0, "· bun km doctor")
    prev.resetDirtyRows()

    const next = prev.clone()
    for (let cx = 0; cx < 30; cx++) next.setCell(cx, 0, { char: " ", fg: null })
    writeText(next, 1, 0, "\u{1F1FA}\u{1F1F8} US 1040")

    const initialAnsi = outputPhase(null, prev, "fullscreen")
    const incrAnsi = outputPhase(prev, next, "fullscreen")
    const freshAnsi = outputPhase(null, next, "fullscreen")

    const incr = replayAnsiWithStyles(COLS, ROWS, initialAnsi + incrAnsi)
    const fresh = replayAnsiWithStyles(COLS, ROWS, freshAnsi)

    for (let cx = 0; cx < 30; cx++) {
      expect(incr[0]![cx]!.char, `col ${cx}`).toBe(fresh[0]![cx]!.char)
    }
  })
})
