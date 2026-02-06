/**
 * Tests for display="none" handling in the render pipeline.
 *
 * Bug: Using display="none" causes the render pipeline to hang.
 * This file tests the fix for this issue.
 */

import React from 'react';
import { describe, expect, test } from 'vitest';
import { Box, Text } from '../src/components/index.js';
import { createRenderer } from '../src/testing/index.js';

const render = createRenderer();

describe('display="none"', () => {
	test('renders visible content next to display=none box', () => {
		const app = render(
			<Box>
				<Box display="none">
					<Text>Hidden</Text>
				</Box>
				<Text>Visible</Text>
			</Box>,
		);
		const frame = app.ansi;
		expect(frame).toContain('Visible');
		expect(frame).not.toContain('Hidden');
	});

	test('handles display=none on root child', () => {
		const app = render(
			<Box display="none">
				<Text>Hidden Content</Text>
			</Box>,
		);
		const frame = app.ansi;
		// Should render an empty frame, not hang
		expect(frame).not.toContain('Hidden');
	});

	test('handles nested display=none', () => {
		const app = render(
			<Box>
				<Text>Before</Text>
				<Box>
					<Box display="none">
						<Text>Deep Hidden</Text>
					</Box>
					<Text>Sibling</Text>
				</Box>
				<Text>After</Text>
			</Box>,
		);
		const frame = app.ansi;
		expect(frame).toContain('Before');
		expect(frame).toContain('Sibling');
		expect(frame).toContain('After');
		expect(frame).not.toContain('Deep Hidden');
	});

	test('display=none takes zero space in layout', () => {
		const app = render(
			<Box flexDirection="row" width={20}>
				<Text>A</Text>
				<Box display="none" width={10}>
					<Text>Hidden</Text>
				</Box>
				<Text>B</Text>
			</Box>,
		);
		const frame = app.ansi;
		expect(frame).toContain('A');
		expect(frame).toContain('B');
		// A and B should be adjacent since hidden box takes no space
	});
});
