/**
 * DOM Adapter Unit Tests
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
	createDOMAdapter,
	DOMRenderBuffer,
	type DOMAdapterConfig,
} from '../src/adapters/dom-adapter.js';
import {
	setRenderAdapter,
	hasRenderAdapter,
	getRenderAdapter,
	type RenderAdapter,
} from '../src/render-adapter.js';

// Check if we have DOM support
const hasDOM = typeof document !== 'undefined';

describe.skipIf(!hasDOM)('DOM Adapter (browser)', () => {
	let adapter: RenderAdapter;

	beforeEach(() => {
		adapter = createDOMAdapter({
			fontSize: 14,
			fontFamily: 'monospace',
			lineHeight: 1.2,
		});
	});

	test('creates adapter with correct name', () => {
		expect(adapter.name).toBe('dom');
	});

	test('measurer returns dimensions', () => {
		const result = adapter.measurer.measureText('Hello');
		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);
	});

	test('createBuffer returns DOMRenderBuffer', () => {
		const buffer = adapter.createBuffer(800, 600);
		expect(buffer).toBeInstanceOf(DOMRenderBuffer);
		expect(buffer.width).toBe(800);
		expect(buffer.height).toBe(600);
	});
});

describe('DOM Adapter (no DOM required)', () => {
	test('createDOMAdapter is available', () => {
		expect(typeof createDOMAdapter).toBe('function');
	});

	test('creates adapter with correct name', () => {
		const adapter = createDOMAdapter();
		expect(adapter.name).toBe('dom');
	});

	test('getBorderChars returns valid characters', () => {
		const adapter = createDOMAdapter();
		const chars = adapter.getBorderChars('single');
		expect(chars.topLeft).toBe('┌');
		expect(chars.horizontal).toBe('─');
		expect(chars.vertical).toBe('│');
	});

	test('line height is based on font size', () => {
		const adapter = createDOMAdapter({ fontSize: 14, lineHeight: 1.2 });
		const lineHeight = adapter.measurer.getLineHeight();
		expect(lineHeight).toBeCloseTo(16.8, 1);
	});

	describe('DOMRenderBuffer', () => {
		let buffer: DOMRenderBuffer;

		beforeEach(() => {
			const adapter = createDOMAdapter();
			buffer = adapter.createBuffer(200, 100) as DOMRenderBuffer;
		});

		test('inBounds returns correct values', () => {
			expect(buffer.inBounds(0, 0)).toBe(true);
			expect(buffer.inBounds(199, 99)).toBe(true);
			expect(buffer.inBounds(200, 100)).toBe(false);
			expect(buffer.inBounds(-1, 0)).toBe(false);
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

		test('fillRect does not throw', () => {
			expect(() => {
				buffer.fillRect(10, 10, 50, 30, { bg: '#ff0000' });
			}).not.toThrow();
		});

		test('clear resets buffer', () => {
			buffer.drawText(10, 10, 'Test', {});
			buffer.clear();
			// No assertions, just verify it doesn't throw
		});
	});

	test('setRenderAdapter works with DOM adapter', () => {
		const adapter = createDOMAdapter();
		setRenderAdapter(adapter);
		expect(hasRenderAdapter()).toBe(true);
		expect(getRenderAdapter().name).toBe('dom');
	});
});
