/**
 * createApp() - Layer 3 entry point for inkx-loop
 *
 * Provides Zustand store integration with unified providers.
 * Providers are stores (getState/subscribe) + event sources (events()).
 *
 * @example
 * ```tsx
 * import { createApp, useApp, createTermProvider } from 'inkx/runtime'
 *
 * const app = createApp(
 *   // Store factory
 *   ({ term }) => (set, get) => ({
 *     count: 0,
 *     increment: () => set(s => ({ count: s.count + 1 })),
 *   }),
 *   // Event handlers - namespaced as 'provider:event'
 *   {
 *     'term:key': ({ input, key }, { set }) => {
 *       if (input === 'j') set(s => ({ count: s.count + 1 }))
 *       if (input === 'q') return 'exit'
 *     },
 *     'term:resize': ({ cols, rows }, { set }) => {
 *       // handle resize
 *     },
 *   }
 * )
 *
 * function Counter() {
 *   const count = useApp(s => s.count)
 *   return <Text>Count: {count}</Text>
 * }
 *
 * const term = createTermProvider(process.stdin, process.stdout)
 * await app.run(<Counter />, { term })
 *
 * // Frame iteration:
 * for await (const frame of app.run(<Counter />, { term })) {
 *   expect(frame.text).toContain('Count:')
 * }
 * ```
 */

import process from 'node:process';
import React, {
	createContext,
	useContext,
	useEffect,
	useRef,
	type ReactElement,
} from 'react';
import { createStore, type StateCreator, type StoreApi } from 'zustand';

