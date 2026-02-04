import { describe, expect, it } from 'vitest';
import { createAdaptiveTick, createFrameTick, createTick, take } from '../../src/runtime/index.js';

describe('runtime/tick', () => {
	describe('createTick()', () => {
		it('yields tick numbers at interval', async () => {
			const ticks = createTick(10);
			const result: number[] = [];

			for await (const tick of take(ticks, 3)) {
				result.push(tick);
			}

			expect(result).toEqual([0, 1, 2]);
		});

		it('stops when signal is aborted', async () => {
			const controller = new AbortController();
			const ticks = createTick(10, controller.signal);
			const result: number[] = [];

			setTimeout(() => controller.abort(), 25);

			for await (const tick of ticks) {
				result.push(tick);
			}

			// Should get 2-3 ticks before abort
			expect(result.length).toBeGreaterThan(0);
			expect(result.length).toBeLessThan(5);
		});

		it('handles already-aborted signal', async () => {
			const controller = new AbortController();
			controller.abort();

			const ticks = createTick(10, controller.signal);
			const result: number[] = [];

			for await (const tick of ticks) {
				result.push(tick);
			}

			expect(result).toEqual([]);
		});

		it('cleans up on early break', async () => {
			const ticks = createTick(10);
			let count = 0;

			for await (const tick of ticks) {
				count++;
				if (count >= 2) break;
			}

			expect(count).toBe(2);
		});
	});

	describe('createFrameTick()', () => {
		it('creates ~60fps tick source', async () => {
			const controller = new AbortController();
			const ticks = createFrameTick(controller.signal);
			const result: number[] = [];

			setTimeout(() => controller.abort(), 50);

			for await (const tick of ticks) {
				result.push(tick);
			}

			// At 16ms per tick, ~50ms should give us 2-4 ticks
			expect(result.length).toBeGreaterThan(0);
			expect(result.length).toBeLessThan(5);
		});
	});

	describe('createAdaptiveTick()', () => {
		it('provides timing information', async () => {
			const controller = new AbortController();
			const ticks = createAdaptiveTick(60, controller.signal);
			let frame: { tick: number; elapsed: number; delta: number } | undefined;

			setTimeout(() => controller.abort(), 50);

			for await (const f of ticks) {
				frame = f;
				if (f.tick >= 1) break;
			}

			expect(frame).toBeDefined();
			expect(frame!.tick).toBeGreaterThanOrEqual(0);
			expect(frame!.elapsed).toBeGreaterThan(0);
			expect(frame!.delta).toBeGreaterThan(0);
		});
	});
});
