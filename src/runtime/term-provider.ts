/**
 * Terminal provider - wraps stdin/stdout as a Provider.
 *
 * This makes the terminal "just another provider" - no special handling needed.
 *
 * @example
 * ```typescript
 * const term = createTermProvider(process.stdin, process.stdout);
 *
 * // State
 * console.log(term.getState()); // { cols: 80, rows: 24 }
 *
 * // Events
 * for await (const event of term.events()) {
 *   if (event.type === 'key') console.log('Key:', event.data.input);
 *   if (event.type === 'resize') console.log('Resize:', event.data);
 * }
 *
 * // Cleanup
 * term[Symbol.dispose]();
 * ```
 */

import { type Key, parseKey } from './keys.js';
import type { Dims, Provider, ProviderEvent } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Terminal state.
 */
export interface TermState {
	cols: number;
	rows: number;
}

/**
 * Terminal events.
 */
export interface TermEvents {
	key: { input: string; key: Key };
	resize: Dims;
}

/**
 * Terminal provider type.
 */
export type TermProvider = Provider<TermState, TermEvents>;

/**
 * Options for createTermProvider.
 */
export interface TermProviderOptions {
	/** Initial columns (default: from stdout or 80) */
	cols?: number;
	/** Initial rows (default: from stdout or 24) */
	rows?: number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a terminal provider from stdin/stdout.
 *
 * The provider:
 * - Exposes terminal dimensions as state
 * - Yields keyboard and resize events
 * - Cleans up stdin/stdout listeners on dispose
 */
export function createTermProvider(
	stdin: NodeJS.ReadStream,
	stdout: NodeJS.WriteStream,
	options: TermProviderOptions = {},
): TermProvider {
	const { cols = stdout.columns || 80, rows = stdout.rows || 24 } = options;

	// Current state
	let state: TermState = { cols, rows };

	// Subscribers
	const listeners = new Set<(state: TermState) => void>();

	// Disposed flag
	let disposed = false;

	// Abort controller for cleanup
	const controller = new AbortController();
	const signal = controller.signal;

	// Resize handler
	const onResize = () => {
		state = {
			cols: stdout.columns || 80,
			rows: stdout.rows || 24,
		};
		listeners.forEach((l) => l(state));
	};

	// Subscribe to resize
	stdout.on('resize', onResize);

	return {
		getState(): TermState {
			return state;
		},

		subscribe(listener: (state: TermState) => void): () => void {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},

		async *events(): AsyncGenerator<ProviderEvent<TermEvents>, void, undefined> {
			if (disposed) return;

			// Set up stdin for raw mode if TTY
			if (stdin.isTTY) {
				stdin.setRawMode(true);
				stdin.resume();
				stdin.setEncoding('utf8');
			}

			// Queued events
			const queue: ProviderEvent<TermEvents>[] = [];
			let eventResolve: (() => void) | null = null;

			// Key handler
			const onData = (rawKey: string) => {
				const [input, key] = parseKey(rawKey);
				const event: ProviderEvent<TermEvents> = {
					type: 'key',
					data: { input, key },
				};
				queue.push(event);
				if (eventResolve) {
					const resolve = eventResolve;
					eventResolve = null;
					resolve();
				}
			};

			// Resize handler for events
			const onResizeEvent = () => {
				const event: ProviderEvent<TermEvents> = {
					type: 'resize',
					data: {
						cols: stdout.columns || 80,
						rows: stdout.rows || 24,
					},
				};
				queue.push(event);
				if (eventResolve) {
					const resolve = eventResolve;
					eventResolve = null;
					resolve();
				}
			};

			// Subscribe
			stdin.on('data', onData);
			stdout.on('resize', onResizeEvent);

			try {
				while (!disposed && !signal.aborted) {
					// Wait for event
					if (queue.length === 0) {
						await new Promise<void>((resolve) => {
							eventResolve = resolve;
							signal.addEventListener('abort', resolve, { once: true });
						});
					}

					// Check if aborted while waiting
					if (disposed || signal.aborted) break;

					// Yield queued events
					while (queue.length > 0) {
						yield queue.shift()!;
					}
				}
			} finally {
				// Cleanup
				stdin.off('data', onData);
				stdout.off('resize', onResizeEvent);

				if (stdin.isTTY) {
					stdin.setRawMode(false);
					stdin.pause();
				}
			}
		},

		[Symbol.dispose](): void {
			if (disposed) return;
			disposed = true;

			// Abort pending waits
			controller.abort();

			// Remove resize listener
			stdout.off('resize', onResize);

			// Clear listeners
			listeners.clear();
		},
	};
}