import { createTerm } from 'chalkx';
import { bufferToText, bufferToStyledText } from '../buffer.js';
import { AppContext, StdoutContext, TermContext } from '../context.js';
import { executeRender } from '../pipeline/index.js';
import { reconciler, createContainer, getContainerRoot } from '../reconciler.js';
import { createRuntime } from './create-runtime.js';
import { ensureLayoutEngine } from './layout.js';
import { parseKey, type Key } from './keys.js';
import { takeUntil, merge, map } from '../streams/index.js';
import { createTermProvider, type TermProvider } from './term-provider.js';
import type {
	Buffer,
	Dims,
	RenderTarget,
	Provider,
	ProviderEvent,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Check if value is a Provider with events (full interface).
 */
function isFullProvider(value: unknown): value is Provider<unknown, Record<string, unknown>> {
	return (
		value !== null &&
		typeof value === 'object' &&
		'getState' in value &&
		'subscribe' in value &&
		'events' in value &&
		typeof (value as Provider).getState === 'function' &&
		typeof (value as Provider).subscribe === 'function' &&
		typeof (value as Provider).events === 'function'
	);
}

/**
 * Check if value is a basic Provider (just getState/subscribe, Zustand-compatible).
 */
function isBasicProvider(value: unknown): value is { getState(): unknown; subscribe(l: (s: unknown) => void): () => void } {
	return (
		value !== null &&
		typeof value === 'object' &&
		'getState' in value &&
		'subscribe' in value &&
		typeof (value as { getState: unknown }).getState === 'function' &&
		typeof (value as { subscribe: unknown }).subscribe === 'function'
	);
}

/**
 * Event handler context passed to handlers.
 */
export interface EventHandlerContext<S> {
	set: StoreApi<S>['setState'];
	get: StoreApi<S>['getState'];
}

/**
 * Generic event handler function.
 * Return 'exit' to exit the app.
 */
export type EventHandler<T, S> = (
	data: T,
	ctx: EventHandlerContext<S>
) => void | 'exit';

/**
 * Legacy key handler for backwards compatibility.
 */
export type KeyHandler<S> = (
	input: string,
	key: Key,
	ctx: EventHandlerContext<S>
) => void | 'exit';

/**
 * Event handlers map.
 * Keys are either:
 * - 'provider:event' for new namespaced handlers
 * - 'key' / 'resize' for legacy handlers (auto-maps to 'term:key', 'term:resize')
 */
export type EventHandlers<S> = {
	// Legacy handlers (backwards compat)
	key?: KeyHandler<S>;
	resize?: EventHandler<{ cols: number; rows: number }, S>;
	// Namespaced handlers
	[event: `${string}:${string}`]: EventHandler<unknown, S> | undefined;
};

/**
 * Options for app.run().
 */
export interface AppRunOptions {
	/** Terminal dimensions (default: from process.stdout) */
	cols?: number;
	rows?: number;
	/** Standard output (default: process.stdout) */
	stdout?: NodeJS.WriteStream;
	/** Standard input (default: process.stdin) */
	stdin?: NodeJS.ReadStream;
	/** Abort signal for external cleanup */
	signal?: AbortSignal;
	/** Providers and plain values to inject */
	[key: string]: unknown;
}

/**
 * Handle returned by app.run().
 *
 * Also AsyncIterable<Buffer> — iterate to get frames after each event:
 * ```typescript
 * for await (const frame of app.run(<App />)) {
 *   expect(frame.text).toContain('expected')
 * }
 * ```
 */
export interface AppHandle<S> {
	/** Current rendered text (no ANSI) */
	readonly text: string;
	/** Access to the Zustand store */
	readonly store: StoreApi<S>;
	/** Wait until the app exits */
	waitUntilExit(): Promise<void>;
	/** Unmount and cleanup */
	unmount(): void;
	/** Send a key press (simulates term:key event) */
	press(key: string): Promise<void>;
	/** Iterate frames yielded after each event */
	[Symbol.asyncIterator](): AsyncIterator<Buffer>;
}

/**
 * App definition returned by createApp().
 */
export interface AppDefinition<S> {
	run(element: ReactElement, options?: AppRunOptions): AppRunner<S>;
}

/**
 * Result of app.run() — both a Promise<AppHandle> and an AsyncIterable<Buffer>.
 *
 * - `await app.run(el)` → AppHandle (backward compat)
 * - `for await (const frame of app.run(el))` → iterate frames
 */
export interface AppRunner<S> extends AsyncIterable<Buffer>, PromiseLike<AppHandle<S>> {}

// ============================================================================
// Store Context
// ============================================================================

const StoreContext = createContext<StoreApi<unknown> | null>(null);

/**
 * Hook for accessing app state with selectors.
 *
 * @example
 * ```tsx
 * const count = useApp(s => s.count)
 * const { count, increment } = useApp(s => ({ count: s.count, increment: s.increment }))
 * ```
 */
export function useApp<S, T>(selector: (state: S) => T): T {
	const store = useContext(StoreContext) as StoreApi<S> | null;
	if (!store) throw new Error('useApp must be used within createApp().run()');

	const [state, setState] = React.useState(() => selector(store.getState()));
	const selectorRef = useRef(selector);
	selectorRef.current = selector;

	useEffect(() => {
		return store.subscribe((newState) => {
			setState(selectorRef.current(newState));
		});
	}, [store]);

	return state;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Namespaced event from a provider.
 */
interface NamespacedEvent {
	type: string;
	provider: string;
	event: string;
	data: unknown;
}

/**
 * Create an app with Zustand store and provider integration.
 *
 * This is Layer 3 - it provides:
 * - Zustand store with fine-grained subscriptions
 * - Providers as unified stores + event sources
 * - Event handlers namespaced as 'provider:event'
 *
 * @param factory Store factory function that receives providers
 * @param handlers Optional event handlers (namespaced as 'provider:event')
 */
export function createApp<I extends Record<string, unknown>, S extends Record<string, unknown>>(
	factory: (inject: I) => StateCreator<S>,
	handlers?: EventHandlers<S & I>
): AppDefinition<S & I> {
	return {
		run(element: ReactElement, options: AppRunOptions = {}): AppRunner<S & I> {
			// Lazy-init: the actual setup happens once, on first access
			let handlePromise: Promise<AppHandle<S & I>> | null = null;

			const init = (): Promise<AppHandle<S & I>> => {
				if (handlePromise) return handlePromise;
				handlePromise = initApp(factory, handlers, element, options);
				return handlePromise;
			};

			return {
				// PromiseLike — makes `await app.run(el)` work
				then<TResult1 = AppHandle<S & I>, TResult2 = never>(
					onfulfilled?: ((value: AppHandle<S & I>) => TResult1 | PromiseLike<TResult1>) | null,
					onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
				): Promise<TResult1 | TResult2> {
					return init().then(onfulfilled, onrejected);
				},

				// AsyncIterable — makes `for await (const frame of app.run(el))` work
				[Symbol.asyncIterator](): AsyncIterator<Buffer> {
					let handle: AppHandle<S & I> | null = null;
					let iterator: AsyncIterator<Buffer> | null = null;
					let started = false;

					return {
						async next(): Promise<IteratorResult<Buffer>> {
							if (!started) {
								started = true;
								handle = await init();
								iterator = handle[Symbol.asyncIterator]();
							}
							return iterator!.next();
						},
						async return(): Promise<IteratorResult<Buffer>> {
							if (handle) handle.unmount();
							return { done: true, value: undefined as unknown as Buffer };
						},
					};
				},
			};
		},
	};
}

/**
 * Initialize the app — extracted from run() for clarity.
 */
async function initApp<I extends Record<string, unknown>, S extends Record<string, unknown>>(
	factory: (inject: I) => StateCreator<S>,
	handlers: EventHandlers<S & I> | undefined,
	element: ReactElement,
	options: AppRunOptions,
): Promise<AppHandle<S & I>> {
	const {
		cols = process.stdout.columns || 80,
		rows = process.stdout.rows || 24,
		stdout = process.stdout,
		stdin = process.stdin,
		signal: externalSignal,
		...injectValues
	} = options;

	// Initialize layout engine
	await ensureLayoutEngine();

	// Create abort controller for cleanup
	const controller = new AbortController();
	const signal = controller.signal;

	// Wire external signal
	if (externalSignal) {
		if (externalSignal.aborted) {
			controller.abort();
		} else {
			externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
		}
	}

	// Separate providers from plain values
	const providers: Record<string, Provider<unknown, Record<string, unknown>>> = {};
	const plainValues: Record<string, unknown> = {};
	const providerCleanups: (() => void)[] = [];

	// Create term provider if not provided
	let termProvider: TermProvider | null = null;
	if (!('term' in injectValues) || !isFullProvider(injectValues.term)) {
		termProvider = createTermProvider(stdin, stdout, { cols, rows });
		providers.term = termProvider;
		providerCleanups.push(() => termProvider![Symbol.dispose]());
	}

	// Categorize injected values
	for (const [name, value] of Object.entries(injectValues)) {
		if (isFullProvider(value)) {
			providers[name] = value;
		} else {
			plainValues[name] = value;
		}
	}

	// Build inject object (providers + plain values)
	const inject = { ...providers, ...plainValues } as I;

	// Subscribe to provider state changes
	const stateUnsubscribes: (() => void)[] = [];

	// Create store
	const store = createStore<S & I>((set, get, api) => {
		// Get base state from factory
		const baseState = factory(inject)(
			set as StoreApi<S>['setState'],
			get as StoreApi<S>['getState'],
			api as StoreApi<S>
		);

		// Merge provider references into state (for access via selectors)
		const mergedState: Record<string, unknown> = { ...baseState };

		for (const [name, provider] of Object.entries(providers)) {
			mergedState[name] = provider;

			// Subscribe to provider state changes (basic providers only)
			if (isBasicProvider(provider)) {
				const unsub = provider.subscribe((providerState) => {
					// Could flatten provider state here if desired
					// For now, just trigger a re-check
				});
				stateUnsubscribes.push(unsub);
			}
		}

		// Add plain values
		for (const [name, value] of Object.entries(plainValues)) {
			mergedState[name] = value;
		}

		return mergedState as S & I;
	});

	// Track current dimensions
	let currentDims: Dims = { cols, rows };
	let shouldExit = false;

	// Create render target
	const target: RenderTarget = {
		write(frame: string): void {
			stdout.write(frame);
		},
		getDims(): Dims {
			return currentDims;
		},
		onResize(handler: (dims: Dims) => void): () => void {
			const onResize = () => {
				currentDims = {
					cols: stdout.columns || 80,
					rows: stdout.rows || 24,
				};
				handler(currentDims);
			};
			stdout.on('resize', onResize);
			return () => stdout.off('resize', onResize);
		},
	};

	// Create runtime
	const runtime = createRuntime({ target, signal });

	// Cleanup state
	let cleanedUp = false;
	let storeUnsubscribeFn: (() => void) | null = null;

	// Cleanup function - idempotent, can be called from exit() or finally
	const cleanup = () => {
		if (cleanedUp) return;
		cleanedUp = true;

		// Unsubscribe from store
		if (storeUnsubscribeFn) {
			storeUnsubscribeFn();
		}

		// Unsubscribe from provider state changes
		stateUnsubscribes.forEach((unsub) => {
			try {
				unsub();
			} catch {
				// Ignore
			}
		});

		// Cleanup providers (including termProvider)
		providerCleanups.forEach((fn) => {
			try {
				fn();
			} catch {
				// Ignore
			}
		});

		// Dispose runtime
		runtime[Symbol.dispose]();

		// Restore cursor
		stdout.write('\x1b[?25h\x1b[0m\n');
	};

	// Exit function - defined early so components can reference it
	let exit: () => void;

	// Create InkxNode container
	const container = createContainer(() => {});

	// Create React fiber root
	const fiberRoot = reconciler.createContainer(
		container,
		0,
		null,
		false,
		null,
		'',
		() => {},
		null,
	);

	// Track current buffer for text access
	let currentText = '';
	let currentBuffer: Buffer;

	// Create mock stdout for contexts
	const mockStdout = {
		columns: cols,
		rows: rows,
		write: () => true,
		isTTY: false,
		on: () => mockStdout,
		off: () => mockStdout,
		once: () => mockStdout,
		removeListener: () => mockStdout,
		addListener: () => mockStdout,
	} as unknown as NodeJS.WriteStream;

	// Create mock term
	const mockTerm = createTerm({ level: 3, columns: cols });

	// Wrap element with all required providers
	const wrappedElement = (
		<TermContext.Provider value={mockTerm}>
			<AppContext.Provider value={{ exit }}>
				<StdoutContext.Provider value={{ stdout: mockStdout, write: () => {} }}>
					<StoreContext.Provider value={store as StoreApi<unknown>}>
						{element}
					</StoreContext.Provider>
				</StdoutContext.Provider>
			</AppContext.Provider>
		</TermContext.Provider>
	);

	// Helper to render and get text
	function doRender(): Buffer {
		reconciler.updateContainerSync(wrappedElement, fiberRoot, null, () => {});
		reconciler.flushSyncWork();

		const rootNode = getContainerRoot(container);
		const dims = runtime.getDims();
		const { buffer: termBuffer } = executeRender(rootNode, dims.cols, dims.rows, null, {
			skipLayoutNotifications: true,
		});

		const text = bufferToText(termBuffer);
		const ansi = bufferToStyledText(termBuffer);

		return {
			text,
			ansi,
			nodes: rootNode,
			_buffer: termBuffer,
		};
	}

	// Initial render
	const buffer = doRender();
	currentText = buffer.text;
	currentBuffer = buffer;

	// Clear screen and hide cursor
	stdout.write('\x1b[2J\x1b[H\x1b[?25l');
	runtime.render(buffer);

	// Exit promise
	let exitResolve: () => void;
	let exitResolved = false;
	const exitPromise = new Promise<void>((resolve) => {
		exitResolve = () => {
			if (!exitResolved) {
				exitResolved = true;
				resolve();
			}
		};
	});

	// Now define exit function (needs exitResolve and cleanup)
	exit = () => {
		if (shouldExit) return; // Already exiting
		shouldExit = true;
		controller.abort();
		cleanup();
		exitResolve();
	};

	// Frame listeners for async iteration
	let frameResolve: ((buffer: Buffer) => void) | null = null;
	let framesDone = false;

	// Notify frame listeners
	function emitFrame(buf: Buffer) {
		if (frameResolve) {
			const resolve = frameResolve;
			frameResolve = null;
			resolve(buf);
		}
	}

	// Subscribe to store for re-renders
	storeUnsubscribeFn = store.subscribe(() => {
		if (!shouldExit) {
			const newBuffer = doRender();
			currentText = newBuffer.text;
			currentBuffer = newBuffer;
			runtime.render(newBuffer);
		}
	});

	// Create namespaced event streams from all providers
	function createProviderEventStream(
		name: string,
		provider: Provider<unknown, Record<string, unknown>>
	): AsyncIterable<NamespacedEvent> {
		return map(provider.events(), (event) => ({
			type: `${name}:${String(event.type)}`,
			provider: name,
			event: String(event.type),
			data: event.data,
		}));
	}

	// Process a single event through handlers, return the resulting buffer
	function processEvent(event: NamespacedEvent): Buffer | null {
		if (shouldExit) return null;

		// Try namespaced handler first: 'provider:event'
		const namespacedKey = event.type;
		const namespacedHandler = handlers?.[namespacedKey as keyof typeof handlers];

		if (namespacedHandler && typeof namespacedHandler === 'function') {
			const result = (namespacedHandler as EventHandler<unknown, S & I>)(event.data, {
				set: store.setState,
				get: store.getState,
			});
			if (result === 'exit') {
				exit();
				return null;
			}
		}

		// Legacy handler support: 'key' maps to 'term:key'
		if (event.type === 'term:key' && handlers?.key) {
			const keyData = event.data as { input: string; key: Key };
			const result = handlers.key(keyData.input, keyData.key, {
				set: store.setState,
				get: store.getState,
			});
			if (result === 'exit') {
				exit();
				return null;
			}
		}

		// Legacy handler support: 'resize' maps to 'term:resize'
		if (event.type === 'term:resize' && handlers?.resize) {
			const resizeData = event.data as { cols: number; rows: number };
			currentDims = resizeData;
			const result = handlers.resize(resizeData, {
				set: store.setState,
				get: store.getState,
			});
			if (result === 'exit') {
				exit();
				return null;
			}
		}

		// Re-render
		const newBuffer = doRender();
		currentText = newBuffer.text;
		currentBuffer = newBuffer;
		runtime.render(newBuffer);

		return newBuffer;
	}

	// Start event loop
	const eventLoop = async () => {
		// Merge all provider event streams
		const providerEventStreams = Object.entries(providers).map(([name, provider]) =>
			createProviderEventStream(name, provider)
		);

		const allEvents = merge(...providerEventStreams);

		try {
			for await (const event of takeUntil(allEvents, signal)) {
				const buf = processEvent(event);
				if (buf) emitFrame(buf);
				if (shouldExit) break;
			}
		} finally {
			// Mark frames as done and notify waiters
			framesDone = true;
			if (frameResolve) {
				const resolve = frameResolve;
				frameResolve = null;
				// Signal completion — resolve with a sentinel that next() will detect
				resolve(null as unknown as Buffer);
			}
			// Cleanup and resolve exit promise
			cleanup();
			exitResolve();
		}
	};

	// Start loop in background
	eventLoop().catch(console.error);

	// Return handle with async iteration
	const handle: AppHandle<S & I> = {
		get text() {
			return currentText;
		},
		get store() {
			return store;
		},
		waitUntilExit() {
			return exitPromise;
		},
		unmount() {
			exit();
		},
		async press(rawKey: string) {
			// Parse the key
			const [input, parsedKey] = parseKey(rawKey);

			// Simulate term:key event through handlers
			const namespacedHandler = handlers?.['term:key' as keyof typeof handlers];
			if (namespacedHandler && typeof namespacedHandler === 'function') {
				const result = (namespacedHandler as EventHandler<unknown, S & I>)(
					{ input, key: parsedKey },
					{ set: store.setState, get: store.getState }
				);
				if (result === 'exit') {
					exit();
					return;
				}
			}

			// Legacy handler
			if (handlers?.key) {
				const result = handlers.key(input, parsedKey, {
					set: store.setState,
					get: store.getState,
				});
				if (result === 'exit') {
					exit();
					return;
				}
			}

			// Trigger re-render
			const newBuffer = doRender();
			currentText = newBuffer.text;
			currentBuffer = newBuffer;
			await Promise.resolve();
		},

		[Symbol.asyncIterator](): AsyncIterator<Buffer> {
			return {
				async next(): Promise<IteratorResult<Buffer>> {
					if (framesDone || shouldExit) {
						return { done: true, value: undefined as unknown as Buffer };
					}

					// Wait for next frame from event loop
					const buf = await new Promise<Buffer>((resolve) => {
						// If already done, resolve immediately
						if (framesDone || shouldExit) {
							resolve(null as unknown as Buffer);
							return;
						}
						frameResolve = resolve;
					});

					// null sentinel means done
					if (!buf) {
						return { done: true, value: undefined as unknown as Buffer };
					}

					return { done: false, value: buf };
				},
				async return(): Promise<IteratorResult<Buffer>> {
					exit();
					return { done: true, value: undefined as unknown as Buffer };
				},
			};
		},
	};

	return handle;
}
