/**
 * Tests for ANSI escape sequence parsing.
 *
 * These tests verify that inkx correctly handles text with embedded ANSI
 * escape codes (like chalk-styled strings), which is essential for
 * applications that use pre-styled text in Text components.
 */

import { describe, expect, test } from 'vitest';
import { displayWidthAnsi, hasAnsi, parseAnsiText, stripAnsi } from '../src/unicode.js';

describe('ANSI text utilities', () => {
	describe('hasAnsi', () => {
		test('returns true for text with ANSI codes', () => {
			expect(hasAnsi('\x1b[31mred\x1b[0m')).toBe(true);
			expect(hasAnsi('\x1b[1mbold\x1b[0m')).toBe(true);
			expect(hasAnsi('before\x1b[34mblue\x1b[0mafter')).toBe(true);
		});

		test('returns false for plain text', () => {
			expect(hasAnsi('plain text')).toBe(false);
			expect(hasAnsi('no escapes here')).toBe(false);
			expect(hasAnsi('')).toBe(false);
		});
	});

	describe('stripAnsi', () => {
		test('removes ANSI escape sequences', () => {
			expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
			expect(stripAnsi('\x1b[1;34mbold blue\x1b[0m')).toBe('bold blue');
			expect(stripAnsi('no codes')).toBe('no codes');
		});

		test('handles multiple escape sequences', () => {
			expect(stripAnsi('\x1b[31mred\x1b[0m and \x1b[32mgreen\x1b[0m')).toBe('red and green');
		});
	});

	describe('displayWidthAnsi', () => {
		test('calculates width ignoring ANSI codes', () => {
			expect(displayWidthAnsi('\x1b[31mred\x1b[0m')).toBe(3);
			expect(displayWidthAnsi('\x1b[1;34mhello\x1b[0m')).toBe(5);
			expect(displayWidthAnsi('plain')).toBe(5);
		});

		test('handles wide characters with ANSI codes', () => {
			// Note: CJK characters are typically width 2
			expect(displayWidthAnsi('\x1b[31m\u4e2d\x1b[0m')).toBe(2); // Single CJK char
		});
	});

	describe('parseAnsiText', () => {
		test('returns plain text as single segment', () => {
			const segments = parseAnsiText('plain text');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('plain text');
			expect(segments[0]!.fg).toBeUndefined();
			expect(segments[0]!.bold).toBeUndefined();
		});

		test('parses basic foreground colors', () => {
			const segments = parseAnsiText('\x1b[31mred\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('red');
			expect(segments[0]!.fg).toBe(31); // Red SGR code
		});

		test('parses background colors', () => {
			const segments = parseAnsiText('\x1b[44mblue bg\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('blue bg');
			expect(segments[0]!.bg).toBe(44); // Blue background SGR code
		});

		test('parses bold attribute', () => {
			const segments = parseAnsiText('\x1b[1mbold\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('bold');
			expect(segments[0]!.bold).toBe(true);
		});

		test('parses dim attribute', () => {
			const segments = parseAnsiText('\x1b[2mdim\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('dim');
			expect(segments[0]!.dim).toBe(true);
		});

		test('parses italic attribute', () => {
			const segments = parseAnsiText('\x1b[3mitalic\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('italic');
			expect(segments[0]!.italic).toBe(true);
		});

		test('parses underline attribute', () => {
			const segments = parseAnsiText('\x1b[4munderline\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('underline');
			expect(segments[0]!.underline).toBe(true);
		});

		test('parses inverse attribute', () => {
			const segments = parseAnsiText('\x1b[7minverse\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('inverse');
			expect(segments[0]!.inverse).toBe(true);
		});

		test('parses combined attributes', () => {
			const segments = parseAnsiText('\x1b[1;31mbold red\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('bold red');
			expect(segments[0]!.bold).toBe(true);
			expect(segments[0]!.fg).toBe(31);
		});

		test('parses bright foreground colors', () => {
			const segments = parseAnsiText('\x1b[91mbright red\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('bright red');
			expect(segments[0]!.fg).toBe(91);
		});

		test('parses bright background colors', () => {
			const segments = parseAnsiText('\x1b[104mbright blue bg\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('bright blue bg');
			expect(segments[0]!.bg).toBe(104);
		});

		test('parses 256 color (palette) foreground', () => {
			const segments = parseAnsiText('\x1b[38;5;214morange\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('orange');
			expect(segments[0]!.fg).toBe(214); // 256-color palette index
		});

		test('parses 256 color (palette) background', () => {
			const segments = parseAnsiText('\x1b[48;5;27mblue bg\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('blue bg');
			expect(segments[0]!.bg).toBe(27);
		});

		test('parses true color (RGB) foreground', () => {
			const segments = parseAnsiText('\x1b[38;2;255;128;0morange\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('orange');
			// True color is packed with 0x1000000 marker
			expect(segments[0]!.fg).toBe(0x1000000 | (255 << 16) | (128 << 8) | 0);
		});

		test('parses true color (RGB) background', () => {
			const segments = parseAnsiText('\x1b[48;2;0;100;200mblue\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('blue');
			expect(segments[0]!.bg).toBe(0x1000000 | (0 << 16) | (100 << 8) | 200);
		});

		test('handles multiple segments with style changes', () => {
			const segments = parseAnsiText('\x1b[31mred\x1b[0m normal \x1b[32mgreen\x1b[0m');
			expect(segments).toHaveLength(3);
			expect(segments[0]!.text).toBe('red');
			expect(segments[0]!.fg).toBe(31);
			expect(segments[1]!.text).toBe(' normal ');
			expect(segments[1]!.fg).toBeUndefined();
			expect(segments[2]!.text).toBe('green');
			expect(segments[2]!.fg).toBe(32);
		});

		test('handles reset code correctly', () => {
			const segments = parseAnsiText('\x1b[1;31mbold red\x1b[0mplain');
			expect(segments).toHaveLength(2);
			expect(segments[0]!.bold).toBe(true);
			expect(segments[0]!.fg).toBe(31);
			expect(segments[1]!.text).toBe('plain');
			expect(segments[1]!.bold).toBeUndefined();
			expect(segments[1]!.fg).toBeUndefined();
		});

		test('handles nested styles without reset', () => {
			// \x1b[1m = bold, \x1b[31m = red (accumulates)
			const segments = parseAnsiText('\x1b[1mbold\x1b[31m red too\x1b[0m');
			expect(segments).toHaveLength(2);
			expect(segments[0]!.text).toBe('bold');
			expect(segments[0]!.bold).toBe(true);
			expect(segments[1]!.text).toBe(' red too');
			expect(segments[1]!.bold).toBe(true);
			expect(segments[1]!.fg).toBe(31);
		});

		test('handles chalk-style compound codes', () => {
			// Typical chalk output: \x1b[47m\x1b[30mtext\x1b[39m\x1b[49m
			// (white bg, black fg, then reset fg, reset bg)
			const segments = parseAnsiText('\x1b[47m\x1b[30mtext\x1b[39m\x1b[49m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('text');
			expect(segments[0]!.bg).toBe(47); // white background
			expect(segments[0]!.fg).toBe(30); // black foreground
		});

		test('handles empty input', () => {
			const segments = parseAnsiText('');
			expect(segments).toHaveLength(0);
		});

		test('handles ANSI codes with no text between them', () => {
			const segments = parseAnsiText('\x1b[31m\x1b[1mtext\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('text');
			expect(segments[0]!.fg).toBe(31);
			expect(segments[0]!.bold).toBe(true);
		});

		test('parses bgOverride marker (SGR 9999)', () => {
			// Private code used by chalkx.bgOverride() to signal intentional bg conflict
			const segments = parseAnsiText('\x1b[9999m\x1b[44mblue bg\x1b[0m');
			expect(segments).toHaveLength(1);
			expect(segments[0]!.text).toBe('blue bg');
			expect(segments[0]!.bg).toBe(44);
			expect(segments[0]!.bgOverride).toBe(true);
		});

		test('bgOverride persists across segments', () => {
			const segments = parseAnsiText('\x1b[9999m\x1b[44mfirst\x1b[41msecond\x1b[0m');
			expect(segments).toHaveLength(2);
			expect(segments[0]!.bgOverride).toBe(true);
			expect(segments[1]!.bgOverride).toBe(true);
		});
	});
});
