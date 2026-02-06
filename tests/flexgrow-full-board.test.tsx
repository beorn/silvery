/**
 * Full board simulation to replicate km-tui bottom bar truncation.
 */
import { describe, expect, test } from 'vitest';
import { Box, Text } from '../src/index.js';
import { createRenderer } from '../src/testing/index.js';

describe('flexGrow full board simulation', () => {
	test('complete board structure with COLUMNS VIEW', () => {
		const render = createRenderer({ cols: 80, rows: 24 });
		const termWidth = 80;
		const termHeight = 24;

		const app = render(
			<Box
				flexDirection="column"
				width={termWidth}
				height={termHeight}
				minHeight={3}
				overflow="hidden"
			>
				{/* Top bar */}
				<Box flexShrink={0} width={termWidth} backgroundColor="white">
					<Text color="gray" wrap="truncate">
						● 📁 / board / Inbox / Task 1
					</Text>
				</Box>
				{/* Content area (flexGrow={1}) */}
				<Box
					flexGrow={1}
					flexDirection="row"
					minHeight={1}
					maxHeight={termHeight - 2}
					overflow="hidden"
				>
					{/* Main board content area */}
					<Box flexGrow={1}>
						<Box flexDirection="column">
							<Text> · Inbox (1)</Text>
							<Text>{'─'.repeat(50)}…</Text>
							<Text>· Task 1</Text>
						</Box>
					</Box>
				</Box>
				{/* Bottom bar */}
				<Box flexDirection="row" flexShrink={0} width={termWidth} id="bottom-bar">
					{/* Left side: fills remaining space */}
					<Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden" id="left">
						<Text dimColor>MEM</Text>
						<Text dimColor>{' 📁'}</Text>
					</Box>
					{/* Right side: intrinsic width */}
					<Box flexGrow={0} flexShrink={0} id="right">
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
		const bottomLine = lines[lines.length - 1] || '';

		// Check computed widths
		const left = app.locator('#left');
		const right = app.locator('#right');
		const leftBox = left.boundingBox();
		const rightBox = right.boundingBox();

		// Verify right side contains full "COLUMNS VIEW"
		expect(bottomLine).toContain('COLUMNS VIEW');
		expect(bottomLine).toMatch(/COLUMNS VIEW\s*$/);
	});

	test('verify the exact broken scenario from km-tui', () => {
		// Exact dimensions and structure from the failing test
		const render = createRenderer({ cols: 80, rows: 24 });
		const termWidth = 80;
		const termHeight = 24;

		// The actual bottom bar has these components when in COLUMNS view:
		// Left: "MEM 📁" (6 chars display width)
		// Middle: (empty in test - no status)
		// Right: " 📋3   COLUMNS VIEW " (21 chars display width)
		//
		// With flexGrow={1}+flexGrow={0}, left should get 80-21=59 chars

		const viewModeStr = 'COLUMNS VIEW';
		const nodeCount = 3;

		const app = render(
			<Box flexDirection="column" width={termWidth} height={termHeight} overflow="hidden">
				{/* Top bar (from km-tui Board.tsx line 219-228) */}
				<Box flexShrink={0} width={termWidth}>
					<Text wrap="truncate">Top bar content</Text>
				</Box>
				{/* Content area (from km-tui Board.tsx line 229-427) */}
				<Box flexGrow={1} flexDirection="row" minHeight={1} overflow="hidden">
					<Text>Content fills remaining space</Text>
				</Box>
				{/* Bottom bar (from km-tui board-bottom-bar.tsx) */}
				<Box flexDirection="row" flexShrink={0} width={termWidth} id="bottom-bar">
					<Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden" id="left">
						<Text dimColor>MEM</Text>
						<Text dimColor>{' 📁'}</Text>
					</Box>
					<Box flexGrow={0} flexShrink={0} id="right">
						<Text dimColor>
							{' '}
							<Text id="node-count">📋{nodeCount}</Text>
							{'   '}
							<Text id="view-mode">{viewModeStr}</Text>{' '}
						</Text>
					</Box>
				</Box>
			</Box>,
		);

		const text = app.text;
		const lines = text.split('\n');
		const bottomLine = lines[lines.length - 1] || '';

		// Get box widths
		const leftBox = app.locator('#left').boundingBox();
		const rightBox = app.locator('#right').boundingBox();

		expect(bottomLine).toContain('COLUMNS VIEW');
	});
});
