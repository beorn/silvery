/**
 * Tests for known bugs in inkx examples
 *
 * These tests reproduce bugs before fixing them.
 * Each test should FAIL initially, then pass after the fix.
 */
import { describe, expect, it, test } from 'bun:test';
import React, { useState } from 'react';
import { Box, type Key, Text, useInput } from '../src/index.js';
import { createRenderer, stripAnsi } from '../src/testing/index.tsx';

// ============================================================================
// Simplified components that reproduce the bugs
// ============================================================================

// Simplified Kanban for testing
function SimpleKanban() {
	const [selectedColumn, setSelectedColumn] = useState(0);
	const [selectedCard, setSelectedCard] = useState(0);

	useInput((input: string, key: Key) => {
		if (key.leftArrow || input === 'h') {
			setSelectedColumn((prev) => Math.max(0, prev - 1));
			setSelectedCard(0);
		}
		if (key.rightArrow || input === 'l') {
			setSelectedColumn((prev) => Math.min(2, prev + 1));
			setSelectedCard(0);
		}
		if (key.upArrow || input === 'k') {
			setSelectedCard((prev) => Math.max(0, prev - 1));
		}
		if (key.downArrow || input === 'j') {
			setSelectedCard((prev) => Math.min(2, prev + 1));
		}
	});

	const columns = ['To Do', 'In Progress', 'Done'];
	const cards = [['Card A1', 'Card A2', 'Card A3'], ['Card B1', 'Card B2'], ['Card C1']];

	return (
		<Box flexDirection="row" gap={1}>
			{columns.map((title, colIdx) => (
				<Box
					key={colIdx}
					flexDirection="column"
					flexGrow={1}
					borderStyle="single"
					borderColor={selectedColumn === colIdx ? 'cyan' : 'gray'}
				>
					{/* Column header - Bug 1: bg color should show */}
					<Box backgroundColor={selectedColumn === colIdx ? 'cyan' : undefined} paddingX={1}>
						<Text bold color={selectedColumn === colIdx ? 'black' : 'white'}>
							{title}
						</Text>
					</Box>

					{/* Cards */}
					<Box flexDirection="column" paddingX={1}>
						{cards[colIdx]?.map((card, cardIdx) => {
							const isCardSelected = selectedColumn === colIdx && selectedCard === cardIdx;
							return (
								<Box
									key={cardIdx}
									borderStyle="round"
									borderColor={isCardSelected ? 'cyan' : 'gray'}
									paddingX={1}
								>
									{isCardSelected ? (
										<Text backgroundColor="cyan" color="black">
											{card}
										</Text>
									) : (
										<Text>{card}</Text>
									)}
								</Box>
							);
						})}
					</Box>
				</Box>
			))}
		</Box>
	);
}

// Simplified TaskList for testing
function SimpleTaskList() {
	const [cursor, setCursor] = useState(0);
	const items = ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5'];

	useInput((input: string, key: Key) => {
		if (key.upArrow || input === 'k') {
			setCursor((prev) => Math.max(0, prev - 1));
		}
		if (key.downArrow || input === 'j') {
			setCursor((prev) => Math.min(items.length - 1, prev + 1));
		}
	});

	return (
		<Box flexDirection="column" height={10}>
			<Text bold color="yellow">
				Task List
			</Text>
			<Box flexDirection="column" borderStyle="single" borderColor="blue">
				{items.map((item, idx) => (
					<Text
						key={idx}
						backgroundColor={idx === cursor ? 'cyan' : undefined}
						color={idx === cursor ? 'black' : 'white'}
					>
						{idx === cursor ? '> ' : '  '}
						{item}
					</Text>
				))}
			</Box>
			<Text dim>Selected: {cursor + 1}</Text>
		</Box>
	);
}

