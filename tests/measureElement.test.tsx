/**
 * measureElement Tests
 *
 * Tests for the measureElement API which provides Ink-compatible
 * element measurement functionality.
 *
 * Note: In inkx, measureElement is primarily used for direct node access.
 * For component-level measurement, useLayout() is the recommended approach.
 * See hooks.test.tsx for useLayout tests.
 */

import { describe, expect, test } from 'vitest';
import { type InkxNode, measureElement } from '../src/index.js';

// Helper to create a mock layout node that returns specific values
function createMockLayoutNode(width: number, height: number) {
	return {
		getComputedWidth: () => width,
		getComputedHeight: () => height,
		getComputedLeft: () => 0,
		getComputedTop: () => 0,
		// Other methods not needed for measureElement
		insertChild: () => {},
		removeChild: () => {},
		free: () => {},
		setMeasureFunc: () => {},
		setWidth: () => {},
		setWidthPercent: () => {},
		setWidthAuto: () => {},
		setHeight: () => {},
		setHeightPercent: () => {},
		setHeightAuto: () => {},
		setMinWidth: () => {},
		setMinWidthPercent: () => {},
		setMinHeight: () => {},
		setMinHeightPercent: () => {},
		setMaxWidth: () => {},
		setMaxWidthPercent: () => {},
		setMaxHeight: () => {},
		setMaxHeightPercent: () => {},
		setFlexGrow: () => {},
		setFlexShrink: () => {},
		setFlexBasis: () => {},
		setFlexBasisPercent: () => {},
		setFlexBasisAuto: () => {},
		setFlexDirection: () => {},
		setFlexWrap: () => {},
		setAlignItems: () => {},
		setAlignSelf: () => {},
		setAlignContent: () => {},
		setJustifyContent: () => {},
		setPadding: () => {},
		setMargin: () => {},
		setBorder: () => {},
		setGap: () => {},
		setDisplay: () => {},
		setPositionType: () => {},
		setOverflow: () => {},
		calculateLayout: () => {},
	};
}

// Helper to create a minimal InkxNode for testing
function createTestNode(options: {
	contentRect?: {
		x: number;
		y: number;
		width: number;
		height: number;
	} | null;
	layoutNode?: ReturnType<typeof createMockLayoutNode> | null;
}): InkxNode {
	const layout = options.contentRect ?? null;
	return {
		type: 'inkx-box',
		props: {},
		children: [],
		parent: null,
		layoutNode: options.layoutNode ?? null,
		contentRect: layout,
		screenRect: layout,
		contentRect: layout,
		prevLayout: null,
		layoutDirty: false,
		contentDirty: false,
		layoutSubscribers: new Set(),
	};
}

