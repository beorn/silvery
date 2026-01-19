/**
 * Inkx Testing Library
 *
 * ink-testing-library compatible API for testing Inkx components.
 *
 * @example
 * ```tsx
 * import { render } from 'inkx/testing';
 * import { Text } from 'inkx';
 *
 * const { lastFrame, frames, rerender, unmount } = render(<Text>Hello</Text>);
 *
 * expect(lastFrame()).toBe('Hello');
 *
 * rerender(<Text>World</Text>);
 * expect(lastFrame()).toBe('World');
 *
 * unmount();
 * ```
 */

import { EventEmitter } from 'node:events';
import type { ReactElement } from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the render function.
 */
export interface RenderOptions {
	/** Terminal width for layout calculations. Default: 80 */
	columns?: number;
	/** Terminal height. Default: 24 */
	rows?: number;
	/** Enable debug output. Default: false */
	debug?: boolean;
}

/**
 * Result returned by the render function.
 */
export interface RenderResult {
	/**
	 * Returns the last rendered frame as a string.
	 * Returns undefined if no frames have been rendered.
	 */
	lastFrame: () => string | undefined;

	/**
	 * Array of all rendered frames in order.
	 * Each frame is a string snapshot of the terminal output.
	 */
	frames: string[];

	/**
	 * Re-render with a new element.
	 * The new frame will be appended to the frames array.
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
}

/**
 * Internal state for a test render instance.
 */
interface TestInstance {
	frames: string[];
	currentElement: ReactElement | null;
	mounted: boolean;
	columns: number;
	rows: number;
	inputEmitter: EventEmitter;
}

// ============================================================================
// Simple Text Extraction (for basic testing without full reconciler)
// ============================================================================

/**
 * Extract text content from a React element.
 * This is a simplified rendering that extracts text for assertions.
 */
function extractTextContent(element: ReactElement | string | number | null | undefined): string {
	if (element === null || element === undefined) {
		return '';
	}

	if (typeof element === 'string') {
		return element;
	}

	if (typeof element === 'number') {
		return String(element);
	}

	if (!element || typeof element !== 'object') {
		return '';
	}

	const { type, props } = element;

	// Handle children
	if (props?.children !== undefined) {
		const children = Array.isArray(props.children) ? props.children : [props.children];
		const childText = children
			.map((child: unknown) => {
				if (typeof child === 'string') return child;
				if (typeof child === 'number') return String(child);
				if (child && typeof child === 'object' && 'type' in child) {
					return extractTextContent(child as ReactElement);
				}
				return '';
			})
			.join('');

		// Handle borders - add border characters if borderStyle is set
		if (props.borderStyle) {
			const borderChars = getBorderChars(props.borderStyle);
			const lines = childText.split('\n');
			const width = props.width ?? Math.max(...lines.map((l: string) => l.length)) + 2;
			const innerWidth = width - 2;

			let result = '';
			result += `${borderChars.topLeft}${borderChars.horizontal.repeat(innerWidth)}${borderChars.topRight}\n`;
			for (const line of lines) {
				result += `${borderChars.vertical}${line.padEnd(innerWidth)}${borderChars.vertical}\n`;
			}
			result += `${borderChars.bottomLeft}${borderChars.horizontal.repeat(innerWidth)}${borderChars.bottomRight}`;
			return result;
		}

		return childText;
	}

	// Handle function components
	if (typeof type === 'function') {
		try {
			const result = (type as (props: unknown) => ReactElement)(props);
			return extractTextContent(result);
		} catch {
			// Component may have hooks which won't work
			return '[Component]';
		}
	}

	return '';
}

/**
 * Border character sets.
 */
interface BorderChars {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
	horizontal: string;
	vertical: string;
}

/**
 * Get border characters for a style.
 */
function getBorderChars(style: string): BorderChars {
	const borders: Record<string, BorderChars> = {
		single: {
			topLeft: '┌',
			topRight: '┐',
			bottomLeft: '└',
			bottomRight: '┘',
			horizontal: '─',
			vertical: '│',
		},
		double: {
			topLeft: '╔',
			topRight: '╗',
			bottomLeft: '╚',
			bottomRight: '╝',
			horizontal: '═',
			vertical: '║',
		},
		round: {
			topLeft: '╭',
			topRight: '╮',
			bottomLeft: '╰',
			bottomRight: '╯',
			horizontal: '─',
			vertical: '│',
		},
		bold: {
			topLeft: '┏',
			topRight: '┓',
			bottomLeft: '┗',
			bottomRight: '┛',
			horizontal: '━',
			vertical: '┃',
		},
		classic: {
			topLeft: '+',
			topRight: '+',
			bottomLeft: '+',
			bottomRight: '+',
			horizontal: '-',
			vertical: '|',
		},
	};

	return borders[style] ?? borders.single;
}

// ============================================================================
// Render Function
// ============================================================================

/**
 * Render a React element for testing.
 *
 * Returns an object with methods to inspect rendered output,
 * re-render with new props, and clean up.
 *
 * @param element - The React element to render
 * @param options - Render options (terminal size, debug mode)
 * @returns RenderResult with inspection and control methods
 *
 * @example
 * ```tsx
 * import { render } from 'inkx/testing';
 * import { Box, Text } from 'inkx';
 *
 * const { lastFrame } = render(
 *   <Box>
 *     <Text>Hello, World!</Text>
 *   </Box>
 * );
 *
 * expect(lastFrame()).toContain('Hello, World!');
 * ```
 */
export function render(element: ReactElement, options: RenderOptions = {}): RenderResult {
	const { columns = 80, rows = 24, debug = false } = options;

	const instance: TestInstance = {
		frames: [],
		currentElement: element,
		mounted: true,
		columns,
		rows,
		inputEmitter: new EventEmitter(),
	};

	// Do initial render
	const frame = extractTextContent(element);
	instance.frames.push(frame);

	if (debug) {
		console.log('[inkx-test] Initial render:', frame);
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

			instance.currentElement = newElement;
			const newFrame = extractTextContent(newElement);
			instance.frames.push(newFrame);

			if (debug) {
				console.log('[inkx-test] Rerender:', newFrame);
			}
		},

		unmount() {
			if (!instance.mounted) {
				throw new Error('Already unmounted');
			}

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
				instance.inputEmitter.emit('input', data);
			},
		},

		clear() {
			instance.frames.length = 0;
		},
	};

	// Register for cleanup
	instances.push(result);

	return result;
}

/**
 * Async render function (same as render, kept for API compatibility).
 *
 * @example
 * ```tsx
 * const { lastFrame } = await renderAsync(<MyComponent />);
 * ```
 */
export async function renderAsync(
	element: ReactElement,
	options: RenderOptions = {},
): Promise<RenderResult> {
	return render(element, options);
}

// ============================================================================
// Cleanup
// ============================================================================

const instances: RenderResult[] = [];

/**
 * Create a cleanup function that unmounts all rendered instances.
 * Useful in afterEach hooks.
 *
 * @example
 * ```tsx
 * import { render, cleanup } from 'inkx/testing';
 *
 * afterEach(() => {
 *   cleanup();
 * });
 * ```
 */
export function cleanup(): void {
	for (const instance of instances) {
		try {
			instance.unmount();
		} catch {
			// Already unmounted, ignore
		}
	}
	instances.length = 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Strip ANSI escape codes from a string for easier assertions.
 */
export function stripAnsi(str: string): string {
	// Matches all ANSI escape sequences
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI codes use control chars
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
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}
