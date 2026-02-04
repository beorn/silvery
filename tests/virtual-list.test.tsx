/**
 * VirtualList Component Tests
 *
 * Tests for React-level virtualization.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import React from 'react';
import { Box, Text, VirtualList } from '../src/index.js';
import { initYogaEngine, setLayoutEngine } from '../src/render.js';
import { createRenderer } from '../src/testing/index.js';

// Initialize layout engine before tests
beforeAll(async () => {
	const engine = await initYogaEngine();
	setLayoutEngine(engine);
});

const render = createRenderer({ cols: 80, rows: 24 });

describe('VirtualList', () => {
	test('renders visible items only', () => {
		const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`);

		const app = render(
			<VirtualList
				items={items}
				height={10}
				itemHeight={1}
				scrollTo={0}
				renderItem={(item, index) => <Text key={index}>{item}</Text>}
			/>,
		);

		// Should render first items
		expect(app.text).toContain('Item 0');
		expect(app.text).toContain('Item 1');

		// Should NOT render items far below viewport
		expect(app.text).not.toContain('Item 99');
	});

	test('scrolls to selected item', () => {
		const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`);

		const app = render(
			<VirtualList
				items={items}
				height={10}
				itemHeight={1}
				scrollTo={50}
				renderItem={(item, index) => <Text key={index}>{item}</Text>}
			/>,
		);

		// Should render items around index 50
		expect(app.text).toContain('Item 50');

		// Should NOT render items at the start
		expect(app.text).not.toContain('Item 0');
	});

	test('handles empty list', () => {
		const items: string[] = [];

		const app = render(
			<VirtualList
				items={items}
				height={10}
				itemHeight={1}
				renderItem={(item, index) => <Text key={index}>{item}</Text>}
			/>,
		);

		// Should render without errors
		expect(app.text).toBeDefined();
	});

	test('handles small list without virtualization', () => {
		const items = ['A', 'B', 'C'];

		const app = render(
			<VirtualList
				items={items}
				height={10}
				itemHeight={1}
				renderItem={(item, index) => <Text key={index}>{item}</Text>}
			/>,
		);

		// Should render all items
		expect(app.text).toContain('A');
		expect(app.text).toContain('B');
		expect(app.text).toContain('C');
	});

	test('respects maxRendered limit', () => {
		const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);

		const app = render(
			<VirtualList
				items={items}
				height={10}
				itemHeight={1}
				scrollTo={500}
				maxRendered={50}
				renderItem={(item, index) => <Text key={index}>{item}</Text>}
			/>,
		);

		// Should render items around index 500
		expect(app.text).toContain('Item 500');

		// Count rendered items (rough check via text content)
		const matches = app.text.match(/Item \d+/g) || [];
		// Should be approximately maxRendered + overscan (50 + 5*2 = 60 max)
		expect(matches.length).toBeLessThanOrEqual(70);
	});

	test('supports keyExtractor', () => {
		const items = [
			{ id: 'a', name: 'Alpha' },
			{ id: 'b', name: 'Beta' },
			{ id: 'c', name: 'Gamma' },
		];

		const app = render(
			<VirtualList
				items={items}
				height={10}
				itemHeight={1}
				keyExtractor={(item) => item.id}
				renderItem={(item) => <Text>{item.name}</Text>}
			/>,
		);

		expect(app.text).toContain('Alpha');
		expect(app.text).toContain('Beta');
		expect(app.text).toContain('Gamma');
	});

	test('renders with overflow indicators', () => {
		const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`);

		const app = render(
			<VirtualList
				items={items}
				height={5}
				itemHeight={1}
				scrollTo={50}
				overflowIndicator
				renderItem={(item, index) => <Text key={index}>{item}</Text>}
			/>,
		);

		// Should show overflow indicators
		expect(app.text).toContain('▲');
		expect(app.text).toContain('▼');
	});

	test('multi-line items work correctly', () => {
		const items = ['First', 'Second', 'Third'];

		const app = render(
			<VirtualList
				items={items}
				height={10}
				itemHeight={2} // Each item takes 2 rows
				renderItem={(item, index) => (
					<Box key={index} height={2} flexDirection="column">
						<Text>{item}</Text>
						<Text dimColor>Description</Text>
					</Box>
				)}
			/>,
		);

		expect(app.text).toContain('First');
		expect(app.text).toContain('Description');
	});
});
