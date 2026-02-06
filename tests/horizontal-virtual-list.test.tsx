import React from 'react';
/**
 * Tests for HorizontalVirtualList component
 */
import { describe, expect, it } from 'vitest';
import { Box, HorizontalVirtualList, Text } from '../src/index.js';
import { createRenderer } from '../src/testing/index.js';

const render = createRenderer({ cols: 80, rows: 24 });

describe('HorizontalVirtualList', () => {
	it('renders visible items only', () => {
		const items = Array.from({ length: 100 }, (_, i) => ({
			id: `item-${i}`,
			name: `Item ${i}`,
		}));

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={40}
				itemWidth={10}
				renderItem={(item) => (
					<Box key={item.id} width={10}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		// Should render first few items (40 width / 10 per item = 4 visible)
		expect(app.text).toContain('Item 0');
		expect(app.text).toContain('Item 1');
		expect(app.text).toContain('Item 2');
		expect(app.text).toContain('Item 3');
		// Should NOT render items far off-screen
		expect(app.text).not.toContain('Item 50');
	});

	it('scrolls to selected item', () => {
		const items = Array.from({ length: 100 }, (_, i) => ({
			id: `item-${i}`,
			name: `I${i}`,
		}));

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={30}
				itemWidth={6}
				scrollTo={50}
				maxRendered={10}
				renderItem={(item) => (
					<Box key={item.id} width={6}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		// Should show item 50 (scrollTo target) - window centered on it
		expect(app.text).toContain('I50');
	});

	it('shows overflow indicators when enabled', () => {
		const items = Array.from({ length: 50 }, (_, i) => ({
			id: `item-${i}`,
			name: `I${i}`,
		}));

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={30}
				itemWidth={6}
				scrollTo={25}
				maxRendered={10}
				overflowIndicator
				renderItem={(item) => (
					<Box key={item.id} width={6}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		// Should show left indicator (items hidden to the left)
		expect(app.text).toContain('◀');
		// Should show right indicator (items hidden to the right)
		expect(app.text).toContain('▶');
	});

	it('supports variable item widths', () => {
		const items = [
			{ id: '1', name: 'Short', width: 8 },
			{ id: '2', name: 'Medium Item', width: 15 },
			{ id: '3', name: 'Longer Item Here', width: 20 },
		];

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={50}
				itemWidth={(item) => item.width}
				renderItem={(item) => (
					<Box key={item.id} width={item.width}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		expect(app.text).toContain('Short');
		expect(app.text).toContain('Medium Item');
		expect(app.text).toContain('Longer Item');
	});

	it('renders gaps between items', () => {
		const items = [
			{ id: '1', name: 'A' },
			{ id: '2', name: 'B' },
			{ id: '3', name: 'C' },
		];

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={30}
				itemWidth={5}
				gap={2}
				renderItem={(item) => (
					<Box key={item.id} width={5}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		// All items should be visible
		expect(app.text).toContain('A');
		expect(app.text).toContain('B');
		expect(app.text).toContain('C');
	});

	it('renders custom separators', () => {
		const items = [
			{ id: '1', name: 'Col1' },
			{ id: '2', name: 'Col2' },
			{ id: '3', name: 'Col3' },
		];

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={40}
				itemWidth={8}
				renderSeparator={() => (
					<Box width={1}>
						<Text>│</Text>
					</Box>
				)}
				renderItem={(item) => (
					<Box key={item.id} width={8}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		// Should show separators between columns
		expect(app.text).toContain('│');
		expect(app.text).toContain('Col1');
		expect(app.text).toContain('Col2');
	});

	it('handles empty list', () => {
		const app = render(
			<HorizontalVirtualList
				items={[]}
				width={40}
				itemWidth={10}
				renderItem={(item: { id: string }) => <Text key={item.id}>Item</Text>}
			/>,
		);

		// Should not crash, render empty
		expect(app.text).toBe('');
	});

	it('handles single item', () => {
		const items = [{ id: '1', name: 'Only One' }];

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={40}
				itemWidth={10}
				renderItem={(item) => (
					<Box key={item.id} width={10}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		expect(app.text).toContain('Only One');
	});

	it('uses keyExtractor for stable keys', () => {
		const items = [
			{ uuid: 'abc', label: 'First' },
			{ uuid: 'def', label: 'Second' },
		];

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={40}
				itemWidth={10}
				keyExtractor={(item) => item.uuid}
				renderItem={(item) => (
					<Box width={10}>
						<Text>{item.label}</Text>
					</Box>
				)}
			/>,
		);

		expect(app.text).toContain('First');
		expect(app.text).toContain('Second');
	});

	it('respects maxRendered limit', () => {
		const items = Array.from({ length: 100 }, (_, i) => ({
			id: `item-${i}`,
			name: `N${i}`,
		}));

		const app = render(
			<HorizontalVirtualList
				items={items}
				width={200}
				itemWidth={5}
				maxRendered={10}
				scrollTo={50}
				renderItem={(item) => (
					<Box key={item.id} width={5}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		// Should show item around scrollTo position
		expect(app.text).toContain('N50');
		// Items far from scrollTo should not be rendered even if width allows
		expect(app.text).not.toContain('N0');
		expect(app.text).not.toContain('N99');
	});

	it('edge-based scrolling preserves offset when not selected', () => {
		const items = Array.from({ length: 20 }, (_, i) => ({
			id: `item-${i}`,
			name: `I${i}`,
		}));

		// First render with scrollTo=10
		const app = render(
			<HorizontalVirtualList
				items={items}
				width={30}
				itemWidth={6}
				scrollTo={10}
				renderItem={(item) => (
					<Box key={item.id} width={6}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		expect(app.text).toContain('I10');

		// Re-render without scrollTo (undefined) - should preserve position
		app.rerender(
			<HorizontalVirtualList
				items={items}
				width={30}
				itemWidth={6}
				scrollTo={undefined}
				renderItem={(item) => (
					<Box key={item.id} width={6}>
						<Text>{item.name}</Text>
					</Box>
				)}
			/>,
		);

		// Should still show items around same position
		expect(app.text).toContain('I10');
	});
});
