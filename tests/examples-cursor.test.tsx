import React, { useState } from 'react';
/**
 * Tests for example cursor movements
 *
 * These tests verify that stdin.write() properly triggers useInput hooks
 * and that state updates are reflected in the rendered output.
 */
import { describe, expect, it } from 'vitest';
import { Box, type Key, Text, useInput } from '../src/index.js';
import { createRenderer, stripAnsi } from '../src/testing/index.tsx';

// Simplified Dashboard component for testing
function TestDashboard() {
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
		<Box flexDirection="column" padding={1}>
			<Text bold color="yellow">
				Dashboard Test
			</Text>
			<Box flexDirection="row" gap={1}>
				{[0, 1, 2].map((i) => (
					<Box
						key={i}
						flexGrow={1}
						borderStyle="round"
						borderColor={selectedPane === i ? 'cyan' : 'gray'}
						padding={1}
					>
						<Text bold color={selectedPane === i ? 'cyan' : 'white'}>
							Pane {i + 1} {selectedPane === i ? '[SEL]' : ''}
						</Text>
					</Box>
				))}
			</Box>
			<Text dim>Selected pane: {selectedPane + 1}</Text>
		</Box>
	);
}

describe('Dashboard cursor movement', () => {
	const render = createRenderer({ cols: 100, rows: 20 });

	it('renders initial state with pane 1 selected', () => {
		const { lastFrame } = render(<TestDashboard />);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 1 [SEL]');
		expect(frame).not.toContain('Pane 2 [SEL]');
		expect(frame).not.toContain('Pane 3 [SEL]');
	});

	it("moves right when 'l' is pressed via stdin", () => {
		const { lastFrame, stdin } = render(<TestDashboard />);

		// Initial state
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 1 [SEL]');

		// Send 'l' to move right - state should update
		stdin.write('l');
		frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 2 [SEL]');
		expect(frame).not.toContain('Pane 1 [SEL]');
	});

	it("moves left when 'h' is pressed via stdin", () => {
		const { lastFrame, stdin } = render(<TestDashboard />);

		// Move to pane 2 first
		stdin.write('l');
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 2 [SEL]');

		// Move left back to pane 1
		stdin.write('h');
		frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 1 [SEL]');
	});

	it('wraps around when navigating past boundaries', () => {
		const { lastFrame, stdin } = render(<TestDashboard />);

		// Move left from pane 1 - should wrap to pane 3
		stdin.write('h');
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 3 [SEL]');

		// Move right from pane 3 - should wrap to pane 1
		stdin.write('l');
		frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 1 [SEL]');
	});

	it('handles multiple rapid inputs', () => {
		const { lastFrame, stdin } = render(<TestDashboard />);

		// Move right twice quickly
		stdin.write('l');
		stdin.write('l');
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 3 [SEL]');

		// Move left once
		stdin.write('h');
		frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('Pane 2 [SEL]');
	});
});

// Test scrollable list cursor movement
function TestScrollList() {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const items = ['Item A', 'Item B', 'Item C', 'Item D', 'Item E'];

	useInput((input: string, key: Key) => {
		if (key.upArrow || input === 'k') {
			setSelectedIndex((prev) => Math.max(0, prev - 1));
		}
		if (key.downArrow || input === 'j') {
			setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
		}
	});

	return (
		<Box flexDirection="column">
			{items.map((item, i) => (
				<Text
					key={i}
					backgroundColor={i === selectedIndex ? 'cyan' : undefined}
					color={i === selectedIndex ? 'black' : 'white'}
				>
					{i === selectedIndex ? '> ' : '  '}
					{item}
				</Text>
			))}
		</Box>
	);
}

describe('Scroll list cursor movement', () => {
	const render = createRenderer({ cols: 60, rows: 15 });

	it('renders initial state with first item selected', () => {
		const { lastFrame } = render(<TestScrollList />);
		const frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('> Item A');
		expect(frame).not.toContain('> Item B');
	});

	it("moves down when 'j' is pressed via stdin", () => {
		const { lastFrame, stdin } = render(<TestScrollList />);

		// Initial state
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('> Item A');

		// Send 'j' to move down - state should update
		stdin.write('j');
		frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('> Item B');
		expect(frame).not.toContain('> Item A');
	});

	it("moves up when 'k' is pressed via stdin", () => {
		const { lastFrame, stdin } = render(<TestScrollList />);

		// Move down first
		stdin.write('j');
		stdin.write('j');
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('> Item C');

		// Move up
		stdin.write('k');
		frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('> Item B');
	});

	it('clamps at list boundaries', () => {
		const { lastFrame, stdin } = render(<TestScrollList />);

		// Try to move up from first item - should stay at first
		stdin.write('k');
		let frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('> Item A');

		// Move to last item
		stdin.write('j');
		stdin.write('j');
		stdin.write('j');
		stdin.write('j');
		frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('> Item E');

		// Try to move past last - should stay at last
		stdin.write('j');
		frame = stripAnsi(lastFrame() ?? '');
		expect(frame).toContain('> Item E');
	});
});
