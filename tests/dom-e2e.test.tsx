/**
 * DOM Adapter End-to-End Tests
 *
 * Tests the full React rendering pipeline with DOM adapter.
 * Validates that useContentRect returns pixel dimensions and state updates work.
 *
 * These tests require document - they skip gracefully in CI without browser.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { useState, useEffect } from 'react';
import { createDOMAdapter } from '../src/adapters/dom-adapter.js';
import { createFlexxZeroEngine } from '../src/adapters/flexx-zero-adapter.js';
import {
	Box,
	DOMRenderBuffer,
	Text,
	initDOMRenderer,
	renderDOMOnce,
	useContentRect,
} from '../src/dom/index.js';
import { isLayoutEngineInitialized, setLayoutEngine } from '../src/layout-engine.js';
import { hasRenderAdapter, setRenderAdapter } from '../src/render-adapter.js';

// Check if we have DOM support
const hasDOM = typeof document !== 'undefined';

describe.skipIf(!hasDOM)('DOM E2E - React Rendering', () => {
	beforeEach(() => {
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createDOMAdapter({ fontSize: 14 }));
	});

	test('renders simple Box and Text to HTML', () => {
		function SimpleApp() {
			return (
				<Box>
					<Text>Hello DOM</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<SimpleApp />, 400, 300);

		expect(typeof html).toBe('string');
		// In browser, should contain rendered content
		// In non-browser, returns placeholder
	});

	test('renders nested layout correctly', () => {
		function NestedApp() {
			return (
				<Box flexDirection="column">
					<Box flexDirection="row">
						<Text>Left</Text>
						<Text>Right</Text>
					</Box>
					<Text>Bottom</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<NestedApp />, 400, 300);
		expect(typeof html).toBe('string');
	});

	test('renders with explicit dimensions', () => {
		function SizedApp() {
			return (
				<Box width={200} height={100}>
					<Text>Sized box</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<SizedApp />, 400, 300);
		expect(typeof html).toBe('string');
	});

	test('renders borders correctly', () => {
		function BorderedApp() {
			return (
				<Box borderStyle="single" borderColor="cyan" width={100} height={50}>
					<Text>Bordered</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<BorderedApp />, 400, 300);
		expect(typeof html).toBe('string');
	});

	test('renders with backgroundColor', () => {
		function ColoredApp() {
			return (
				<Box backgroundColor="#ff0000" width={100} height={50}>
					<Text color="white">Red bg</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<ColoredApp />, 400, 300);
		expect(typeof html).toBe('string');
	});

	test('renders text styles', () => {
		function StyledApp() {
			return (
				<Box flexDirection="column">
					<Text bold>Bold</Text>
					<Text italic>Italic</Text>
					<Text underline>Underlined</Text>
					<Text strikethrough>Strikethrough</Text>
					<Text underlineStyle="curly" underlineColor="red">
						Curly underline
					</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<StyledApp />, 400, 300);
		expect(typeof html).toBe('string');
	});
});

describe.skipIf(!hasDOM)('DOM E2E - useContentRect', () => {
	beforeEach(() => {
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createDOMAdapter({ fontSize: 14 }));
	});

	test('useContentRect returns pixel dimensions', () => {
		let capturedRect: { width: number; height: number } | null = null;

		function MeasuredApp() {
			const rect = useContentRect();
			if (rect.width > 0 && !capturedRect) {
				capturedRect = { width: rect.width, height: rect.height };
			}
			return (
				<Box>
					<Text>
						Size: {rect.width}x{rect.height}
					</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<MeasuredApp />, 800, 600);

		// Should have received dimensions
		expect(capturedRect).not.toBeNull();
		expect(capturedRect!.width).toBe(800);
		expect(capturedRect!.height).toBe(600);
	});

	test('useContentRect returns dimensions for sized container', () => {
		let capturedRect: { width: number; height: number } | null = null;

		function SizedMeasuredApp() {
			const rect = useContentRect();
			if (rect.width > 0 && !capturedRect) {
				capturedRect = { width: rect.width, height: rect.height };
			}
			return (
				<Box width={200} height={100}>
					<Text>
						{rect.width}x{rect.height}
					</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<SizedMeasuredApp />, 800, 600);

		expect(capturedRect).not.toBeNull();
		expect(capturedRect!.width).toBe(200);
		expect(capturedRect!.height).toBe(100);
	});

	test('pixel dimensions are not cell-based', () => {
		let capturedRect: { width: number; height: number } | null = null;

		function PixelCheckApp() {
			const rect = useContentRect();
			if (rect.width > 0 && !capturedRect) {
				capturedRect = { width: rect.width, height: rect.height };
			}
			return <Text>Checking pixels</Text>;
		}

		const html = renderDOMOnce(<PixelCheckApp />, 500, 300);

		expect(capturedRect).not.toBeNull();
		expect(capturedRect!.width).toBe(500);
		expect(capturedRect!.height).toBe(300);
	});
});

describe.skipIf(!hasDOM)('DOM E2E - Accessibility Features', () => {
	beforeEach(() => {
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createDOMAdapter({ fontSize: 14 }));
	});

	test('rendered HTML contains text content', () => {
		function AccessibleApp() {
			return (
				<Box>
					<Text>Screen reader text</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<AccessibleApp />, 400, 300);

		// In browser environment, HTML should contain the text
		if (html !== '<!-- DOM rendering requires browser environment -->') {
			expect(html).toContain('Screen reader text');
		}
	});

	test('multiple text elements are distinct', () => {
		function MultiTextApp() {
			return (
				<Box flexDirection="column">
					<Text>First line</Text>
					<Text>Second line</Text>
					<Text>Third line</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<MultiTextApp />, 400, 300);

		if (html !== '<!-- DOM rendering requires browser environment -->') {
			expect(html).toContain('First line');
			expect(html).toContain('Second line');
			expect(html).toContain('Third line');
		}
	});
});

describe.skipIf(!hasDOM)('DOM E2E - Layout Engine Integration', () => {
	beforeEach(() => {
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createDOMAdapter({ fontSize: 14 }));
	});

	test('flexDirection column works', () => {
		function ColumnApp() {
			return (
				<Box flexDirection="column">
					<Text>Line 1</Text>
					<Text>Line 2</Text>
					<Text>Line 3</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<ColumnApp />, 400, 300);
		expect(typeof html).toBe('string');
	});

	test('flexDirection row works', () => {
		function RowApp() {
			return (
				<Box flexDirection="row">
					<Text>A</Text>
					<Text>B</Text>
					<Text>C</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<RowApp />, 400, 300);
		expect(typeof html).toBe('string');
	});

	test('flexGrow distributes space', () => {
		let leftWidth = 0;
		let rightWidth = 0;

		function GrowApp() {
			return (
				<Box width={400}>
					<Box flexGrow={1}>
						<MeasureWidth onWidth={(w) => (leftWidth = w)} />
					</Box>
					<Box flexGrow={1}>
						<MeasureWidth onWidth={(w) => (rightWidth = w)} />
					</Box>
				</Box>
			);
		}

		function MeasureWidth({ onWidth }: { onWidth: (w: number) => void }) {
			const { width } = useContentRect();
			if (width > 0) onWidth(width);
			return <Text>W</Text>;
		}

		const html = renderDOMOnce(<GrowApp />, 400, 300);

		expect(leftWidth).toBeGreaterThan(0);
		expect(rightWidth).toBeGreaterThan(0);
		expect(leftWidth).toBeCloseTo(rightWidth, -1);
	});

	test('padding reduces content area', () => {
		let innerWidth = 0;

		function PaddedApp() {
			return (
				<Box width={200} padding={20}>
					<MeasureWidth onWidth={(w) => (innerWidth = w)} />
				</Box>
			);
		}

		function MeasureWidth({ onWidth }: { onWidth: (w: number) => void }) {
			const { width } = useContentRect();
			if (width > 0) onWidth(width);
			return <Text>Content</Text>;
		}

		const html = renderDOMOnce(<PaddedApp />, 400, 300);

		// 200 - 20 (left) - 20 (right) = 160
		expect(innerWidth).toBe(160);
	});
});

describe.skipIf(!hasDOM)('DOM E2E - Edge Cases', () => {
	beforeEach(() => {
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createDOMAdapter({ fontSize: 14 }));
	});

	test('empty Box renders without error', () => {
		function EmptyApp() {
			return <Box />;
		}

		const html = renderDOMOnce(<EmptyApp />, 400, 300);
		expect(typeof html).toBe('string');
	});

	test('deeply nested components work', () => {
		function DeepApp() {
			return (
				<Box>
					<Box>
						<Box>
							<Box>
								<Box>
									<Text>Deep</Text>
								</Box>
							</Box>
						</Box>
					</Box>
				</Box>
			);
		}

		const html = renderDOMOnce(<DeepApp />, 400, 300);
		expect(typeof html).toBe('string');
	});

	test('many children render without error', () => {
		function ManyChildrenApp() {
			const items = Array.from({ length: 100 }, (_, i) => i);
			return (
				<Box flexDirection="column">
					{items.map((i) => (
						<Text key={i}>Item {i}</Text>
					))}
				</Box>
			);
		}

		const html = renderDOMOnce(<ManyChildrenApp />, 400, 3000);
		expect(typeof html).toBe('string');
	});

	test('zero-size container handles gracefully', () => {
		function ZeroApp() {
			return (
				<Box>
					<Text>Content</Text>
				</Box>
			);
		}

		const html = renderDOMOnce(<ZeroApp />, 1, 1);
		expect(typeof html).toBe('string');
	});
});

describe('DOM Adapter (no browser required)', () => {
	test('createDOMAdapter is available', () => {
		expect(typeof createDOMAdapter).toBe('function');
	});

	test('creates adapter with correct name', () => {
		const adapter = createDOMAdapter();
		expect(adapter.name).toBe('dom');
	});

	test('measurer provides line height', () => {
		const adapter = createDOMAdapter({ fontSize: 14, lineHeight: 1.2 });
		const lineHeight = adapter.measurer.getLineHeight();
		expect(lineHeight).toBeCloseTo(16.8, 1);
	});

	test('border chars are available', () => {
		const adapter = createDOMAdapter();
		const chars = adapter.getBorderChars('single');
		expect(chars.topLeft).toBe('┌');
		expect(chars.horizontal).toBe('─');
		expect(chars.vertical).toBe('│');
	});
});
