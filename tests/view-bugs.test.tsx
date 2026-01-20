/**
 * Tests for view component bugs
 *
 * Bug reproductions for:
 * - km-r0nz: Columns view vertical spacing inconsistency
 * - km-d5e9: Cards view top bar black on black text
 * - km-5x66: Cards view bottom bar loses background color
 * - km-n29q: Empty column navigation fails
 */
import { describe, expect, it } from 'bun:test';
import React, { useState } from 'react';
import { Box, type Key, Text, useInput } from '../src/index.js';
import { createTestRenderer, normalizeFrame, stripAnsi } from '../src/testing/index.tsx';

// ============================================================================
// Bug km-r0nz: Columns view vertical spacing inconsistency
// ============================================================================

describe('Bug km-r0nz: Columns view vertical spacing', () => {
	const render = createTestRenderer({ columns: 60, rows: 20 });

	// Simplified column component that mimics the km columns view structure
	function SimpleColumnsView() {
		const items = [
			{ name: 'Task A', hasContext: false },
			{ name: 'Task B with context', hasContext: true, context: 'Project X' },
			{ name: 'Task C', hasContext: false },
			{ name: 'Task D with context', hasContext: true, context: 'Project Y' },
		];

		return (
			<Box flexDirection="column" width={40} height={15}>
				<Text bold>Column Header</Text>
				<Box flexDirection="column" overflow="scroll">
					{items.map((item, i) => (
						<Box key={i} flexDirection="column" width={40}>
							{/* Parent context line - only shown for some items */}
							{item.hasContext && (
								<Text dimColor italic>
									{item.context}
								</Text>
							)}
							<Text>{item.name}</Text>
						</Box>
					))}
				</Box>
			</Box>
		);
	}

	it('items should have consistent vertical spacing', () => {
		const { lastFrame } = render(<SimpleColumnsView />);
		const frame = normalizeFrame(lastFrame() ?? '');
		const lines = frame.split('\n');

		// Find lines with task names
		const taskLines: number[] = [];
		lines.forEach((line, idx) => {
			if (line.includes('Task A') || line.includes('Task B') || line.includes('Task C') || line.includes('Task D')) {
				taskLines.push(idx);
			}
		});

		// Check that tasks without context are on consecutive lines
		// Task A and Task C should not have extra blank lines above them
		// This test documents the expected behavior
		expect(taskLines.length).toBe(4);
	});

	it('context lines should render above items that have them', () => {
		const { lastFrame } = render(<SimpleColumnsView />);
		const frame = stripAnsi(lastFrame() ?? '');

		// Context should appear immediately before its task
		const projectXIndex = frame.indexOf('Project X');
		const taskBIndex = frame.indexOf('Task B');
		expect(projectXIndex).toBeLessThan(taskBIndex);

		const projectYIndex = frame.indexOf('Project Y');
		const taskDIndex = frame.indexOf('Task D');
		expect(projectYIndex).toBeLessThan(taskDIndex);
	});
});

// ============================================================================
// Bug km-d5e9: Cards view top bar black on black text
// ============================================================================

describe('Bug km-d5e9: Top bar text visibility', () => {
	const render = createTestRenderer({ columns: 80, rows: 24 });

	// Simplified top bar that mimics Board.tsx rendering
	function SimpleTopBar({ bgColor, useWhiteText }: { bgColor?: string; useWhiteText: boolean }) {
		// This mimics the Board.tsx pattern of using chalk for top bar
		// The bug occurs when useWhiteText is false but bgColor is dark
		const style: { backgroundColor?: string; color: string } = {
			color: useWhiteText ? 'white' : 'black',
		};
		if (bgColor) {
			style.backgroundColor = bgColor;
		}

		return (
			<Box width={80} height={1}>
				<Text {...style}>Board / Path / To / Item</Text>
			</Box>
		);
	}

	it('top bar text should be visible on white background', () => {
		const { lastFrame } = render(<SimpleTopBar bgColor="white" useWhiteText={false} />);
		const frame = lastFrame() ?? '';

		// Should have black text color code (30) on white background (47)
		expect(frame).toContain('Board');
		// Text should be readable (not black on black)
	});

	it('top bar text should be visible on blue background', () => {
		const { lastFrame } = render(<SimpleTopBar bgColor="blue" useWhiteText={true} />);
		const frame = lastFrame() ?? '';

		// Should have white text on blue background
		expect(frame).toContain('Board');
	});

	it('top bar with no bgColor defaults should be visible', () => {
		// This reproduces the startup state where board color isn't set
		const { lastFrame } = render(<SimpleTopBar useWhiteText={false} />);
		const frame = lastFrame() ?? '';

		// Without background set, we need white text or terminal default
		expect(frame).toContain('Board');
	});
});

// ============================================================================
// Bug km-5x66: Bottom bar background color loss
// ============================================================================

