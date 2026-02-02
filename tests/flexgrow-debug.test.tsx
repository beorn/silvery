/**
 * Debug test for flexGrow sibling layout issue.
 */
import { describe, expect, test } from 'bun:test';
import { Box, Text } from '../src/index.js';
import { createTestRenderer } from '../src/testing/index.js';

describe('flexGrow debug', () => {
	const render = createTestRenderer({ columns: 80, rows: 5 });

	test('debug intrinsic width measurement', () => {
		// Replicate the status bar pattern
		const app = render(
			<Box width={80} flexDirection="row">
				<Box flexGrow={1} flexShrink={1} overflow="hidden">
					<Text>MEM 📁</Text>
				</Box>
				<Box flexGrow={0} flexShrink={0}>
					<Text> 📋3   COLUMNS VIEW </Text>
				</Box>
			</Box>,
		);

		const text = app.text;
		console.log('Debug output:', '[' + text + ']');
		console.log('Text length:', text.length);

		// The right side text is " 📋3   COLUMNS VIEW " which is 21 chars
		// Left side should get 80 - 21 = 59 chars
		expect(text).toContain('COLUMNS VIEW');
	});

	test('debug with narrower container', () => {
		// Use 60 char width to force potential truncation
		const app = render(
			<Box width={60} flexDirection="row">
				<Box flexGrow={1} flexShrink={1} overflow="hidden">
					<Text>MEM 📁</Text>
				</Box>
				<Box flexGrow={0} flexShrink={0}>
					<Text> 📋3   COLUMNS VIEW </Text>
				</Box>
			</Box>,
		);

		const text = app.text;
		console.log('Narrow output:', '[' + text + ']');
		console.log('Text length:', text.length);

		// With flexGrow=0 + flexShrink=0, right should keep its intrinsic width
		expect(text).toContain('COLUMNS VIEW');
	});

	test('verify text intrinsic width', () => {
		// What width does the text component measure to?
		const app = render(
			<Box width={80} flexDirection="row">
				<Text> 📋3   COLUMNS VIEW </Text>
			</Box>,
		);

		console.log('Single text:', '[' + app.text + ']');
		// Get bounding box via locator
		// Text should be ~ 21 chars (including the emoji which is 2 wide)
	});
});
