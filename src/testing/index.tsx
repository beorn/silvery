/**
 * Inkx Testing Library
 *
 * Unified App-based API for testing Inkx components.
 * Uses the actual inkx render pipeline for accurate ANSI output.
 *
 * ## Import Syntax
 *
 * ```tsx
 * import { createTestRenderer, bufferToText, stripAnsi } from 'inkx/testing';
 * ```
 *
 * ## Auto-cleanup
 *
 * Each render() call automatically unmounts the previous render,
 * so you don't need explicit cleanup.
 *
 * ## Basic Testing (NewWay - App API)
 *
 * @example
 * ```tsx
 * import { createTestRenderer } from 'inkx/testing';
 * import { Text, Box } from 'inkx';
 *
 * const render = createTestRenderer({ columns: 80, rows: 24 });
 *
 * test('renders text', () => {
 *   const app = render(<Text>Hello</Text>);
 *
 *   // Plain text (no ANSI)
 *   expect(app.text).toContain('Hello');
 *
 *   // Auto-refreshing locators
 *   expect(app.getByText('Hello').count()).toBe(1);
 * });
 * ```
 *
 * ## Keyboard Input Testing
 *
 * @example
 * ```tsx
 * test('handles keyboard', () => {
 *   const app = render(<MyComponent />);
 *
 *   await app.press('j');           // Letter key
 *   await app.press('ArrowUp');     // Arrow keys
 *   await app.press('Escape');      // Special keys
 *   await app.press('Enter');       // Enter
 *
 *   expect(app.text).toContain('expected result');
 * });
 * ```
 *
 * ## Auto-refreshing Locators
 *
 * @example
 * ```tsx
 * test('locators auto-refresh', () => {
 *   const app = render(<Board />);
 *   const cursor = app.locator('[data-cursor]');
 *
 *   expect(cursor.textContent()).toBe('item1');
 *   await app.press('j');
 *   expect(cursor.textContent()).toBe('item2');  // Same locator, fresh result!
 * });
 * ```
 */

import { EventEmitter } from 'node:events';
import React, { type ReactElement, act } from 'react';
import { ensureDefaultLayoutEngine, getLayoutEngine, isLayoutEngineInitialized } from '../layout-engine.js';
import { type TerminalBuffer, bufferToText } from '../buffer.js';
import { createApp, type App } from '../app.js';

// Re-export App for type usage
export type { App } from '../app.js';
export { createAutoLocator, type AutoLocator, type FilterOptions } from '../auto-locator.js';
export type { BoundTerm } from '../bound-term.js';

// Re-export buffer utilities for testing convenience
export { bufferToText, bufferToStyledText } from '../buffer.js';
export type { TerminalBuffer } from '../buffer.js';

// Re-export locator API for DOM queries (legacy, prefer App.locator())
export { createLocator, type InkxLocator } from './locator.js';
export type { Rect } from '../types.js';

// Re-export keyboard utilities
export { keyToAnsi, CODE_TO_KEY } from '../keys.js';

// Re-export debug utilities
export { debugTree, type DebugTreeOptions } from './debug.js';
import { AppContext, InputContext, StdoutContext } from '../context.js';
import type { LayoutEngine } from '../layout-engine.js';
import { setLayoutEngine } from '../layout-engine.js';
import { executeRender } from '../pipeline.js';
import { createContainer, getContainerRoot, reconciler } from '../reconciler.js';

// ============================================================================
// Module Initialization
// ============================================================================

// Configure React to recognize this as a testing environment for act() support
// This suppresses the "testing environment not configured" warning
// @ts-expect-error - React internal flag for testing environments
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Initialize default layout engine via top-level await.
// This cached engine is used by createTestRenderer() when no engine is provided.
await ensureDefaultLayoutEngine();
const defaultLayoutEngine = getLayoutEngine();

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a test renderer.
 */
export interface TestRendererOptions {
	/** Terminal width for layout calculations. Default: 80 */
	columns?: number;
	/** Terminal height. Default: 24 */
	rows?: number;
	/** Layout engine to use (yoga or flexx). Default: yoga (temporarily, will switch to flexx) */
	layoutEngine?: LayoutEngine;
	/** Enable debug output. Default: false */
	debug?: boolean;
}

/**
 * Options for individual render calls.
 */
export interface RenderOptions {
	/** Enable debug output for this render. Default: false */
	debug?: boolean;
	/** Override terminal width for this render. Default: use renderer default (80) */
	columns?: number;
	/** Override terminal height for this render. Default: use renderer default (24) */
	rows?: number;
}

/**
 * Result returned by the render function.
 * @deprecated Use App interface instead. RenderResult is kept for backward compatibility.
 */
export interface RenderResult {
	/**
	 * Returns the last rendered frame as a string (with ANSI codes).
	 * Returns undefined if no frames have been rendered.
	 */
	lastFrame: () => string | undefined;

