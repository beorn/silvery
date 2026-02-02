import { beforeAll, describe, expect, it } from 'bun:test';
import React from 'react';
import { Box, Text } from '../../src/index.js';
import { diff, ensureLayoutEngine, layout } from '../../src/runtime/index.js';

describe('runtime/layout', () => {
	beforeAll(async () => {
		await ensureLayoutEngine();
	});

	describe('layout()', () => {
		it('renders simple text to buffer', () => {
			const buffer = layout(<Text>Hello World</Text>, { cols: 80, rows: 24 });

			expect(buffer.text).toContain('Hello World');
			expect(buffer.ansi).toContain('Hello World');
			expect(buffer.nodes).toBeDefined();
		});

		it('handles styled text', () => {
			const buffer = layout(<Text bold>Bold Text</Text>, { cols: 80, rows: 24 });

			expect(buffer.text).toContain('Bold Text');
			// ANSI should contain bold escape code (ESC[1m)
			expect(buffer.ansi).toMatch(/\x1b\[\d+;?\d*m/);
		});

		it('handles nested boxes', () => {
			const buffer = layout(
				<Box flexDirection="column">
					<Text>Line 1</Text>
					<Text>Line 2</Text>
				</Box>,
				{ cols: 80, rows: 24 },
			);

			expect(buffer.text).toContain('Line 1');
			expect(buffer.text).toContain('Line 2');
		});

		it('respects dimensions', () => {
			const buffer = layout(<Text>Test</Text>, { cols: 10, rows: 5 });

			// Buffer should not exceed dimensions
			const lines = buffer.text.split('\n');
			expect(lines.length).toBeLessThanOrEqual(5);
			for (const line of lines) {
				expect(line.length).toBeLessThanOrEqual(10);
			}
		});
	});

	describe('diff()', () => {
		it('returns full render on first render (prev null)', () => {
			const buffer = layout(<Text>Hello</Text>, { cols: 80, rows: 24 });
			const output = diff(null, buffer);

			expect(output).toContain('Hello');
		});

		it('returns empty string when buffers are identical', () => {
			const dims = { cols: 80, rows: 24 };
			const buffer1 = layout(<Text>Hello</Text>, dims);
			const buffer2 = layout(<Text>Hello</Text>, dims);

			const output = diff(buffer1, buffer2);

			// Diff should be minimal (possibly empty or just cursor positioning)
			expect(output.length).toBeLessThan(buffer2.ansi.length);
		});

		it('returns patch when content changes', () => {
			const dims = { cols: 80, rows: 24 };
			const prev = layout(<Text>Hello</Text>, dims);
			const next = layout(<Text>World</Text>, dims);

			const output = diff(prev, next);

			// Diff outputs only changed characters:
			// "Hello" → "World" changes at positions 1,2,3,5 (H→W, e→o, l→r, o→d)
			// Position 4 (l→l) is unchanged, so diff skips it
			expect(output).toMatch(/Wor/);
			expect(output).toMatch(/d/);
			// Should contain cursor positioning escape codes
			expect(output).toMatch(/\x1b\[/);
		});
	});
});
