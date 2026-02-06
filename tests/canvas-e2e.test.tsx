/**
 * Canvas Adapter End-to-End Tests
 *
 * Tests the full React rendering pipeline with Canvas adapter.
 * Validates that useContentRect returns pixel dimensions and state updates work.
 *
 * These tests require OffscreenCanvas or document - they skip gracefully in CI.
 */

import React, { useState, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCanvasAdapter } from '../src/adapters/canvas-adapter.js';
import { createFlexxZeroEngine } from '../src/adapters/flexx-zero-adapter.js';
import {
	Box,
	CanvasRenderBuffer,
	Text,
	initCanvasRenderer,
	renderCanvasOnce,
	useContentRect,
} from '../src/canvas/index.js';
import { isLayoutEngineInitialized, setLayoutEngine } from '../src/layout-engine.js';
import { hasRenderAdapter, setRenderAdapter } from '../src/render-adapter.js';

// Check if we have canvas support
const hasCanvas = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';

// Reset state between tests
function resetRendererState(): void {
	// Force re-initialization on next test
	// (Internal state reset - normally not exposed)
}

describe.skipIf(!hasCanvas)('Canvas E2E - React Rendering', () => {
	beforeEach(() => {
		// Initialize fresh for each test
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createCanvasAdapter({ fontSize: 14 }));
	});

	test('renders simple Box and Text', () => {
		function SimpleApp() {
			return (
				<Box>
					<Text>Hello Canvas</Text>
				</Box>
			);
		}

		const buffer = renderCanvasOnce(<SimpleApp />, 400, 300);

		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
		expect(buffer.width).toBe(400);
		expect(buffer.height).toBe(300);
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

		const buffer = renderCanvasOnce(<NestedApp />, 400, 300);

		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
		// Layout should complete without errors
	});

	test('renders with explicit dimensions', () => {
		function SizedApp() {
			return (
				<Box width={200} height={100}>
					<Text>Sized box</Text>
				</Box>
			);
		}

		const buffer = renderCanvasOnce(<SizedApp />, 400, 300);

		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
	});

	test('renders borders correctly', () => {
		function BorderedApp() {
			return (
				<Box borderStyle="single" borderColor="cyan" width={100} height={50}>
					<Text>Bordered</Text>
				</Box>
			);
		}

		const buffer = renderCanvasOnce(<BorderedApp />, 400, 300);

		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
	});

	test('renders with backgroundColor', () => {
		function ColoredApp() {
			return (
				<Box backgroundColor="#ff0000" width={100} height={50}>
					<Text color="white">Red bg</Text>
				</Box>
			);
		}

		const buffer = renderCanvasOnce(<ColoredApp />, 400, 300);

		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
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

		const buffer = renderCanvasOnce(<StyledApp />, 400, 300);

		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
	});
});

describe.skipIf(!hasCanvas)('Canvas E2E - useContentRect', () => {
	beforeEach(() => {
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createCanvasAdapter({ fontSize: 14 }));
	});

	test('useContentRect returns pixel dimensions', () => {
		let capturedRect: { width: number; height: number } | null = null;

		function MeasuredApp() {
			const rect = useContentRect();
			// Capture on mount
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

		const buffer = renderCanvasOnce(<MeasuredApp />, 800, 600);

		// Should have received dimensions
		expect(capturedRect).not.toBeNull();
		expect(capturedRect!.width).toBe(800); // Full width
		expect(capturedRect!.height).toBe(600); // Full height
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

		// Render at larger canvas size
		const buffer = renderCanvasOnce(<SizedMeasuredApp />, 800, 600);

		// Inner box should be 200x100
		// Note: useContentRect returns the dimensions of the component's content area
		// which is the explicitly set 200x100
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

		const buffer = renderCanvasOnce(<PixelCheckApp />, 500, 300);

		expect(capturedRect).not.toBeNull();
		// Canvas adapter uses pixels, not terminal cells
		// Width should be exactly 500 (not divided by char width)
		expect(capturedRect!.width).toBe(500);
		expect(capturedRect!.height).toBe(300);
	});
});

describe.skipIf(!hasCanvas)('Canvas E2E - Layout Engine Integration', () => {
	beforeEach(() => {
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createCanvasAdapter({ fontSize: 14 }));
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

		const buffer = renderCanvasOnce(<ColumnApp />, 400, 300);
		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
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

		const buffer = renderCanvasOnce(<RowApp />, 400, 300);
		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
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

		const buffer = renderCanvasOnce(<GrowApp />, 400, 300);

		// Both should get ~200px each
		expect(leftWidth).toBeGreaterThan(0);
		expect(rightWidth).toBeGreaterThan(0);
		expect(leftWidth).toBeCloseTo(rightWidth, -1); // Within 10px
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

		const buffer = renderCanvasOnce(<PaddedApp />, 400, 300);

		// 200 - 20 (left) - 20 (right) = 160
		expect(innerWidth).toBe(160);
	});
});

describe.skipIf(!hasCanvas)('Canvas E2E - Edge Cases', () => {
	beforeEach(() => {
		if (!isLayoutEngineInitialized()) {
			setLayoutEngine(createFlexxZeroEngine());
		}
		setRenderAdapter(createCanvasAdapter({ fontSize: 14 }));
	});

	test('empty Box renders without error', () => {
		function EmptyApp() {
			return <Box />;
		}

		const buffer = renderCanvasOnce(<EmptyApp />, 400, 300);
		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
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

		const buffer = renderCanvasOnce(<DeepApp />, 400, 300);
		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
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

		const buffer = renderCanvasOnce(<ManyChildrenApp />, 400, 3000);
		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
	});

	test('zero-size canvas handles gracefully', () => {
		function ZeroApp() {
			return (
				<Box>
					<Text>Content</Text>
				</Box>
			);
		}

		// Very small canvas
		const buffer = renderCanvasOnce(<ZeroApp />, 1, 1);
		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
	});
});
