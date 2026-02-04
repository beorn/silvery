/**
 * Simulate the full board structure to replicate the bottom bar bug.
 */
import { describe, expect, test } from 'bun:test';
import { Box, Text } from '../src/index.js';
import { createRenderer } from '../src/testing/index.js';

describe('flexGrow in board structure', () => {
	const render = createRenderer({ cols: 80, rows: 24 });

	test('bottom bar in full board layout', () => {
		const termWidth = 80;
		const termHeight = 24;
		const contentHeight = termHeight - 2; // Minus top bar and bottom bar

		const app = render(
			<Box flexDirection="column" width={termWidth} height={termHeight} overflow="hidden">
				{/* Top bar */}
				<Box flexShrink={0} width={termWidth}>
					<Text>Top bar content</Text>
				</Box>
				{/* Content area */}
				<Box flexGrow={1} flexDirection="row" minHeight={1} overflow="hidden">
					<Text>Main content area</Text>
				</Box>
				{/* Bottom bar - the problematic one */}
				<Box flexDirection="row" flexShrink={0} width={termWidth}>
					<Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
						<Text dimColor>MEM</Text>
						<Text dimColor>{' 📁'}</Text>
					</Box>
					<Box flexGrow={0} flexShrink={0}>
						<Text dimColor>
							{' '}
							<Text>📋3</Text>
							{'   '}
							<Text>COLUMNS VIEW</Text>{' '}
						</Text>
					</Box>
				</Box>
			</Box>,
		);

		const text = app.text;
		const lines = text.split('\n');
		console.log('Full board - last line:', '[' + lines[lines.length - 1] + ']');

		// The bottom bar line should contain full COLUMNS VIEW
		expect(lines[lines.length - 1]).toContain('COLUMNS VIEW');
	});

	test('bottom bar with toast stack sibling', () => {
		const termWidth = 80;
		const termHeight = 24;

		// Replicate: content area, toast stack, bottom bar all in column layout
		const app = render(
			<Box flexDirection="column" width={termWidth} height={termHeight} overflow="hidden">
				{/* Top bar */}
				<Box flexShrink={0} width={termWidth}>
					<Text>Top bar</Text>
				</Box>
				{/* Content area with overlays */}
				<Box flexGrow={1} flexDirection="row" minHeight={1} overflow="hidden">
					<Text>Content</Text>
				</Box>
				{/* Toast stack (empty in this test) */}
				{/* Bottom bar */}
				<Box flexDirection="row" flexShrink={0} width={termWidth}>
					<Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
						<Text dimColor>MEM 📁</Text>
					</Box>
					<Box flexGrow={0} flexShrink={0}>
						<Text dimColor> 📋3 COLUMNS VIEW </Text>
					</Box>
				</Box>
			</Box>,
		);

		const text = app.text;
		const lines = text.split('\n');
		console.log('With toast - last line:', '[' + lines[lines.length - 1] + ']');

		expect(lines[lines.length - 1]).toContain('COLUMNS VIEW');
	});
});
