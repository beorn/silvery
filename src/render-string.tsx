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

import React, { type ReactElement } from 'react';

import { createTerm } from 'chalkx';

import { type App, createApp } from './app.js';
import { bufferToStyledText, bufferToText } from './buffer.js';
import { AppContext, StdoutContext, TermContext } from './context.js';
import { isLayoutEngineInitialized } from './layout-engine.js';
import { executeRender } from './pipeline.js';
import { createContainer, getContainerRoot, reconciler } from './reconciler.js';

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
	width?: number;

	/**
	 * Height in rows for layout calculations.
	 * Default: 24
	 */
	height?: number;

	/**
	 * Strip ANSI codes for plain text output.
	 * Default: false (includes ANSI styling)
	 */
	plain?: boolean;
}

// ============================================================================
// Module State
// ============================================================================

// Track if we've initialized to avoid redundant imports
let engineInitialized = false;

async function ensureLayoutEngine(): Promise<void> {
	if (engineInitialized || isLayoutEngineInitialized()) {
		return;
	}
	// Use centralized default engine initialization
	const { ensureDefaultLayoutEngine } = await import('./layout-engine.js');
	await ensureDefaultLayoutEngine();
	engineInitialized = true;
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
	await ensureLayoutEngine();
	return renderStringSync(element, options);
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
export function renderStringSync(element: ReactElement, options: RenderStringOptions = {}): string {
	if (!isLayoutEngineInitialized()) {
		throw new Error(
			'Layout engine not initialized. Use renderString() (async) or initialize with setLayoutEngine().',
		);
	}

	const { width = 80, height = 24, plain = false } = options;

	// Create container for React reconciliation
	const container = createContainer(() => {});

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
	);

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
	} as unknown as NodeJS.WriteStream;

	// Create mock term for components that use useTerm()
	const mockTerm = createTerm({ color: plain ? null : 'truecolor' });

	// Wrap with minimal contexts (no input handling needed)
	const wrapped = React.createElement(
		TermContext.Provider,
		{ value: mockTerm },
		React.createElement(
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
		),
	);

	// Mount, render, and unmount - all without act warnings
	withoutActWarnings(() => {
		reconciler.updateContainerSync(wrapped, fiberRoot, null, null);
		reconciler.flushSyncWork();
	});

	// Execute render pipeline (skip layout notifications for static renders)
	const root = getContainerRoot(container);
	const { buffer } = executeRender(root, width, height, null, {
		skipLayoutNotifications: true,
	});

	// Unmount (cleanup)
	withoutActWarnings(() => {
		reconciler.updateContainerSync(null, fiberRoot, null, null);
		reconciler.flushSyncWork();
	});

	return plain ? bufferToText(buffer) : bufferToStyledText(buffer);
}

/**
 * Render a React element to an App instance for static output.
 *
 * Returns a full App with text, html, locator, etc. but no input handling.
 * Used internally by render() for static mode.
 */
export function renderStaticToApp(element: ReactElement, options: RenderStringOptions = {}): App {
	if (!isLayoutEngineInitialized()) {
		throw new Error(
			'Layout engine not initialized. Use render() (async) or initialize with setLayoutEngine().',
		);
	}

	const { width = 80, height = 24, plain = false } = options;

	// Create container for React reconciliation
	const container = createContainer(() => {});

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
	);

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
	} as unknown as NodeJS.WriteStream;

	// Create mock term for components that use useTerm()
	const mockTerm = createTerm({ color: plain ? null : 'truecolor' });

	// Wrap with minimal contexts (no input handling needed)
	const wrapped = React.createElement(
		TermContext.Provider,
		{ value: mockTerm },
		React.createElement(
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
		),
	);

	// Mount and render
	withoutActWarnings(() => {
		reconciler.updateContainerSync(wrapped, fiberRoot, null, null);
		reconciler.flushSyncWork();
	});

	// Execute render pipeline
	const root = getContainerRoot(container);
	let { buffer } = executeRender(root, width, height, null, {
		skipLayoutNotifications: true,
	});

	// Create App instance
	const app = createApp({
		getContainer: () => getContainerRoot(container),
		getBuffer: () => buffer,
		sendInput: () => {}, // No-op for static mode
		rerender: (newElement) => {
			withoutActWarnings(() => {
				const newWrapped = React.createElement(
					TermContext.Provider,
					{ value: mockTerm },
					React.createElement(
						AppContext.Provider,
						{ value: { exit: () => {} } },
						React.createElement(
							StdoutContext.Provider,
							{ value: { stdout: mockStdout, write: () => {} } },
							newElement,
						),
					),
				);
				reconciler.updateContainerSync(newWrapped, fiberRoot, null, null);
				reconciler.flushSyncWork();
			});
			const result = executeRender(getContainerRoot(container), width, height, null, {
				skipLayoutNotifications: true,
			});
			buffer = result.buffer;
		},
		unmount: () => {
			withoutActWarnings(() => {
				reconciler.updateContainerSync(null, fiberRoot, null, null);
				reconciler.flushSyncWork();
			});
		},
		waitUntilExit: () => Promise.resolve(),
		clear: () => {},
		columns: width,
		rows: height,
	});

	return app;
}

// ============================================================================
// Helpers
// ============================================================================

// Extend globalThis type for React testing flag
declare const globalThis: { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * Run a function with React act warnings disabled.
 * Used for static renders where we don't use act() and don't need layout feedback.
 */
function withoutActWarnings(fn: () => void): void {
	const prev = globalThis.IS_REACT_ACT_ENVIRONMENT;
	globalThis.IS_REACT_ACT_ENVIRONMENT = false;
	try {
		fn();
	} finally {
		globalThis.IS_REACT_ACT_ENVIRONMENT = prev;
	}
}
