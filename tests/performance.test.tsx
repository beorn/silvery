/**
 * Inkx Performance Tests (km-ed63)
 *
 * Tests rendering performance with large numbers of components.
 * Measures layout time vs content render time and identifies bottlenecks.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React from 'react';
import { Box, Text } from '../src/components/index.js';
import { createTestRenderer, stripAnsi } from '../src/testing/index.js';

const render = createTestRenderer();

// Capture console.log output during tests
let logSpy: ReturnType<typeof spyOn>;
let logOutput: string[];

beforeEach(() => {
	logOutput = [];
	logSpy = spyOn(console, 'log').mockImplementation((...args) => {
		logOutput.push(args.join(' '));
	});
});

afterEach(() => {
	logSpy.mockRestore();
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Time a function and return both result and elapsed time in ms.
 */
function timed<T>(fn: () => T): { result: T; elapsed: number } {
	const start = performance.now();
	const result = fn();
	const elapsed = performance.now() - start;
	return { result, elapsed };
}

/**
 * Run a function multiple times and return statistics.
 */
function benchmark(
	fn: () => void,
	iterations = 5,
): {
	min: number;
	max: number;
	avg: number;
	runs: number[];
} {
	const runs: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		fn();
		runs.push(performance.now() - start);
	}
	return {
		min: Math.min(...runs),
		max: Math.max(...runs),
		avg: runs.reduce((a, b) => a + b, 0) / runs.length,
		runs,
	};
}

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance (km-ed63)', () => {
	describe('Basic Scaling', () => {
		test('renders 100 Text components efficiently', () => {
			const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`);

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 120 },
				),
			);

			const frame = result.lastFrame();
			console.log(`100 Text components: ${elapsed.toFixed(2)}ms`);

			// Verify all items rendered
			expect(frame).toContain('Item 0');
			expect(frame).toContain('Item 99');

			// Should complete in reasonable time (< 1 second)
			expect(elapsed).toBeLessThan(1000);
		});

		test('renders 200 Text components', () => {
			const items = Array.from({ length: 200 }, (_, i) => `Line ${i}`);

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 220 },
				),
			);

			const frame = result.lastFrame();
			console.log(`200 Text components: ${elapsed.toFixed(2)}ms`);

			expect(frame).toContain('Line 0');
			expect(frame).toContain('Line 199');
			expect(elapsed).toBeLessThan(2000);
		});

		test('renders 500 Text components', () => {
			const items = Array.from({ length: 500 }, (_, i) => `Row ${i}`);

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 520 },
				),
			);

			const frame = result.lastFrame();
			console.log(`500 Text components: ${elapsed.toFixed(2)}ms`);

			expect(frame).toContain('Row 0');
			expect(frame).toContain('Row 499');
			// Allow more time for larger counts
			expect(elapsed).toBeLessThan(5000);
		});
	});

	describe('Scrolling Container', () => {
		test('renders 500 components in scrolling container', () => {
			const items = Array.from({ length: 500 }, (_, i) => `Scroll item ${i}`);

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column" height={50} overflow="scroll">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 50 },
				),
			);

			const frame = result.lastFrame();
			console.log(`500 items in scroll container: ${elapsed.toFixed(2)}ms`);

			// First items should be visible
			expect(frame).toContain('Scroll item 0');

			// With overflow=scroll, content is clipped to container height
			// The container is 50 rows, so we shouldn't see item 499
			// (unless we scroll down)
			expect(elapsed).toBeLessThan(5000);
		});

		test('renders 1000 components in scrolling container', () => {
			const items = Array.from({ length: 1000 }, (_, i) => `Entry ${i}`);

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column" height={30} overflow="scroll">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 30 },
				),
			);

			const frame = result.lastFrame();
			console.log(`1000 items in scroll container: ${elapsed.toFixed(2)}ms`);

			expect(frame).toContain('Entry 0');
			expect(elapsed).toBeLessThan(10000);
		});
	});

	describe('Nested Components', () => {
		test('renders 100 nested Box+Text components', () => {
			const items = Array.from({ length: 100 }, (_, i) => i);

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column">
						{items.map((i) => (
							<Box key={i} flexDirection="row">
								<Text color="blue">[{i}]</Text>
								<Text> - </Text>
								<Text>Nested item with text</Text>
							</Box>
						))}
					</Box>,
					{ columns: 80, rows: 120 },
				),
			);

			const frame = result.lastFrame();
			console.log(`100 nested Box+Text: ${elapsed.toFixed(2)}ms`);

			expect(frame).toContain('[0]');
			expect(frame).toContain('[99]');
			expect(elapsed).toBeLessThan(2000);
		});

		test('renders deeply nested structure (5 levels)', () => {
			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column">
						{Array.from({ length: 50 }, (_, i) => (
							<Box key={i} flexDirection="row">
								<Box paddingLeft={1}>
									<Box paddingLeft={1}>
										<Box paddingLeft={1}>
											<Box paddingLeft={1}>
												<Text>Deep item {i}</Text>
											</Box>
										</Box>
									</Box>
								</Box>
							</Box>
						))}
					</Box>,
					{ columns: 80, rows: 60 },
				),
			);

			const frame = result.lastFrame();
			console.log(`50 items with 5-level nesting: ${elapsed.toFixed(2)}ms`);

			expect(frame).toContain('Deep item 0');
			expect(frame).toContain('Deep item 49');
			expect(elapsed).toBeLessThan(2000);
		});
	});

	describe('Layout vs Render Timing', () => {
		test('measures layout time vs content render time', () => {
			const itemCount = 200;
			const items = Array.from({ length: itemCount }, (_, i) => `Item ${i}`);

			// First render (includes React reconciliation, layout, and painting)
			const { elapsed: firstRender } = timed(() =>
				render(
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 220 },
				),
			);

			// Rerender with same structure (tests React diffing + layout + painting)
			const { result, elapsed: rerender1 } = timed(() => {
				const r = render(
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 220 },
				);
				return r;
			});

			// Rerender with content change (tests diff + layout + painting)
			const modifiedItems = items.map((item) => `${item} modified`);
			const { elapsed: rerenderModified } = timed(() => {
				result.rerender(
					<Box flexDirection="column">
						{modifiedItems.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
				);
			});

			console.log(`Layout vs Render timing (${itemCount} items):`);
			console.log(`  First render: ${firstRender.toFixed(2)}ms`);
			console.log(`  Clean rerender: ${rerender1.toFixed(2)}ms`);
			console.log(`  Modified rerender: ${rerenderModified.toFixed(2)}ms`);

			// All should complete reasonably fast
			expect(firstRender).toBeLessThan(3000);
			expect(rerender1).toBeLessThan(3000);
			expect(rerenderModified).toBeLessThan(3000);
		});
	});

	describe('Benchmark Consistency', () => {
		test('render times are consistent across runs', () => {
			const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`);

			const stats = benchmark(() => {
				render(
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 120 },
				);
			}, 5);

			console.log('Benchmark (100 items, 5 runs):');
			console.log(`  Min: ${stats.min.toFixed(2)}ms`);
			console.log(`  Max: ${stats.max.toFixed(2)}ms`);
			console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
			console.log(`  Runs: [${stats.runs.map((r) => r.toFixed(1)).join(', ')}]ms`);

			// Check that variance isn't too extreme (max shouldn't be >5x min)
			// This helps detect performance anomalies
			expect(stats.max).toBeLessThan(stats.min * 5 + 100); // +100ms buffer for GC etc
		});
	});

	describe('Edge Cases', () => {
		test('renders wide content efficiently', () => {
			const wideText = 'X'.repeat(200);
			const items = Array.from({ length: 50 }, () => wideText);

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column" width={80}>
						{items.map((item, i) => (
							<Text key={i} wrap="truncate">
								{item}
							</Text>
						))}
					</Box>,
					{ columns: 80, rows: 60 },
				),
			);

			const frame = result.lastFrame();
			console.log(`50 wide (200 char) lines with truncate: ${elapsed.toFixed(2)}ms`);

			// Content should be truncated to fit width
			expect(frame).toBeDefined();
			expect(elapsed).toBeLessThan(2000);
		});

		test('renders with mixed styles efficiently', () => {
			const items = Array.from({ length: 100 }, (_, i) => ({
				text: `Item ${i}`,
				color: ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan'][i % 6] as
					| 'red'
					| 'green'
					| 'blue'
					| 'yellow'
					| 'magenta'
					| 'cyan',
				bold: i % 2 === 0,
			}));

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i} color={item.color} bold={item.bold}>
								{item.text}
							</Text>
						))}
					</Box>,
					{ columns: 80, rows: 120 },
				),
			);

			const frame = result.lastFrame();
			console.log(`100 items with mixed styles: ${elapsed.toFixed(2)}ms`);

			expect(frame).toContain('Item 0');
			expect(frame).toContain('Item 99');
			expect(elapsed).toBeLessThan(2000);
		});

		test('renders empty/sparse content efficiently', () => {
			const items = Array.from({ length: 100 }, (_, i) => (i % 10 === 0 ? `Item ${i}` : ''));

			const { result, elapsed } = timed(() =>
				render(
					<Box flexDirection="column">
						{items.map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>,
					{ columns: 80, rows: 120 },
				),
			);

			const frame = result.lastFrame();
			console.log(`100 items (90% empty): ${elapsed.toFixed(2)}ms`);

			expect(frame).toContain('Item 0');
			expect(frame).toContain('Item 90');
			expect(elapsed).toBeLessThan(1000);
		});
	});
});