	/**
	 * Returns the last rendered buffer for direct inspection.
	 * Returns undefined if no frames have been rendered.
	 */
	lastBuffer: () => TerminalBuffer | undefined;

	/**
	 * Returns the last rendered frame as plain text (no ANSI codes).
	 * @deprecated Use app.text instead
	 */
	lastFrameText: () => string | undefined;

	/** Array of all rendered frames */
	frames: string[];

	/** Re-render with a new element */
	rerender: (element: ReactElement) => void;

	/** Unmount the component */
	unmount: () => void;

	/** Send stdin input */
	stdin: { write: (data: string) => void };

	/** Clear all captured frames */
	clear: () => void;

	/** Check if exit() was called */
	exitCalled: () => boolean;

	/** Get the error passed to exit() */
	exitError: () => Error | undefined;

	/**
	 * Get the container root node for DOM queries.
	 * @deprecated Use app.locator() instead - auto-refreshes on each access
	 */
	getContainer: () => import('../types.js').InkxNode;

	/** Print the component tree for debugging */
	debug: () => void;
}

/**
 * Test render function type.
 * Returns App which extends RenderResult for backward compatibility.
 */
export type TestRender = (element: ReactElement, options?: RenderOptions) => App;

/**
 * Internal state for a render instance.
 */
interface RenderInstance {
	frames: string[];
	container: ReturnType<typeof createContainer>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React reconciler internal type
	fiberRoot: any;
	prevBuffer: TerminalBuffer | null;
	mounted: boolean;
	columns: number;
	rows: number;
	inputEmitter: EventEmitter;
	debug: boolean;
}

// ============================================================================
// Test Renderer Factory
// ============================================================================

/**
 * Create a test render function for testing inkx components.
 *
 * The returned render function auto-cleans previous renders on each call.
 *
 * @param options - Renderer configuration (dimensions, layout engine, debug)
 * @returns Render function that returns { lastFrame, lastFrameText, stdin, getContainer, ... }
 *
 * @example
 * ```tsx
 * import { createTestRenderer, createLocator } from 'inkx/testing';
 * import { Box, Text } from 'inkx';
 *
 * // Create renderer (typically once per test file)
 * const render = createTestRenderer({ columns: 80, rows: 24 });
 *
 * test('my test', () => {
 *   const { lastFrameText, stdin, getContainer } = render(<MyComponent />);
 *
 *   // Check output
 *   expect(lastFrameText()).toContain('expected');
 *
 *   // Send input
 *   stdin.write('q');
 *
 *   // DOM queries
 *   const locator = createLocator(getContainer());
 *   expect(locator.getByText('Hello').count()).toBe(1);
 * });
 * ```
 */
