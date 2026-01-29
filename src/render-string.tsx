/**
 * renderString - Static one-shot rendering to string
 *
 * Renders a React element to a string without needing a terminal.
 * Use for:
 * - CI output (no cursor control needed)
 * - Piped output
 * - One-shot reports/summaries
 * - Testing component output
 *
 * @example
 * ```tsx
 * import { renderString, Box, Text } from 'inkx'
 *
 * // Basic usage
 * const output = renderString(<Summary stats={stats} />)
 * console.log(output)
 *
 * // Custom width
 * const wide = renderString(<Report />, { width: 120 })
 *
 * // Plain text (no ANSI)
 * const plain = renderString(<Report />, { plain: true })
 * ```
 */

import React, { type ReactElement, act } from 'react'

// Configure React to recognize this as a testing environment for act() support
// This suppresses the "testing environment not configured" warning
// @ts-expect-error - React internal flag for testing environments
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { bufferToText, bufferToStyledText } from './buffer.js'
import { AppContext, StdoutContext } from './context.js'
import { isLayoutEngineInitialized, setLayoutEngine } from './layout-engine.js'
import { executeRender } from './pipeline.js'
import { createContainer, getContainerRoot, reconciler } from './reconciler.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for renderString().
 */
export interface RenderStringOptions {
	/**
	 * Width in columns for layout calculations.
	 * Default: 80
	 */
	width?: number

	/**
	 * Height in rows for layout calculations.
	 * Default: 24
	 */
	height?: number

	/**
	 * Strip ANSI codes for plain text output.
	 * Default: false (includes ANSI styling)
	 */
	plain?: boolean
}

// ============================================================================
// Module State
// ============================================================================

// Lazy-initialized yoga engine
let engineInitialized = false

async function ensureLayoutEngine(): Promise<void> {
	if (engineInitialized || isLayoutEngineInitialized()) {
		return
	}
	const { initYogaEngine } = await import('./adapters/yoga-adapter.js')
	const engine = await initYogaEngine()
	setLayoutEngine(engine)
	engineInitialized = true
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Render a React element to a string (async version).
 *
 * Automatically initializes the layout engine if needed.
 * Use this when you're not sure if the layout engine is ready.
 *
 * @param element - React element to render
 * @param options - Render options (width, height, plain)
 * @returns Rendered string (with or without ANSI codes)
 *
 * @example
 * ```tsx
 * const output = await renderString(<Summary stats={stats} />)
 * console.log(output)
 * ```
 */
export async function renderString(
	element: ReactElement,
	options: RenderStringOptions = {},
): Promise<string> {
	await ensureLayoutEngine()
	return renderStringSync(element, options)
}

/**
 * Render a React element to a string (sync version).
 *
 * Requires the layout engine to be already initialized.
 * Throws if the layout engine is not ready.
 *
 * @param element - React element to render
 * @param options - Render options (width, height, plain)
 * @returns Rendered string (with or without ANSI codes)
 *
 * @example
 * ```tsx
 * // After layout engine is initialized
 * const output = renderStringSync(<Summary stats={stats} />)
 * console.log(output)
 * ```
 */
export function renderStringSync(
	element: ReactElement,
	options: RenderStringOptions = {},
): string {
	if (!isLayoutEngineInitialized()) {
		throw new Error(
			'Layout engine not initialized. Use renderString() (async) or initialize with setLayoutEngine().',
		)
	}

	const { width = 80, height = 24, plain = false } = options

	// Create container for React reconciliation
	const container = createContainer(() => {})

	// Create fiber root
	const fiberRoot = reconciler.createContainer(
		container,
		0, // LegacyRoot
		null, // hydrationCallbacks
		false, // isStrictMode
		null, // concurrentUpdatesByDefaultOverride
		'', // identifierPrefix
		() => {}, // onRecoverableError
		null, // transitionCallbacks
	)

	// Create minimal mock stdout for components that use useStdout
	const mockStdout = {
		columns: width,
		rows: height,
		write: () => true,
		isTTY: false,
		on: () => mockStdout,
		off: () => mockStdout,
		once: () => mockStdout,
		removeListener: () => mockStdout,
		addListener: () => mockStdout,
	} as unknown as NodeJS.WriteStream

	// Wrap with minimal contexts (no input handling needed)
	const wrapped = React.createElement(
		AppContext.Provider,
		{
			value: {
				exit: () => {}, // No-op for static render
			},
		},
		React.createElement(
			StdoutContext.Provider,
			{
				value: {
					stdout: mockStdout,
					write: () => {},
				},
			},
			element,
		),
	)

	// Mount and flush synchronously
	act(() => {
		reconciler.updateContainerSync(wrapped, fiberRoot, null, null)
		reconciler.flushSyncWork()
	})

	// Execute render pipeline
	const root = getContainerRoot(container)
	const { buffer } = executeRender(root, width, height, null)

	// Unmount (cleanup)
	act(() => {
		reconciler.updateContainer(null, fiberRoot, null, () => {})
	})

	// Convert buffer to string
	if (plain) {
		return bufferToText(buffer)
	}
	return bufferToStyledText(buffer)
}
