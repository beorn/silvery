/**
 * Output Function Tests
 *
 * Tests for ANSI output generation functions in output.ts.
 */

import { describe, expect, test } from "bun:test";
import { TerminalBuffer } from "../src/buffer.js";
import {
  ANSI,
  bufferToAnsi,
  changesToAnsi,
  clearLine,
  clearScreen,
  clearToEnd,
  diffBuffers,
  disableMouse,
  enableMouse,
  enterAlternateScreen,
  leaveAlternateScreen,
  renderBuffer,
  styleToAnsi,
} from "../src/output.js";

describe("Output Functions", () => {
  describe("styleToAnsi", () => {
    test("returns empty string for default style", () => {
      const result = styleToAnsi({ fg: null, bg: null, attrs: {} });
      // Default colors still emit codes
      expect(result).toContain("39"); // fg default
      expect(result).toContain("49"); // bg default
    });

    test("converts bold attribute", () => {
      const result = styleToAnsi({ fg: null, bg: null, attrs: { bold: true } });
      expect(result).toContain("1"); // bold SGR code
    });

    test("converts dim attribute", () => {
      const result = styleToAnsi({ fg: null, bg: null, attrs: { dim: true } });
      expect(result).toContain("2"); // dim SGR code
    });

    test("converts italic attribute", () => {
      const result = styleToAnsi({
        fg: null,
        bg: null,
        attrs: { italic: true },
      });
      expect(result).toContain("3"); // italic SGR code
    });

    test("converts underline attribute", () => {
      const result = styleToAnsi({
        fg: null,
        bg: null,
        attrs: { underline: true },
      });
      expect(result).toContain("4"); // underline SGR code
    });

    test("converts strikethrough attribute", () => {
      const result = styleToAnsi({
        fg: null,
        bg: null,
        attrs: { strikethrough: true },
      });
      expect(result).toContain("9"); // strikethrough SGR code
    });

    test("converts inverse attribute", () => {
      const result = styleToAnsi({
        fg: null,
        bg: null,
        attrs: { inverse: true },
      });
      expect(result).toContain("7"); // inverse SGR code
    });

    test("converts blink attribute", () => {
      const result = styleToAnsi({
        fg: null,
        bg: null,
        attrs: { blink: true },
      });
      expect(result).toContain("5"); // blink SGR code
    });

    test("converts hidden attribute", () => {
      const result = styleToAnsi({
        fg: null,
        bg: null,
        attrs: { hidden: true },
      });
      expect(result).toContain("8"); // hidden SGR code
    });

    test("converts foreground color (standard palette)", () => {
      // Red (color index 1)
      const result = styleToAnsi({ fg: 1, bg: null, attrs: {} });
      expect(result).toContain("31"); // fg red
    });

    test("converts foreground color (bright palette)", () => {
      // Bright red (color index 9)
      const result = styleToAnsi({ fg: 9, bg: null, attrs: {} });
      expect(result).toContain("91"); // fg bright red
    });

    test("converts background color (standard palette)", () => {
      // Cyan background (color index 6)
      const result = styleToAnsi({ fg: null, bg: 6, attrs: {} });
      expect(result).toContain("46"); // bg cyan
    });

    test("converts 256-color foreground", () => {
      // Color 200 (extended palette)
      const result = styleToAnsi({ fg: 200, bg: null, attrs: {} });
      expect(result).toContain("38;5;200"); // 256-color fg
    });

    test("converts 256-color background", () => {
      // Color 100 (extended palette)
      const result = styleToAnsi({ fg: null, bg: 100, attrs: {} });
      expect(result).toContain("48;5;100"); // 256-color bg
    });

    test("converts RGB true color foreground", () => {
      const result = styleToAnsi({
        fg: { r: 255, g: 128, b: 64 },
        bg: null,
        attrs: {},
      });
      expect(result).toContain("38;2;255;128;64"); // true color fg
    });

    test("converts RGB true color background", () => {
      const result = styleToAnsi({
        fg: null,
        bg: { r: 32, g: 64, b: 128 },
        attrs: {},
      });
      expect(result).toContain("48;2;32;64;128"); // true color bg
    });

    test("handles out-of-range color index (negative)", () => {
      const result = styleToAnsi({ fg: -1, bg: null, attrs: {} });
      expect(result).toContain("39"); // falls back to default fg
    });

    test("handles out-of-range color index (> 255)", () => {
      const result = styleToAnsi({ fg: 300, bg: null, attrs: {} });
      expect(result).toContain("39"); // falls back to default fg
    });

    test("converts black foreground (color 0)", () => {
      const result = styleToAnsi({ fg: 0, bg: null, attrs: {} });
      expect(result).toContain("30"); // fg black
    });

    test("converts background color index at boundary (255)", () => {
      const result = styleToAnsi({ fg: null, bg: 255, attrs: {} });
      expect(result).toContain("48;5;255"); // 256-color bg
    });

    test("combines multiple attributes", () => {
      const result = styleToAnsi({
        fg: 1,
        bg: 6,
        attrs: { bold: true, underline: true },
      });
      expect(result).toContain("1"); // bold
      expect(result).toContain("4"); // underline
      expect(result).toContain("31"); // fg red
      expect(result).toContain("46"); // bg cyan
    });
  });

  describe("bufferToAnsi", () => {
    test("converts empty buffer to string with spaces", () => {
      const buffer = new TerminalBuffer(5, 2);
      const result = bufferToAnsi(buffer);
      // Should contain cursor home
      expect(result).toContain("\x1b[H");
    });

    test("converts buffer with text content", () => {
      const buffer = new TerminalBuffer(10, 1);
      buffer.setCell(0, 0, { char: "H" });
      buffer.setCell(1, 0, { char: "i" });
      const result = bufferToAnsi(buffer);
      expect(result).toContain("H");
      expect(result).toContain("i");
    });

    test("converts buffer with styled cells", () => {
      const buffer = new TerminalBuffer(5, 1);
      buffer.setCell(0, 0, { char: "X", fg: 1, attrs: { bold: true } });
      const result = bufferToAnsi(buffer);
      expect(result).toContain("X");
      expect(result).toContain("1"); // bold code
    });
  });

  describe("diffBuffers", () => {
    test("returns all cells when prev is different", () => {
      const prev = new TerminalBuffer(3, 1);
      prev.setCell(0, 0, { char: "A" });

      const next = new TerminalBuffer(3, 1);
      next.setCell(0, 0, { char: "B" });

      const changes = diffBuffers(prev, next);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.cell.char === "B")).toBe(true);
    });

    test("returns empty array for identical buffers", () => {
      const prev = new TerminalBuffer(3, 1);
      prev.setCell(0, 0, { char: "A" });

      const next = new TerminalBuffer(3, 1);
      next.setCell(0, 0, { char: "A" });

      const changes = diffBuffers(prev, next);
      expect(changes.length).toBe(0);
    });

    test("detects style changes", () => {
      const prev = new TerminalBuffer(3, 1);
      prev.setCell(0, 0, { char: "A", fg: 1 });

      const next = new TerminalBuffer(3, 1);
      next.setCell(0, 0, { char: "A", fg: 2 });

      const changes = diffBuffers(prev, next);
      expect(changes.length).toBeGreaterThan(0);
    });

    test("returns all cells when dimensions change (width)", () => {
      const prev = new TerminalBuffer(3, 1);
      prev.setCell(0, 0, { char: "A" });

      const next = new TerminalBuffer(5, 1);
      next.setCell(0, 0, { char: "A" });
      next.setCell(4, 0, { char: "B" });

      const changes = diffBuffers(prev, next);
      // Should return all cells from the new buffer
      expect(changes.length).toBe(5);
    });

    test("returns all cells when dimensions change (height)", () => {
      const prev = new TerminalBuffer(3, 2);
      const next = new TerminalBuffer(3, 3);

      const changes = diffBuffers(prev, next);
      // Should return all 9 cells (3 * 3)
      expect(changes.length).toBe(9);
    });

    test("skips continuation cells in diff", () => {
      const prev = new TerminalBuffer(4, 1);
      const next = new TerminalBuffer(4, 1);
      // Simulate a wide character (e.g., CJK)
      next.setCell(0, 0, { char: "\u4e2d", wide: true });
      next.setCell(1, 0, { char: "", continuation: true });

      const changes = diffBuffers(prev, next);
      // Should not include the continuation cell
      const continuations = changes.filter((c) => c.cell.continuation);
      expect(continuations.length).toBe(0);
    });
  });

  describe("changesToAnsi", () => {
    test("converts changes to ANSI sequence", () => {
      const changes = [
        {
          x: 0,
          y: 0,
          cell: {
            char: "X",
            fg: null,
            bg: null,
            attrs: {},
            wide: false,
            continuation: false,
          },
        },
      ];
      const result = changesToAnsi(changes);
      expect(result).toContain("X");
    });

    test("handles empty changes array", () => {
      const result = changesToAnsi([]);
      expect(result).toBe("");
    });

    test("handles wide character cursor advancement", () => {
      const changes = [
        {
          x: 0,
          y: 0,
          cell: {
            char: "\u4e2d",
            fg: null,
            bg: null,
            attrs: {},
            wide: true,
            continuation: false,
          },
        },
        {
          x: 2, // After wide char, cursor should be at 2 (not 1)
          y: 0,
          cell: {
            char: "A",
            fg: null,
            bg: null,
            attrs: {},
            wide: false,
            continuation: false,
          },
        },
      ];
      const result = changesToAnsi(changes);
      // Both characters should appear
      expect(result).toContain("\u4e2d");
      expect(result).toContain("A");
    });

    test("sorts changes by position for optimal rendering", () => {
      const changes = [
        {
          x: 5,
          y: 1,
          cell: {
            char: "B",
            fg: null,
            bg: null,
            attrs: {},
            wide: false,
            continuation: false,
          },
        },
        {
          x: 0,
          y: 0,
          cell: {
            char: "A",
            fg: null,
            bg: null,
            attrs: {},
            wide: false,
            continuation: false,
          },
        },
      ];
      const result = changesToAnsi(changes);
      // A should come before B in the output (row 0 before row 1)
      const posA = result.indexOf("A");
      const posB = result.indexOf("B");
      expect(posA).toBeLessThan(posB);
    });

    test("applies style transitions between cells", () => {
      const changes = [
        {
          x: 0,
          y: 0,
          cell: {
            char: "A",
            fg: 1,
            bg: null,
            attrs: { bold: true },
            wide: false,
            continuation: false,
          },
        },
        {
          x: 1,
          y: 0,
          cell: {
            char: "B",
            fg: 2,
            bg: null,
            attrs: { italic: true },
            wide: false,
            continuation: false,
          },
        },
      ];
      const result = changesToAnsi(changes);
      expect(result).toContain("A");
      expect(result).toContain("B");
      // Should contain style codes
      expect(result).toContain("1"); // bold
    });
  });

  describe("renderBuffer", () => {
    test("renders full buffer when no previous", () => {
      const buffer = new TerminalBuffer(5, 2);
      buffer.setCell(0, 0, { char: "A" });
      const result = renderBuffer(buffer, null);
      expect(result).toContain("A");
      expect(result).toContain("\x1b[H"); // cursor home
    });

    test("renders diff when previous buffer provided", () => {
      const prev = new TerminalBuffer(5, 2);
      prev.setCell(0, 0, { char: "A" });

      const next = new TerminalBuffer(5, 2);
      next.setCell(0, 0, { char: "B" });

      const result = renderBuffer(next, prev);
      expect(result).toContain("B");
      // Should be shorter than full render
      expect(result.length).toBeLessThan(renderBuffer(next, null).length);
    });

    test("returns empty string for identical buffers", () => {
      const prev = new TerminalBuffer(5, 1);
      prev.setCell(0, 0, { char: "A" });

      const next = new TerminalBuffer(5, 1);
      next.setCell(0, 0, { char: "A" });

      const result = renderBuffer(next, prev);
      expect(result).toBe("");
    });
  });

  describe("Screen control functions", () => {
    test("clearScreen returns clear sequence", () => {
      const result = clearScreen();
      expect(result).toContain("\x1b[2J"); // clear screen
      expect(result).toContain("\x1b[H"); // cursor home
    });

    test("clearToEnd returns clear to end sequence", () => {
      const result = clearToEnd();
      expect(result).toContain("\x1b[0J"); // clear to end
    });

    test("clearLine returns clear line sequence", () => {
      const result = clearLine();
      expect(result).toContain("\x1b[2K"); // clear line
    });

    test("enterAlternateScreen returns enter sequence", () => {
      const result = enterAlternateScreen();
      expect(result).toContain("\x1b[?1049h");
    });

    test("leaveAlternateScreen returns leave sequence", () => {
      const result = leaveAlternateScreen();
      expect(result).toContain("\x1b[?1049l");
    });

    test("enableMouse returns enable sequence with all tracking modes", () => {
      const result = enableMouse();
      // Basic mouse tracking
      expect(result).toContain("\x1b[?1000h");
      // Button-event tracking (report button press/release with motion)
      expect(result).toContain("\x1b[?1002h");
      // SGR extended coordinates (for large terminals)
      expect(result).toContain("\x1b[?1006h");
    });

    test("disableMouse returns disable sequence with all tracking modes", () => {
      const result = disableMouse();
      // Disable in reverse order
      expect(result).toContain("\x1b[?1006l");
      expect(result).toContain("\x1b[?1002l");
      expect(result).toContain("\x1b[?1000l");
    });
  });

  describe("ANSI constants", () => {
    test("ANSI object contains expected properties", () => {
      expect(ANSI.CURSOR_HIDE).toBeDefined();
      expect(ANSI.CURSOR_SHOW).toBeDefined();
      expect(ANSI.RESET).toBeDefined();
    });

    test("ANSI sequences have correct format", () => {
      expect(ANSI.CURSOR_HIDE).toContain("\x1b[");
      expect(ANSI.CURSOR_SHOW).toContain("\x1b[");
      expect(ANSI.RESET).toBe("\x1b[0m");
    });

    test("CURSOR_HOME moves to top-left", () => {
      expect(ANSI.CURSOR_HOME).toBe("\x1b[H");
    });

    test("ESC and CSI are defined", () => {
      expect(ANSI.ESC).toBe("\x1b");
      expect(ANSI.CSI).toBe("\x1b[");
    });
  });

  describe("ANSI cursor movement functions", () => {
    test("moveCursor positions cursor at row, column (1-indexed)", () => {
      // Position 0,0 in buffer = row 1, col 1 in terminal
      expect(ANSI.moveCursor(0, 0)).toBe("\x1b[1;1H");
      expect(ANSI.moveCursor(9, 4)).toBe("\x1b[5;10H");
    });

    test("cursorUp moves cursor up N lines", () => {
      expect(ANSI.cursorUp(0)).toBe("");
      expect(ANSI.cursorUp(1)).toBe("\x1b[A");
      expect(ANSI.cursorUp(5)).toBe("\x1b[5A");
    });

    test("cursorDown moves cursor down N lines", () => {
      expect(ANSI.cursorDown(0)).toBe("");
      expect(ANSI.cursorDown(1)).toBe("\x1b[B");
      expect(ANSI.cursorDown(3)).toBe("\x1b[3B");
    });

    test("cursorRight moves cursor right N columns", () => {
      expect(ANSI.cursorRight(0)).toBe("");
      expect(ANSI.cursorRight(1)).toBe("\x1b[C");
      expect(ANSI.cursorRight(10)).toBe("\x1b[10C");
    });

    test("cursorLeft moves cursor left N columns", () => {
      expect(ANSI.cursorLeft(0)).toBe("");
      expect(ANSI.cursorLeft(1)).toBe("\x1b[D");
      expect(ANSI.cursorLeft(7)).toBe("\x1b[7D");
    });

    test("cursorToColumn moves cursor to column (1-indexed)", () => {
      expect(ANSI.cursorToColumn(0)).toBe("\x1b[1G");
      expect(ANSI.cursorToColumn(79)).toBe("\x1b[80G");
    });
  });

  describe("ANSI SGR codes", () => {
    test("SGR contains attribute codes", () => {
      expect(ANSI.SGR.bold).toBe(1);
      expect(ANSI.SGR.dim).toBe(2);
      expect(ANSI.SGR.italic).toBe(3);
      expect(ANSI.SGR.underline).toBe(4);
      expect(ANSI.SGR.blink).toBe(5);
      expect(ANSI.SGR.inverse).toBe(7);
      expect(ANSI.SGR.hidden).toBe(8);
      expect(ANSI.SGR.strikethrough).toBe(9);
    });

    test("SGR contains foreground color codes", () => {
      expect(ANSI.SGR.fgDefault).toBe(39);
      expect(ANSI.SGR.fgBlack).toBe(30);
      expect(ANSI.SGR.fgRed).toBe(31);
      expect(ANSI.SGR.fgGreen).toBe(32);
      expect(ANSI.SGR.fgYellow).toBe(33);
      expect(ANSI.SGR.fgBlue).toBe(34);
      expect(ANSI.SGR.fgMagenta).toBe(35);
      expect(ANSI.SGR.fgCyan).toBe(36);
      expect(ANSI.SGR.fgWhite).toBe(37);
    });

    test("SGR contains bright foreground color codes", () => {
      expect(ANSI.SGR.fgBrightBlack).toBe(90);
      expect(ANSI.SGR.fgBrightRed).toBe(91);
      expect(ANSI.SGR.fgBrightGreen).toBe(92);
      expect(ANSI.SGR.fgBrightYellow).toBe(93);
      expect(ANSI.SGR.fgBrightBlue).toBe(94);
      expect(ANSI.SGR.fgBrightMagenta).toBe(95);
      expect(ANSI.SGR.fgBrightCyan).toBe(96);
      expect(ANSI.SGR.fgBrightWhite).toBe(97);
    });

    test("SGR contains background color codes", () => {
      expect(ANSI.SGR.bgDefault).toBe(49);
      expect(ANSI.SGR.bgBlack).toBe(40);
      expect(ANSI.SGR.bgRed).toBe(41);
      expect(ANSI.SGR.bgGreen).toBe(42);
      expect(ANSI.SGR.bgYellow).toBe(43);
      expect(ANSI.SGR.bgBlue).toBe(44);
      expect(ANSI.SGR.bgMagenta).toBe(45);
      expect(ANSI.SGR.bgCyan).toBe(46);
      expect(ANSI.SGR.bgWhite).toBe(47);
    });

    test("SGR contains bright background color codes", () => {
      expect(ANSI.SGR.bgBrightBlack).toBe(100);
      expect(ANSI.SGR.bgBrightRed).toBe(101);
      expect(ANSI.SGR.bgBrightGreen).toBe(102);
      expect(ANSI.SGR.bgBrightYellow).toBe(103);
      expect(ANSI.SGR.bgBrightBlue).toBe(104);
      expect(ANSI.SGR.bgBrightMagenta).toBe(105);
      expect(ANSI.SGR.bgBrightCyan).toBe(106);
      expect(ANSI.SGR.bgBrightWhite).toBe(107);
    });
  });

  describe("Bug km-pii3: Layout jumps on view mode changes", () => {
    /**
     * This test reproduces the bug where content shifts 30-40 characters
     * when cycling between views. The root cause is that optimalCursorMove
     * uses bare '\n' to move down, which doesn't reset to column 0.
     *
     * In most terminals, '\n' moves down but preserves the column position.
     * To move to column 0 of the next line, you need '\r\n' or explicit
     * cursor positioning.
     */
    test("changesToAnsi should use absolute positioning, not bare newlines", () => {
      // Simulate a view change where content at column 30 is replaced
      // by content at column 0 on the next line
      const prev = new TerminalBuffer(80, 3);
      // Old content at column 30
      prev.setCell(30, 0, { char: "O" });
      prev.setCell(31, 0, { char: "L" });
      prev.setCell(32, 0, { char: "D" });

      const next = new TerminalBuffer(80, 3);
      // New content at column 0 on next line
      next.setCell(0, 1, { char: "N" });
      next.setCell(1, 1, { char: "E" });
      next.setCell(2, 1, { char: "W" });

      const changes = diffBuffers(prev, next);
      const output = changesToAnsi(changes);

      // The output should NOT contain bare '\n' for cursor movement
      // because '\n' doesn't move the cursor to column 0
      //
      // If output contains '\n' followed by text (not preceded by \r),
      // the text would render at the wrong column
      const bareNewlinePattern = /[^\r]\n[A-Z]/;
      expect(output).not.toMatch(bareNewlinePattern);
    });

    test("cursor movement to column 0 should use explicit positioning or CR+LF", () => {
      // After writing at column 30, moving to column 0 on next line
      // needs explicit positioning, not bare newline
      const changes = [
        {
          x: 30,
          y: 0,
          cell: {
            char: "A",
            fg: null,
            bg: null,
            attrs: {},
            wide: false,
            continuation: false,
          },
        },
        {
          x: 0,
          y: 1,
          cell: {
            char: "B",
            fg: null,
            bg: null,
            attrs: {},
            wide: false,
            continuation: false,
          },
        },
      ];

      const output = changesToAnsi(changes);

      // Should contain either:
      // - Explicit cursor move: \x1b[2;1H (row 2, col 1)
      // - Or \r\n (carriage return + newline)
      // But NOT bare \n
      const hasExplicitMove =
        output.includes("\x1b[2;1H") || output.includes("\r\n");
      const hasBareNewline = /[^\r]\n/.test(output);

      // Either use explicit positioning OR use \r\n (not bare \n)
      expect(hasExplicitMove || !hasBareNewline).toBe(true);
    });

    test("view mode switch simulation - content should not shift horizontally", () => {
      // Simulate a view change where content on line 2 moves to column 0
      // after content was at column 30 on line 1
      const cardsView = new TerminalBuffer(80, 5);
      // Content at column 30 on row 0
      cardsView.setCell(30, 0, { char: "C" });
      cardsView.setCell(31, 0, { char: "a" });
      cardsView.setCell(32, 0, { char: "r" });
      cardsView.setCell(33, 0, { char: "d" });
      cardsView.setCell(34, 0, { char: "s" });

      // Simulate columns view (content starts at column 0 on row 1)
      const columnsView = new TerminalBuffer(80, 5);
      columnsView.setCell(0, 1, { char: "C" });
      columnsView.setCell(1, 1, { char: "o" });
      columnsView.setCell(2, 1, { char: "l" });
      columnsView.setCell(3, 1, { char: "s" });

      // Switching from cards to columns
      const changes = diffBuffers(cardsView, columnsView);
      const output = changesToAnsi(changes);

      // The output should contain changes for both row 0 (clearing) and row 1 (new content)
      const row0Changes = changes.filter((c) => c.y === 0);
      const row1Changes = changes.filter((c) => c.y === 1);
      expect(row0Changes.length).toBeGreaterThan(0);
      expect(row1Changes.length).toBeGreaterThan(0);

      // The crucial check: when moving from row 0 to row 1 at column 0,
      // the output must NOT use bare '\n' - it should use '\r\n' or explicit positioning
      const bareNewlineBeforeText = /[^\r]\n[C]/;
      expect(output).not.toMatch(bareNewlineBeforeText);

      // Should use \r\n (carriage return + line feed) to move to column 0 of next row
      // or explicit cursor positioning
      const usesProperPositioning =
        output.includes("\r\n") || output.includes("\x1b[2;1H");
      expect(usesProperPositioning).toBe(true);
    });
  });
});