describe('measureElement', () => {
	describe('with contentRect (inkx pipeline)', () => {
		test('returns dimensions from contentRect', () => {
			const node = createTestNode({
				contentRect: { x: 0, y: 0, width: 42, height: 17 },
			});

			const result = measureElement(node);

			expect(result.width).toBe(42);
			expect(result.height).toBe(17);
		});

		test('ignores layoutNode when contentRect is present', () => {
			const node = createTestNode({
				contentRect: { x: 0, y: 0, width: 100, height: 50 },
				layoutNode: createMockLayoutNode(999, 888),
			});

			const result = measureElement(node);

			// Should use contentRect, not layoutNode
			expect(result.width).toBe(100);
			expect(result.height).toBe(50);
		});

		test('handles zero dimensions', () => {
			const node = createTestNode({
				contentRect: { x: 0, y: 0, width: 0, height: 0 },
			});

			const result = measureElement(node);

			expect(result.width).toBe(0);
			expect(result.height).toBe(0);
		});

		test('handles large dimensions', () => {
			const node = createTestNode({
				contentRect: { x: 0, y: 0, width: 1000, height: 500 },
			});

			const result = measureElement(node);

			expect(result.width).toBe(1000);
			expect(result.height).toBe(500);
		});
	});

	describe('with layoutNode only (fallback)', () => {
		test('falls back to layoutNode when contentRect is null', () => {
			const node = createTestNode({
				contentRect: null,
				layoutNode: createMockLayoutNode(30, 20),
			});

			const result = measureElement(node);

			expect(result.width).toBe(30);
			expect(result.height).toBe(20);
		});

		test('handles NaN from layoutNode (before calculateLayout)', () => {
			const node = createTestNode({
				contentRect: null,
				layoutNode: createMockLayoutNode(Number.NaN, Number.NaN),
			});

			const result = measureElement(node);

			// Should convert NaN to 0
			expect(result.width).toBe(0);
			expect(result.height).toBe(0);
		});
	});

	describe('edge cases', () => {
		test('returns zeros when no layout info available', () => {
			const node = createTestNode({
				contentRect: null,
				layoutNode: null,
			});

			const result = measureElement(node);

			expect(result.width).toBe(0);
			expect(result.height).toBe(0);
		});

		test('returns object with only width and height properties', () => {
			const node = createTestNode({
				contentRect: { x: 10, y: 20, width: 30, height: 40 },
			});

			const result = measureElement(node);

			expect(Object.keys(result)).toEqual(['width', 'height']);
			// x and y should not be included
			expect('x' in result).toBe(false);
			expect('y' in result).toBe(false);
		});

		test('returns number types', () => {
			const node = createTestNode({
				contentRect: { x: 0, y: 0, width: 50, height: 25 },
			});

			const result = measureElement(node);

			expect(typeof result.width).toBe('number');
			expect(typeof result.height).toBe('number');
		});
	});

	describe('MeasureElementOutput interface', () => {
		test('width property is numeric', () => {
			const node = createTestNode({
				contentRect: { x: 0, y: 0, width: 123, height: 456 },
			});

			const result = measureElement(node);

			expect(result.width).toBe(123);
			expect(Number.isFinite(result.width)).toBe(true);
		});

		test('height property is numeric', () => {
			const node = createTestNode({
				contentRect: { x: 0, y: 0, width: 123, height: 456 },
			});

			const result = measureElement(node);

			expect(result.height).toBe(456);
			expect(Number.isFinite(result.height)).toBe(true);
		});
	});

	describe('different node types', () => {
		test('works with inkx-box nodes', () => {
			const node: InkxNode = {
				type: 'inkx-box',
				props: {},
				children: [],
				parent: null,
				layoutNode: null,
				contentRect: { x: 0, y: 0, width: 80, height: 24 },
				screenRect: { x: 0, y: 0, width: 80, height: 24 },
				contentRect: { x: 0, y: 0, width: 80, height: 24 },
				prevLayout: null,
				layoutDirty: false,
				contentDirty: false,
				layoutSubscribers: new Set(),
			};

			const result = measureElement(node);

			expect(result.width).toBe(80);
			expect(result.height).toBe(24);
		});

		test('works with inkx-text nodes', () => {
			const node: InkxNode = {
				type: 'inkx-text',
				props: {},
				children: [],
				parent: null,
				layoutNode: null,
				contentRect: { x: 0, y: 0, width: 11, height: 1 },
				screenRect: { x: 0, y: 0, width: 11, height: 1 },
				contentRect: { x: 0, y: 0, width: 11, height: 1 },
				prevLayout: null,
				layoutDirty: false,
				contentDirty: false,
				layoutSubscribers: new Set(),
				textContent: 'Hello World',
			};

			const result = measureElement(node);

			expect(result.width).toBe(11);
			expect(result.height).toBe(1);
		});

		test('works with inkx-root nodes', () => {
			const node: InkxNode = {
				type: 'inkx-root',
				props: {},
				children: [],
				parent: null,
				layoutNode: null,
				contentRect: { x: 0, y: 0, width: 120, height: 40 },
				screenRect: { x: 0, y: 0, width: 120, height: 40 },
				contentRect: { x: 0, y: 0, width: 120, height: 40 },
				prevLayout: null,
				layoutDirty: false,
				contentDirty: false,
				layoutSubscribers: new Set(),
			};

			const result = measureElement(node);

			expect(result.width).toBe(120);
			expect(result.height).toBe(40);
		});
	});
});
