/**
 * Mode 3 Example: Pure Functional Counter
 *
 * Demonstrates the Elm-style architecture:
 * - User drives the event loop
 * - Pure reducer for state updates
 * - Pure view function for rendering
 *
 * Usage: bun examples/mode3-counter.tsx
 */

import React from 'react'
import { Box, Text } from '../src/index.js'
import {
	layout,
	diff,
	ensureLayoutEngine,
	createTick,
	merge,
	map,
	takeUntil,
	type Buffer,
	type Dims,
} from '../src/runtime/index.js'

// ============================================================================
// State
// ============================================================================

interface State {
	count: number
	running: boolean
}

// ============================================================================
// Events
// ============================================================================

type Event =
	| { type: 'tick' }
	| { type: 'key'; key: string }
	| { type: 'quit' }

// ============================================================================
// Reducer (pure function)
// ============================================================================

function reducer(state: State, event: Event): State {
	switch (event.type) {
		case 'tick':
			return { ...state, count: state.count + 1 }
		case 'key':
			if (event.key === 'q' || event.key === '\x03') { // q or ctrl+c
				return { ...state, running: false }
			}
			if (event.key === 'r') {
				return { ...state, count: 0 }
			}
			return state
		case 'quit':
			return { ...state, running: false }
		default:
			return state
	}
}

// ============================================================================
// View (pure function)
// ============================================================================

function view(state: State): React.ReactElement {
	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>Mode 3 Counter Example</Text>
			<Text> </Text>
			<Text>Count: <Text color="green">{state.count}</Text></Text>
			<Text> </Text>
			<Text dimColor>Press 'r' to reset, 'q' to quit</Text>
		</Box>
	)
}

// ============================================================================
// Event Sources
// ============================================================================

/**
 * Create a keyboard event source from stdin.
 */
function createKeyboardSource(signal: AbortSignal): AsyncIterable<Event> {
	return {
		async *[Symbol.asyncIterator]() {
			const stdin = process.stdin
			stdin.setRawMode(true)
			stdin.resume()
			stdin.setEncoding('utf8')

			try {
				while (!signal.aborted) {
					const key = await new Promise<string | null>((resolve) => {
						const onData = (data: string) => {
							stdin.off('data', onData)
							resolve(data)
						}
						const onAbort = () => {
							stdin.off('data', onData)
							resolve(null)
						}
						stdin.on('data', onData)
						signal.addEventListener('abort', onAbort, { once: true })
					})

					if (key === null || signal.aborted) break
					yield { type: 'key' as const, key }
				}
			} finally {
				stdin.setRawMode(false)
				stdin.pause()
			}
		},
	}
}

// ============================================================================
// Main Loop
// ============================================================================

async function main() {
	// Initialize layout engine
	await ensureLayoutEngine()

	// Get terminal dimensions
	const dims: Dims = {
		cols: process.stdout.columns || 80,
		rows: process.stdout.rows || 24,
	}

	// Initial state
	let state: State = { count: 0, running: true }

	// Abort controller for cleanup
	const controller = new AbortController()

	// Create event sources
	const ticks = map(createTick(100, controller.signal), () => ({ type: 'tick' as const }))
	const keys = createKeyboardSource(controller.signal)

	// Merge all event sources
	const events = takeUntil(merge(ticks, keys), controller.signal)

	// Previous buffer for diffing
	let prevBuffer: Buffer | null = null

	// Clear screen and hide cursor
	process.stdout.write('\x1b[2J\x1b[H\x1b[?25l')

	try {
		// Initial render
		const buffer = layout(view(state), dims)
		const output = diff(null, buffer)
		process.stdout.write(output)
		prevBuffer = buffer

		// Event loop
		for await (const event of events) {
			// Update state
			const newState = reducer(state, event)

			// Check if we should exit
			if (!newState.running) {
				break
			}

			// Only re-render if state changed
			if (newState !== state) {
				state = newState

				// Render
				const buffer = layout(view(state), dims)
				const output = diff(prevBuffer, buffer)
				process.stdout.write(output)
				prevBuffer = buffer
			}
		}
	} finally {
		// Cleanup
		controller.abort()

		// Show cursor and reset
		process.stdout.write('\x1b[?25h\x1b[0m\n')
	}
}

// Run
main().catch(console.error)
