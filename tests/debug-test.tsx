import React from 'react';
import { Box, Text } from '../src/index.js';
import { createTestRenderer, stripAnsi } from '../src/testing/index.js';

const render = createTestRenderer({ rows: 5 });

const { lastFrame } = render(
	<Box flexDirection="column">
		<Text backgroundColor="cyan" color="black">
			&gt; Selected item
		</Text>
		<Text> Normal item</Text>
	</Box>,
);

const frame = lastFrame()!;
console.log('Raw frame:');
console.log(JSON.stringify(frame));
console.log('\nStripped:');
const stripped = stripAnsi(frame);
console.log(JSON.stringify(stripped));
console.log("\nContains '> Selected':", stripped.includes('> Selected'));
console.log("Contains ' Normal':", stripped.includes(' Normal'));
