/**
 * Render Adapter Core Tests
 */

import { beforeEach, describe, expect, test } from 'vitest';
import {
	type RenderAdapter,
	type RenderBuffer,
	type RenderStyle,
	type TextMeasurer,
	getRenderAdapter,
	getTextMeasurer,
	hasRenderAdapter,
	setRenderAdapter,
} from '../src/render-adapter.js';

// Mock adapter for testing
function createMockAdapter(): RenderAdapter {
	const mockMeasurer: TextMeasurer = {
		measureText: (text) => ({ width: text.length, height: 1 }),
		getLineHeight: () => 1,
	};

	const mockBuffer: RenderBuffer = {
		width: 80,
		height: 24,
		fillRect: () => {},
		drawText: () => {},
		drawChar: () => {},
		inBounds: (x, y) => x >= 0 && x < 80 && y >= 0 && y < 24,
	};

	return {
		name: 'mock',
		measurer: mockMeasurer,
		createBuffer: () => mockBuffer,
		flush: () => 'mock-output',
		getBorderChars: () => ({
			topLeft: '+',
			topRight: '+',
			bottomLeft: '+',
			bottomRight: '+',
			horizontal: '-',
			vertical: '|',
		}),
	};
}

describe('Render Adapter', () => {
	test('setRenderAdapter and getRenderAdapter work', () => {
		const adapter = createMockAdapter();
		setRenderAdapter(adapter);

		expect(hasRenderAdapter()).toBe(true);
		expect(getRenderAdapter()).toBe(adapter);
		expect(getRenderAdapter().name).toBe('mock');
	});

	test('getTextMeasurer returns adapter measurer', () => {
		const adapter = createMockAdapter();
		setRenderAdapter(adapter);

		const measurer = getTextMeasurer();
		expect(measurer).toBe(adapter.measurer);
		expect(measurer.measureText('test').width).toBe(4);
	});

	test('adapter creates buffer with dimensions', () => {
		const adapter = createMockAdapter();
		setRenderAdapter(adapter);

		const buffer = adapter.createBuffer(100, 50);
		expect(buffer.width).toBe(80); // Mock always returns 80x24
		expect(buffer.height).toBe(24);
	});

	test('adapter getBorderChars returns chars', () => {
		const adapter = createMockAdapter();
		const chars = adapter.getBorderChars('single');
		expect(chars.horizontal).toBe('-');
		expect(chars.vertical).toBe('|');
	});
});
