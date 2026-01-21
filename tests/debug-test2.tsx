import React from 'react';
import { Box, Text } from '../src/index.js';
import { createTestRenderer, stripAnsi } from '../src/testing/index.js';

const render = createTestRenderer({ rows: 3, cols: 20 });

const { lastFrame } = render(
	<Box flexDirection="column">
		<Text> Normal item</Text>
	</Box>,
);

const frame = lastFrame()!;
console.log('Raw frame:');
console.log(JSON.stringify(frame));
console.log('\nStripped:');
const stripped = stripAnsi(frame);
console.log(JSON.stringify(stripped));
console.log('\nFirst char code:', stripped.charCodeAt(stripped.indexOf('N') - 1));
