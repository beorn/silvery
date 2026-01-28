#!/usr/bin/env tsx
/**
 * Example: Non-TTY Mode Support (km-inkx-nontty)
 *
 * Demonstrates inkx's non-TTY mode support for rendering in environments
 * without a terminal (pipes, CI, TERM=dumb).
 *
 * Run this example:
 *   # Normal TTY mode
 *   bun examples/inline-nontty.tsx
 *
 *   # Piped output (auto-detects non-TTY)
 *   bun examples/inline-nontty.tsx | cat
 *
 *   # Force plain text mode
 *   INKX_NONTTY=plain bun examples/inline-nontty.tsx
 *
 *   # Force line-by-line mode
 *   INKX_NONTTY=line-by-line bun examples/inline-nontty.tsx
 */

import React, { useEffect, useState } from 'react';
import { Box, render, Text, type NonTTYMode } from '../src/index.js';

function ProgressExample() {
	const [progress, setProgress] = useState(0);
	const [done, setDone] = useState(false);

	useEffect(() => {
		const timer = setInterval(() => {
			setProgress((prev) => {
				const next = prev + 20;
				if (next >= 100) {
					setDone(true);
					clearInterval(timer);
					return 100;
				}
				return next;
			});
		}, 300);

		return () => clearInterval(timer);
	}, []);

	const barWidth = 30;
	const filled = Math.floor((progress / 100) * barWidth);
	const bar = '#'.repeat(filled) + '-'.repeat(barWidth - filled);

	return (
		<Box flexDirection="column">
			<Text>Processing files...</Text>
			<Text>
				[{bar}] {progress}%
			</Text>
			{done && <Text color="green">Complete!</Text>}
		</Box>
	);
}

async function main() {
	// Determine non-TTY mode from environment
	const envMode = process.env.INKX_NONTTY as NonTTYMode | undefined;
	const nonTTYMode = envMode || 'auto';

	console.log(`Non-TTY mode: ${nonTTYMode}`);
	console.log(`stdout.isTTY: ${process.stdout.isTTY}`);
	console.log('---\n');

	const { waitUntilExit } = await render(<ProgressExample />, {
		mode: 'inline',
		nonTTYMode,
	});

	await waitUntilExit();

	console.log('\n---');
	console.log('Done!');
}

main().catch(console.error);
