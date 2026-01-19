/**
 * Unicode Tests
 *
 * Tests for Unicode handling: grapheme segmentation, display width,
 * text manipulation, and buffer writing.
 */

import { describe, expect, test } from 'bun:test';
import { TerminalBuffer } from '../src/buffer.js';
import {
	displayWidth,
	displayWidthAnsi,
	graphemeCount,
	graphemeWidth,
	hasWideCharacters,
	hasZeroWidthCharacters,
	isCJK,
	isLikelyEmoji,
	isWideGrapheme,
	isZeroWidthGrapheme,
	measureText,
	padText,
	sliceByWidth,
	splitGraphemes,
	stripAnsi,
	truncateAnsi,
	truncateText,
	wrapText,
	writeTextToBuffer,
	writeTextTruncated,
} from '../src/unicode.js';

describe('Unicode', () => {
	describe('splitGraphemes', () => {
		test('splits ASCII text', () => {
			expect(splitGraphemes('hello')).toEqual(['h', 'e', 'l', 'l', 'o']);
		});

		test('splits CJK characters', () => {
			expect(splitGraphemes('한국어')).toEqual(['한', '국', '어']);
		});

		test('handles combining characters', () => {
			// e + combining acute accent
			const cafe = 'cafe\u0301';
			const graphemes = splitGraphemes(cafe);
			expect(graphemes).toHaveLength(4);
			expect(graphemes[3]).toBe('e\u0301');
		});

		test('handles emoji', () => {
			expect(splitGraphemes('😀🎉')).toEqual(['😀', '🎉']);
		});

		test('handles ZWJ emoji sequences', () => {
			// Family emoji (man + ZWJ + woman + ZWJ + girl)
			const family = '👨‍👩‍👧';
			const graphemes = splitGraphemes(family);
			expect(graphemes).toHaveLength(1);
		});
	});

	describe('graphemeCount', () => {
		test('counts ASCII', () => {
			expect(graphemeCount('hello')).toBe(5);
		});

		test('counts CJK', () => {
			expect(graphemeCount('한국어')).toBe(3);
		});

		test('counts combining as single grapheme', () => {
			expect(graphemeCount('cafe\u0301')).toBe(4);
		});
	});

	describe('displayWidth', () => {
		test('ASCII is 1 column each', () => {
			expect(displayWidth('hello')).toBe(5);
		});

		test('CJK is 2 columns each', () => {
			expect(displayWidth('한국어')).toBe(6);
		});

		test('emoji varies', () => {
			// Most emoji are 2 columns wide in modern terminals
			expect(displayWidth('😀')).toBeGreaterThanOrEqual(1);
		});

		test('combining chars are 0 width', () => {
			// Just the combining acute alone
			expect(displayWidth('\u0301')).toBe(0);
		});
	});

	describe('graphemeWidth', () => {
		test('ASCII grapheme is 1', () => {
			expect(graphemeWidth('A')).toBe(1);
		});

		test('CJK grapheme is 2', () => {
			expect(graphemeWidth('한')).toBe(2);
		});
	});

	describe('isWideGrapheme', () => {
		test('ASCII is not wide', () => {
			expect(isWideGrapheme('A')).toBe(false);
		});

		test('CJK is wide', () => {
			expect(isWideGrapheme('中')).toBe(true);
		});
	});

	describe('isZeroWidthGrapheme', () => {
		test('ASCII is not zero-width', () => {
			expect(isZeroWidthGrapheme('A')).toBe(false);
		});

		test('combining accent is zero-width', () => {
			expect(isZeroWidthGrapheme('\u0301')).toBe(true);
		});
	});

	describe('truncateText', () => {
		test('no truncation if fits', () => {
			expect(truncateText('hello', 10)).toBe('hello');
		});

		test('truncates with ellipsis', () => {
			expect(truncateText('hello world', 8)).toBe('hello w…');
		});

		test('handles CJK truncation', () => {
			const result = truncateText('한국어입니다', 7);
			expect(displayWidth(result)).toBeLessThanOrEqual(7);
			expect(result).toContain('…');
		});

		test('custom ellipsis', () => {
			expect(truncateText('hello world', 8, '...')).toBe('hello...');
		});

		test('empty when maxWidth too small', () => {
			expect(truncateText('hello', 0)).toBe('');
		});
	});

	describe('padText', () => {
		test('pads left (right-aligns content)', () => {
			expect(padText('hi', 5, 'left')).toBe('hi   ');
		});

		test('pads right (left-aligns content)', () => {
			expect(padText('hi', 5, 'right')).toBe('   hi');
		});

		test('pads center', () => {
			const padded = padText('hi', 6, 'center');
			expect(padded).toBe('  hi  ');
		});

		test('no pad if already fits', () => {
			expect(padText('hello', 3)).toBe('hello');
		});

		test('handles CJK padding', () => {
			const padded = padText('한', 5, 'left');
			expect(displayWidth(padded)).toBe(5);
		});
	});

	describe('wrapText', () => {
		test('wraps long text', () => {
			const lines = wrapText('hello world test', 6);
			expect(lines).toEqual(['hello ', 'world ', 'test']);
		});

		test('preserves newlines by default', () => {
			const lines = wrapText('a\nb\nc', 10);
			expect(lines).toEqual(['a', 'b', 'c']);
		});

		test('handles empty lines', () => {
			const lines = wrapText('a\n\nb', 10);
			expect(lines).toEqual(['a', '', 'b']);
		});

		test('wraps CJK correctly', () => {
			const lines = wrapText('한국어입니다', 5);
			// Each CJK char is 2 cols, so max 2 per line
			for (const line of lines) {
				expect(displayWidth(line)).toBeLessThanOrEqual(5);
			}
		});

		test('returns empty for width 0', () => {
			expect(wrapText('hello', 0)).toEqual([]);
		});
	});

	describe('sliceByWidth', () => {
		test('slices ASCII', () => {
			expect(sliceByWidth('hello', 1, 4)).toBe('ell');
		});

		test('slices CJK', () => {
			expect(sliceByWidth('한국어', 0, 4)).toBe('한국');
		});

		test('slice from start', () => {
			expect(sliceByWidth('hello', 0, 3)).toBe('hel');
		});

		test('slice to end', () => {
			expect(sliceByWidth('hello', 2)).toBe('llo');
		});
	});

	describe('stripAnsi', () => {
		test('strips color codes', () => {
			expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
		});

		test('strips multiple codes', () => {
			expect(stripAnsi('\x1b[1m\x1b[32mbold green\x1b[0m')).toBe('bold green');
		});

		test('preserves plain text', () => {
			expect(stripAnsi('plain')).toBe('plain');
		});
	});

	describe('displayWidthAnsi', () => {
		test('ignores ANSI in width calculation', () => {
			expect(displayWidthAnsi('\x1b[31mhello\x1b[0m')).toBe(5);
		});
	});

	describe('truncateAnsi', () => {
		test('truncates after stripping ANSI', () => {
			const result = truncateAnsi('\x1b[31mhello world\x1b[0m', 8);
			expect(result).toBe('hello w…');
		});
	});

	describe('measureText', () => {
		test('measures single line', () => {
			expect(measureText('hello')).toEqual({ width: 5, height: 1 });
		});

		test('measures multi-line', () => {
			expect(measureText('hello\nworld!')).toEqual({ width: 6, height: 2 });
		});

		test('measures CJK', () => {
			expect(measureText('한국어')).toEqual({ width: 6, height: 1 });
		});
	});

	describe('hasWideCharacters', () => {
		test('false for ASCII', () => {
			expect(hasWideCharacters('hello')).toBe(false);
		});

		test('true for CJK', () => {
			expect(hasWideCharacters('hello 한국어')).toBe(true);
		});
	});

	describe('hasZeroWidthCharacters', () => {
		test('false for normal text', () => {
			expect(hasZeroWidthCharacters('hello')).toBe(false);
		});

		test('true for standalone combining chars', () => {
			// A standalone combining character is zero-width
			expect(hasZeroWidthCharacters('\u0301')).toBe(true);
		});

		test('false when combining char merges with base', () => {
			// When combining char merges into grapheme, it's not detected separately
			// This is expected behavior since splitGraphemes groups them together
			expect(hasZeroWidthCharacters('cafe\u0301')).toBe(false);
		});
	});

	describe('isLikelyEmoji', () => {
		test('detects basic emoji', () => {
			expect(isLikelyEmoji('😀')).toBe(true);
		});

		test('detects ZWJ emoji', () => {
			expect(isLikelyEmoji('👨‍👩‍👧')).toBe(true);
		});

		test('false for ASCII', () => {
			expect(isLikelyEmoji('A')).toBe(false);
		});
	});

	describe('isCJK', () => {
		test('detects Chinese', () => {
			expect(isCJK('中')).toBe(true);
		});

		test('detects Japanese hiragana', () => {
			expect(isCJK('あ')).toBe(true);
		});

		test('detects Korean', () => {
			expect(isCJK('한')).toBe(true);
		});

		test('false for ASCII', () => {
			expect(isCJK('A')).toBe(false);
		});
	});

	describe('writeTextToBuffer', () => {
		test('writes ASCII text', () => {
			const buffer = new TerminalBuffer(10, 1);
			const endCol = writeTextToBuffer(buffer, 0, 0, 'hello');
			expect(endCol).toBe(5);
			expect(buffer.getCell(0, 0).char).toBe('h');
			expect(buffer.getCell(4, 0).char).toBe('o');
		});

		test('writes CJK with wide cells', () => {
			const buffer = new TerminalBuffer(10, 1);
			writeTextToBuffer(buffer, 0, 0, '한');
			expect(buffer.getCell(0, 0).char).toBe('한');
			expect(buffer.getCell(0, 0).wide).toBe(true);
			expect(buffer.getCell(1, 0).continuation).toBe(true);
		});

		test('writes with style', () => {
			const buffer = new TerminalBuffer(10, 1);
			writeTextToBuffer(buffer, 0, 0, 'hi', { fg: 196, bg: null, attrs: { bold: true } });
			expect(buffer.getCell(0, 0).fg).toBe(196);
			expect(buffer.getCell(0, 0).attrs.bold).toBe(true);
		});

		test('combines zero-width chars with previous', () => {
			const buffer = new TerminalBuffer(10, 1);
			writeTextToBuffer(buffer, 0, 0, 'e\u0301');
			expect(buffer.getCell(0, 0).char).toBe('e\u0301');
		});
	});

	describe('writeTextTruncated', () => {
		test('writes without truncation if fits', () => {
			const buffer = new TerminalBuffer(10, 1);
			writeTextTruncated(buffer, 0, 0, 'hello', 10);
			expect(buffer.getCell(4, 0).char).toBe('o');
		});

		test('truncates with ellipsis', () => {
			const buffer = new TerminalBuffer(10, 1);
			writeTextTruncated(buffer, 0, 0, 'hello world', 6);
			expect(buffer.getCell(5, 0).char).toBe('…');
		});
	});
});
