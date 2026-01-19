/**
 * Inkx Render Tests
 *
 * Basic tests for the render function and testing library.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { cleanup, render } from '../src/testing/index.js';
import { expectFrame, normalizeFrame, stripAnsi } from './setup.js';

// Cleanup after each test
afterEach(() => {
	cleanup();
});

describe('render', () => {
	describe('basic rendering', () => {
		it('renders a simple string', () => {
			const { lastFrame } = render(createElement('text', null, 'Hello, World!'));

			expect(lastFrame()).toBeDefined();
			expectFrame(lastFrame()).toContain('Hello, World!');
		});

		it('renders nested elements', () => {
			const element = createElement(
				'box',
				null,
				createElement('text', null, 'Line 1'),
				createElement('text', null, 'Line 2'),
			);

			const { lastFrame } = render(element);

			expectFrame(lastFrame()).toContain('Line 1');
			expectFrame(lastFrame()).toContain('Line 2');
		});

		it('returns undefined lastFrame when no frames exist', () => {
			const { lastFrame, clear } = render(createElement('text', null, 'Hello'));
			clear();
			expect(lastFrame()).toBeUndefined();
		});
	});

	describe('frames tracking', () => {
		it('tracks all rendered frames', () => {
			const { frames, rerender } = render(createElement('text', null, 'Frame 1'));

			expect(frames).toHaveLength(1);

			rerender(createElement('text', null, 'Frame 2'));
			expect(frames).toHaveLength(2);

			rerender(createElement('text', null, 'Frame 3'));
			expect(frames).toHaveLength(3);
		});

		it('frames array contains actual content', () => {
			const { frames, rerender } = render(createElement('text', null, 'First'));

			rerender(createElement('text', null, 'Second'));
			rerender(createElement('text', null, 'Third'));

			expect(normalizeFrame(frames[0])).toContain('First');
			expect(normalizeFrame(frames[1])).toContain('Second');
			expect(normalizeFrame(frames[2])).toContain('Third');
		});

		it('clear() empties the frames array', () => {
			const { frames, clear, rerender } = render(createElement('text', null, 'Initial'));

			rerender(createElement('text', null, 'More'));
			expect(frames).toHaveLength(2);

			clear();
			expect(frames).toHaveLength(0);
		});
	});

	describe('rerender', () => {
		it('updates content on rerender', () => {
			const { lastFrame, rerender } = render(createElement('text', null, 'Before'));

			expectFrame(lastFrame()).toContain('Before');

			rerender(createElement('text', null, 'After'));

			expectFrame(lastFrame()).toContain('After');
		});

		it('throws when rerendering after unmount', () => {
			const { unmount, rerender } = render(createElement('text', null, 'Test'));

			unmount();

			expect(() => {
				rerender(createElement('text', null, 'Should fail'));
			}).toThrow('Cannot rerender after unmount');
		});
	});

	describe('unmount', () => {
		it('unmounts successfully', () => {
			const { unmount, lastFrame } = render(createElement('text', null, 'Content'));

			unmount();

			// lastFrame should still return the last rendered content
			expectFrame(lastFrame()).toContain('Content');
		});

		it('throws when unmounting twice', () => {
			const { unmount } = render(createElement('text', null, 'Test'));

			unmount();

			expect(() => {
				unmount();
			}).toThrow('Already unmounted');
		});
	});

	describe('stdin', () => {
		it('provides stdin.write method', () => {
			const { stdin } = render(createElement('text', null, 'Test'));

			expect(typeof stdin.write).toBe('function');
		});

		it('throws when writing after unmount', () => {
			const { stdin, unmount } = render(createElement('text', null, 'Test'));

			unmount();

			expect(() => {
				stdin.write('input');
			}).toThrow('Cannot write to stdin after unmount');
		});
	});

	describe('options', () => {
		it('accepts columns option', () => {
			const { lastFrame } = render(createElement('text', null, 'Test'), {
				columns: 40,
			});

			expect(lastFrame()).toBeDefined();
		});

		it('accepts rows option', () => {
			const { lastFrame } = render(createElement('text', null, 'Test'), {
				rows: 10,
			});

			expect(lastFrame()).toBeDefined();
		});

		it('accepts debug option', () => {
			// Debug mode should not throw
			const { lastFrame } = render(createElement('text', null, 'Test'), {
				debug: false,
			});

			expect(lastFrame()).toBeDefined();
		});
	});
});

describe('test utilities', () => {
	describe('stripAnsi', () => {
		it('removes ANSI color codes', () => {
			const colored = '\x1B[31mRed\x1B[0m';
			expect(stripAnsi(colored)).toBe('Red');
		});

		it('removes multiple ANSI codes', () => {
			const styled = '\x1B[1m\x1B[32mBold Green\x1B[0m';
			expect(stripAnsi(styled)).toBe('Bold Green');
		});

		it('preserves plain text', () => {
			const plain = 'No styling here';
			expect(stripAnsi(plain)).toBe('No styling here');
		});
	});

	describe('normalizeFrame', () => {
		it('strips ANSI and trims whitespace', () => {
			const frame = '\x1B[32mHello\x1B[0m   \n  World  \n';
			expect(normalizeFrame(frame)).toBe('Hello\n  World');
		});

		it('removes trailing empty lines', () => {
			const frame = 'Content\n\n\n';
			expect(normalizeFrame(frame)).toBe('Content');
		});
	});

	describe('expectFrame', () => {
		it('provides toContain matcher', () => {
			const frame = 'Hello, World!';
			expectFrame(frame).toContain('World');
		});

		it('provides toBe matcher', () => {
			const frame = 'Exact match';
			expectFrame(frame).toBe('Exact match');
		});

		it('provides toMatch matcher', () => {
			const frame = 'Test 123';
			expectFrame(frame).toMatch(/Test \d+/);
		});

		it('handles undefined frame', () => {
			expectFrame(undefined).toBeEmpty();
		});
	});
});

describe('cleanup', () => {
	it('is a function', () => {
		expect(typeof cleanup).toBe('function');
	});

	it('can be called multiple times', () => {
		cleanup();
		cleanup();
		// Should not throw
	});
});
