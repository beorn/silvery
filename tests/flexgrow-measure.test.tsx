/**
 * Debug measurement to understand flexGrow behavior.
 */
import { describe, expect, test } from 'bun:test';
import { Box, Text } from '../src/index.js';
import { createTestRenderer } from '../src/testing/index.js';

describe('flexGrow measurement', () => {
	const render = createTestRenderer({ columns: 80, rows: 5 });

	test('check computed widths', () => {
		const app = render(
			<Box width={80} flexDirection="row" id="parent">
				<Box flexGrow={1} flexShrink={1} overflow="hidden" id="left">
					<Text>MEM 📁</Text>
				</Box>
				<Box flexGrow={0} flexShrink={0} id="right">
					<Text> 📋3   COLUMNS VIEW </Text>
				</Box>
			</Box>,
		);

		// Check the computed widths via locator bounding boxes
		const parent = app.locator('#parent');
		const left = app.locator('#left');
		const right = app.locator('#right');

		console.log('Parent bbox:', parent.boundingBox());
		console.log('Left bbox:', left.boundingBox());
		console.log('Right bbox:', right.boundingBox());

		const parentBox = parent.boundingBox();
		const leftBox = left.boundingBox();
		const rightBox = right.boundingBox();

		expect(parentBox?.width).toBe(80);
		// Right should be intrinsic width (~ 21 chars for " 📋3   COLUMNS VIEW ")
		console.log('Right width:', rightBox?.width);
		// Left should get the remainder
		console.log('Left width:', leftBox?.width);
		console.log('Left + Right:', (leftBox?.width ?? 0) + (rightBox?.width ?? 0));

		// Total should equal parent
		expect((leftBox?.width ?? 0) + (rightBox?.width ?? 0)).toBe(80);
	});
});
