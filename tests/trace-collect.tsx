import React from 'react';
import { Text } from '../src/index.js';
import { createTestRenderer } from '../src/testing/index.js';

// Patch collectTextContent to add logging
import * as renderText from '../src/pipeline/render-text.js';

const originalCollect = renderText.collectTextContent;
let callCount = 0;
// @ts-ignore
renderText.collectTextContent = (node: any, parentContext: any = {}) => {
	callCount++;
	const result = originalCollect(node, parentContext);
	console.log(
		`collectTextContent #${callCount}:`,
		JSON.stringify({
			type: node.type,
			textContent: node.textContent,
			childrenCount: node.children?.length,
			result: result,
		}),
	);
	return result;
};

const render = createTestRenderer({ rows: 1, cols: 20 });
const { lastFrame } = render(<Text> Normal item</Text>);
console.log('Final frame:', JSON.stringify(lastFrame()));
