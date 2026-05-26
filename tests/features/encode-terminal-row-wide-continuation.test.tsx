/**
 * Defect B of @km/termless/15589 #undead reopen — bead 15615.
 *
 * Three failures in the rec-overlay re-render path:
 *   1. Wide-cell over-counting in `encodeTerminalRow` — when xterm.js
 *      backend stores a wide char at col X, col X+1 has `wide=false`,
 *      `continuation=false`, `char=""` (xtermjs.backend.ts always sets
 *      continuation=false). The encoder writes BOTH cells, producing
 *      3 visible chars (2 for wide + 1 space) for a 2-cell grapheme.
 *      → border columns shift right by 1 on the affected row.
 *   2. Downstream effect: the over-written row exceeds `cols`, gets
 *      truncated/clipped, sometimes mid-codepoint, producing U+FFFD.
 *   3. Right border of the silvery card drops off the visible row.
 *
 * Sibling: `@km/tui/separator-utf8-truncation` (same family of
 * "wrap clips mid-codepoint"). Sibling output-phase fix: the wide-char
 * CUP re-sync work in `output-phase.ts` solved the same shape one
 * layer down (incremental ANSI generation); this is one layer UP
 * (encoding from an external cell grid).
 */
import { describe, expect, test } from "vitest"
import { encodeTerminalRow, type TerminalCell } from "silvery"

function cell(char: string, opts: Partial<TerminalCell> = {}): TerminalCell {
  return {
    char,
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
    wide: false,
    continuation: false,
    ...opts,
  }
}

describe("encodeTerminalRow — wide-cell continuation handling", () => {
  test("xterm.js-shaped wide cell (continuation=false, char='') does NOT produce double-write", () => {
    // Reproduces xtermjs backend.ts cell shape: continuation=false, char=""
    // at the column after a wide char. The encoder MUST skip this cell,
    // not write a stray space.
    const row: TerminalCell[] = [
      cell("本", { wide: true }),
      cell("", { wide: false, continuation: false }), // xterm.js-shaped continuation
      cell(" "),
      cell("X"),
    ]
    const out = encodeTerminalRow(row, 4)
    // Strip ANSI to get visible chars
    const visible = out.replace(/\x1b\[[0-9;]*m/g, "")
    // Expected: "本 X" — 4 cell-widths total (本=2, space=1, X=1)
    expect(visible).toBe("本 X")
  })

  test("explicit continuation=true cell IS skipped (legacy contract)", () => {
    // Confirm the continuation=true path still works for backends that
    // populate it (vt100, vterm).
    const row: TerminalCell[] = [
      cell("本", { wide: true }),
      cell(" ", { continuation: true }),
      cell(" "),
      cell("X"),
    ]
    const out = encodeTerminalRow(row, 4)
    const visible = out.replace(/\x1b\[[0-9;]*m/g, "")
    expect(visible).toBe("本 X")
  })

  test("wide-char run + right border — border lands at the correct column", () => {
    // The motivating scenario: card right border `│` after CJK content.
    // Without the fix the encoder writes 1 extra cell, pushing the border
    // off the row's right edge.
    const text = "│本県X│"
    const row: TerminalCell[] = []
    for (const ch of text) {
      const w = ch === "本" || ch === "県"
      row.push(cell(ch, { wide: w }))
      if (w) row.push(cell("", { wide: false, continuation: false })) // xterm.js-shape
    }
    const out = encodeTerminalRow(row, 7) // border + wide + wide + ascii + border = 1+2+2+1+1 = 7
    const visible = out.replace(/\x1b\[[0-9;]*m/g, "")
    expect(visible).toBe("│本県X│")
  })
})

describe("encodeTerminalRow — bullet (·, U+00B7) survives narrow-grid encoding", () => {
  test("repro from `@km/termless/15589` defect B screenshot — bullet + ASCII content", () => {
    // Mirrors the `· @waiting — blocked on external` row that the
    // 2026-05-22 #undead screenshot showed mangled into `��`. ASCII-only
    // content at this point; the corruption is downstream of an OTHER
    // row's wide-cell over-count that drove the encoder to emit cols+1
    // glyphs and triggered silvery's `<Text>` to truncate mid-codepoint.
    // With the fix, encoding is exact and downstream truncation never
    // fires on legitimate rows.
    const text = "│  · @waiting — blocked on external│"
    const row: TerminalCell[] = []
    for (const ch of text) row.push(cell(ch))
    const out = encodeTerminalRow(row, text.length)
    const visible = out.replace(/\x1b\[[0-9;]*m/g, "")
    expect(visible).toBe(text)
    // Sanity: no U+FFFD in encoded bytes
    expect(out.includes("�")).toBe(false)
  })

  test("xterm.js-shaped wide chars + bullet on adjacent row — encoder stays exact", () => {
    // The bug cascade: row A has a wide CJK char with xtermjs-shape
    // continuation (continuation:false, char:""). Without the fix the
    // encoder emitted cols+1 glyphs on row A; silvery's <Text> measured
    // the overflowing line and truncated mid-codepoint, the U+FFFD then
    // surfaced in the downstream paint. With the fix, row A is exact
    // and row B (the bullet line) is untouched.
    const rowA: TerminalCell[] = [
      cell("│"),
      cell("本", { wide: true }),
      cell("", { wide: false, continuation: false }), // xtermjs-shape
      cell("L"),
      cell("u"),
      cell("a"),
      cell("n"),
      cell("│"),
    ]
    // Visible cells: │(1) + 本(2) + L(1) + u(1) + a(1) + n(1) + │(1) = 8 cells.
    const visibleA = encodeTerminalRow(rowA, 8).replace(/\x1b\[[0-9;]*m/g, "")
    expect(visibleA).toBe("│本Luan│")
  })
})
