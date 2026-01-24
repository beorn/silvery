/**
 * Inkx Testing Library
 *
 * ink-testing-library compatible API for testing Inkx components.
 * Uses the actual inkx render pipeline for accurate ANSI output.
 *
 * Auto-cleanup: Each render() call automatically unmounts the previous render,
 * so you don't need explicit cleanup.
 *
 * @example
 * ```tsx
 * import { createTestRenderer } from 'inkx/testing';
 * import { Text } from 'inkx';
 *
 * const render = createTestRenderer();
 *
 * test('renders text', () => {
 *   const { lastFrame } = render(<Text>Hello</Text>);
 *   expect(lastFrame()).toContain('Hello');
 * });
 *
 * test('renders more text', () => {
 *   // Previous render is auto-cleaned when render() is called again
 *   const { lastFrame } = render(<Text>World</Text>);
 *   expect(lastFrame()).toContain('World');
 * });
 * ```
 *
 * @example
 * ```tsx
 * // Testing keyboard input (stdin.write connects to useInput hooks)
 * const render = createTestRenderer();
 *
 * test('handles keyboard input', () => {
 *   const { stdin } = render(<MyComponent />);
 *   stdin.write('\x1b');  // Send Escape key
 *   stdin.write('q');     // Send 'q' key
 * });
 * ```
 *
 * @example
 * ```tsx
 * // Custom dimensions per render
 * const render = createTestRenderer();
 * const { lastFrame } = render(<WideComponent />, { columns: 120, rows: 40 });
 * ```
 */

import { EventEmitter } from 'node:events';
import React, { type ReactElement, act } from 'react';
import { initYogaEngine } from '../adapters/yoga-adapter.js';
import type { TerminalBuffer } from '../buffer.js';
import { AppContext, InputContext } from '../context.js';
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

// Initialize default yoga engine at module load time via top-level await.
// This cached engine is used by createTestRenderer() when no engine is provided.
const defaultLayoutEngine = await initYogaEngine();

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
	/** Layout engine to use (yoga or flexx). Default: yoga */
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
 */
export interface RenderResult {
	/**
	 * Returns the last rendered frame as a string (with ANSI codes).
	 * Returns undefined if no frames have been rendered.
	 */
	lastFrame: () => string | undefined;

	/**
	 * Array of all rendered frames in order.
	 * Each frame is a string snapshot of the terminal output with ANSI codes.
	 */
	frames: string[];

	/**
	 * Re-render with a new element.
	 * The new frame will be appended to the frames array.
	 * This is synchronous - the frame is available immediately after calling.
	 */
	rerender: (element: ReactElement) => void;

	/**
	 * Unmount the component and clean up.
	 * After unmount, lastFrame() will return the last rendered state.
	 */
	unmount: () => void;

	/**
	 * Send stdin input to the rendered component.
	 * Useful for testing keyboard input handling.
	 */
	stdin: {
		write: (data: string) => void;
	};

	/**
	 * Clear all captured frames.
	 * Useful for testing sequences of renders.
	 */
	clear: () => void;

	/**
	 * Check if exit() was called by the component.
	 * Useful for testing exit behavior.
	 */
	exitCalled: () => boolean;

	/**
	 * Get the error passed to exit(), if any.
	 */
	exitError: () => Error | undefined;
}

/**
 * Test render function type.
 * Auto-cleans previous render when called again.
 */
export type TestRender = (element: ReactElement, options?: RenderOptions) => RenderResult;

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
 * Create a test render function with custom configuration.
 *
 * @param options - Renderer configuration (dimensions, layout engine, debug)
 * @returns Render function that auto-cleans previous render on each call
 *
 * @example
 * ```tsx
 * // Custom dimensions
 * const render = createTestRenderer({ columns: 120, rows: 40 });
 *
 * // Custom layout engine
 * const flexx = await initFlexxEngine();
 * const render = createTestRenderer({ layoutEngine: flexx });
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
	let currentInstance: RenderResult | null = null;

	function render(element: ReactElement, renderOptions: RenderOptions = {}): RenderResult {
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

		// Wrap element with contexts to enable useApp and useInput hooks
		function wrapWithContexts(el: ReactElement): ReactElement {
			return React.createElement(
				AppContext.Provider,
				{
					value: {
						exit: handleExit,
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

		const result: RenderResult = {
			lastFrame() {
				if (instance.frames.length === 0) {
					return undefined;
				}
				return instance.frames[instance.frames.length - 1];
			},

			frames: instance.frames,

			rerender(newElement: ReactElement) {
				if (!instance.mounted) {
					throw new Error('Cannot rerender after unmount');
				}

				// Synchronously update React tree within act() to ensure all state updates are flushed
				act(() => {
					reconciler.updateContainerSync(
						wrapWithContexts(newElement),
						instance.fiberRoot,
						null,
						null,
					);
					reconciler.flushSyncWork();
				});

				// Execute render pipeline
				const newFrame = doRender();
				instance.frames.push(newFrame);

				if (debug) {
					console.log('[inkx-test] Rerender:', newFrame);
				}
			},

			unmount() {
				if (!instance.mounted) {
					throw new Error('Already unmounted');
				}

				// Wrap unmount in act() to ensure cleanup effects complete without warnings
				act(() => {
					reconciler.updateContainer(null, instance.fiberRoot, null, () => {});
				});
				instance.mounted = false;
				instance.inputEmitter.removeAllListeners();

				if (debug) {
					console.log('[inkx-test] Unmounted');
				}
			},

			stdin: {
				write(data: string) {
					if (!instance.mounted) {
						throw new Error('Cannot write to stdin after unmount');
					}
					// Use React's act() to ensure state updates are flushed synchronously
					// This is necessary because useInput hooks call setState from an event callback
					act(() => {
						instance.inputEmitter.emit('input', data);
					});

					// Capture a new frame with the updated state
					const newFrame = doRender();
					instance.frames.push(newFrame);

					if (debug) {
						console.log('[inkx-test] stdin.write:', newFrame);
					}
				},
			},

			clear() {
				instance.frames.length = 0;
				instance.prevBuffer = null;
			},

			exitCalled() {
				return exitCalledFlag;
			},

			exitError() {
				return exitErrorValue;
			},
		};

		// Track current instance for auto-cleanup on next render
		currentInstance = result;

		return result;
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
