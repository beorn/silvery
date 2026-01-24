/**
 * Buffer Tests
 *
 * Tests for the terminal buffer implementation.
 */

import { describe, expect, test } from 'bun:test';
import {
	type Cell,
	type CellAttrs,
	type Color,
	TerminalBuffer,
	attrsEquals,
	attrsToNumber,
	cellEquals,
	colorEquals,
	createBuffer,
	numberToAttrs,
	packCell,
	styleEquals,
} from '../src/buffer.js';

describe('Buffer', () => {
	describe('attrsToNumber / numberToAttrs', () => {
		test('encodes empty attrs', () => {
			expect(attrsToNumber({})).toBe(0);
		});

		test('encodes bold', () => {
			const n = attrsToNumber({ bold: true });
			expect(n).toBe(1);
			expect(numberToAttrs(n).bold).toBe(true);
		});

		test('encodes all attrs', () => {
			const attrs: CellAttrs = {
				bold: true,
				dim: true,
				italic: true,
				underline: true,
				blink: true,
				inverse: true,
				hidden: true,
				strikethrough: true,
			};
			const n = attrsToNumber(attrs);
			const decoded = numberToAttrs(n);
			expect(decoded).toEqual(attrs);
		});

		test('round-trips partial attrs', () => {
			const attrs: CellAttrs = { italic: true, underline: true };
			const decoded = numberToAttrs(attrsToNumber(attrs));
			expect(decoded.italic).toBe(true);
			expect(decoded.underline).toBe(true);
			expect(decoded.bold).toBeUndefined();
		});
	});

	describe('packCell', () => {
		test('packs basic cell', () => {
			const cell: Cell = {
				char: 'A',
				fg: null,
				bg: null,
				attrs: {},
				wide: false,
				continuation: false,
			};
			const packed = packCell(cell);
			expect(typeof packed).toBe('number');
		});

		test('packs cell with 256 color', () => {
			const cell: Cell = {
				char: 'A',
				fg: 196, // red-ish
				bg: 21, // blue-ish
				attrs: { bold: true },
				wide: false,
				continuation: false,
			};
			const packed = packCell(cell);
			// Colors are stored with +1 offset to distinguish 0 (null) from black (index 0)
			// FG should be in low 8 bits: 196 + 1 = 197
			expect(packed & 0xff).toBe(197);
			// BG should be in bits 8-15: 21 + 1 = 22
			expect((packed >> 8) & 0xff).toBe(22);
		});

		test('packs wide flag', () => {
			const cell: Cell = {
				char: '한',
				fg: null,
				bg: null,
				attrs: {},
				wide: true,
				continuation: false,
			};
			const packed = packCell(cell);
			// Wide flag is bit 24
			expect(packed & (1 << 24)).not.toBe(0);
		});
	});

	describe('colorEquals', () => {
		test('null equals null', () => {
			expect(colorEquals(null, null)).toBe(true);
		});

		test('null !== number', () => {
			expect(colorEquals(null, 1)).toBe(false);
			expect(colorEquals(1, null)).toBe(false);
		});

		test('same numbers equal', () => {
			expect(colorEquals(196, 196)).toBe(true);
		});

		test('different numbers not equal', () => {
			expect(colorEquals(196, 21)).toBe(false);
		});

		test('rgb equals same rgb', () => {
			expect(colorEquals({ r: 255, g: 0, b: 0 }, { r: 255, g: 0, b: 0 })).toBe(true);
		});

		test('rgb !== different rgb', () => {
			expect(colorEquals({ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 })).toBe(false);
		});

		test('number !== rgb', () => {
			expect(colorEquals(196, { r: 255, g: 0, b: 0 })).toBe(false);
		});

		test('undefined equals null', () => {
			expect(colorEquals(undefined, null)).toBe(true);
			expect(colorEquals(null, undefined)).toBe(true);
		});
	});

	describe('attrsEquals', () => {
		test('empty attrs equal', () => {
			expect(attrsEquals({}, {})).toBe(true);
		});

		test('same attrs equal', () => {
			expect(attrsEquals({ bold: true }, { bold: true })).toBe(true);
		});

		test('missing attr equals false attr', () => {
			// false and undefined should both be falsy
			expect(attrsEquals({}, { bold: false })).toBe(true);
		});

		test('different attrs not equal', () => {
			expect(attrsEquals({ bold: true }, { italic: true })).toBe(false);
		});
	});

	describe('cellEquals', () => {
		test('identical cells equal', () => {
			const cell: Cell = {
				char: 'A',
				fg: 196,
				bg: null,
				attrs: { bold: true },
				wide: false,
				continuation: false,
			};
			expect(cellEquals(cell, { ...cell })).toBe(true);
		});

		test('different char not equal', () => {
			const a: Cell = {
				char: 'A',
				fg: null,
				bg: null,
				attrs: {},
				wide: false,
				continuation: false,
			};
			const b: Cell = {
				char: 'B',
				fg: null,
				bg: null,
				attrs: {},
				wide: false,
				continuation: false,
			};
			expect(cellEquals(a, b)).toBe(false);
		});
	});

	describe('styleEquals', () => {
		test('null styles equal', () => {
			expect(styleEquals(null, null)).toBe(true);
		});

		test('null !== non-null', () => {
			expect(styleEquals(null, { fg: null, bg: null, attrs: {} })).toBe(false);
		});

		test('same styles equal', () => {
			const style = { fg: 196 as Color, bg: null, attrs: { bold: true } };
			expect(styleEquals(style, { ...style })).toBe(true);
		});
	});

	describe('TerminalBuffer', () => {
		test('creates buffer with correct dimensions', () => {
			const buffer = new TerminalBuffer(80, 24);
			expect(buffer.width).toBe(80);
			expect(buffer.height).toBe(24);
		});

		test('inBounds checks coordinates', () => {
			const buffer = new TerminalBuffer(10, 5);
			expect(buffer.inBounds(0, 0)).toBe(true);
			expect(buffer.inBounds(9, 4)).toBe(true);
			expect(buffer.inBounds(10, 0)).toBe(false);
			expect(buffer.inBounds(0, 5)).toBe(false);
			expect(buffer.inBounds(-1, 0)).toBe(false);
		});

		test('getCell returns empty cell for new buffer', () => {
			const buffer = new TerminalBuffer(10, 5);
			const cell = buffer.getCell(0, 0);
			expect(cell.char).toBe(' ');
			expect(cell.fg).toBe(null);
			expect(cell.bg).toBe(null);
		});

		test('setCell and getCell round-trip', () => {
			const buffer = new TerminalBuffer(10, 5);
			buffer.setCell(3, 2, {
				char: 'X',
				fg: 196,
				bg: 21,
				attrs: { bold: true, underline: true },
				wide: false,
				continuation: false,
			});

			const cell = buffer.getCell(3, 2);
			expect(cell.char).toBe('X');
			expect(cell.fg).toBe(196);
			expect(cell.bg).toBe(21);
			expect(cell.attrs.bold).toBe(true);
			expect(cell.attrs.underline).toBe(true);
		});

		test('setCell with true color', () => {
			const buffer = new TerminalBuffer(10, 5);
			buffer.setCell(0, 0, {
				char: 'R',
				fg: { r: 255, g: 0, b: 0 },
				bg: { r: 0, g: 0, b: 128 },
				attrs: {},
			});

			const cell = buffer.getCell(0, 0);
			expect(cell.fg).toEqual({ r: 255, g: 0, b: 0 });
			expect(cell.bg).toEqual({ r: 0, g: 0, b: 128 });
		});

		test('fill fills region', () => {
			const buffer = new TerminalBuffer(10, 5);
			buffer.fill(2, 1, 3, 2, { char: '#', fg: 15 });

			// Inside region
			expect(buffer.getCell(2, 1).char).toBe('#');
			expect(buffer.getCell(4, 2).char).toBe('#');

			// Outside region
			expect(buffer.getCell(0, 0).char).toBe(' ');
			expect(buffer.getCell(5, 1).char).toBe(' ');
		});

		test('clear resets buffer', () => {
			const buffer = new TerminalBuffer(10, 5);
			buffer.setCell(5, 2, { char: 'X', fg: 196 });
			buffer.clear();

			const cell = buffer.getCell(5, 2);
			expect(cell.char).toBe(' ');
			expect(cell.fg).toBe(null);
		});

		test('clone creates independent copy', () => {
			const buffer = new TerminalBuffer(10, 5);
			buffer.setCell(0, 0, { char: 'A' });

			const clone = buffer.clone();
			clone.setCell(0, 0, { char: 'B' });

			expect(buffer.getCell(0, 0).char).toBe('A');
			expect(clone.getCell(0, 0).char).toBe('B');
		});

		test('copyFrom copies region', () => {
			const src = new TerminalBuffer(10, 5);
			src.setCell(0, 0, { char: '1' });
			src.setCell(1, 0, { char: '2' });
			src.setCell(0, 1, { char: '3' });

			const dst = new TerminalBuffer(10, 5);
			dst.copyFrom(src, 0, 0, 5, 2, 2, 2);

			expect(dst.getCell(5, 2).char).toBe('1');
			expect(dst.getCell(6, 2).char).toBe('2');
			expect(dst.getCell(5, 3).char).toBe('3');
		});

		test('cellEquals compares cells efficiently', () => {
			const a = new TerminalBuffer(10, 5);
			const b = new TerminalBuffer(10, 5);

			a.setCell(0, 0, { char: 'X', fg: 196 });
			b.setCell(0, 0, { char: 'X', fg: 196 });

			expect(a.cellEquals(0, 0, b)).toBe(true);

			b.setCell(0, 0, { char: 'Y', fg: 196 });
			expect(a.cellEquals(0, 0, b)).toBe(false);
		});

		test('getCell returns empty for out of bounds', () => {
			const buffer = new TerminalBuffer(10, 5);
			const cell = buffer.getCell(100, 100);
			expect(cell.char).toBe(' ');
		});

		test('setCell ignores out of bounds', () => {
			const buffer = new TerminalBuffer(10, 5);
			// Should not throw
			buffer.setCell(100, 100, { char: 'X' });
		});
	});

	describe('createBuffer', () => {
		test('creates buffer with default space char', () => {
			const buffer = createBuffer(10, 5);
			expect(buffer.getCell(0, 0).char).toBe(' ');
		});

		test('creates buffer with custom char', () => {
			const buffer = createBuffer(10, 5, '.');
			expect(buffer.getCell(0, 0).char).toBe('.');
			expect(buffer.getCell(9, 4).char).toBe('.');
		});
	});
});
