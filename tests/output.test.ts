/**
 * Output Function Tests
 *
 * Tests for ANSI output generation functions in output.ts.
 */

import { describe, expect, test } from 'bun:test';
import { TerminalBuffer } from '../src/buffer.js';
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
} from '../src/output.js';

describe('Output Functions', () => {
	describe('styleToAnsi', () => {
		test('returns empty string for default style', () => {
			const result = styleToAnsi({ fg: null, bg: null, attrs: {} });
			// Default colors still emit codes
			expect(result).toContain('39'); // fg default
			expect(result).toContain('49'); // bg default
		});

		test('converts bold attribute', () => {
			const result = styleToAnsi({ fg: null, bg: null, attrs: { bold: true } });
			expect(result).toContain('1'); // bold SGR code
		});

		test('converts dim attribute', () => {
			const result = styleToAnsi({ fg: null, bg: null, attrs: { dim: true } });
			expect(result).toContain('2'); // dim SGR code
		});

		test('converts italic attribute', () => {
			const result = styleToAnsi({ fg: null, bg: null, attrs: { italic: true } });
			expect(result).toContain('3'); // italic SGR code
		});

		test('converts underline attribute', () => {
			const result = styleToAnsi({ fg: null, bg: null, attrs: { underline: true } });
			expect(result).toContain('4'); // underline SGR code
		});

		test('converts strikethrough attribute', () => {
			const result = styleToAnsi({ fg: null, bg: null, attrs: { strikethrough: true } });
			expect(result).toContain('9'); // strikethrough SGR code
		});

		test('converts inverse attribute', () => {
			const result = styleToAnsi({ fg: null, bg: null, attrs: { inverse: true } });
			expect(result).toContain('7'); // inverse SGR code
		});

		test('converts foreground color (standard palette)', () => {
			// Red (color index 1)
			const result = styleToAnsi({ fg: 1, bg: null, attrs: {} });
			expect(result).toContain('31'); // fg red
		});

		test('converts foreground color (bright palette)', () => {
			// Bright red (color index 9)
			const result = styleToAnsi({ fg: 9, bg: null, attrs: {} });
			expect(result).toContain('91'); // fg bright red
		});

		test('converts background color (standard palette)', () => {
			// Cyan background (color index 6)
			const result = styleToAnsi({ fg: null, bg: 6, attrs: {} });
			expect(result).toContain('46'); // bg cyan
		});

		test('converts 256-color foreground', () => {
			// Color 200 (extended palette)
			const result = styleToAnsi({ fg: 200, bg: null, attrs: {} });
			expect(result).toContain('38;5;200'); // 256-color fg
		});

		test('converts 256-color background', () => {
			// Color 100 (extended palette)
			const result = styleToAnsi({ fg: null, bg: 100, attrs: {} });
			expect(result).toContain('48;5;100'); // 256-color bg
		});

		test('converts RGB true color foreground', () => {
			const result = styleToAnsi({ fg: { r: 255, g: 128, b: 64 }, bg: null, attrs: {} });
			expect(result).toContain('38;2;255;128;64'); // true color fg
		});

		test('converts RGB true color background', () => {
			const result = styleToAnsi({ fg: null, bg: { r: 32, g: 64, b: 128 }, attrs: {} });
			expect(result).toContain('48;2;32;64;128'); // true color bg
		});

		test('combines multiple attributes', () => {
			const result = styleToAnsi({ fg: 1, bg: 6, attrs: { bold: true, underline: true } });
			expect(result).toContain('1'); // bold
			expect(result).toContain('4'); // underline
			expect(result).toContain('31'); // fg red
			expect(result).toContain('46'); // bg cyan
		});
	});

	describe('bufferToAnsi', () => {
		test('converts empty buffer to string with spaces', () => {
			const buffer = new TerminalBuffer(5, 2);
			const result = bufferToAnsi(buffer);
			// Should contain cursor home
			expect(result).toContain('\x1b[H');
		});

		test('converts buffer with text content', () => {
			const buffer = new TerminalBuffer(10, 1);
			buffer.setCell(0, 0, { char: 'H' });
			buffer.setCell(1, 0, { char: 'i' });
			const result = bufferToAnsi(buffer);
			expect(result).toContain('H');
			expect(result).toContain('i');
		});

		test('converts buffer with styled cells', () => {
			const buffer = new TerminalBuffer(5, 1);
			buffer.setCell(0, 0, { char: 'X', fg: 1, attrs: { bold: true } });
			const result = bufferToAnsi(buffer);
			expect(result).toContain('X');
			expect(result).toContain('1'); // bold code
		});
	});

	describe('diffBuffers', () => {
		test('returns all cells when prev is different', () => {
			const prev = new TerminalBuffer(3, 1);
			prev.setCell(0, 0, { char: 'A' });

			const next = new TerminalBuffer(3, 1);
			next.setCell(0, 0, { char: 'B' });

			const changes = diffBuffers(prev, next);
			expect(changes.length).toBeGreaterThan(0);
			expect(changes.some((c) => c.cell.char === 'B')).toBe(true);
		});

		test('returns empty array for identical buffers', () => {
			const prev = new TerminalBuffer(3, 1);
			prev.setCell(0, 0, { char: 'A' });

			const next = new TerminalBuffer(3, 1);
			next.setCell(0, 0, { char: 'A' });

			const changes = diffBuffers(prev, next);
			expect(changes.length).toBe(0);
		});

		test('detects style changes', () => {
			const prev = new TerminalBuffer(3, 1);
			prev.setCell(0, 0, { char: 'A', fg: 1 });

			const next = new TerminalBuffer(3, 1);
			next.setCell(0, 0, { char: 'A', fg: 2 });

			const changes = diffBuffers(prev, next);
			expect(changes.length).toBeGreaterThan(0);
		});
	});

	describe('changesToAnsi', () => {
		test('converts changes to ANSI sequence', () => {
			const changes = [{ x: 0, y: 0, cell: { char: 'X', fg: null, bg: null, attrs: {}, wide: false, continuation: false } }];
			const result = changesToAnsi(changes);
			expect(result).toContain('X');
		});

		test('handles empty changes array', () => {
			const result = changesToAnsi([]);
			expect(result).toBe('');
		});
	});

	describe('renderBuffer', () => {
		test('renders full buffer when no previous', () => {
			const buffer = new TerminalBuffer(5, 2);
			buffer.setCell(0, 0, { char: 'A' });
			const result = renderBuffer(buffer, null);
			expect(result).toContain('A');
			expect(result).toContain('\x1b[H'); // cursor home
		});

		test('renders diff when previous buffer provided', () => {
			const prev = new TerminalBuffer(5, 2);
			prev.setCell(0, 0, { char: 'A' });

			const next = new TerminalBuffer(5, 2);
			next.setCell(0, 0, { char: 'B' });

			const result = renderBuffer(next, prev);
			expect(result).toContain('B');
			// Should be shorter than full render
			expect(result.length).toBeLessThan(renderBuffer(next, null).length);
		});

		test('returns empty string for identical buffers', () => {
			const prev = new TerminalBuffer(5, 1);
			prev.setCell(0, 0, { char: 'A' });

			const next = new TerminalBuffer(5, 1);
			next.setCell(0, 0, { char: 'A' });

			const result = renderBuffer(next, prev);
			expect(result).toBe('');
		});
	});

	describe('Screen control functions', () => {
		test('clearScreen returns clear sequence', () => {
			const result = clearScreen();
			expect(result).toContain('\x1b[2J'); // clear screen
			expect(result).toContain('\x1b[H'); // cursor home
		});

		test('clearToEnd returns clear to end sequence', () => {
			const result = clearToEnd();
			expect(result).toContain('\x1b[0J'); // clear to end
		});

		test('clearLine returns clear line sequence', () => {
			const result = clearLine();
			expect(result).toContain('\x1b[2K'); // clear line
		});

		test('enterAlternateScreen returns enter sequence', () => {
			const result = enterAlternateScreen();
			expect(result).toContain('\x1b[?1049h');
		});

		test('leaveAlternateScreen returns leave sequence', () => {
			const result = leaveAlternateScreen();
			expect(result).toContain('\x1b[?1049l');
		});

		test('enableMouse returns enable sequence', () => {
			const result = enableMouse();
			expect(result).toContain('\x1b[?1000h');
		});

		test('disableMouse returns disable sequence', () => {
			const result = disableMouse();
			expect(result).toContain('\x1b[?1000l');
		});
	});

	describe('ANSI constants', () => {
		test('ANSI object contains expected properties', () => {
			expect(ANSI.CURSOR_HIDE).toBeDefined();
			expect(ANSI.CURSOR_SHOW).toBeDefined();
			expect(ANSI.RESET).toBeDefined();
		});

		test('ANSI sequences have correct format', () => {
			expect(ANSI.CURSOR_HIDE).toContain('\x1b[');
			expect(ANSI.CURSOR_SHOW).toContain('\x1b[');
			expect(ANSI.RESET).toBe('\x1b[0m');
		});
	});
});
