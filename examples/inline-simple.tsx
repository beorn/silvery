#!/usr/bin/env bun
/**
 * Simple inline mode test
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text } from '../src/index.js';

function Counter() {
	const [count, setCount] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setCount((c) => {
				if (c >= 5) {
					clearInterval(timer);
					return c;
				}
				return c + 1;
			});
		}, 500);

		return () => clearInterval(timer);
	}, []);

	return (
		<Box>
			<Text>Count: {count}</Text>
		</Box>
	);
}

async function main() {
	console.log('Before\n');

	const { waitUntilExit } = await render(<Counter />, {
		mode: 'inline',
	});

	await waitUntilExit();

	console.log('\nAfter');
}

main().catch(console.error);
