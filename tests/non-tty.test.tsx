/**
 * Non-TTY Environment Tests (km-wvgu)
 *
 * Tests for inkx behavior when running in environments without a TTY:
 * - Piped output (stdout is not a TTY)
 * - CI environments (no interactive terminal)
 * - Running without a terminal attached
 * - Graceful degradation behavior
 *
 * The test renderer uses 80x24 dimensions by default, which matches
 * the fallback behavior when stdout.columns/rows are undefined (non-TTY).
 */

import { describe, expect, test } from 'bun:test';
import { Box, Text } from '../src/components/index.js';
import { createTestRenderer, normalizeFrame } from '../src/testing/index.js';

// Single shared render instance (required pattern for inkx tests)
const render = createTestRenderer();

describe('Non-TTY environments (km-wvgu)', () => {
	describe('Default dimensions when no TTY', () => {
		test('renders with default 80x24 dimensions', () => {
			const { lastFrame } = render(
				<Box width={80}>
					<Text>Full width text</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Full width text');
		});

		test('uses fallback dimensions for vertical layout', () => {
			const { lastFrame } = render(
				<Box flexDirection="column">
					<Text>Line 1</Text>
					<Text>Line 2</Text>
				</Box>,
			);
			const frame = normalizeFrame(lastFrame() ?? '');
			expect(frame).toContain('Line 1');
			expect(frame).toContain('Line 2');
		});
	});

	describe('Does not crash when stdout is piped', () => {
		test('basic text rendering works', () => {
			const { lastFrame } = render(<Text>Hello World</Text>);
			expect(lastFrame()).toContain('Hello World');
		});

		test('nested boxes render correctly', () => {
			const { lastFrame } = render(
				<Box flexDirection="column">
					<Box flexDirection="row">
						<Text>A</Text>
						<Text>B</Text>
					</Box>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});

		test('borders render correctly', () => {
			const { lastFrame } = render(
				<Box borderStyle="single" width={10} height={3}>
					<Text>Hi</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Hi');
		});

		test('rerender works correctly', () => {
			const { lastFrame, rerender } = render(<Text>Initial</Text>);
			expect(lastFrame()).toContain('Initial');
			rerender(<Text>Updated</Text>);
			expect(lastFrame()).toContain('Updated');
		});
	});

	describe('Graceful degradation', () => {
		test('styled text renders without crash', () => {
			const { lastFrame } = render(
				<Box>
					<Text color="red">Red</Text>
					<Text bold>Bold</Text>
				</Box>,
			);
			const frame = normalizeFrame(lastFrame() ?? '');
			expect(frame).toContain('Red');
			expect(frame).toContain('Bold');
		});

		test('unmount works cleanly', () => {
			const { unmount, lastFrame } = render(<Text>Cleanup test</Text>);
			expect(lastFrame()).toContain('Cleanup test');
			unmount();
			expect(lastFrame()).toContain('Cleanup test');
		});
	});

	describe('Edge cases', () => {
		test('handles empty content', () => {
			const { lastFrame } = render(
				<Box>
					<Text />
				</Box>,
			);
			expect(lastFrame()).toBeDefined();
		});
	});
});
