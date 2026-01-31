/**
 * App - Unified render API for inkx
 *
 * Both production and testing return an App instance with the same interface.
 * Key improvements over the old API:
 * - Auto-refreshing locators (no stale locator problem)
 * - Playwright-style API (app.press(), app.getByTestId())
 * - Bound terminal (app.term) with node awareness
 *
 * @example
 * ```tsx
 * // Both production and testing
 * const app = await render(<App />, term)
 *
 * // Query and interact
 * app.text                          // rendered text (no ANSI)
 * app.getByTestId('modal')          // auto-refreshing locator
 * await app.press('ArrowUp')        // send key
 * await app.waitUntilExit()         // wait until exit
 *
 * // Terminal access
 * app.term.cell(x, y)               // { char, fg, bg, attrs }
 * app.term.nodeAt(x, y)             // node at screen coords
 * ```
 */

import type { ReactNode } from 'react';
import { type AutoLocator, createAutoLocator } from './auto-locator.js';
import { type BoundTerm, createBoundTerm } from './bound-term.js';
import type { TerminalBuffer } from './buffer.js';
import { bufferToStyledText, bufferToText } from './buffer.js';
import { keyToAnsi } from './keys.js';
import type { InkxNode } from './types.js';

/**
 * App interface - unified return type from render()
 */
export interface App {
	// === Content/Document Perspective ===

	/** Full rendered text (no ANSI codes) */
	readonly text: string;

	/** Full rendered text with ANSI styling */
	readonly html: string;

	/** Get node at content coordinates */
	nodeAt(x: number, y: number): InkxNode | null;

	/** Get locator by testID attribute */
	getByTestId(id: string): AutoLocator;

	/** Get locator by text content */
	getByText(text: string | RegExp): AutoLocator;

	/** Get locator by CSS-style selector */
	locator(selector: string): AutoLocator;

	// === Actions (return this for chaining) ===

	/** Send a key press (uses keyToAnsi internally) */
	press(key: string): Promise<this>;

	/** Send multiple key presses */
	pressSequence(...keys: string[]): Promise<this>;

	/** Type text input */
	type(text: string): Promise<this>;

	/** Wait until app exits */
	run(): Promise<void>;

	// === Terminal Binding ===

	/** Bound terminal for screen-space access */
	readonly term: BoundTerm;

	// === Lifecycle (Instance compatibility) ===

	/** Re-render with a new element */
	rerender(element: ReactNode): void;

	/** Unmount the component and clean up */
	unmount(): void;

	/** Promise that resolves when the app exits (alias for run()) */
	waitUntilExit(): Promise<void>;

	/** Clear the terminal output */
	clear(): void;

	// === Debug ===

	/** Print component tree to console */
	debug(): void;

	// === Testing extras ===

	/** Check if exit() was called */
	exitCalled(): boolean;

	/** Get error passed to exit() */
	exitError(): Error | undefined;

	/** Send raw stdin input (for sync test helpers; prefer app.press() for new code) */
	readonly stdin: { write: (data: string) => void };

	// === Internal/Legacy (kept for inkx test compatibility, not for external use) ===

	/** All rendered frames (internal) */
	readonly frames: string[];

	/** Get last frame with ANSI codes (internal - use app.html instead) */
	lastFrame(): string | undefined;

	/** Get last buffer (internal - use app.term.buffer instead) */
	lastBuffer(): TerminalBuffer | undefined;

	/** Get last frame as plain text (internal - use app.text instead) */
	lastFrameText(): string | undefined;

	/** Get container root node (internal - use app.locator() instead) */
	getContainer(): InkxNode;
}

/**
 * Options for creating an App instance
 */
export interface AppOptions {
	/** Function to get current container root */
	getContainer: () => InkxNode;

	/** Function to get current buffer */
	getBuffer: () => TerminalBuffer | null;

	/** Function to send input */
	sendInput: (data: string) => void;

	/** Function to rerender */
	rerender: (element: ReactNode) => void;

	/** Function to unmount */
	unmount: () => void;

	/** Function to wait for exit */
	waitUntilExit: () => Promise<void>;

	/** Function to clear output */
	clear: () => void;

	/** Function to check if exit was called */
	exitCalled?: () => boolean;

