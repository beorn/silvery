/**
 * Output Function Tests
 *
 * Tests for ANSI output generation functions in output.ts.
 * Note: Buffer rendering (bufferToAnsi, diffBuffers, changesToAnsi, styleToAnsi)
 * is now handled by pipeline/output-phase.ts and is internal.
 */

import { describe, expect, test } from "vitest"
import {
  ANSI,
  disableMouse,
  enableMouse,
  enterAlternateScreen,
  leaveAlternateScreen,
  setCursorStyle,
  resetCursorStyle,
} from "../src/output.js"
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

  describe("changesToAnsi correctness (incremental vs fresh)", () => {
    /**
     * Minimal ANSI replay simulator. Takes a character grid and applies ANSI
     * output to it, handling cursor movement and character writes.
     * Only supports sequences used by changesToAnsi/bufferToAnsi.
     */
    function replayAnsi(width: number, height: number, ansi: string): string[][] {
      const screen: string[][] = Array.from({ length: height }, () => Array(width).fill(" "))
      let cx = 0
      let cy = 0
      let i = 0

      while (i < ansi.length) {
        if (ansi[i] === "\x1b") {
          // CSI sequence: \x1b[...
          if (ansi[i + 1] === "[") {
            i += 2
            // Parse params
            let params = ""
            while (
              (i < ansi.length && ansi[i]! >= "0" && ansi[i]! <= "9") ||
              ansi[i] === ";" ||
              ansi[i] === "?" ||
              ansi[i] === ":"
            ) {
              params += ansi[i]
              i++
            }
            const cmd = ansi[i]
            i++

            if (cmd === "H") {
              // Cursor position (1-indexed) or home
              if (params === "") {
                cx = 0
                cy = 0
              } else {
                const parts = params.split(";")
                cy = Math.max(0, (parseInt(parts[0]!) || 1) - 1)
                cx = Math.max(0, (parseInt(parts[1]!) || 1) - 1)
              }
            } else if (cmd === "K") {
              // Erase to end of line (character content only, ignore style)
              for (let x = cx; x < width; x++) screen[cy]![x] = " "
            } else if (cmd === "A") {
              // Cursor up
              cy = Math.max(0, cy - (parseInt(params) || 1))
            } else if (cmd === "B") {
              // Cursor down
              cy = Math.min(height - 1, cy + (parseInt(params) || 1))
            } else if (cmd === "C") {
              // Cursor forward
              cx = Math.min(width - 1, cx + (parseInt(params) || 1))
            } else if (cmd === "D") {
              // Cursor backward
              cx = Math.max(0, cx - (parseInt(params) || 1))
            } else if (cmd === "G") {
              // Cursor to column (1-indexed)
              cx = Math.max(0, (parseInt(params) || 1) - 1)
            } else if (cmd === "J") {
              // Erase display
              if (params === "2") {
                for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) screen[y]![x] = " "
              }
            }
            // Skip other CSI sequences (SGR 'm', mouse modes 'h'/'l', etc.)
          } else if (ansi[i + 1] === "]") {
            // OSC sequence: skip to ST (\x1b\\) or BEL (\x07)
            i += 2
            while (i < ansi.length) {
              if (ansi[i] === "\x1b" && ansi[i + 1] === "\\") {
                i += 2
                break
              }
              if (ansi[i] === "\x07") {
                i++
                break
              }
              i++
            }
          } else {
            i += 2 // Skip unknown escape
          }
        } else if (ansi[i] === "\r") {
          cx = 0
          i++
        } else if (ansi[i] === "\n") {
          cy = Math.min(height - 1, cy + 1)
          i++
        } else {
          // Regular character
          if (cy < height && cx < width) {
            screen[cy]![cx] = ansi[i]!
            cx++
          }
          i++
        }
      }
      return screen
    }

    function screenToText(screen: string[][]): string {
      return screen.map((row) => row.join("")).join("\n")
    }

    test("incremental diff produces same screen as fresh render", () => {
      // Buffer 1: initial state
      const buf1 = new TerminalBuffer(20, 4)
      for (let x = 0; x < 10; x++) buf1.setCell(x, 0, { char: "A" })
      for (let x = 0; x < 15; x++) buf1.setCell(x, 1, { char: "B" })
      for (let x = 0; x < 20; x++) buf1.setCell(x, 2, { char: "C" })
      for (let x = 0; x < 5; x++) buf1.setCell(x, 3, { char: "D" })

      // Buffer 2: changed state (different content, some rows moved)
      const buf2 = new TerminalBuffer(20, 4)
      for (let x = 0; x < 8; x++) buf2.setCell(x, 0, { char: "X" })
      for (let x = 0; x < 15; x++) buf2.setCell(x, 1, { char: "B" }) // unchanged
      for (let x = 0; x < 12; x++) buf2.setCell(x, 2, { char: "Y" })
      for (let x = 0; x < 20; x++) buf2.setCell(x, 3, { char: "Z" })

      // Replay initial render through virtual terminal
      const freshBuf1 = outputPhase(null, buf1)
      const screen1 = replayAnsi(20, 4, freshBuf1)

      // Apply incremental diff to screen1
      const incrAnsi = outputPhase(buf1, buf2)
      const screenIncr = replayAnsi(20, 4, freshBuf1 + incrAnsi)

      // Fresh render of buf2
      const freshBuf2 = outputPhase(null, buf2)
      const screenFresh = replayAnsi(20, 4, freshBuf2)

      expect(screenToText(screenIncr)).toBe(screenToText(screenFresh))
    })

    test("incremental diff handles row shortening correctly", () => {
      // Row that was full now has fewer characters
      const buf1 = new TerminalBuffer(10, 2)
      for (let x = 0; x < 10; x++) buf1.setCell(x, 0, { char: "F" })
      for (let x = 0; x < 10; x++) buf1.setCell(x, 1, { char: "G" })

      const buf2 = new TerminalBuffer(10, 2)
      for (let x = 0; x < 3; x++) buf2.setCell(x, 0, { char: "H" })
      // Row 1: completely empty

      const fresh1 = outputPhase(null, buf1)
      const incrAnsi = outputPhase(buf1, buf2)
      const screenIncr = replayAnsi(10, 2, fresh1 + incrAnsi)

      const fresh2 = outputPhase(null, buf2)
      const screenFresh = replayAnsi(10, 2, fresh2)

      expect(screenToText(screenIncr)).toBe(screenToText(screenFresh))
    })

    test("incremental diff handles bg color changes", () => {
      const buf1 = new TerminalBuffer(10, 2)
      for (let x = 0; x < 10; x++) buf1.setCell(x, 0, { char: "A", bg: "red" })
      for (let x = 0; x < 5; x++) buf1.setCell(x, 1, { char: "B" })

      const buf2 = new TerminalBuffer(10, 2)
      for (let x = 0; x < 10; x++) buf2.setCell(x, 0, { char: "A", bg: "blue" })
      for (let x = 0; x < 5; x++) buf2.setCell(x, 1, { char: "C" })

      const fresh1 = outputPhase(null, buf1)
      const incrAnsi = outputPhase(buf1, buf2)
      const screenIncr = replayAnsi(10, 2, fresh1 + incrAnsi)

      const fresh2 = outputPhase(null, buf2)
      const screenFresh = replayAnsi(10, 2, fresh2)

      expect(screenToText(screenIncr)).toBe(screenToText(screenFresh))
    })

    test("incremental diff with board-like layout (mixed bg, cursor highlight)", () => {
      // Simulates a board TUI: header row with bg, columns with cards,
      // cursor highlight moving from one card to another
      const W = 40
      const H = 10
      const buf1 = new TerminalBuffer(W, H)
      // Header row with bg
      for (let x = 0; x < W; x++) buf1.setCell(x, 0, { char: x < 20 ? "H" : " ", bg: "#333333" })
      // Column separator at x=20
      for (let y = 1; y < H; y++) buf1.setCell(20, y, { char: "│" })
      // Card 1 (highlighted) in left column
      for (let x = 1; x < 19; x++) buf1.setCell(x, 2, { char: "C", bg: "yellow" })
      // Card 2 in left column
      for (let x = 1; x < 19; x++) buf1.setCell(x, 4, { char: "D" })
      // Card 3 in right column
      for (let x = 21; x < 39; x++) buf1.setCell(x, 2, { char: "E" })

      // Move cursor highlight from card 1 to card 2
      const buf2 = new TerminalBuffer(W, H)
      for (let x = 0; x < W; x++) buf2.setCell(x, 0, { char: x < 20 ? "H" : " ", bg: "#333333" })
      for (let y = 1; y < H; y++) buf2.setCell(20, y, { char: "│" })
      // Card 1 (no longer highlighted)
      for (let x = 1; x < 19; x++) buf2.setCell(x, 2, { char: "C" })
      // Card 2 (now highlighted)
      for (let x = 1; x < 19; x++) buf2.setCell(x, 4, { char: "D", bg: "yellow" })
      // Card 3 unchanged
      for (let x = 21; x < 39; x++) buf2.setCell(x, 2, { char: "E" })

      const fresh1 = outputPhase(null, buf1)
      const incrAnsi = outputPhase(buf1, buf2)
      const screenIncr = replayAnsi(W, H, fresh1 + incrAnsi)

      const fresh2 = outputPhase(null, buf2)
      const screenFresh = replayAnsi(W, H, fresh2)

      expect(screenToText(screenIncr)).toBe(screenToText(screenFresh))
    })

    test("incremental diff with scattered single-cell changes", () => {
      // Sparse changes across multiple rows (worst case for cursor movement)
      const buf1 = new TerminalBuffer(20, 5)
      for (let y = 0; y < 5; y++) for (let x = 0; x < 20; x++) buf1.setCell(x, y, { char: "." })

      const buf2 = new TerminalBuffer(20, 5)
      for (let y = 0; y < 5; y++) for (let x = 0; x < 20; x++) buf2.setCell(x, y, { char: "." })
      // Scatter a few changed cells
      buf2.setCell(5, 0, { char: "X" })
      buf2.setCell(15, 1, { char: "Y" })
      buf2.setCell(0, 3, { char: "Z" })
      buf2.setCell(19, 4, { char: "W" })

      const fresh1 = outputPhase(null, buf1)
      const incrAnsi = outputPhase(buf1, buf2)
      const screenIncr = replayAnsi(20, 5, fresh1 + incrAnsi)

      const fresh2 = outputPhase(null, buf2)
      const screenFresh = replayAnsi(20, 5, fresh2)

      expect(screenToText(screenIncr)).toBe(screenToText(screenFresh))
    })
  })

  describe("DECSCUSR cursor style", () => {
    test("setCursorStyle produces correct sequences for each shape", () => {
      // Steady (default blink=false)
      expect(setCursorStyle("block")).toBe("\x1b[2 q")
      expect(setCursorStyle("underline")).toBe("\x1b[4 q")
      expect(setCursorStyle("bar")).toBe("\x1b[6 q")
    })

    test("setCursorStyle with blink=true produces blinking variants", () => {
      expect(setCursorStyle("block", true)).toBe("\x1b[1 q")
      expect(setCursorStyle("underline", true)).toBe("\x1b[3 q")
      expect(setCursorStyle("bar", true)).toBe("\x1b[5 q")
    })

    test("resetCursorStyle produces DECSCUSR 0", () => {
      expect(resetCursorStyle()).toBe("\x1b[0 q")
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
