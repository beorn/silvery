/**
 * Mode 3 Tests: Pure Functional Pattern
 *
 * Verifies that the Elm-style architecture works correctly:
 * - Reducer updates state properly
 * - View renders state to buffer
 * - Diff produces correct patches
 * - Events flow through the system correctly
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import type React from 'react';
import { Box, Text } from '../../src/index.js';
import {
	type Buffer,
	diff,
	ensureLayoutEngine,
	fromArray,
	layout,
	map,
	merge,
} from '../../src/runtime/index.js';

// ============================================================================
// Test State/Events/Reducer
// ============================================================================

interface State {
	count: number;
	items: string[];
}

type Event =
	| { type: 'increment' }
	| { type: 'decrement' }
	| { type: 'add'; item: string }
	| { type: 'reset' };

function reducer(state: State, event: Event): State {
	switch (event.type) {
		case 'increment':
			return { ...state, count: state.count + 1 };
		case 'decrement':
			return { ...state, count: state.count - 1 };
		case 'add':
			return { ...state, items: [...state.items, event.item] };
		case 'reset':
			return { count: 0, items: [] };
		default:
			return state;
	}
}

function view(state: State): React.ReactElement {
	return (
		<Box flexDirection="column">
			<Text>Count: {state.count}</Text>
			{state.items.map((item, i) => (
				<Text key={i}>- {item}</Text>
			))}
		</Box>
	);
}

// ============================================================================
// Tests
// ============================================================================

describe('Mode 3 (Pure Functional)', () => {
	beforeAll(async () => {
		await ensureLayoutEngine();
	});

	describe('reducer', () => {
		it('handles increment', () => {
			const state = { count: 0, items: [] };
			const newState = reducer(state, { type: 'increment' });
			expect(newState.count).toBe(1);
		});

		it('handles decrement', () => {
			const state = { count: 5, items: [] };
			const newState = reducer(state, { type: 'decrement' });
			expect(newState.count).toBe(4);
		});

		it('handles add', () => {
			const state = { count: 0, items: ['a'] };
			const newState = reducer(state, { type: 'add', item: 'b' });
			expect(newState.items).toEqual(['a', 'b']);
		});

		it('handles reset', () => {
			const state = { count: 10, items: ['a', 'b'] };
			const newState = reducer(state, { type: 'reset' });
			expect(newState).toEqual({ count: 0, items: [] });
		});

		it('is pure (returns same reference for unknown events)', () => {
			const state = { count: 0, items: [] };
			// @ts-expect-error - testing unknown event
			const newState = reducer(state, { type: 'unknown' });
			expect(newState).toBe(state);
		});
	});

	describe('view', () => {
		it('renders state to buffer', () => {
			const state = { count: 5, items: ['hello'] };
			const buffer = layout(view(state), { cols: 80, rows: 24 });

			expect(buffer.text).toContain('Count: 5');
			expect(buffer.text).toContain('hello');
		});

		it('handles empty state', () => {
			const state = { count: 0, items: [] };
			const buffer = layout(view(state), { cols: 80, rows: 24 });

			expect(buffer.text).toContain('Count: 0');
		});
	});

	describe('event loop simulation', () => {
		it('processes events and updates state', async () => {
			const dims = { cols: 80, rows: 24 };
			let state: State = { count: 0, items: [] };
			const renders: string[] = [];

			// Simulate events
			const events = fromArray<Event>([
				{ type: 'increment' },
				{ type: 'increment' },
				{ type: 'add', item: 'item1' },
				{ type: 'decrement' },
			]);

			let prevBuffer: Buffer | null = null;

			// Initial render
			prevBuffer = layout(view(state), dims);
			renders.push(prevBuffer.text);

			// Process events
			for await (const event of events) {
				state = reducer(state, event);
				const buffer = layout(view(state), dims);
				const patch = diff(prevBuffer, buffer);
				renders.push(buffer.text);
				prevBuffer = buffer;
			}

			// Final state should be correct
			expect(state.count).toBe(1); // +1 +1 -1 = 1
			expect(state.items).toEqual(['item1']);

			// Should have rendered 5 times (initial + 4 events)
			expect(renders.length).toBe(5);
		});

		it('handles 1000 events correctly (stress test)', async () => {
			const dims = { cols: 80, rows: 24 };
			let state: State = { count: 0, items: [] };
			let renderCount = 0;

			// Generate 1000 increment events
			const events = fromArray<Event>(
				Array.from({ length: 1000 }, () => ({ type: 'increment' as const })),
			);

			let prevBuffer: Buffer | null = null;

			// Initial render
			prevBuffer = layout(view(state), dims);
			renderCount++;

			// Process events
			for await (const event of events) {
				state = reducer(state, event);
				const buffer = layout(view(state), dims);
				diff(prevBuffer, buffer); // Compute diff (don't need to output)
				prevBuffer = buffer;
				renderCount++;
			}

			// Verify: 1000 events → exactly 1001 renders (initial + 1000)
			expect(state.count).toBe(1000);
			expect(renderCount).toBe(1001);
		});

		it('merges multiple event sources', async () => {
			const dims = { cols: 80, rows: 24 };
			let state: State = { count: 0, items: [] };

			// Two event sources
			const increments = fromArray<Event>([{ type: 'increment' }, { type: 'increment' }]);
			const adds = fromArray<Event>([
				{ type: 'add', item: 'a' },
				{ type: 'add', item: 'b' },
			]);

			// Merge them
			const events = merge(increments, adds);

			// Process all events
			for await (const event of events) {
				state = reducer(state, event);
			}

			// All events should have been processed
			expect(state.count).toBe(2);
			expect(state.items.length).toBe(2);
		});

		it('maps events from different sources', async () => {
			const dims = { cols: 80, rows: 24 };
			let state: State = { count: 0, items: [] };

			// Raw key events
			const keys = fromArray(['j', 'j', 'k', 'a']);

			// Map to domain events
			const events = map(keys, (key): Event => {
				switch (key) {
					case 'j':
						return { type: 'increment' };
					case 'k':
						return { type: 'decrement' };
					default:
						return { type: 'add', item: key };
				}
			});

			// Process
			for await (const event of events) {
				state = reducer(state, event);
			}

			expect(state.count).toBe(1); // j, j, k → +1 +1 -1 = 1
			expect(state.items).toEqual(['a']);
		});
	});
});