	/** Function to get exit error */
	exitError?: () => Error | undefined;

	/** Debug print function */
	debugFn?: () => void;

	/** Captured frames array (internal) */
	frames?: string[];

	/** Terminal dimensions */
	columns: number;
	rows: number;
}

/**
 * Create an App instance
 */
export function createApp(options: AppOptions): App {
	const {
		getContainer,
		getBuffer,
		sendInput,
		rerender,
		unmount,
		waitUntilExit,
		clear,
		exitCalled = () => false,
		exitError = () => undefined,
		debugFn,
		frames = [],
		columns,
		rows,
	} = options;

	// Create auto-refreshing locator factory
	const createLocator = () => createAutoLocator(getContainer);

	// Create bound terminal
	const getText = () => {
		const buffer = getBuffer();
		return buffer ? bufferToText(buffer) : '';
	};

	// Note: BoundTerm is created lazily since buffer may not exist initially
	let boundTerm: BoundTerm | null = null;

	const app: App = {
		// === Content/Document Perspective ===

		get text(): string {
			return getText();
		},

		get html(): string {
			const buffer = getBuffer();
			return buffer ? bufferToStyledText(buffer) : '';
		},

		nodeAt(x: number, y: number): InkxNode | null {
			const root = getContainer();
			return findNodeAtContentPosition(root, x, y);
		},

		getByTestId(id: string): AutoLocator {
			return createLocator().getByTestId(id);
		},

		getByText(text: string | RegExp): AutoLocator {
			return createLocator().getByText(text);
		},

		locator(selector: string): AutoLocator {
			return createLocator().locator(selector);
		},

		// === Actions ===

		async press(key: string): Promise<App> {
			const sequence = keyToAnsi(key);
			sendInput(sequence);
			// Allow microtask to flush for test synchronization
			await Promise.resolve();
			return app;
		},

		async pressSequence(...keys: string[]): Promise<App> {
			for (const key of keys) {
				await app.press(key);
			}
			return app;
		},

		async type(text: string): Promise<App> {
			for (const char of text) {
				sendInput(char);
			}
			await Promise.resolve();
			return app;
		},

		async run(): Promise<void> {
			return waitUntilExit();
		},

		// === Terminal Binding ===

		get term(): BoundTerm {
			const buffer = getBuffer();
			if (!buffer) {
				// Return a dummy bound term if no buffer yet
				const dummyBuffer = {
					width: columns,
					height: rows,
					getCell: () => ({
						char: ' ',
						fg: null,
						bg: null,
						attrs: {},
						wide: false,
						continuation: false,
					}),
					setCell: () => {},
					clear: () => {},
					inBounds: () => false,
				} as unknown as TerminalBuffer;
				return createBoundTerm(dummyBuffer, getContainer, getText);
			}
			if (!boundTerm || boundTerm.buffer !== buffer) {
				boundTerm = createBoundTerm(buffer, getContainer, getText);
			}
			return boundTerm;
		},

		// === Lifecycle ===

		rerender,
		unmount,
		waitUntilExit,
		clear,

		// === Debug ===

		debug(): void {
			if (debugFn) {
				debugFn();
			} else {
				console.log(app.text);
			}
		},

		// === Testing extras ===

		exitCalled,
		exitError,

		stdin: {
			write: sendInput,
		},

		// Internal/Legacy (kept for inkx test compatibility)
		frames,

		lastFrame(): string | undefined {
			return frames[frames.length - 1];
		},

		lastBuffer(): TerminalBuffer | undefined {
			return getBuffer() ?? undefined;
		},

		lastFrameText(): string | undefined {
			const buffer = getBuffer();
			return buffer ? bufferToText(buffer) : undefined;
		},

		getContainer(): InkxNode {
			return getContainer();
		},
	};

	return app;
}

/**
 * Find node at content coordinates (not screen coordinates)
 */
function findNodeAtContentPosition(node: InkxNode, x: number, y: number): InkxNode | null {
	const rect = node.contentRect;
	if (!rect) return null;

	if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) {
		return null;
	}

	for (const child of node.children) {
		const found = findNodeAtContentPosition(child, x, y);
		if (found) return found;
	}

	return node;
}
