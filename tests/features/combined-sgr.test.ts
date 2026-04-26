/**
 * Combined SGR Sequence Tests
 *
 * Verifies that styleToAnsi emits combined SGR sequences (\e[1;2m)
 * instead of separate sequences (\e[1m\e[2m) when multiple attributes
 * are active. Fewer bytes and more spec-compliant.
 */

import { describe, test, expect } from "vitest"
import { outputPhase, replayAnsiWithStyles } from "@silvery/ag-term/pipeline/output-phase"
import { createBuffer } from "@silvery/ag-term/buffer"

describe("combined SGR sequences", () => {
  test("bold+dim emits single combined sequence", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X", attrs: { bold: true, dim: true } })
    const ansi = outputPhase(null, buf, "fullscreen")
    // Should contain \x1b[...1;...2...m or \x1b[...2;...1...m (combined)
    // Should NOT contain \x1b[1m\x1b[2m (separate)
    expect(ansi).not.toMatch(/\x1b\[1m\x1b\[2m/)
    expect(ansi).not.toMatch(/\x1b\[2m\x1b\[1m/)
    // Should contain both codes in a single sequence
    expect(ansi).toMatch(/\x1b\[[0-9;]*1[;0-9]*2[0-9;]*m/)
  })

  test("bold+italic+underline emits single combined sequence", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X", attrs: { bold: true, italic: true, underline: true } })
    const ansi = outputPhase(null, buf, "fullscreen")
    // Should NOT have multiple separate \x1b[...m sequences for attrs
    // Count the number of SGR sequences (excluding position sequences)
    const sgrMatches = ansi.match(/\x1b\[\d[\d;:]*m/g) ?? []
    // All attributes should be in one sequence (plus possibly position)
    // The key assertion: bold+italic+underline should be combined
    expect(ansi).not.toMatch(/\x1b\[1m\x1b\[3m/)
    expect(ansi).not.toMatch(/\x1b\[3m\x1b\[4m/)
  })

  test("fg color + bold emits combined sequence", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X", fg: { r: 255, g: 0, b: 0 }, attrs: { bold: true } })
    const ansi = outputPhase(null, buf, "fullscreen")
    // fg color code and bold should be in one \x1b[...m
    expect(ansi).not.toMatch(/\x1b\[38;2;255;0;0m\x1b\[1m/)
    // Should contain a combined sequence with both
    expect(ansi).toMatch(/\x1b\[38;2;255;0;0;1m/)
  })

  test("no attributes emits no SGR", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X" })
    const ansi = outputPhase(null, buf, "fullscreen")
    // Position sequence + char, but no style SGR (just space = default)
    // The char "X" with default style should not have a style sequence
    expect(ansi).not.toMatch(/\x1b\[0m.*X/)
  })
})

describe("replayAnsiWithStyles SGR parameter parsing", () => {
  // Regression: the verifier's VT100 parser used to ignore SGR 58 (underline
  // color) but did NOT consume its sub-parameters. When the output phase
  // emitted underline color in legacy semicolon form (`58;5;N` or
  // `58;2;r;g;b`) the parser would re-interpret the next param ("5" or "2")
  // as standalone SGR 5 (blink) or SGR 2 (dim), corrupting the parsed cell
  // style. This surfaced as STRICT_OUTPUT mismatches like
  //   `dim: true vs false at (col,row) char='│'`
  // on cells following links/tag refs that emit underline color.
  // See dump artifacts under /tmp/silvery-strict-failure-*.

  test("SGR 58;2;r;g;b (underline color RGB) does not bleed into dim", () => {
    const buf = createBuffer(20, 1)
    // Curly underline + RGB underline color via colon-form (modern), then
    // reset, then plain text — the cell after the reset must NOT have dim set.
    // Mimics `\x1b[4:5;58;2;225;127;135m^TAG\x1b[24;39;59m  │`
    const seq =
      // CUP (1,1)
      "\x1b[1;1H" +
      // 4:5 = curly underline (colon sub-form), 58;2;r;g;b = underline color RGB (semicolon form)
      "\x1b[4:5;58;2;225;127;135m" +
      "TAG" +
      // 24 reset underline, 39 default fg, 59 default underline color
      "\x1b[24;39;59m" +
      // Now write a border char — its style must NOT include dim
      "│"
    const screen = replayAnsiWithStyles(20, 1, seq)
    // The "│" lands at column 4 (after "TAG" which is 3 wide)
    const cell = screen[0]![3]!
    expect(cell.char).toBe("│")
    expect(cell.dim).toBe(false)
    expect(cell.underline).toBe(false)
    expect(cell.blink).toBe(false)
  })

  test("SGR 58;5;N (underline color 256-color) does not bleed into blink", () => {
    const buf = createBuffer(20, 1)
    // 58;5;N is the legacy 256-color form of underline color. Without proper
    // sub-param consumption, the "5" is re-interpreted as SGR 5 (blink).
    void buf
    const seq = "\x1b[1;1H" + "\x1b[4;58;5;124m" + "TAG" + "\x1b[24;59m" + "│"
    const screen = replayAnsiWithStyles(20, 1, seq)
    const cell = screen[0]![3]!
    expect(cell.char).toBe("│")
    expect(cell.blink).toBe(false)
  })

  test("SGR 58;2;r;g;b mid-sequence does not corrupt subsequent attrs", () => {
    // Chain: bold, then underline-color RGB, then italic. Without proper
    // sub-param consumption, the "2" in the underline-color sequence would
    // toggle dim, breaking the bold+italic assertion.
    const seq = "\x1b[1;1H" + "\x1b[1;58;2;100;150;200;3m" + "X"
    const screen = replayAnsiWithStyles(10, 1, seq)
    const cell = screen[0]![0]!
    expect(cell.char).toBe("X")
    expect(cell.bold).toBe(true)
    expect(cell.italic).toBe(true)
    expect(cell.dim).toBe(false) // The "2" inside 58;2;r;g;b must NOT enable dim
  })
})
