/**
 * Tests for key parsing - parseKey() function.
 */

import { describe, expect, it } from 'vitest';
import { emptyKey, parseKey } from '../../src/runtime/keys.js';

describe('parseKey()', () => {
	describe('basic characters', () => {
		it('parses lowercase letters', () => {
			const [input, key] = parseKey('a');
			expect(input).toBe('a');
			expect(key.ctrl).toBe(false);
			expect(key.shift).toBe(false);
		});

		it('parses uppercase letters with shift', () => {
			const [input, key] = parseKey('A');
			expect(input).toBe('A');
			expect(key.shift).toBe(true);
		});

		it('parses numbers', () => {
			const [input, key] = parseKey('5');
			expect(input).toBe('5');
		});
	});

	describe('special keys', () => {
		it('parses return/enter', () => {
			const [input, key] = parseKey('\r');
			expect(input).toBe('');
			expect(key.return).toBe(true);
		});

		it('parses tab', () => {
			const [input, key] = parseKey('\t');
			expect(input).toBe('');
			expect(key.tab).toBe(true);
		});

		it('parses escape', () => {
			const [input, key] = parseKey('\x1b');
			expect(input).toBe('');
			expect(key.escape).toBe(true);
		});

		it('parses backspace', () => {
			const [input, key] = parseKey('\b');
			expect(input).toBe('');
			expect(key.backspace).toBe(true);
		});

		it('parses delete', () => {
			const [input, key] = parseKey('\x7f');
			expect(input).toBe('');
			expect(key.delete).toBe(true);
		});

		it('parses space', () => {
			const [input, key] = parseKey(' ');
			expect(input).toBe(' ');
		});
	});

	describe('arrow keys', () => {
		it('parses up arrow (xterm)', () => {
			const [input, key] = parseKey('\x1b[A');
			expect(input).toBe('');
			expect(key.upArrow).toBe(true);
		});

		it('parses down arrow (xterm)', () => {
			const [input, key] = parseKey('\x1b[B');
			expect(input).toBe('');
			expect(key.downArrow).toBe(true);
		});

		it('parses right arrow (xterm)', () => {
			const [input, key] = parseKey('\x1b[C');
			expect(input).toBe('');
			expect(key.rightArrow).toBe(true);
		});

		it('parses left arrow (xterm)', () => {
			const [input, key] = parseKey('\x1b[D');
			expect(input).toBe('');
			expect(key.leftArrow).toBe(true);
		});

		it('parses up arrow (gnome)', () => {
			const [input, key] = parseKey('\x1bOA');
			expect(key.upArrow).toBe(true);
		});

		it('parses down arrow (gnome)', () => {
			const [input, key] = parseKey('\x1bOB');
			expect(key.downArrow).toBe(true);
		});
	});

	describe('navigation keys', () => {
		it('parses home', () => {
			const [input, key] = parseKey('\x1b[H');
			expect(key.home).toBe(true);
		});

		it('parses end', () => {
			const [input, key] = parseKey('\x1b[F');
			expect(key.end).toBe(true);
		});

		it('parses page up', () => {
			const [input, key] = parseKey('\x1b[5~');
			expect(key.pageUp).toBe(true);
		});

		it('parses page down', () => {
			const [input, key] = parseKey('\x1b[6~');
			expect(key.pageDown).toBe(true);
		});

		it('parses delete (xterm)', () => {
			const [input, key] = parseKey('\x1b[3~');
			expect(key.delete).toBe(true);
		});
	});

	describe('ctrl modifier', () => {
		it('parses ctrl+c', () => {
			const [input, key] = parseKey('\x03');
			expect(input).toBe('c');
			expect(key.ctrl).toBe(true);
		});

		it('parses ctrl+a', () => {
			const [input, key] = parseKey('\x01');
			expect(input).toBe('a');
			expect(key.ctrl).toBe(true);
		});

		it('parses ctrl+z', () => {
			const [input, key] = parseKey('\x1a');
			expect(input).toBe('z');
			expect(key.ctrl).toBe(true);
		});
	});

	describe('meta/alt modifier', () => {
		it('parses meta+letter', () => {
			const [input, key] = parseKey('\x1ba');
			expect(key.meta).toBe(true);
		});

		it('parses escape as meta', () => {
			const [input, key] = parseKey('\x1b');
			expect(key.meta).toBe(true);
			expect(key.escape).toBe(true);
		});
	});

	describe('shift+tab', () => {
		it('parses shift+tab', () => {
			const [input, key] = parseKey('\x1b[Z');
			expect(key.tab).toBe(true);
			expect(key.shift).toBe(true);
		});
	});
});

describe('emptyKey()', () => {
	it('returns all false values', () => {
		const key = emptyKey();
		expect(key.upArrow).toBe(false);
		expect(key.downArrow).toBe(false);
		expect(key.leftArrow).toBe(false);
		expect(key.rightArrow).toBe(false);
		expect(key.pageDown).toBe(false);
		expect(key.pageUp).toBe(false);
		expect(key.home).toBe(false);
		expect(key.end).toBe(false);
		expect(key.return).toBe(false);
		expect(key.escape).toBe(false);
		expect(key.ctrl).toBe(false);
		expect(key.shift).toBe(false);
		expect(key.tab).toBe(false);
		expect(key.backspace).toBe(false);
		expect(key.delete).toBe(false);
		expect(key.meta).toBe(false);
	});
});
