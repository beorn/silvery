/**
 * Scroll Example
 *
 * Demonstrates overflow="scroll" with keyboard navigation.
 */

import React, { useState } from 'react';
import { Box, Text, render, useInput } from '../../src/index.js';

// Generate sample items
const items = Array.from({ length: 50 }, (_, i) => ({
	id: i,
	title: `Item ${i + 1}`,
	description: `This is the description for item number ${i + 1}`,
}));

function ScrollExample() {
	const [selectedIndex, setSelectedIndex] = useState(0);

	useInput((input, key) => {
		if (key.upArrow) {
			setSelectedIndex((prev) => Math.max(0, prev - 1));
		}
		if (key.downArrow) {
			setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
		}
		if (input === 'q') {
			process.exit(0);
		}
	});

	return (
		<Box flexDirection="column" width={60} height={20}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Scroll Example
				</Text>
				<Text dim> | ↑↓ to navigate | q to quit</Text>
			</Box>

			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="cyan"
				overflow="scroll"
				scrollTo={selectedIndex}
				height={10}
			>
				{items.map((item, index) => (
					<Box key={item.id} paddingX={1} backgroundColor={index === selectedIndex ? 'cyan' : undefined}>
						<Text color={index === selectedIndex ? 'black' : 'white'} bold={index === selectedIndex}>
							{item.title}
						</Text>
					</Box>
				))}
			</Box>

			<Box marginTop={1}>
				<Text dim>
					Selected: {selectedIndex + 1}/{items.length}
				</Text>
			</Box>
		</Box>
	);
}

// Run the app
await render(<ScrollExample />);