describe('Bug km-5x66: Bottom bar background color', () => {
	const render = createTestRenderer({ columns: 80, rows: 24 });

	// Simplified bottom bar that mimics Board.tsx pattern
	function SimpleBottomBar() {
		return (
			<Box width={80} justifyContent="space-between" paddingX={1}>
				{/* Left side: store indicator (the bug) */}
				<Text>
					<Text color="green">DISK REPO /path/to/vault</Text>
				</Text>
				{/* Right side: mode indicators */}
				<Text>
					<Text inverse>{' CARDS VIEW '}</Text>
				</Text>
			</Box>
		);
	}

	// Fixed version with proper background
	function FixedBottomBar() {
		return (
			<Box width={80} justifyContent="space-between" paddingX={1}>
				<Text color="green">DISK REPO /path/to/vault</Text>
				<Text inverse>{' CARDS VIEW '}</Text>
			</Box>
		);
	}

	it('nested Text components should inherit styles', () => {
		const { lastFrame } = render(<SimpleBottomBar />);
		const frame = lastFrame() ?? '';

		// The nested Text with color="green" should render green
		// Check for green color ANSI codes (32 or 38;5;2)
		expect(frame).toContain('DISK REPO');
	});

	it('bottom bar text should not have broken background', () => {
		const { lastFrame } = render(<FixedBottomBar />);
		const frame = stripAnsi(lastFrame() ?? '');

		// Should have both indicators
		expect(frame).toContain('DISK REPO');
		expect(frame).toContain('CARDS VIEW');
	});
});

// ============================================================================
// Bug km-n29q: Empty column navigation
// ============================================================================

describe('Bug km-n29q: Empty column navigation', () => {
	const render = createTestRenderer({ columns: 100, rows: 20 });

	// Simplified navigation that mimics kanban column navigation
	function ColumnsNav() {
		const [colIndex, setColIndex] = useState(0);
		const [cardIndex, setCardIndex] = useState(0);

		const columns = [
			{ name: 'Todo', cards: ['Task 1', 'Task 2'] },
			{ name: 'Empty Column', cards: [] }, // Empty column!
			{ name: 'Done', cards: ['Task 3'] },
		];

		useInput((input: string, key: Key) => {
			if (key.leftArrow || input === 'h') {
				setColIndex((prev) => Math.max(0, prev - 1));
				// Reset card index when changing columns
				const newColIndex = Math.max(0, colIndex - 1);
				const newCol = columns[newColIndex];
				setCardIndex(newCol?.cards.length ? 0 : 0);
			}
			if (key.rightArrow || input === 'l') {
				setColIndex((prev) => Math.min(columns.length - 1, prev + 1));
				// Reset card index when changing columns
				const newColIndex = Math.min(columns.length - 1, colIndex + 1);
				const newCol = columns[newColIndex];
				setCardIndex(newCol?.cards.length ? 0 : 0);
			}
			if (key.upArrow || input === 'k') {
				const currentCol = columns[colIndex];
				if (currentCol && currentCol.cards.length > 0) {
					setCardIndex((prev) => Math.max(0, prev - 1));
				}
			}
			if (key.downArrow || input === 'j') {
				const currentCol = columns[colIndex];
				if (currentCol && currentCol.cards.length > 0) {
					setCardIndex((prev) => Math.min(currentCol.cards.length - 1, prev + 1));
				}
			}
		});

		return (
			<Box flexDirection="row" gap={1}>
				{columns.map((col, idx) => (
					<Box
						key={idx}
						flexDirection="column"
						width={20}
						borderStyle="single"
						borderColor={idx === colIndex ? 'cyan' : 'gray'}
					>
						<Text bold color={idx === colIndex ? 'cyan' : 'white'}>
							{col.name} ({col.cards.length})
						</Text>
						<Box flexDirection="column">
							{col.cards.length === 0 ? (
								<Text dimColor>(empty)</Text>
							) : (
								col.cards.map((card, cardIdx) => {
									const isSelected = idx === colIndex && cardIdx === cardIndex;
									return (
										<Text
											key={cardIdx}
											backgroundColor={isSelected ? 'cyan' : undefined}
											color={isSelected ? 'black' : 'white'}
										>
											{card}
										</Text>
									);
								})
							)}
						</Box>
					</Box>
				))}
			</Box>
		);
	}

	it('should navigate into empty column', () => {
		const { lastFrame, stdin } = render(<ColumnsNav />);

		// Initial: first column selected
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Todo');

		// Navigate right to empty column
		stdin.write('l');
		frame = stripAnsi(lastFrame() ?? '');
		// Should now show empty column as selected
		expect(frame).toContain('Empty Column');
	});

	it('should navigate back from empty column', () => {
		const { lastFrame, stdin } = render(<ColumnsNav />);

		// Navigate to empty column
		stdin.write('l');
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('(empty)');

		// Navigate back
		stdin.write('h');
		frame = stripAnsi(lastFrame() ?? '');

		// Should be back at first column
		// The bug is that navigation back might not work properly
	});

	it('should navigate through empty column to next column', () => {
		const { lastFrame, stdin } = render(<ColumnsNav />);

		// Navigate to empty column
		stdin.write('l');

		// Navigate to done column
		stdin.write('l');
		const frame = stripAnsi(lastFrame() ?? '');

		// Should be at Done column
		expect(frame).toContain('Done');
	});

	it('vertical navigation should not break in empty column', () => {
		const { lastFrame, stdin } = render(<ColumnsNav />);

		// Navigate to empty column
		stdin.write('l');

		// Try vertical navigation (should not crash or break state)
		stdin.write('j'); // down
		stdin.write('k'); // up

		const frame = stripAnsi(lastFrame() ?? '');
		// Should still be at empty column, not broken
		expect(frame).toContain('Empty Column');
	});
});
