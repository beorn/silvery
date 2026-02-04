/**
 * Content Phase Clearing Tests
 *
 * Verifies that incremental rendering clears stale backgrounds on Text nodes,
 * not just Box nodes. Reproduces the bug where Text backgroundColor transitions
 * (e.g., "yellow" → undefined) left stale colored pixels in the cloned buffer.
 *
 * Bug: km-jmxuh, km-inkx-stale
 */
import { describe, expect, test } from 'bun:test';
import React, { useState } from 'react';
import { Box, type Key, Text, useInput } from '../../src/index.js';
import { createRenderer } from '../../src/testing/index.js';

describe('Text node backgroundColor clearing (incremental)', () => {
	const render = createRenderer({ cols: 40, rows: 10 });

	test('Text backgroundColor removed on rerender clears stale bg', () => {
		function Header({ active }: { active: boolean }) {
			return (
				<Box flexDirection="column" width={40}>
					<Text backgroundColor={active ? 'yellow' : undefined}>Header</Text>
					<Text>Body</Text>
				</Box>
			);
		}

		const app = render(<Header active={true} />, { incremental: true });

		// Initial: header has yellow bg (index 3)
		const headerBox = app.getByText('Header').boundingBox()!;
		expect(app.term.cell(headerBox.x, headerBox.y).bg).toBe(3);

		// Rerender with backgroundColor removed
		app.rerender(<Header active={false} />);

		// Header should no longer have yellow bg
		const cell = app.term.cell(headerBox.x, headerBox.y);
		expect(cell.bg).not.toBe(3);
	});

	test('Text backgroundColor toggled via keyboard clears stale bg', () => {
		function Toggle() {
			const [highlighted, setHighlighted] = useState(true);

			useInput((input: string) => {
				if (input === ' ') setHighlighted((h) => !h);
			});

			return (
				<Box flexDirection="column" width={40}>
					<Text backgroundColor={highlighted ? 'yellow' : undefined}>Toggle Me</Text>
					<Text>Other Content</Text>
				</Box>
			);
		}

		const app = render(<Toggle />, { incremental: true });

		// Initial: highlighted
		const textBox = app.getByText('Toggle Me').boundingBox()!;
		expect(app.term.cell(textBox.x, textBox.y).bg).toBe(3);

		// Toggle off
		app.press(' ');
		expect(app.term.cell(textBox.x, textBox.y).bg).not.toBe(3);

		// Toggle back on
		app.press(' ');
		expect(app.term.cell(textBox.x, textBox.y).bg).toBe(3);
	});

	test('multiple Text nodes with conditional backgroundColor', () => {
		function SelectableHeaders({ selected }: { selected: number }) {
			const items = ['Alpha', 'Beta', 'Gamma'];
			return (
				<Box flexDirection="column" width={40}>
					{items.map((item, i) => (
						<Text key={i} backgroundColor={i === selected ? 'yellow' : undefined}>
							{item}
						</Text>
					))}
				</Box>
			);
		}

		const app = render(<SelectableHeaders selected={0} />, { incremental: true });

		// Initial: Alpha has yellow bg
		const alphaBox = app.getByText('Alpha').boundingBox()!;
		const betaBox = app.getByText('Beta').boundingBox()!;
		const gammaBox = app.getByText('Gamma').boundingBox()!;

		expect(app.term.cell(alphaBox.x, alphaBox.y).bg).toBe(3);
		expect(app.term.cell(betaBox.x, betaBox.y).bg).not.toBe(3);

		// Move selection to Beta
		app.rerender(<SelectableHeaders selected={1} />);

		expect(app.term.cell(alphaBox.x, alphaBox.y).bg).not.toBe(3); // cleared
		expect(app.term.cell(betaBox.x, betaBox.y).bg).toBe(3); // now yellow
		expect(app.term.cell(gammaBox.x, gammaBox.y).bg).not.toBe(3);

		// Move selection to Gamma
		app.rerender(<SelectableHeaders selected={2} />);

		expect(app.term.cell(alphaBox.x, alphaBox.y).bg).not.toBe(3);
		expect(app.term.cell(betaBox.x, betaBox.y).bg).not.toBe(3); // cleared
		expect(app.term.cell(gammaBox.x, gammaBox.y).bg).toBe(3); // now yellow
	});

	test('parent bg inherited when clearing child Text (Bug 1: km-inkx-stale)', () => {
		// Bug 1: When parent Box has backgroundColor=white and child Text has no bg,
		// clearing the Text region should use the parent's white bg, not null (black).
		function BoardTitle({ active }: { active: boolean }) {
			return (
				<Box backgroundColor="white" width={40} height={3} flexDirection="column">
					<Text color={active ? 'yellow' : undefined}>Title</Text>
					<Text>Subtitle</Text>
				</Box>
			);
		}

		const app = render(<BoardTitle active={true} />, { incremental: true });

		// Initial: Title text cell should have white bg from parent Box
		const titleBox = app.getByText('Title').boundingBox()!;
		expect(app.term.cell(titleBox.x, titleBox.y).bg).toBe(7); // white = 7

		// Rerender: Title loses its yellow color, paintDirty triggers clearing
		app.rerender(<BoardTitle active={false} />);

		// After clearing, the Title cell should still have white bg (inherited from parent)
		// NOT null/black which was the old bug behavior
		const cell = app.term.cell(titleBox.x, titleBox.y);
		expect(cell.bg).toBe(7); // white bg inherited from parent Box
	});

	test('paintDirty-only node is NOT skipped by fast-path (Bug 2: km-inkx-stale)', () => {
		// Bug 2: A node with only paintDirty=true (contentDirty cleared by measure,
		// no layout change, subtreeDirty not propagated) should NOT be fast-path skipped.
		function StyledText({ highlighted }: { highlighted: boolean }) {
			return (
				<Box flexDirection="column" width={40}>
					<Text backgroundColor={highlighted ? 'cyan' : undefined}>Styled</Text>
					<Text>Other</Text>
				</Box>
			);
		}

		const app = render(<StyledText highlighted={true} />, { incremental: true });

		const styledBox = app.getByText('Styled').boundingBox()!;
		expect(app.term.cell(styledBox.x, styledBox.y).bg).toBe(6); // cyan = 6

		// Toggle off — this triggers paintDirty on the Text node
		app.rerender(<StyledText highlighted={false} />);

		// The cyan bg should be gone — paintDirty node was NOT skipped
		expect(app.term.cell(styledBox.x, styledBox.y).bg).not.toBe(6);
	});

	test('scroll container clearing preserves parent bg (Bug 4: km-inkx-stale)', () => {
		// Bug 4: Scroll container clearing at line 189 used bg=null,
		// destroying parent's painted background.
		function ScrollWithBg({ selected }: { selected: number }) {
			return (
				<Box backgroundColor="white" width={20} height={5} flexDirection="column">
					<Box overflow="scroll" height={3} flexGrow={1}>
						{['A', 'B', 'C', 'D'].map((item, i) => (
							<Text key={i} backgroundColor={i === selected ? 'yellow' : undefined}>
								{item}
							</Text>
						))}
					</Box>
				</Box>
			);
		}

		const app = render(<ScrollWithBg selected={0} />, { incremental: true });

		// Move selection — triggers scroll container child re-render
		app.rerender(<ScrollWithBg selected={1} />);

		// After clearing, cells in scroll container area without explicit bg
		// should inherit white from parent Box, not be null/black
		const itemA = app.getByText('A').boundingBox()!;
		const cell = app.term.cell(itemA.x, itemA.y);
		// A lost its yellow bg - should now show white from ancestor, not null
		expect(cell.bg).toBe(7); // white = 7, inherited from parent Box
	});

	test('Box backgroundColor still works with clearing', () => {
		// Ensure the fix doesn't break Box clearing
		function BoxToggle({ active }: { active: boolean }) {
			return (
				<Box flexDirection="column" width={40}>
					<Box backgroundColor={active ? 'yellow' : undefined} width={10} height={1}>
						<Text>Box</Text>
					</Box>
					<Text>Below</Text>
				</Box>
			);
		}

		const app = render(<BoxToggle active={true} />, { incremental: true });

		const boxLoc = app.getByText('Box').boundingBox()!;
		expect(app.term.cell(boxLoc.x, boxLoc.y).bg).toBe(3);

		app.rerender(<BoxToggle active={false} />);

		expect(app.term.cell(boxLoc.x, boxLoc.y).bg).not.toBe(3);
	});
});