export function createTestRenderer(options: TestRendererOptions = {}): TestRender {
	const {
		columns = 80,
		rows = 24,
		layoutEngine = defaultLayoutEngine,
		debug: defaultDebug = false,
	} = options;

	// Set the layout engine for this renderer
	setLayoutEngine(layoutEngine);

	// Track current instance for auto-cleanup
	let currentInstance: App | null = null;

	function render(element: ReactElement, renderOptions: RenderOptions = {}): App {
		// Auto-cleanup previous render before creating new one
		if (currentInstance) {
			try {
				currentInstance.unmount();
			} catch {
				// Already unmounted, ignore
			}
		}

		const debug = renderOptions.debug ?? defaultDebug;
		// Allow per-render column/row overrides
		const renderColumns = renderOptions.columns ?? columns;
		const renderRows = renderOptions.rows ?? rows;

		const instance: RenderInstance = {
			frames: [],
			container: null as unknown as ReturnType<typeof createContainer>,
			fiberRoot: null,
			prevBuffer: null,
			mounted: true,
			columns: renderColumns,
			rows: renderRows,
			inputEmitter: new EventEmitter(),
			debug,
		};

		// Create container (onRender callback not needed for sync rendering)
		instance.container = createContainer(() => {});

		instance.fiberRoot = reconciler.createContainer(
			instance.container,
			0, // LegacyRoot
			null, // hydrationCallbacks
			false, // isStrictMode
			null, // concurrentUpdatesByDefaultOverride
			'', // identifierPrefix
			() => {}, // onRecoverableError
			null, // transitionCallbacks
		);

		// Track if exit was called (for testing exit behavior)
		let exitCalledFlag = false;
		let exitErrorValue: Error | undefined;

		// Exit handler for useApp hook
		const handleExit = (error?: Error) => {
			exitCalledFlag = true;
			exitErrorValue = error;
			if (debug) {
				console.log('[inkx-test] exit() called', error ? `with error: ${error.message}` : '');
			}
		};

		// Create a mock stdout for useStdout hook
		// Provides columns/rows from test config and a no-op write function
		// Also includes on/off methods for resize event listeners (required by layout systems)
		const mockStdout = {
			columns: instance.columns,
			rows: instance.rows,
			write: () => true,
			// Add required WriteStream properties for type compatibility
			isTTY: true,
			// Event listener methods (no-op since tests don't resize)
			on: () => mockStdout,
			off: () => mockStdout,
			once: () => mockStdout,
			removeListener: () => mockStdout,
			addListener: () => mockStdout,
		} as unknown as NodeJS.WriteStream;

		// Wrap element with contexts to enable useApp, useInput, and useStdout hooks
		function wrapWithContexts(el: ReactElement): ReactElement {
			return React.createElement(
				AppContext.Provider,
				{
					value: {
						exit: handleExit,
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
					React.createElement(
						InputContext.Provider,
						{
							value: {
								eventEmitter: instance.inputEmitter,
								exitOnCtrlC: false,
							},
						},
						el,
					),
				),
			);
		}

		// Render function that executes the pipeline
		// Note: We pass null for prevBuffer to always get full frame output (not diffs)
		// This is important for testing where we want to inspect complete frames
		function doRender(): string {
			const root = getContainerRoot(instance.container);
			const { output, buffer } = executeRender(root, instance.columns, instance.rows, null);
			instance.prevBuffer = buffer;
			return output;
		}

		// Synchronously update React tree within act() to ensure all state updates are flushed
		act(() => {
			reconciler.updateContainerSync(wrapWithContexts(element), instance.fiberRoot, null, null);
			reconciler.flushSyncWork();
		});

		// Execute the render pipeline
		const output = doRender();
		instance.frames.push(output);

		if (debug) {
			console.log('[inkx-test] Initial render:', output);
		}

		// Helper functions for App
		const getContainer = () => getContainerRoot(instance.container);
		const getBuffer = () => instance.prevBuffer;

		const sendInput = (data: string) => {
			if (!instance.mounted) {
				throw new Error('Cannot write to stdin after unmount');
			}
			act(() => {
				instance.inputEmitter.emit('input', data);
			});
			const newFrame = doRender();
			instance.frames.push(newFrame);
			if (debug) {
				console.log('[inkx-test] stdin.write:', newFrame);
			}
		};

		const rerenderFn = (newElement: React.ReactNode) => {
			if (!instance.mounted) {
				throw new Error('Cannot rerender after unmount');
			}
			act(() => {
				reconciler.updateContainerSync(
					wrapWithContexts(newElement as ReactElement),
					instance.fiberRoot,
					null,
					null,
				);
				reconciler.flushSyncWork();
			});
			const newFrame = doRender();
			instance.frames.push(newFrame);
			if (debug) {
				console.log('[inkx-test] Rerender:', newFrame);
			}
		};

		const unmountFn = () => {
			if (!instance.mounted) {
				throw new Error('Already unmounted');
			}
			act(() => {
				reconciler.updateContainer(null, instance.fiberRoot, null, () => {});
			});
			instance.mounted = false;
			instance.inputEmitter.removeAllListeners();
			if (debug) {
				console.log('[inkx-test] Unmounted');
			}
		};

		const clearFn = () => {
			instance.frames.length = 0;
			instance.prevBuffer = null;
		};

		const debugFn = () => {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { debugTree } = require('./debug.js') as typeof import('./debug.js');
			console.log(debugTree(getContainerRoot(instance.container)));
		};

		// Create unified App instance
		const app = createApp({
			getContainer,
			getBuffer,
			sendInput,
			rerender: rerenderFn,
			unmount: unmountFn,
			waitUntilExit: () => Promise.resolve(),
			clear: clearFn,
			exitCalled: () => exitCalledFlag,
			exitError: () => exitErrorValue,
			frames: instance.frames,
			debugFn,
			columns: renderColumns,
			rows: renderRows,
		});

		// Track current instance for auto-cleanup on next render
		currentInstance = app;

		return app;
	}

	// Return render function directly - auto-cleans previous render on each call
	return render;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Strip ANSI escape codes from a string for easier assertions.
 */
export function stripAnsi(str: string): string {
	return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Normalize frame output for comparison.
 * - Strips ANSI codes
 * - Trims trailing whitespace from lines
 * - Removes empty trailing lines
 */
export function normalizeFrame(frame: string): string {
	return stripAnsi(frame)
		.split('\n')
		.map((line) => line.trimEnd())
		.join('\n')
		.trimEnd();
}

/**
 * Wait for a condition to be true, polling at intervals.
 * Useful for waiting for async state updates.
 */
export async function waitFor(
	condition: () => boolean,
	{ timeout = 1000, interval = 10 } = {},
): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeout) {
			throw new Error(`waitFor timed out after ${timeout}ms`);
		}
		await new Promise<void>((resolve) => {
			setTimeout(resolve, interval);
		});
	}
}
