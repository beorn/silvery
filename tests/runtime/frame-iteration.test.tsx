/**
 * Tests for app.run() frame iteration (AsyncIterable<Buffer>).
 */

import { describe, expect, it } from 'bun:test';
import React from 'react';
import { Text } from '../../src/index.js';
import { createApp, useApp, type Key } from '../../src/runtime/index.js';
import type { Provider, ProviderEvent, Dims } from '../../src/runtime/types.js';

/**
 * Minimal test provider that yields a fixed sequence of key events.
 * Implements the Provider interface so createApp treats it as a real provider.
 */
function createTestProvider(keys: string[]): Provider<
	{ cols: number; rows: number },
	{ key: { input: string; key: Key } }
> {
	const state = { cols: 80, rows: 24 };
	const listeners = new Set<(s: typeof state) => void>();
	let disposed = false;

	const emptyKey: Key = {
		upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
		pageDown: false, pageUp: false, home: false, end: false,
		return: false, escape: false, ctrl: false, shift: false,
		tab: false, backspace: false, delete: false, meta: false,
	};

	return {
		getState: () => state,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async *events() {
			for (const input of keys) {
				if (disposed) break;
				yield {
					type: 'key' as const,
					data: { input, key: { ...emptyKey } },
				};
			}
		},
		[Symbol.dispose]() {
			disposed = true;
			listeners.clear();
		},
	};
}

describe('app.run() frame iteration', () => {
	it('yields frames via for-await', async () => {
		const app = createApp(
			() => (set) => ({
				count: 0,
			}),
			{
				key: (input, key, { set }) => {
					if (input === 'j') set((s) => ({ count: s.count + 1 }));
				},
			}
		);

		const term = createTestProvider(['j', 'j', 'j']);
		const frames: string[] = [];

		for await (const frame of app.run(<Counter />, { cols: 80, rows: 24, term })) {
			frames.push(frame.text);
		}

		expect(frames.length).toBe(3);
		expect(frames[0]).toContain('Count: 1');
		expect(frames[1]).toContain('Count: 2');
		expect(frames[2]).toContain('Count: 3');
	});

	it('is backward compatible with await', async () => {
		const app = createApp(
			() => () => ({
				message: 'Hello',
			})
		);

		const handle = await app.run(<Message />, { cols: 80, rows: 24 });
		expect(handle.text).toContain('Hello');
		handle.unmount();
	});

	it('supports press() on awaited handle', async () => {
		const app = createApp(
			() => (set) => ({
				count: 0,
			}),
			{
				key: (input, key, { set }) => {
					if (input === 'j') set((s) => ({ count: s.count + 1 }));
				},
			}
		);

		const handle = await app.run(<Counter />, { cols: 80, rows: 24 });
		expect(handle.text).toContain('Count: 0');

		await handle.press('j');
		await new Promise((r) => setTimeout(r, 10));
		expect(handle.text).toContain('Count: 1');

		handle.unmount();
	});

	it('breaks from frame iteration cleanly', async () => {
		const app = createApp(
			() => (set) => ({
				count: 0,
			}),
			{
				key: (input, key, { set }) => {
					if (input === 'j') set((s) => ({ count: s.count + 1 }));
				},
			}
		);

		const term = createTestProvider(['j', 'j', 'j', 'j', 'j']);
		let frameCount = 0;

		for await (const frame of app.run(<Counter />, { cols: 80, rows: 24, term })) {
			frameCount++;
			if (frameCount >= 2) break; // Early exit
		}

		expect(frameCount).toBe(2);
	});
});

// Helper components
function Counter() {
	const count = useApp((s: { count: number }) => s.count);
	return <Text>Count: {count}</Text>;
}

function Message() {
	const message = useApp((s: { message: string }) => s.message);
	return <Text>{message}</Text>;
}
