/**
 * Output Function Tests
 *
 * Tests for ANSI output generation functions in output.ts.
 * Note: Buffer rendering (bufferToAnsi, diffBuffers, changesToAnsi, styleToAnsi)
 * is now handled by pipeline/output-phase.ts and is internal.
 */

import { describe, expect, test } from "vitest"
import { ANSI, disableMouse, enableMouse, enterAlternateScreen, leaveAlternateScreen } from "../src/output.js"
import { TerminalBuffer } from "../src/buffer.js"
import { outputPhase } from "../src/pipeline/output-phase.js"

describe("Output Functions", () => {
  describe("Screen control functions", () => {
    test("enterAlternateScreen returns enter sequence", () => {
      const result = enterAlternateScreen()
      expect(result).toContain("\x1b[?1049h")
    })

    test("leaveAlternateScreen returns leave sequence with SYNC_END safety", () => {
      const result = leaveAlternateScreen()
      expect(result).toContain("\x1b[?1049l")
      // SYNC_END is prepended as safety belt to reset DEC 2026 on cleanup
      expect(result).toContain(ANSI.SYNC_END)
    })

    test("enableMouse returns enable sequence with all tracking modes", () => {
      const result = enableMouse()
      // Basic mouse tracking
      expect(result).toContain("\x1b[?1000h")
      // Button-event tracking (report button press/release with motion)
      expect(result).toContain("\x1b[?1002h")
      // SGR extended coordinates (for large terminals)
      expect(result).toContain("\x1b[?1006h")
    })

    test("disableMouse returns disable sequence with all tracking modes", () => {
      const result = disableMouse()
      // Disable in reverse order
      expect(result).toContain("\x1b[?1006l")
      expect(result).toContain("\x1b[?1002l")
      expect(result).toContain("\x1b[?1000l")
    })
  })

  describe("ANSI constants", () => {
    test("ANSI object contains expected properties", () => {
      expect(ANSI.CURSOR_HIDE).toBeDefined()
      expect(ANSI.CURSOR_SHOW).toBeDefined()
      expect(ANSI.RESET).toBeDefined()
    })

    test("ANSI sequences have correct format", () => {
      expect(ANSI.CURSOR_HIDE).toContain("\x1b[")
      expect(ANSI.CURSOR_SHOW).toContain("\x1b[")
      expect(ANSI.RESET).toBe("\x1b[0m")
    })

    test("CURSOR_HOME moves to top-left", () => {
      expect(ANSI.CURSOR_HOME).toBe("\x1b[H")
    })

    test("ESC and CSI are defined", () => {
      expect(ANSI.ESC).toBe("\x1b")
      expect(ANSI.CSI).toBe("\x1b[")
    })

    test("SYNC_BEGIN and SYNC_END are DEC 2026 sequences", () => {
      expect(ANSI.SYNC_BEGIN).toBe("\x1b[?2026h")
      expect(ANSI.SYNC_END).toBe("\x1b[?2026l")
    })
  })

  describe("ANSI cursor movement functions", () => {
    test("moveCursor positions cursor at row, column (1-indexed)", () => {
      // Position 0,0 in buffer = row 1, col 1 in terminal
      expect(ANSI.moveCursor(0, 0)).toBe("\x1b[1;1H")
      expect(ANSI.moveCursor(9, 4)).toBe("\x1b[5;10H")
    })

    test("cursorUp moves cursor up N lines", () => {
      expect(ANSI.cursorUp(0)).toBe("")
      expect(ANSI.cursorUp(1)).toBe("\x1b[A")
      expect(ANSI.cursorUp(5)).toBe("\x1b[5A")
    })

    test("cursorDown moves cursor down N lines", () => {
      expect(ANSI.cursorDown(0)).toBe("")
      expect(ANSI.cursorDown(1)).toBe("\x1b[B")
      expect(ANSI.cursorDown(3)).toBe("\x1b[3B")
    })

    test("cursorRight moves cursor right N columns", () => {
      expect(ANSI.cursorRight(0)).toBe("")
      expect(ANSI.cursorRight(1)).toBe("\x1b[C")
      expect(ANSI.cursorRight(10)).toBe("\x1b[10C")
    })

    test("cursorLeft moves cursor left N columns", () => {
      expect(ANSI.cursorLeft(0)).toBe("")
      expect(ANSI.cursorLeft(1)).toBe("\x1b[D")
      expect(ANSI.cursorLeft(7)).toBe("\x1b[7D")
    })

    test("cursorToColumn moves cursor to column (1-indexed)", () => {
      expect(ANSI.cursorToColumn(0)).toBe("\x1b[1G")
      expect(ANSI.cursorToColumn(79)).toBe("\x1b[80G")
    })
  })

  describe("Background color and EL (erase-to-end-of-line)", () => {
    test("background color is reset before EL on first render", () => {
      // Regression: \x1b[K (EL) uses current SGR attributes for the erased area.
      // If the last cell on a row has a background color, the clear-to-end fills
      // the right margin with that color — visible as a grey band in Ghostty.
      const buffer = new TerminalBuffer(10, 2)
      // Row 0: text with red bg filling all 10 columns
      for (let x = 0; x < 10; x++) {
        buffer.setCell(x, 0, { char: "X", bg: "red" })
      }
      // Row 1: plain text (no bg)
      for (let x = 0; x < 5; x++) {
        buffer.setCell(x, 1, { char: "Y" })
      }

      const output = outputPhase(null, buffer)

      // Find first \x1b[K] — it should NOT have a red bg active at that point.
      // The reset (\x1b[0m) must come BEFORE the erase (\x1b[K]).
      // Split output at first newline to isolate row 0's ANSI sequence.
      const firstNewline = output.indexOf("\n")
      const row0 = output.slice(0, firstNewline)

      // Row 0 must contain a reset before the EL sequence
      const lastReset = row0.lastIndexOf("\x1b[0m")
      const lastEL = row0.lastIndexOf("\x1b[K")
      expect(lastReset).toBeGreaterThanOrEqual(0)
      expect(lastEL).toBeGreaterThan(lastReset)
    })

    test("EL with no background does not emit unnecessary reset", () => {
      const buffer = new TerminalBuffer(10, 1)
      // Row 0: plain text (no bg, no attrs)
      for (let x = 0; x < 5; x++) {
        buffer.setCell(x, 0, { char: "A" })
      }

      const output = outputPhase(null, buffer)
      const row0 = output

      // No bg means no reset needed before \x1b[K]
      // The final \x1b[0m at the very end is the always-reset, but we're checking
      // that there's no extra reset just before \x1b[K]
      const elIdx = row0.indexOf("\x1b[K")
      expect(elIdx).toBeGreaterThanOrEqual(0)
      // The character before \x1b[K should be 'A' (or space), not \x1b[0m
      const beforeEL = row0.slice(Math.max(0, elIdx - 4), elIdx)
      expect(beforeEL).not.toContain("\x1b[0m")
    })
  })

  describe("ANSI SGR codes", () => {
    test("SGR contains attribute codes", () => {
      expect(ANSI.SGR.bold).toBe(1)
      expect(ANSI.SGR.dim).toBe(2)
      expect(ANSI.SGR.italic).toBe(3)
      expect(ANSI.SGR.underline).toBe(4)
      expect(ANSI.SGR.blink).toBe(5)
      expect(ANSI.SGR.inverse).toBe(7)
      expect(ANSI.SGR.hidden).toBe(8)
      expect(ANSI.SGR.strikethrough).toBe(9)
    })

    test("SGR contains foreground color codes", () => {
      expect(ANSI.SGR.fgDefault).toBe(39)
      expect(ANSI.SGR.fgBlack).toBe(30)
      expect(ANSI.SGR.fgRed).toBe(31)
      expect(ANSI.SGR.fgGreen).toBe(32)
      expect(ANSI.SGR.fgYellow).toBe(33)
      expect(ANSI.SGR.fgBlue).toBe(34)
      expect(ANSI.SGR.fgMagenta).toBe(35)
      expect(ANSI.SGR.fgCyan).toBe(36)
      expect(ANSI.SGR.fgWhite).toBe(37)
    })

    test("SGR contains bright foreground color codes", () => {
      expect(ANSI.SGR.fgBrightBlack).toBe(90)
      expect(ANSI.SGR.fgBrightRed).toBe(91)
      expect(ANSI.SGR.fgBrightGreen).toBe(92)
      expect(ANSI.SGR.fgBrightYellow).toBe(93)
      expect(ANSI.SGR.fgBrightBlue).toBe(94)
      expect(ANSI.SGR.fgBrightMagenta).toBe(95)
      expect(ANSI.SGR.fgBrightCyan).toBe(96)
      expect(ANSI.SGR.fgBrightWhite).toBe(97)
    })

    test("SGR contains background color codes", () => {
      expect(ANSI.SGR.bgDefault).toBe(49)
      expect(ANSI.SGR.bgBlack).toBe(40)
      expect(ANSI.SGR.bgRed).toBe(41)
      expect(ANSI.SGR.bgGreen).toBe(42)
      expect(ANSI.SGR.bgYellow).toBe(43)
      expect(ANSI.SGR.bgBlue).toBe(44)
      expect(ANSI.SGR.bgMagenta).toBe(45)
      expect(ANSI.SGR.bgCyan).toBe(46)
      expect(ANSI.SGR.bgWhite).toBe(47)
    })

    test("SGR contains bright background color codes", () => {
      expect(ANSI.SGR.bgBrightBlack).toBe(100)
      expect(ANSI.SGR.bgBrightRed).toBe(101)
      expect(ANSI.SGR.bgBrightGreen).toBe(102)
      expect(ANSI.SGR.bgBrightYellow).toBe(103)
      expect(ANSI.SGR.bgBrightBlue).toBe(104)
      expect(ANSI.SGR.bgBrightMagenta).toBe(105)
      expect(ANSI.SGR.bgBrightCyan).toBe(106)
      expect(ANSI.SGR.bgBrightWhite).toBe(107)
    })
  })
})
