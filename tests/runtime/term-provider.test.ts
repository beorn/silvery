/**
 * Tests for createTermProvider - terminal as a Provider.
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type TermProvider, createTermProvider } from '../../src/runtime/term-provider.js';

// Mock stdin/stdout
function createMockStreams() {
	const stdin = new EventEmitter() as NodeJS.ReadStream & {
		isTTY: boolean;
		setRawMode: (mode: boolean) => void;
		resume: () => void;
		pause: () => void;
		setEncoding: (enc: string) => void;
	};
	stdin.isTTY = true;
	stdin.setRawMode = () => {};
	stdin.resume = () => {};
	stdin.pause = () => {};
	stdin.setEncoding = () => {};

	const stdout = new EventEmitter() as NodeJS.WriteStream & {
		columns: number;
		rows: number;
	};
	stdout.columns = 80;
	stdout.rows = 24;

	return { stdin, stdout };
}

describe('createTermProvider()', () => {
	describe('state', () => {
		it('returns initial dimensions from stdout', () => {
			const { stdin, stdout } = createMockStreams();
			stdout.columns = 120;
			stdout.rows = 40;

			const term = createTermProvider(stdin, stdout);

			expect(term.getState()).toEqual({ cols: 120, rows: 40 });
			term[Symbol.dispose]();
		});

		it('uses options for initial dimensions if provided', () => {
			const { stdin, stdout } = createMockStreams();

			const term = createTermProvider(stdin, stdout, { cols: 100, rows: 30 });

			expect(term.getState()).toEqual({ cols: 100, rows: 30 });
			term[Symbol.dispose]();
		});

		it('notifies subscribers on resize', () => {
			const { stdin, stdout } = createMockStreams();
			const term = createTermProvider(stdin, stdout);

			const states: { cols: number; rows: number }[] = [];
			term.subscribe((state) => states.push(state));

			// Simulate resize
			stdout.columns = 100;
			stdout.rows = 50;
			stdout.emit('resize');

			expect(states).toHaveLength(1);
			expect(states[0]).toEqual({ cols: 100, rows: 50 });

			term[Symbol.dispose]();
		});

		it('unsubscribe stops notifications', () => {
			const { stdin, stdout } = createMockStreams();
			const term = createTermProvider(stdin, stdout);

			const states: { cols: number; rows: number }[] = [];
			const unsub = term.subscribe((state) => states.push(state));

			unsub();

			stdout.columns = 100;
			stdout.emit('resize');

			expect(states).toHaveLength(0);

			term[Symbol.dispose]();
		});
	});

	describe('events', () => {
		it('yields key events', async () => {
			const { stdin, stdout } = createMockStreams();
			const term = createTermProvider(stdin, stdout);

			const events: unknown[] = [];
			const iterator = term.events()[Symbol.asyncIterator]();

			// Emit a key
			setTimeout(() => stdin.emit('data', 'a'), 10);

			const result = await iterator.next();
			events.push(result.value);

			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				type: 'key',
				data: { input: 'a' },
			});

			term[Symbol.dispose]();
		});

		it('yields resize events', async () => {
			const { stdin, stdout } = createMockStreams();
			const term = createTermProvider(stdin, stdout);

			const events: unknown[] = [];
			const iterator = term.events()[Symbol.asyncIterator]();

			// Emit resize
			setTimeout(() => {
				stdout.columns = 100;
				stdout.rows = 50;
				stdout.emit('resize');
			}, 10);

			const result = await iterator.next();
			events.push(result.value);

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({
				type: 'resize',
				data: { cols: 100, rows: 50 },
			});

			term[Symbol.dispose]();
		});

		it('parses arrow keys', async () => {
			const { stdin, stdout } = createMockStreams();
			const term = createTermProvider(stdin, stdout);

			const iterator = term.events()[Symbol.asyncIterator]();

			// Emit up arrow
			setTimeout(() => stdin.emit('data', '\x1b[A'), 10);

			const result = await iterator.next();

			expect(result.value).toMatchObject({
				type: 'key',
				data: {
					input: '',
					key: { upArrow: true },
				},
			});

			term[Symbol.dispose]();
		});

		it('stops on dispose', async () => {
			const { stdin, stdout } = createMockStreams();
			const term = createTermProvider(stdin, stdout);

			const iterator = term.events()[Symbol.asyncIterator]();

			// Dispose after short delay
			setTimeout(() => term[Symbol.dispose](), 10);

			const result = await iterator.next();

			expect(result.done).toBe(true);
		});
	});

	describe('cleanup', () => {
		it('dispose is idempotent', () => {
			const { stdin, stdout } = createMockStreams();
			const term = createTermProvider(stdin, stdout);

			term[Symbol.dispose]();
			term[Symbol.dispose]();
			term[Symbol.dispose]();

			// No error thrown
			expect(true).toBe(true);
		});

		it('clears subscribers on dispose', () => {
			const { stdin, stdout } = createMockStreams();
			const term = createTermProvider(stdin, stdout);

			const states: unknown[] = [];
			term.subscribe((state) => states.push(state));

			term[Symbol.dispose]();

			// After dispose, resize shouldn't notify
			stdout.columns = 100;
			stdout.emit('resize');

			expect(states).toHaveLength(0);
		});
	});
});
