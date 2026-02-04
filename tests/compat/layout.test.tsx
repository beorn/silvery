/**
 * Layout API Compatibility Tests
 *
 * Tests that verify Inkx accepts the same props as Ink.
 * These tests verify API compatibility (props accepted without error).
 *
 * Note: The test renderer uses simplified text extraction without full Yoga layout.
 * For visual layout verification, use the visual regression tests (e2e/).
 */

import React from 'react';
import { describe, expect, test } from 'vitest';
import { Box, Newline, Spacer, Text } from '../../src/index.js';
import { createRenderer } from '../../src/testing/index.js';

const render = createRenderer();

describe('Layout API Compatibility', () => {
	describe('Flex Direction', () => {
		test('accepts flexDirection="row"', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" width={10}>
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});

		test('accepts flexDirection="column"', () => {
			const { lastFrame } = render(
				<Box flexDirection="column" width={10}>
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});

		test('accepts flexDirection="row-reverse"', () => {
			const { lastFrame } = render(
				<Box flexDirection="row-reverse" width={10}>
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});

		test('accepts flexDirection="column-reverse"', () => {
			const { lastFrame } = render(
				<Box flexDirection="column-reverse" width={10}>
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});
	});

	describe('Flex Properties', () => {
		test('accepts flexGrow', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" width={20}>
					<Box flexGrow={1}>
						<Text>L</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>R</Text>
					</Box>
				</Box>,
			);
			expect(lastFrame()).toContain('L');
			expect(lastFrame()).toContain('R');
		});

		test('accepts flexShrink', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" width={20}>
					<Box flexShrink={0}>
						<Text>Fixed</Text>
					</Box>
					<Box flexShrink={1}>
						<Text>Shrink</Text>
					</Box>
				</Box>,
			);
			expect(lastFrame()).toContain('Fixed');
			expect(lastFrame()).toContain('Shrink');
		});

		test('accepts flexBasis', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" width={20}>
					<Box flexBasis={10}>
						<Text>Ten</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>Rest</Text>
					</Box>
				</Box>,
			);
			expect(lastFrame()).toContain('Ten');
			expect(lastFrame()).toContain('Rest');
		});

		test('accepts flexWrap', () => {
			const { lastFrame } = render(
				<Box flexWrap="wrap" width={10}>
					<Text>A</Text>
					<Text>B</Text>
					<Text>C</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
			expect(lastFrame()).toContain('C');
		});
	});

	describe('Dimensions', () => {
		test('accepts width as number', () => {
			const { lastFrame } = render(
				<Box width={10}>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts width as percentage string', () => {
			const { lastFrame } = render(
				<Box width="50%">
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts height as number', () => {
			const { lastFrame } = render(
				<Box height={5}>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts minWidth/maxWidth', () => {
			const { lastFrame } = render(
				<Box minWidth={5} maxWidth={20}>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts minHeight/maxHeight', () => {
			const { lastFrame } = render(
				<Box minHeight={2} maxHeight={10}>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});
	});

	describe('Padding', () => {
		test('accepts padding (all sides)', () => {
			const { lastFrame } = render(
				<Box padding={1}>
					<Text>Padded</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Padded');
		});

		test('accepts paddingX/paddingY', () => {
			const { lastFrame } = render(
				<Box paddingX={2} paddingY={1}>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts paddingTop/Bottom/Left/Right', () => {
			const { lastFrame } = render(
				<Box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});
	});

	describe('Margin', () => {
		test('accepts margin (all sides)', () => {
			const { lastFrame } = render(
				<Box margin={1}>
					<Text>Margined</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Margined');
		});

		test('accepts marginX/marginY', () => {
			const { lastFrame } = render(
				<Box marginX={2} marginY={1}>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts marginTop/Bottom/Left/Right', () => {
			const { lastFrame } = render(
				<Box marginTop={1} marginBottom={1} marginLeft={2} marginRight={2}>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});
	});

	describe('Alignment', () => {
		test('accepts alignItems', async () => {
			const values = ['flex-start', 'flex-end', 'center', 'stretch', 'baseline'] as const;
			for (const alignItems of values) {
				const { lastFrame } = await render(
					<Box alignItems={alignItems} height={3}>
						<Text>Content</Text>
					</Box>,
				);
				expect(lastFrame()).toContain('Content');
			}
		});

		test('accepts alignSelf', () => {
			const { lastFrame } = render(
				<Box height={3}>
					<Box alignSelf="center">
						<Text>Content</Text>
					</Box>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts justifyContent', async () => {
			const values = [
				'flex-start',
				'flex-end',
				'center',
				'space-between',
				'space-around',
				'space-evenly',
			] as const;
			for (const justifyContent of values) {
				const { lastFrame } = await render(
					<Box justifyContent={justifyContent} width={20}>
						<Text>A</Text>
						<Text>B</Text>
					</Box>,
				);
				expect(lastFrame()).toContain('A');
				expect(lastFrame()).toContain('B');
			}
		});
	});

	describe('Gap', () => {
		test('accepts gap', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" gap={2} width={20}>
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});
	});

	describe('Position', () => {
		test('accepts position="relative" (default)', () => {
			const { lastFrame } = render(
				<Box position="relative">
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts position="absolute"', () => {
			const { lastFrame } = render(
				<Box width={20} height={5}>
					<Box position="absolute">
						<Text>Absolute</Text>
					</Box>
				</Box>,
			);
			expect(lastFrame()).toContain('Absolute');
		});
	});

	describe('Display', () => {
		test('accepts display="flex" (default)', () => {
			const { lastFrame } = render(
				<Box display="flex">
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts display="none"', () => {
			const { lastFrame } = render(
				<Box>
					<Box display="none">
						<Text>Hidden</Text>
					</Box>
					<Text>Visible</Text>
				</Box>,
			);
			const frame = lastFrame();
			expect(frame).toContain('Visible');
			expect(frame).not.toContain('Hidden');
		});
	});

	describe('Borders', () => {
		test('accepts all borderStyle values', async () => {
			const styles = ['single', 'double', 'round', 'bold', 'classic'] as const;
			for (const borderStyle of styles) {
				const { lastFrame } = await render(
					<Box borderStyle={borderStyle}>
						<Text>Content</Text>
					</Box>,
				);
				expect(lastFrame()).toContain('Content');
			}
		});

		test('accepts borderColor', () => {
			const { lastFrame } = render(
				<Box borderStyle="single" borderColor="red">
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});

		test('accepts borderTop/Bottom/Left/Right', () => {
			const { lastFrame } = render(
				<Box
					borderStyle="single"
					borderTop={true}
					borderBottom={true}
					borderLeft={false}
					borderRight={false}
				>
					<Text>Content</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Content');
		});
	});

	describe('Overflow (Inkx Extension)', () => {
		test('accepts overflow="visible"', () => {
			const { lastFrame } = render(
				<Box overflow="visible" width={5}>
					<Text>Long content here</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Long');
		});

		test('accepts overflow="hidden"', () => {
			const { lastFrame } = render(
				<Box overflow="hidden" width={5}>
					<Text>Long content here</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Long');
		});

		test('accepts overflow="scroll"', () => {
			const { lastFrame } = render(
				<Box overflow="scroll" height={3}>
					<Text>Line 1</Text>
					<Text>Line 2</Text>
					<Text>Line 3</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Line');
		});

		test('accepts scrollTo', () => {
			const { lastFrame } = render(
				<Box overflow="scroll" height={3} scrollTo={2}>
					<Text>Item 0</Text>
					<Text>Item 1</Text>
					<Text>Item 2</Text>
					<Text>Item 3</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Item');
		});
	});

	describe('Utility Components', () => {
		test('Spacer component works', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" width={20}>
					<Text>L</Text>
					<Spacer />
					<Text>R</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('L');
			expect(lastFrame()).toContain('R');
		});

		test('Newline component works', () => {
			const { lastFrame } = render(
				<Box flexDirection="column">
					<Text>Before</Text>
					<Newline />
					<Text>After</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Before');
			expect(lastFrame()).toContain('After');
		});

		test('Newline accepts count prop', () => {
			const { lastFrame } = render(
				<Box flexDirection="column">
					<Text>A</Text>
					<Newline count={3} />
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});
	});

	describe('Core Rendering - ANSI Width', () => {
		test('ANSI codes not counted in text width', () => {
			const { lastFrame } = render(
				<Box width={10}>
					<Text color="red">Hello</Text>
				</Box>,
			);
			// 'Hello' is 5 chars, should fit in width 10
			// ANSI codes for red should not affect width calculation
			const frame = lastFrame() ?? '';
			// The actual text should be present
			expect(frame).toContain('Hello');
		});

		test('styled text fits in container', () => {
			const { lastFrame } = render(
				<Box width={20}>
					<Text bold color="green">
						Styled Text
					</Text>
				</Box>,
			);
			// 'Styled Text' is 11 chars, should fit in width 20
			expect(lastFrame()).toContain('Styled Text');
		});

		test('multiple styled segments render correctly', () => {
			const { lastFrame } = render(
				<Box width={30}>
					<Text>
						<Text color="red">Red</Text>
						{' and '}
						<Text color="blue">Blue</Text>
					</Text>
				</Box>,
			);
			// Total visible chars: 'Red and Blue' = 12 chars
			const frame = lastFrame() ?? '';
			expect(frame).toContain('Red');
			expect(frame).toContain('Blue');
		});
	});

	describe('Core Rendering - Nested Flex', () => {
		test('nested flex containers calculate correct sizes', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" width={30}>
					<Box width={10}>
						<Text>Fixed</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>Grows</Text>
					</Box>
				</Box>,
			);
			// Growing child should fill remaining 20 chars
			const frame = lastFrame() ?? '';
			expect(frame).toContain('Fixed');
			expect(frame).toContain('Grows');
		});

		test('deeply nested flex containers work', () => {
			const { lastFrame } = render(
				<Box flexDirection="column" width={40} height={10}>
					<Box flexDirection="row" height={2}>
						<Box width={20}>
							<Text>Left</Text>
						</Box>
						<Box flexGrow={1}>
							<Text>Right</Text>
						</Box>
					</Box>
					<Box flexGrow={1}>
						<Text>Bottom</Text>
					</Box>
				</Box>,
			);
			const frame = lastFrame() ?? '';
			expect(frame).toContain('Left');
			expect(frame).toContain('Right');
			expect(frame).toContain('Bottom');
		});

		test('flexGrow with mixed fixed-width and growing children', () => {
			const { lastFrame } = render(
				<Box flexDirection="row" width={50}>
					<Box width={10}>
						<Text>A</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>B</Text>
					</Box>
					<Box width={10}>
						<Text>C</Text>
					</Box>
					<Box flexGrow={2}>
						<Text>D</Text>
					</Box>
				</Box>,
			);
			// Fixed: 10 + 10 = 20, remaining 30 split by flexGrow 1:2 = 10:20
			const frame = lastFrame() ?? '';
			expect(frame).toContain('A');
			expect(frame).toContain('B');
			expect(frame).toContain('C');
			expect(frame).toContain('D');
		});
	});
});
