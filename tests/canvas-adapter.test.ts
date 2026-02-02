/**
 * Canvas Adapter Unit Tests
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
	createCanvasAdapter,
	CanvasRenderBuffer,
	type CanvasAdapterConfig,
} from '../src/adapters/canvas-adapter.js';
import {
	setRenderAdapter,
	hasRenderAdapter,
	getRenderAdapter,
	type RenderAdapter,
} from '../src/render-adapter.js';

// Check if we have canvas support (OffscreenCanvas or document)
const hasCanvas = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';

describe.skipIf(!hasCanvas)('Canvas Adapter', () => {
	let adapter: RenderAdapter;

	beforeEach(() => {
		adapter = createCanvasAdapter({
			fontSize: 14,
			fontFamily: 'monospace',
			lineHeight: 1.2,
		});
	});

	test('creates adapter with correct name', () => {
		expect(adapter.name).toBe('canvas');
	});

	test('measurer returns pixel dimensions', () => {
		const result = adapter.measurer.measureText('Hello');
		// Pixel width should be > 0 and typically > 20 for "Hello" at 14px
		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);
	});

	test('line height is based on font size', () => {
		const lineHeight = adapter.measurer.getLineHeight();
		// 14px * 1.2 lineHeight = 16.8
		expect(lineHeight).toBeCloseTo(16.8, 1);
	});

	test('createBuffer returns CanvasRenderBuffer', () => {
		const buffer = adapter.createBuffer(800, 600);
		expect(buffer).toBeInstanceOf(CanvasRenderBuffer);
		expect(buffer.width).toBe(800);
		expect(buffer.height).toBe(600);
	});

	test('getBorderChars returns valid characters', () => {
		const chars = adapter.getBorderChars('single');
		expect(chars.topLeft).toBe('┌');
		expect(chars.horizontal).toBe('─');
		expect(chars.vertical).toBe('│');
	});

	describe('CanvasRenderBuffer', () => {
		let buffer: CanvasRenderBuffer;

		beforeEach(() => {
			buffer = adapter.createBuffer(200, 100) as CanvasRenderBuffer;
		});

		test('inBounds returns correct values', () => {
			expect(buffer.inBounds(0, 0)).toBe(true);
			expect(buffer.inBounds(199, 99)).toBe(true);
			expect(buffer.inBounds(200, 100)).toBe(false);
			expect(buffer.inBounds(-1, 0)).toBe(false);
		});

		test('has canvas property', () => {
			expect(buffer.canvas).toBeDefined();
			expect(buffer.canvas.width).toBe(200);
			expect(buffer.canvas.height).toBe(100);
		});

		test('fillRect does not throw', () => {
			expect(() => {
				buffer.fillRect(10, 10, 50, 30, { bg: '#ff0000' });
			}).not.toThrow();
		});

		test('drawText does not throw', () => {
			expect(() => {
				buffer.drawText(10, 10, 'Hello World', { fg: '#ffffff' });
			}).not.toThrow();
		});

		test('drawChar does not throw', () => {
			expect(() => {
				buffer.drawChar(10, 10, '█', { fg: '#00ff00' });
			}).not.toThrow();
		});
	});
});

describe('Canvas Adapter (no canvas required)', () => {
	test('createCanvasAdapter is available', () => {
		expect(typeof createCanvasAdapter).toBe('function');
	});

	test('setRenderAdapter works', () => {
		// Save any existing adapter
		const hadAdapter = hasRenderAdapter();

		if (hasCanvas) {
			const adapter = createCanvasAdapter();
			setRenderAdapter(adapter);
			expect(hasRenderAdapter()).toBe(true);
			expect(getRenderAdapter().name).toBe('canvas');
		}
	});
});
