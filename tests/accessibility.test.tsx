/**
 * Accessibility Tests (km-017z)
 *
 * Tests for screen reader compatibility and accessibility considerations.
 * Verifies that rendered output is accessible when colors are stripped,
 * doesn't contain invisible characters that break screen readers,
 * and maintains logical reading order.
 */

import React from 'react';
import { describe, expect, test } from 'vitest';
import { Box, Text } from '../src/components/index.js';
import { createRenderer, normalizeFrame, stripAnsi } from '../src/testing/index.js';
import { displayWidth, hasAnsi, splitGraphemes } from '../src/unicode.js';

const render = createRenderer();

// ============================================================================
// Screen Reader Compatibility
// ============================================================================

describe('Accessibility (km-017z)', () => {
	describe('Screen reader compatibility', () => {
		test('content is readable when ANSI stripped', () => {
			const app = render(
				<Box flexDirection="column">
					<Text color="red" bold>
						Error: Something went wrong
					</Text>
					<Text color="green">Success: Operation completed</Text>
					<Text dim>Hint: Press Enter to continue</Text>
				</Box>,
			);

			const frame = app.ansi;
			expect(frame).toBeDefined();

			// Strip ANSI and verify content is still meaningful
			const stripped = stripAnsi(frame!);
			expect(stripped).toContain('Error: Something went wrong');
			expect(stripped).toContain('Success: Operation completed');
			expect(stripped).toContain('Hint: Press Enter to continue');
		});

		test('nested colored text preserves meaning when stripped', () => {
			const app = render(
				<Text>
					Status: <Text color="green">PASS</Text> - All tests passed
				</Text>,
			);

			const stripped = app.text;
			expect(stripped).toContain('Status:');
			expect(stripped).toContain('PASS');
			expect(stripped).toContain('All tests passed');
		});

		test('styled status indicators have text equivalents', () => {
			// Good accessibility: use both color AND text/shape
			const app = render(
				<Box flexDirection="column">
					<Text>
						<Text color="green">[PASS]</Text> Test 1
					</Text>
					<Text>
						<Text color="red">[FAIL]</Text> Test 2
					</Text>
					<Text>
						<Text color="yellow">[SKIP]</Text> Test 3
					</Text>
				</Box>,
			);

			const stripped = app.text;
			// Status is conveyed through text, not just color
			expect(stripped).toContain('[PASS]');
			expect(stripped).toContain('[FAIL]');
			expect(stripped).toContain('[SKIP]');
		});
	});

	// ============================================================================
	// No Invisible Characters
	// ============================================================================

	describe('no invisible characters in output', () => {
		// Characters that commonly cause screen reader issues
		const problematicChars = [
			{ char: '\u200B', name: 'Zero-Width Space' },
			{ char: '\u200C', name: 'Zero-Width Non-Joiner' },
			{ char: '\u200D', name: 'Zero-Width Joiner (standalone)' },
			{ char: '\uFEFF', name: 'Byte Order Mark' },
			{ char: '\u00AD', name: 'Soft Hyphen' },
			{ char: '\u2060', name: 'Word Joiner' },
			{ char: '\u2061', name: 'Function Application' },
			{ char: '\u2062', name: 'Invisible Times' },
			{ char: '\u2063', name: 'Invisible Separator' },
			{ char: '\u2064', name: 'Invisible Plus' },
		];

		test('basic text has no problematic invisible characters', () => {
			const app = render(<Text>Hello World</Text>);

			const stripped = app.text;
			for (const { char, name } of problematicChars) {
				expect(stripped).not.toContain(char);
			}
		});

		test('styled text has no problematic invisible characters', () => {
			const app = render(
				<Box>
					<Text color="red" bold>
						Styled
					</Text>
					<Text> and </Text>
					<Text underline>formatted</Text>
				</Box>,
			);

			const stripped = app.text;
			for (const { char } of problematicChars) {
				expect(stripped).not.toContain(char);
			}
		});

		test('border characters are standard box drawing', () => {
			const app = render(
				<Box borderStyle="single" width={10} height={3}>
					<Text>Hi</Text>
				</Box>,
			);

			const stripped = app.text;

			// Box drawing characters should be from standard Unicode block
			// U+2500-U+257F (Box Drawing)
			const boxDrawingRegex = /[\u2500-\u257F]/g;
			const boxChars = stripped.match(boxDrawingRegex) || [];

			// Should have some box drawing characters
			expect(boxChars.length).toBeGreaterThan(0);

			// All should be in the standard range (not private use area)
			for (const char of boxChars) {
				const codePoint = char.codePointAt(0)!;
				expect(codePoint).toBeGreaterThanOrEqual(0x2500);
				expect(codePoint).toBeLessThanOrEqual(0x257f);
			}
		});

		test('ZWJ is only used in valid emoji sequences', () => {
			// ZWJ (U+200D) is acceptable when part of emoji sequences like family emoji
			// but should not appear as standalone invisible character
			const app = render(<Text>Hello World</Text>);

			const stripped = app.text;
			const graphemes = splitGraphemes(stripped.trim());

			// Check each grapheme
			for (const g of graphemes) {
				if (g.includes('\u200D')) {
					// If ZWJ is present, it should be part of a multi-codepoint grapheme (emoji sequence)
					// A standalone ZWJ would be a single codepoint grapheme
					expect(g.length).toBeGreaterThan(1);
				}
			}
		});

		test('output contains no private use area characters', () => {
			const app = render(
				<Box borderStyle="double" width={15} height={3}>
					<Text>Content</Text>
				</Box>,
			);

			const stripped = app.text;

			// Private Use Area ranges
			const puaRanges = [
				[0xe000, 0xf8ff], // BMP Private Use Area
				[0xf0000, 0xffffd], // Supplementary Private Use Area-A
				[0x100000, 0x10fffd], // Supplementary Private Use Area-B
			];

			for (const char of stripped) {
				const codePoint = char.codePointAt(0)!;
				for (const [start, end] of puaRanges) {
					expect(codePoint! < start! || codePoint! > end!).toBe(true);
				}
			}
		});
	});

	// ============================================================================
	// Logical Reading Order
	// ============================================================================

	describe('logical reading order is maintained', () => {
		test('vertical layout produces top-to-bottom reading order', () => {
			const app = render(
				<Box flexDirection="column">
					<Text>First line</Text>
					<Text>Second line</Text>
					<Text>Third line</Text>
				</Box>,
			);

			const stripped = app.text;
			const lines = stripped.split('\n').filter((l) => l.trim());

			// Content should appear in document order
			const firstIdx = stripped.indexOf('First');
			const secondIdx = stripped.indexOf('Second');
			const thirdIdx = stripped.indexOf('Third');

			expect(firstIdx).toBeLessThan(secondIdx);
			expect(secondIdx).toBeLessThan(thirdIdx);
		});

		test('horizontal layout maintains left-to-right order', () => {
			const app = render(
				<Box flexDirection="row">
					<Text>Left</Text>
					<Text> Middle </Text>
					<Text>Right</Text>
				</Box>,
			);

			const stripped = app.text;

			// In a horizontal layout, text should appear left to right
			const leftIdx = stripped.indexOf('Left');
			const middleIdx = stripped.indexOf('Middle');
			const rightIdx = stripped.indexOf('Right');

			expect(leftIdx).toBeLessThan(middleIdx);
			expect(middleIdx).toBeLessThan(rightIdx);
		});

		test('nested layouts maintain semantic order', () => {
			const app = render(
				<Box flexDirection="column">
					<Text>Header</Text>
					<Box flexDirection="row">
						<Text>Col1</Text>
						<Text> | </Text>
						<Text>Col2</Text>
					</Box>
					<Text>Footer</Text>
				</Box>,
			);

			const stripped = app.text;

			// Vertical: Header, then row content, then Footer
			const headerIdx = stripped.indexOf('Header');
			const col1Idx = stripped.indexOf('Col1');
			const col2Idx = stripped.indexOf('Col2');
			const footerIdx = stripped.indexOf('Footer');

			expect(headerIdx).toBeLessThan(col1Idx);
			expect(col1Idx).toBeLessThan(col2Idx);
			expect(col2Idx).toBeLessThan(footerIdx);
		});

		test('tables have row-major reading order', () => {
			// Simulating a simple table structure
			const app = render(
				<Box flexDirection="column">
					<Box flexDirection="row">
						<Text>A1</Text>
						<Text> </Text>
						<Text>B1</Text>
						<Text> </Text>
						<Text>C1</Text>
					</Box>
					<Box flexDirection="row">
						<Text>A2</Text>
						<Text> </Text>
						<Text>B2</Text>
						<Text> </Text>
						<Text>C2</Text>
					</Box>
				</Box>,
			);

			const stripped = app.text;

			// Row-major order: A1, B1, C1, A2, B2, C2
			const indices = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2'].map((s) => stripped.indexOf(s));

			for (let i = 0; i < indices.length - 1; i++) {
				expect(indices[i]).toBeLessThan(indices[i + 1]!);
			}
		});
	});

	// ============================================================================
	// High Contrast Support
	// ============================================================================

	describe('high contrast support', () => {
		test('colors are not the only way to convey information', () => {
			// This test documents the pattern of using shape/text + color
			// Bad: relying only on color
			// Good: using both color AND shape/text

			const app = render(
				<Box flexDirection="column">
					{/* Good: checkmark + color for success */}
					<Text>
						<Text color="green">[OK]</Text> Task completed
					</Text>
					{/* Good: X + color for error */}
					<Text>
						<Text color="red">[X]</Text> Task failed
					</Text>
					{/* Good: arrow + color for in progress */}
					<Text>
						<Text color="yellow">[&gt;]</Text> Task running
					</Text>
				</Box>,
			);

			const stripped = app.text;

			// Even without colors, status is conveyed through text symbols
			expect(stripped).toContain('[OK]');
			expect(stripped).toContain('[X]');
			expect(stripped).toContain('[>]');
		});

		test('selection state uses both color AND formatting', () => {
			// Document the km pattern: selected items use both color change AND potentially other cues
			// Use explicit prefix characters (not leading spaces) for alignment indicators
			const app = render(
				<Box flexDirection="column">
					<Text backgroundColor="cyan" color="black">
						&gt; Selected item
					</Text>
					<Text>· Normal item</Text>
				</Box>,
			);

			const stripped = app.text;

			// The ">" prefix provides a non-color indicator of selection
			// Unselected items use "·" (middle dot) as a visible but subtle prefix
			expect(stripped).toContain('> Selected');
			expect(stripped).toContain('· Normal');
		});

		test('text contrast is maintained with background colors', () => {
			// Render text with various background colors
			const app = render(
				<Box flexDirection="column">
					<Text backgroundColor="red" color="white">
						White on Red
					</Text>
					<Text backgroundColor="blue" color="white">
						White on Blue
					</Text>
					<Text backgroundColor="cyan" color="black">
						Black on Cyan
					</Text>
				</Box>,
			);

			const frame = app.ansi;

			// Content should be present (visual contrast is a design concern,
			// but we can verify the text is there)
			expect(stripAnsi(frame)).toContain('White on Red');
			expect(stripAnsi(frame)).toContain('White on Blue');
			expect(stripAnsi(frame)).toContain('Black on Cyan');
		});
	});

	// ============================================================================
	// ANSI Code Handling
	// ============================================================================

	describe('ANSI codes are properly handled', () => {
		test('ANSI codes are complete and balanced', () => {
			const app = render(
				<Text color="red" bold>
					Styled text
				</Text>,
			);

			const frame = app.ansi;

			// Should have ANSI codes
			expect(hasAnsi(frame)).toBe(true);

			// ANSI codes should be complete (no truncated escape sequences)
			// A truncated sequence would be \x1b[ without a terminating letter
			const truncatedEscapePattern = /\x1b\[[^A-Za-z]*$/;
			expect(frame).not.toMatch(truncatedEscapePattern);

			// Should end with a reset or have balanced styling
			// Most terminal output ends with reset \x1b[0m or just has the styled content
			const lines = frame.split('\n');
			for (const line of lines) {
				if (hasAnsi(line)) {
					// No orphaned escape character at end
					expect(line).not.toMatch(/\x1b$/);
				}
			}
		});

		test('stripped output has correct display width', () => {
			const app = render(
				<Text color="red" bold>
					Hello
				</Text>,
			);

			const frame = app.ansi;
			const stripped = stripAnsi(frame);

			// Display width of stripped content should match visible characters
			// The actual text "Hello" is 5 characters wide
			const trimmedLine = stripped.trim();
			expect(displayWidth(trimmedLine)).toBe(5);

			// The styled version should have ANSI codes but same visible width
			expect(hasAnsi(frame)).toBe(true);
		});

		test('hex color codes are handled', () => {
			// Inkx supports hex color codes
			const app = render(<Text color="#ff0000">Hex color red</Text>);

			const frame = app.ansi;
			const stripped = stripAnsi(frame);

			// Content should be preserved
			expect(stripped).toContain('Hex color red');

			// No broken escape sequences
			expect(frame).not.toMatch(/\x1b\[[^m]*$/);
		});
	});

	// ============================================================================
	// Semantic Structure
	// ============================================================================

	describe('semantic structure', () => {
		test('headings and content have visual hierarchy', () => {
			const app = render(
				<Box flexDirection="column">
					<Text bold color="yellow">
						Main Heading
					</Text>
					<Text>Regular content paragraph</Text>
					<Text bold dim>
						Subheading
					</Text>
					<Text dim>Secondary content</Text>
				</Box>,
			);

			const stripped = app.text;

			// All content should be readable in order
			const mainIdx = stripped.indexOf('Main Heading');
			const contentIdx = stripped.indexOf('Regular content');
			const subIdx = stripped.indexOf('Subheading');
			const secondaryIdx = stripped.indexOf('Secondary content');

			expect(mainIdx).toBeLessThan(contentIdx);
			expect(contentIdx).toBeLessThan(subIdx);
			expect(subIdx).toBeLessThan(secondaryIdx);
		});

		test('grouped content maintains structure when stripped', () => {
			const app = render(
				<Box flexDirection="column">
					<Box borderStyle="single" flexDirection="column">
						<Text>Group 1 Title</Text>
						<Text>Group 1 Content</Text>
					</Box>
					<Box borderStyle="single" flexDirection="column">
						<Text>Group 2 Title</Text>
						<Text>Group 2 Content</Text>
					</Box>
				</Box>,
			);

			const stripped = app.text;

			// Groups should maintain their content order
			const g1Title = stripped.indexOf('Group 1 Title');
			const g1Content = stripped.indexOf('Group 1 Content');
			const g2Title = stripped.indexOf('Group 2 Title');
			const g2Content = stripped.indexOf('Group 2 Content');

			expect(g1Title).toBeLessThan(g1Content);
			expect(g1Content).toBeLessThan(g2Title);
			expect(g2Title).toBeLessThan(g2Content);
		});
	});
});
