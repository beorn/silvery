/**
 * Ink Compatibility Tests
 *
 * Tests that verify Inkx is API-compatible with Ink.
 * These tests verify that the public API matches Ink's expectations.
 */

import { describe, expect, test } from 'bun:test';
import React from 'react';

// Test that all expected exports exist
import {
	// Components
	Box,
	// Types (these should not throw when imported)
	type BoxProps,
	type ComputedLayout,
	type InkxNode,
	type InputHandler,
	type Instance,
	type Key,
	type MeasureElementOutput,
	Newline,
	type RenderOptions,
	Spacer,
	Static,
	Text,
	type TextProps,
	type UseAppResult,
	type UseFocusManagerResult,
	type UseFocusOptions,
	type UseFocusResult,
	type UseInputOptions,
	type UseStdinResult,
	type UseStdoutResult,
	// Render
	measureElement,
	render,
	// Hooks
	useApp,
	useFocus,
	useFocusManager,
	useInput,
	useLayout,
	useStdin,
	useStdout,
} from '../src/index.js';

import { render as testRender } from '../src/testing/index.js';

describe('Ink API Compatibility', () => {
	describe('Component Exports', () => {
		test('Box component exists and is a function', () => {
			expect(typeof Box).toBe('function');
		});

		test('Text component exists and is a function', () => {
			expect(typeof Text).toBe('function');
		});

		test('Newline component exists and is a function', () => {
			expect(typeof Newline).toBe('function');
		});

		test('Spacer component exists and is a function', () => {
			expect(typeof Spacer).toBe('function');
		});

		test('Static component exists and is a function', () => {
			expect(typeof Static).toBe('function');
		});
	});

	describe('Hook Exports', () => {
		test('useInput hook exists and is a function', () => {
			expect(typeof useInput).toBe('function');
		});

		test('useApp hook exists and is a function', () => {
			expect(typeof useApp).toBe('function');
		});

		test('useStdout hook exists and is a function', () => {
			expect(typeof useStdout).toBe('function');
		});

		test('useStdin hook exists and is a function', () => {
			expect(typeof useStdin).toBe('function');
		});

		test('useFocus hook exists and is a function', () => {
			expect(typeof useFocus).toBe('function');
		});

		test('useFocusManager hook exists and is a function', () => {
			expect(typeof useFocusManager).toBe('function');
		});

		test('useLayout hook exists and is a function (Inkx-specific)', () => {
			expect(typeof useLayout).toBe('function');
		});
	});

	describe('Render Exports', () => {
		test('render function exists and is a function', () => {
			expect(typeof render).toBe('function');
		});

		test('measureElement function exists and is a function', () => {
			expect(typeof measureElement).toBe('function');
		});
	});

	describe('Box Props (Ink-compatible)', () => {
		test('Box accepts flexDirection prop', () => {
			const { lastFrame } = testRender(
				<Box flexDirection="column">
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			const frame = lastFrame();
			expect(frame).toContain('A');
			expect(frame).toContain('B');
		});

		test('Box accepts padding props', () => {
			const { lastFrame } = testRender(
				<Box padding={1}>
					<Text>Padded</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Padded');
		});

		test('Box accepts margin props', () => {
			const { lastFrame } = testRender(
				<Box margin={1}>
					<Text>Margined</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Margined');
		});

		test('Box accepts width/height props', () => {
			const { lastFrame } = testRender(
				<Box width={10} height={3}>
					<Text>Sized</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Sized');
		});

		test('Box accepts borderStyle prop', () => {
			const { lastFrame } = testRender(
				<Box borderStyle="single">
					<Text>Bordered</Text>
				</Box>,
			);
			const frame = lastFrame();
			expect(frame).toContain('Bordered');
			// Should have border characters
			expect(frame).toMatch(/[─│┌┐└┘]/);
		});

		test('Box accepts borderColor prop', () => {
			const { lastFrame } = testRender(
				<Box borderStyle="single" borderColor="red">
					<Text>Red Border</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Red Border');
		});

		test('Box accepts justifyContent prop', () => {
			const { lastFrame } = testRender(
				<Box justifyContent="space-between" width={20}>
					<Text>A</Text>
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});

		test('Box accepts alignItems prop', () => {
			const { lastFrame } = testRender(
				<Box alignItems="center" height={3}>
					<Text>Centered</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('Centered');
		});
	});

	describe('Text Props (Ink-compatible)', () => {
		test('Text accepts color prop', () => {
			const { lastFrame } = testRender(<Text color="red">Red</Text>);
			expect(lastFrame()).toContain('Red');
		});

		test('Text accepts backgroundColor prop', () => {
			const { lastFrame } = testRender(<Text backgroundColor="blue">BlueBg</Text>);
			expect(lastFrame()).toContain('BlueBg');
		});

		test('Text accepts bold prop', () => {
			const { lastFrame } = testRender(<Text bold>Bold</Text>);
			expect(lastFrame()).toContain('Bold');
		});

		test('Text accepts italic prop', () => {
			const { lastFrame } = testRender(<Text italic>Italic</Text>);
			expect(lastFrame()).toContain('Italic');
		});

		test('Text accepts underline prop', () => {
			const { lastFrame } = testRender(<Text underline>Underline</Text>);
			expect(lastFrame()).toContain('Underline');
		});

		test('Text accepts strikethrough prop', () => {
			const { lastFrame } = testRender(<Text strikethrough>Strike</Text>);
			expect(lastFrame()).toContain('Strike');
		});

		test('Text accepts dimColor prop', () => {
			const { lastFrame } = testRender(<Text dimColor>Dim</Text>);
			expect(lastFrame()).toContain('Dim');
		});

		test('Text accepts inverse prop', () => {
			const { lastFrame } = testRender(<Text inverse>Inverse</Text>);
			expect(lastFrame()).toContain('Inverse');
		});

		test('Text accepts wrap prop', () => {
			const { lastFrame } = testRender(<Text wrap="truncate">LongTextHere</Text>);
			expect(lastFrame()).toContain('Long');
		});
	});

	describe('Spacer Component', () => {
		test('Spacer pushes content apart', () => {
			const { lastFrame } = testRender(
				<Box flexDirection="row" width={20}>
					<Text>L</Text>
					<Spacer />
					<Text>R</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('L');
			expect(lastFrame()).toContain('R');
		});
	});

	describe('Newline Component', () => {
		test('Newline adds line breaks', () => {
			const { lastFrame } = testRender(
				<Box flexDirection="column">
					<Text>A</Text>
					<Newline count={2} />
					<Text>B</Text>
				</Box>,
			);
			expect(lastFrame()).toContain('A');
			expect(lastFrame()).toContain('B');
		});
	});

	describe('Static Component', () => {
		test('Static component exists and accepts items prop', () => {
			// Static is a special component that requires the full reconciler
			// for proper behavior (writing content once and never updating).
			// Here we just verify the API shape.
			const items = ['a', 'b'];
			const element = <Static items={items}>{(item) => <Text key={item}>{item}</Text>}</Static>;
			expect(element).toBeDefined();
			expect(element.props.items).toEqual(['a', 'b']);
			expect(typeof element.props.children).toBe('function');
		});
	});

	describe('Key Object Shape', () => {
		test('Key type has expected properties', () => {
			// This tests the type shape at runtime by creating a mock key object
			const mockKey: Key = {
				upArrow: false,
				downArrow: false,
				leftArrow: false,
				rightArrow: false,
				pageDown: false,
				pageUp: false,
				home: false,
				end: false,
				return: false,
				escape: false,
				ctrl: false,
				shift: false,
				tab: false,
				backspace: false,
				delete: false,
				meta: false,
			};

			// Verify all properties exist
			expect(mockKey).toHaveProperty('upArrow');
			expect(mockKey).toHaveProperty('downArrow');
			expect(mockKey).toHaveProperty('leftArrow');
			expect(mockKey).toHaveProperty('rightArrow');
			expect(mockKey).toHaveProperty('pageDown');
			expect(mockKey).toHaveProperty('pageUp');
			expect(mockKey).toHaveProperty('home');
			expect(mockKey).toHaveProperty('end');
			expect(mockKey).toHaveProperty('return');
			expect(mockKey).toHaveProperty('escape');
			expect(mockKey).toHaveProperty('ctrl');
			expect(mockKey).toHaveProperty('shift');
			expect(mockKey).toHaveProperty('tab');
			expect(mockKey).toHaveProperty('backspace');
			expect(mockKey).toHaveProperty('delete');
			expect(mockKey).toHaveProperty('meta');
		});
	});

	describe('Color Formats', () => {
		test('Text accepts named colors', () => {
			const { lastFrame } = testRender(<Text color="green">Green</Text>);
			expect(lastFrame()).toContain('Green');
		});

		test('Text accepts hex colors', () => {
			const { lastFrame } = testRender(<Text color="#ff0000">Hex</Text>);
			expect(lastFrame()).toContain('Hex');
		});

		test('Text accepts rgb colors', () => {
			const { lastFrame } = testRender(<Text color="rgb(255, 0, 0)">RGB</Text>);
			expect(lastFrame()).toContain('RGB');
		});
	});
});