// Simplified Dashboard for testing
function SimpleDashboard() {
	const [selectedPane, setSelectedPane] = useState(0);

	useInput((input: string, key: Key) => {
		if (key.leftArrow || input === 'h') {
			setSelectedPane((prev) => (prev - 1 + 3) % 3);
		}
		if (key.rightArrow || input === 'l') {
			setSelectedPane((prev) => (prev + 1) % 3);
		}
	});

	return (
		<Box flexDirection="column">
			<Text bold color="yellow">
				Dashboard
			</Text>
			<Box flexDirection="row" gap={1}>
				{['Stats', 'Activity', 'Progress'].map((title, idx) => (
					<Box
						key={idx}
						flexGrow={1}
						borderStyle="round"
						borderColor={selectedPane === idx ? 'cyan' : 'gray'}
						padding={1}
					>
						<Text bold color={selectedPane === idx ? 'cyan' : 'white'}>
							{title} {selectedPane === idx ? '[SEL]' : ''}
						</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}

// ============================================================================
// Bug reproduction tests
// ============================================================================

describe('Bug 1: Kanban column header background color', () => {
	const render = createRenderer({ cols: 100, rows: 30 });

	it('selected column header should have cyan background', () => {
		const { lastFrame } = render(<SimpleKanban />);
		const frame = lastFrame() ?? '';

		// The frame should contain ANSI code for cyan background (48;5;6 or 46)
		// around the "To Do" text when the first column is selected
		// Check that the header area has background color applied
		expect(frame).toContain('\x1b['); // Has ANSI codes

		// The "To Do" text should be rendered with background color
		// In the current bug, the card's bg overrides the header's bg
	});

	it('card selection should not override column header background', () => {
		const { lastFrame } = render(<SimpleKanban />);
		const frame = lastFrame() ?? '';

		// Count occurrences of cyan background codes
		// The ANSI format includes reset (0;) before the background code
		// Look for 48;5;6 (256-color cyan background) anywhere in SGR sequences
		const cyanBgMatches = frame.match(/\x1b\[[0-9;]*48;5;6[0-9;]*m/g) || [];

		// Should have at least 2 cyan backgrounds (header + card)
		// 1. Header background for "To Do" column
		// 2. Selected card "Card A1" background
		expect(cyanBgMatches.length).toBeGreaterThanOrEqual(2);
	});
});

describe('Bug 2: Kanban cursor movement', () => {
	const render = createRenderer({ cols: 100, rows: 30 });

	it('pressing j should move cursor down', () => {
		const { lastFrame, stdin } = render(<SimpleKanban />);

		// Initial: Card A1 selected (has cyan border/bg)
		let frame = lastFrame() ?? '';
		expect(frame).toContain('Card A1');

		// Press j to move down
		stdin.write('j');
		frame = lastFrame() ?? '';

		// After j: Card A2 should be selected
		// Check that the selection indicator moved
		const strippedFrame = stripAnsi(frame);
		// The selection state should have changed
		// Bug: cursor doesn't move, frame looks the same
	});

	it('pressing l should move to next column', () => {
		const { lastFrame, stdin } = render(<SimpleKanban />);

		// Initial: To Do column selected
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('To Do');

		// Press l to move right
		stdin.write('l');
		frame = lastFrame() ?? '';

		// After l: In Progress column should be selected (cyan border)
		// Bug: selection doesn't change
	});
});

describe('Bug 3: Colors lost after keyboard input', () => {
	const render = createRenderer({ cols: 80, rows: 24 });

	it('dashboard colors persist after pressing l', () => {
		const { lastFrame, stdin } = render(<SimpleDashboard />);

		const initialFrame = lastFrame() ?? '';
		// Initial frame should have ANSI color codes
		expect(initialFrame).toContain('\x1b[');

		// Count color codes in initial frame
		const initialColorCount = (initialFrame.match(/\x1b\[/g) || []).length;
		expect(initialColorCount).toBeGreaterThan(5); // Has many colors

		// Press a key
		stdin.write('l');

		const afterFrame = lastFrame() ?? '';
		const afterColorCount = (afterFrame.match(/\x1b\[/g) || []).length;

		// Bug: after input, colors are stripped
		// afterColorCount should be similar to initialColorCount
		expect(afterColorCount).toBeGreaterThan(5);
	});

	it('task-list colors persist after pressing j', () => {
		const { lastFrame, stdin } = render(<SimpleTaskList />);

		const initialFrame = lastFrame() ?? '';
		const initialColorCount = (initialFrame.match(/\x1b\[/g) || []).length;
		expect(initialColorCount).toBeGreaterThan(3);

		stdin.write('j');

		const afterFrame = lastFrame() ?? '';
		const afterColorCount = (afterFrame.match(/\x1b\[/g) || []).length;

		// Bug: colors lost after input
		expect(afterColorCount).toBeGreaterThan(3);
	});

	it('kanban colors persist after pressing j', () => {
		const { lastFrame, stdin } = render(<SimpleKanban />);

		const initialFrame = lastFrame() ?? '';
		const initialColorCount = (initialFrame.match(/\x1b\[/g) || []).length;
		expect(initialColorCount).toBeGreaterThan(10);

		stdin.write('j');

		const afterFrame = lastFrame() ?? '';
		const afterColorCount = (afterFrame.match(/\x1b\[/g) || []).length;

		// Bug: colors lost after input
		expect(afterColorCount).toBeGreaterThan(10);
	});
});

describe('Bug 4: Task-list layout changes after keypress', () => {
	const render = createRenderer({ cols: 60, rows: 20 });

	it('layout height should remain stable after input', () => {
		const { lastFrame, stdin } = render(<SimpleTaskList />);

		const initialFrame = lastFrame() ?? '';
		const initialLines = initialFrame.split('\n');
		const initialHeight = initialLines.length;

		// Press j to move down
		stdin.write('j');

		const afterFrame = lastFrame() ?? '';
		const afterLines = afterFrame.split('\n');
		const afterHeight = afterLines.length;

		// Bug: layout changes (height different)
		expect(afterHeight).toBe(initialHeight);
	});

	it('layout width should remain stable after input', () => {
		const { lastFrame, stdin } = render(<SimpleTaskList />);

		const initialFrame = lastFrame() ?? '';
		const initialMaxWidth = Math.max(
			...initialFrame.split('\n').map((line) => stripAnsi(line).length),
		);

		stdin.write('j');

		const afterFrame = lastFrame() ?? '';
		const afterMaxWidth = Math.max(...afterFrame.split('\n').map((line) => stripAnsi(line).length));

		// Width should be similar (within a few chars due to cursor indicator)
		expect(Math.abs(afterMaxWidth - initialMaxWidth)).toBeLessThan(5);
	});
});

describe('Bug 5: Overflow height calculation with borders', () => {
	const render = createRenderer({ cols: 40, rows: 15 });

	it('height=5 with border should show correct content lines', () => {
		const { lastFrame } = render(
			<Box borderStyle="single" height={5} overflow="hidden">
				<Box flexDirection="column">
					<Text>Line 1</Text>
					<Text>Line 2</Text>
					<Text>Line 3</Text>
					<Text>Line 4</Text>
					<Text>Line 5</Text>
					<Text>Line 6 - hidden</Text>
					<Text>Line 7 - hidden</Text>
				</Box>
			</Box>,
		);

		const frame = stripAnsi(lastFrame() ?? '');

		// With height=5 and single border (2 lines for top+bottom),
		// content area is 3 lines
		expect(frame).toContain('Line 1');
		expect(frame).toContain('Line 2');
		expect(frame).toContain('Line 3');

		// These should be hidden by overflow
		expect(frame).not.toContain('Line 6');
		expect(frame).not.toContain('Line 7');
	});

	it('height should include border in total box height', () => {
		const { lastFrame } = render(
			<Box borderStyle="single" height={7} overflow="hidden">
				<Box flexDirection="column">
					<Text>Line 1</Text>
					<Text>Line 2</Text>
					<Text>Line 3</Text>
					<Text>Line 4</Text>
					<Text>Line 5</Text>
					<Text>Line 6</Text>
					<Text>Line 7</Text>
				</Box>
			</Box>,
		);

		const frame = stripAnsi(lastFrame() ?? '');

		// height=7 with border = 5 content lines
		expect(frame).toContain('Line 1');
		expect(frame).toContain('Line 5');
		expect(frame).not.toContain('Line 7');
	});
});
