/**
 * Content Phase: Scroll Container Incremental Rendering Tests
 *
 * Verifies that scroll container children use the fast-path (skip re-rendering)
 * when the scroll offset hasn't changed, and correctly re-render when it has.
 *
 * The key optimization: when a scroll container re-renders but its offset is
 * unchanged, children that aren't dirty can skip rendering because their
 * screen positions haven't moved.
 *
 * Bead: km-inkx.incremental-content
 */
import React, { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { Box, Text, useInput } from '../../src/index.js';
import { createRenderer, stripAnsi } from '../../src/testing/index.js';

describe('Scroll container incremental rendering', () => {
	const render = createRenderer({ cols: 40, rows: 20 });

	test('scroll children render correctly with incremental mode', () => {
		// Basic correctness: incremental and fresh render produce same output
		function ScrollList({ selected }: { selected: number }) {
			return (
				<Box flexDirection="column" width={40}>
					<Box overflow="scroll" height={3}>
						{['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((item, i) => (
							<Text key={i} backgroundColor={i === selected ? 'yellow' : undefined}>
								{item}
							</Text>
						))}
					</Box>
				</Box>
			);
		}

		// Render with incremental mode
		const incApp = createRenderer({ cols: 40, rows: 20, incremental: true })(
			<ScrollList selected={0} />,
		);

		// Render without incremental mode (fresh each time)
		const freshApp = render(<ScrollList selected={0} />);

		expect(incApp.text).toBe(freshApp.text);

		// Move selection without scrolling (item 1 is still visible)
		incApp.rerender(<ScrollList selected={1} />);
		freshApp.rerender(<ScrollList selected={1} />);
		expect(incApp.text).toBe(freshApp.text);
	});

	test('scroll offset change re-renders all children correctly', () => {
		function ScrollList({ selected }: { selected: number }) {
			return (
				<Box flexDirection="column" width={40}>
					<Box overflow="scroll" height={5} scrollTo={selected}>
						{['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Foxtrot', 'Golf'].map(
							(item, i) => (
								<Text key={i} backgroundColor={i === selected ? 'yellow' : undefined}>
									{item}
								</Text>
							),
						)}
					</Box>
				</Box>
			);
		}

		const incRender = createRenderer({ cols: 40, rows: 20, incremental: true });
		const incApp = incRender(<ScrollList selected={0} />);

		// Initial: first items visible
		expect(incApp.text).toContain('Alpha');
		expect(incApp.text).toContain('Beta');

		// Scroll down to show Golf (scroll offset changes)
		incApp.rerender(<ScrollList selected={6} />);

		// After scrolling: should show Golf
		expect(incApp.text).toContain('Golf');

		// Verify against fresh render
		const freshApp = render(<ScrollList selected={6} />);
		expect(incApp.text).toBe(freshApp.text);
	});

	test('unchanged scroll offset skips re-rendering clean children', () => {
		// When scroll offset hasn't changed and only one child is dirty,
		// other children should be skipped (fast-path). We verify correctness
		// by checking the output matches a fresh render.
		function ScrollList({ selected }: { selected: number }) {
			return (
				<Box flexDirection="column" width={40}>
					<Box overflow="scroll" height={5} scrollTo={selected}>
						{['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((item, i) => (
							<Text key={i} backgroundColor={i === selected ? 'cyan' : undefined}>
								{`${item}: item ${i}`}
							</Text>
						))}
					</Box>
				</Box>
			);
		}

		const incRender = createRenderer({ cols: 40, rows: 20, incremental: true });
		const incApp = incRender(<ScrollList selected={0} />);

		// Move selection from 0 to 1 (no scroll needed, both visible)
		incApp.rerender(<ScrollList selected={1} />);

		const freshApp = render(<ScrollList selected={1} />);
		expect(incApp.text).toBe(freshApp.text);

		// Move selection from 1 to 2 (still no scroll needed)
		incApp.rerender(<ScrollList selected={2} />);

		const freshApp2 = render(<ScrollList selected={2} />);
		expect(incApp.text).toBe(freshApp2.text);
	});

	test('stale backgroundColor cleared on scroll children after selection move', () => {
		// When selection changes within a scroll container (no scroll offset change),
		// the old selected item should lose its background color.
		function SelectList({ cursor }: { cursor: number }) {
			return (
				<Box width={20}>
					<Box overflow="scroll" height={4} scrollTo={cursor}>
						{['One', 'Two', 'Three', 'Four'].map((item, i) => (
							<Text key={i} backgroundColor={i === cursor ? 'yellow' : undefined}>
								{item}
							</Text>
						))}
					</Box>
				</Box>
			);
		}

		const incRender = createRenderer({ cols: 20, rows: 10, incremental: true });
		const app = incRender(<SelectList cursor={0} />);

		// One has yellow bg
		const oneBox = app.getByText('One').boundingBox()!;
		expect(app.term.cell(oneBox.x, oneBox.y).bg).toBe(3); // yellow = 3

		// Move cursor to Two
		app.rerender(<SelectList cursor={1} />);

		// One should no longer have yellow bg
		expect(app.term.cell(oneBox.x, oneBox.y).bg).not.toBe(3);

		// Two should have yellow bg
		const twoBox = app.getByText('Two').boundingBox()!;
		expect(app.term.cell(twoBox.x, twoBox.y).bg).toBe(3);
	});

	test('scroll container with parent backgroundColor preserves bg on incremental', () => {
		function ScrollWithBg({ cursor }: { cursor: number }) {
			return (
				<Box backgroundColor="white" width={20} height={6} flexDirection="column">
					<Text>Header</Text>
					<Box overflow="scroll" height={4} scrollTo={cursor}>
						{['A', 'B', 'C', 'D', 'E'].map((item, i) => (
							<Text key={i} backgroundColor={i === cursor ? 'yellow' : undefined}>
								{item}
							</Text>
						))}
					</Box>
				</Box>
			);
		}

		const incRender = createRenderer({ cols: 20, rows: 10, incremental: true });
		const app = incRender(<ScrollWithBg cursor={0} />);

		// Move cursor from 0 to 1 (no scroll offset change, items still visible)
		app.rerender(<ScrollWithBg cursor={1} />);

		// Item A lost its yellow bg - should inherit white from ancestor
		const aBox = app.getByText('A').boundingBox()!;
		const cell = app.term.cell(aBox.x, aBox.y);
		// White bg = 7 (inherited from parent Box), not null/black
		expect(cell.bg).toBe(7);
	});

	test('scroll offset change with scroll clears stale pixels', () => {
		// When scrolling, old content at old positions must be cleared
		function LongList({ cursor }: { cursor: number }) {
			const items = Array.from({ length: 20 }, (_, i) => `Item ${i}`);
			return (
				<Box width={30}>
					<Box overflow="scroll" height={5} scrollTo={cursor}>
						{items.map((item, i) => (
							<Text key={i} backgroundColor={i === cursor ? 'cyan' : undefined}>
								{item}
							</Text>
						))}
					</Box>
				</Box>
			);
		}

		const incRender = createRenderer({ cols: 30, rows: 10, incremental: true });
		const app = incRender(<LongList cursor={0} />);

		expect(app.text).toContain('Item 0');

		// Scroll down significantly
		app.rerender(<LongList cursor={10} />);

		// Old items should not be visible
		expect(app.text).not.toContain('Item 0');
		expect(app.text).toContain('Item 10');

		// Verify against fresh render
		const freshApp = render(<LongList cursor={10} />);
		expect(app.text).toBe(freshApp.text);
	});

	test('prevOffset reflects previous scroll position in scrollState', () => {
		function ScrollList({ cursor }: { cursor: number }) {
			return (
				<Box width={20}>
					<Box overflow="scroll" height={3} scrollTo={cursor} id="scroll">
						{['A', 'B', 'C', 'D', 'E'].map((item, i) => (
							<Text key={i}>{item}</Text>
						))}
					</Box>
				</Box>
			);
		}

		const app = render(<ScrollList cursor={0} />);
		const scrollLocator = app.locator('#scroll');
		const node = scrollLocator.resolve()!;

		// Initial render: prevOffset should equal offset (no previous state)
		expect(node.scrollState?.offset).toBe(0);
		expect(node.scrollState?.prevOffset).toBe(0);

		// Scroll down
		app.rerender(<ScrollList cursor={4} />);

		// After scrolling: prevOffset should be 0 (previous offset),
		// offset should be > 0 (scrolled down)
		expect(node.scrollState?.prevOffset).toBe(0);
		expect(node.scrollState?.offset).toBeGreaterThan(0);

		// Rerender at same scroll position
		const offsetAfterScroll = node.scrollState?.offset;
		app.rerender(<ScrollList cursor={4} />);

		// prevOffset should now match the previous offset
		expect(node.scrollState?.prevOffset).toBe(offsetAfterScroll);
		expect(node.scrollState?.offset).toBe(offsetAfterScroll);
	});
});
