import { describe, expect, it } from 'vitest';
import {
	batch,
	concat,
	debounce,
	filter,
	filterMap,
	fromArray,
	fromArrayWithDelay,
	map,
	merge,
	take,
	takeUntil,
	throttle,
	zip,
} from '../../src/streams/index.js';

describe('streams', () => {
	describe('fromArray', () => {
		it('yields all items', async () => {
			const items = [1, 2, 3];
			const result: number[] = [];
			for await (const item of fromArray(items)) {
				result.push(item);
			}
			expect(result).toEqual([1, 2, 3]);
		});

		it('handles empty array', async () => {
			const result: number[] = [];
			for await (const item of fromArray([])) {
				result.push(item);
			}
			expect(result).toEqual([]);
		});
	});

	describe('map', () => {
		it('transforms each value', async () => {
			const source = fromArray([1, 2, 3]);
			const result: number[] = [];
			for await (const item of map(source, (x) => x * 2)) {
				result.push(item);
			}
			expect(result).toEqual([2, 4, 6]);
		});

		it('handles early break', async () => {
			const source = fromArray([1, 2, 3, 4, 5]);
			const result: number[] = [];
			for await (const item of map(source, (x) => x * 2)) {
				result.push(item);
				if (result.length === 2) break;
			}
			expect(result).toEqual([2, 4]);
		});
	});

	describe('filter', () => {
		it('filters values', async () => {
			const source = fromArray([1, 2, 3, 4, 5]);
			const result: number[] = [];
			for await (const item of filter(source, (x) => x % 2 === 0)) {
				result.push(item);
			}
			expect(result).toEqual([2, 4]);
		});

		it('handles all filtered out', async () => {
			const source = fromArray([1, 3, 5]);
			const result: number[] = [];
			for await (const item of filter(source, (x) => x % 2 === 0)) {
				result.push(item);
			}
			expect(result).toEqual([]);
		});
	});

	describe('filterMap', () => {
		it('filters and maps in one pass', async () => {
			const source = fromArray([1, 2, 3, 4, 5]);
			const result: string[] = [];
			for await (const item of filterMap(source, (x) => (x % 2 === 0 ? `even:${x}` : undefined))) {
				result.push(item);
			}
			expect(result).toEqual(['even:2', 'even:4']);
		});
	});

	describe('take', () => {
		it('takes first n values', async () => {
			const source = fromArray([1, 2, 3, 4, 5]);
			const result: number[] = [];
			for await (const item of take(source, 3)) {
				result.push(item);
			}
			expect(result).toEqual([1, 2, 3]);
		});

		it('handles count > source length', async () => {
			const source = fromArray([1, 2]);
			const result: number[] = [];
			for await (const item of take(source, 10)) {
				result.push(item);
			}
			expect(result).toEqual([1, 2]);
		});

		it('handles count = 0', async () => {
			const source = fromArray([1, 2, 3]);
			const result: number[] = [];
			for await (const item of take(source, 0)) {
				result.push(item);
			}
			expect(result).toEqual([]);
		});
	});

	describe('takeUntil', () => {
		it('stops when signal aborts', async () => {
			const controller = new AbortController();
			const source = fromArrayWithDelay([1, 2, 3, 4, 5], 10);
			const result: number[] = [];

			setTimeout(() => controller.abort(), 25);

			for await (const item of takeUntil(source, controller.signal)) {
				result.push(item);
			}

			// Should get 2-3 items before abort
			expect(result.length).toBeLessThan(5);
			expect(result.length).toBeGreaterThan(0);
		});

		it('handles already-aborted signal', async () => {
			const controller = new AbortController();
			controller.abort();

			const source = fromArray([1, 2, 3]);
			const result: number[] = [];

			for await (const item of takeUntil(source, controller.signal)) {
				result.push(item);
			}

			expect(result).toEqual([]);
		});
	});

	describe('merge', () => {
		it('merges multiple sources', async () => {
			const source1 = fromArray([1, 2]);
			const source2 = fromArray([3, 4]);
			const result: number[] = [];

			for await (const item of merge(source1, source2)) {
				result.push(item);
			}

			// All items present (order may vary)
			expect(result.sort()).toEqual([1, 2, 3, 4]);
		});

		it('handles empty sources array', async () => {
			const result: number[] = [];
			for await (const item of merge<number>()) {
				result.push(item);
			}
			expect(result).toEqual([]);
		});

		it('handles early break and cleans up', async () => {
			const source1 = fromArray([1, 2, 3]);
			const source2 = fromArray([4, 5, 6]);
			const result: number[] = [];

			for await (const item of merge(source1, source2)) {
				result.push(item);
				if (result.length === 2) break;
			}

			expect(result.length).toBe(2);
		});

		it('preserves arrival order with delays', async () => {
			// source1 emits at 10, 30, 50
			// source2 emits at 0, 20, 40
			const source1 = (async function* () {
				await new Promise((r) => setTimeout(r, 10));
				yield 'a';
				await new Promise((r) => setTimeout(r, 20));
				yield 'c';
				await new Promise((r) => setTimeout(r, 20));
				yield 'e';
			})();

			const source2 = (async function* () {
				yield 'b';
				await new Promise((r) => setTimeout(r, 20));
				yield 'd';
				await new Promise((r) => setTimeout(r, 20));
				yield 'f';
			})();

			const result: string[] = [];
			for await (const item of merge(source1, source2)) {
				result.push(item);
			}

			// First item should be 'b' (immediate), then 'a' (after 10ms)
			expect(result[0]).toBe('b');
			expect(result[1]).toBe('a');
			expect(result.length).toBe(6);
		});
	});

	describe('concat', () => {
		it('concatenates sources in order', async () => {
			const source1 = fromArray([1, 2]);
			const source2 = fromArray([3, 4]);
			const result: number[] = [];

			for await (const item of concat(source1, source2)) {
				result.push(item);
			}

			expect(result).toEqual([1, 2, 3, 4]);
		});
	});

	describe('zip', () => {
		it('zips sources together', async () => {
			const source1 = fromArray([1, 2, 3]);
			const source2 = fromArray(['a', 'b', 'c']);
			const result: [number, string][] = [];

			for await (const item of zip(source1, source2)) {
				result.push(item);
			}

			expect(result).toEqual([
				[1, 'a'],
				[2, 'b'],
				[3, 'c'],
			]);
		});

		it('stops at shortest source', async () => {
			const source1 = fromArray([1, 2]);
			const source2 = fromArray(['a', 'b', 'c', 'd']);
			const result: [number, string][] = [];

			for await (const item of zip(source1, source2)) {
				result.push(item);
			}

			expect(result).toEqual([
				[1, 'a'],
				[2, 'b'],
			]);
		});
	});

	describe('batch', () => {
		it('batches items', async () => {
			const source = fromArray([1, 2, 3, 4, 5]);
			const result: number[][] = [];

			for await (const item of batch(source, 2)) {
				result.push(item);
			}

			expect(result).toEqual([[1, 2], [3, 4], [5]]);
		});

		it('throws on invalid size', async () => {
			expect(() => batch(fromArray([1, 2]), 0)).toThrow();
		});
	});

	describe('throttle', () => {
		it('throttles high frequency', async () => {
			const source = fromArrayWithDelay([1, 2, 3, 4, 5], 10);
			const result: number[] = [];

			for await (const item of throttle(source, 25)) {
				result.push(item);
			}

			// With 10ms delay between items and 25ms throttle,
			// we should get roughly every 3rd item
			expect(result.length).toBeLessThan(5);
			expect(result[0]).toBe(1); // First always emitted
		});
	});

	describe('debounce', () => {
		it('yields only final value after source completes', async () => {
			const source = fromArray([1, 2, 3]);
			const result: number[] = [];

			for await (const item of debounce(source, 10)) {
				result.push(item);
			}

			// With pull-based debounce, we get the last value after source ends
			expect(result).toEqual([3]);
		});

		it('handles empty source', async () => {
			const source = fromArray<number>([]);
			const result: number[] = [];

			for await (const item of debounce(source, 10)) {
				result.push(item);
			}

			expect(result).toEqual([]);
		});
	});

	describe('composition', () => {
		it('chains multiple operations', async () => {
			const source = fromArray([1, 2, 3, 4, 5]);
			const result: string[] = [];

			const processed = map(
				filter(source, (x) => x % 2 === 0),
				(x) => `value:${x}`,
			);

			for await (const item of processed) {
				result.push(item);
			}

			expect(result).toEqual(['value:2', 'value:4']);
		});

		it('handles merge with map', async () => {
			const keys = map(fromArray(['j', 'k']), (k) => ({
				type: 'key' as const,
				key: k,
			}));
			const resizes = map(fromArray([{ cols: 80, rows: 24 }]), (r) => ({
				type: 'resize' as const,
				...r,
			}));

			const result: Array<
				{ type: 'key'; key: string } | { type: 'resize'; cols: number; rows: number }
			> = [];

			for await (const item of merge(keys, resizes)) {
				result.push(item);
			}

			expect(result.length).toBe(3);
			expect(result.some((e) => e.type === 'key')).toBe(true);
			expect(result.some((e) => e.type === 'resize')).toBe(true);
		});
	});
});
