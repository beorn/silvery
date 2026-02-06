import { describe, expect, test } from 'vitest';
import { keyToAnsi } from '../src/keys.js';

describe('keyToAnsi', () => {
	describe('single characters', () => {
		test('lowercase letter', () => {
			expect(keyToAnsi('a')).toBe('a');
		});

		test('uppercase letter', () => {
			expect(keyToAnsi('A')).toBe('A');
		});

		test('number', () => {
			expect(keyToAnsi('5')).toBe('5');
		});

		test('special character', () => {
			expect(keyToAnsi('!')).toBe('!');
		});
	});

	describe('named keys', () => {
		test('Enter', () => {
			expect(keyToAnsi('Enter')).toBe('\r');
		});

		test('Escape', () => {
			expect(keyToAnsi('Escape')).toBe('\x1b');
		});

		test('Tab', () => {
			expect(keyToAnsi('Tab')).toBe('\t');
		});

		test('Space', () => {
			expect(keyToAnsi('Space')).toBe(' ');
		});

		test('Backspace', () => {
			expect(keyToAnsi('Backspace')).toBe('\x08');
		});

		test('Delete', () => {
			expect(keyToAnsi('Delete')).toBe('\x7f');
		});

		test('ArrowUp', () => {
			expect(keyToAnsi('ArrowUp')).toBe('\x1b[A');
		});

		test('ArrowDown', () => {
			expect(keyToAnsi('ArrowDown')).toBe('\x1b[B');
		});

		test('ArrowLeft', () => {
			expect(keyToAnsi('ArrowLeft')).toBe('\x1b[D');
		});

		test('ArrowRight', () => {
			expect(keyToAnsi('ArrowRight')).toBe('\x1b[C');
		});

		test('Home', () => {
			expect(keyToAnsi('Home')).toBe('\x1b[H');
		});

		test('End', () => {
			expect(keyToAnsi('End')).toBe('\x1b[F');
		});

		test('PageUp', () => {
			expect(keyToAnsi('PageUp')).toBe('\x1b[5~');
		});

		test('PageDown', () => {
			expect(keyToAnsi('PageDown')).toBe('\x1b[6~');
		});
	});

	describe('modifier combos', () => {
		test('Control+c produces ETX (0x03)', () => {
			expect(keyToAnsi('Control+c')).toBe('\x03');
		});

		test('Control+a produces SOH (0x01)', () => {
			expect(keyToAnsi('Control+a')).toBe('\x01');
		});

		test('Control+z produces SUB (0x1a)', () => {
			expect(keyToAnsi('Control+z')).toBe('\x1a');
		});

		test('Control+uppercase letter works', () => {
			expect(keyToAnsi('Control+C')).toBe('\x03');
		});

		test('Control with named key returns base key', () => {
			expect(keyToAnsi('Control+Enter')).toBe('\r');
		});
	});

	describe('modifier aliases', () => {
		test('ctrl+c works like Control+c', () => {
			expect(keyToAnsi('ctrl+c')).toBe('\x03');
		});

		test('ctrl+a works like Control+a', () => {
			expect(keyToAnsi('ctrl+a')).toBe('\x01');
		});

		test('Ctrl+c (capitalized) works', () => {
			expect(keyToAnsi('Ctrl+c')).toBe('\x03');
		});

		test('alt+x produces ESC+x', () => {
			expect(keyToAnsi('alt+x')).toBe('\x1bx');
		});

		test('meta+x produces ESC+x', () => {
			expect(keyToAnsi('meta+x')).toBe('\x1bx');
		});

		test('cmd+x produces ESC+x (macOS alias)', () => {
			expect(keyToAnsi('cmd+x')).toBe('\x1bx');
		});

		test('option+x produces ESC+x (macOS alias)', () => {
			expect(keyToAnsi('option+x')).toBe('\x1bx');
		});

		test('shift+Tab works like Shift+Tab', () => {
			expect(keyToAnsi('shift+Tab')).toBe(keyToAnsi('Shift+Tab'));
		});
	});

	describe('unknown keys', () => {
		test('unknown named key passes through', () => {
			expect(keyToAnsi('UnknownKey')).toBe('UnknownKey');
		});

		test('modifier-only key is stripped', () => {
			// When only modifier is specified, mainKey becomes the modifier name
			expect(keyToAnsi('Control')).toBe('Control');
		});
	});
});
