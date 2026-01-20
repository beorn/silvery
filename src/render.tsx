/**
 * Inkx Render Entry Point
 *
 * The main render() function that initializes Inkx and renders a React element
 * to the terminal. This wires together:
 * - Yoga (layout engine)
 * - React reconciler
 * - Context providers (App, Stdin, Stdout, Input, Focus)
 * - Render scheduler (batching and diffing)
 *
 * Compatible with Ink's render API.
 */

import { EventEmitter } from 'node:events';
import process from 'node:process';
import React, { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
	AppContext,
	FocusContext,
	type FocusContextValue,
	InputContext,
	StdinContext,
	StdoutContext,
} from './context.js';
import { isLayoutEngineInitialized, setLayoutEngine } from './layout-engine.js';
import { enterAlternateScreen, leaveAlternateScreen } from './output.js';
import { createContainer, getContainerRoot, reconciler } from './reconciler.js';
import { RenderScheduler } from './scheduler.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the render function.
 */
export interface RenderOptions {
	/** Standard output stream (default: process.stdout) */
	stdout?: NodeJS.WriteStream;
	/** Standard input stream (default: process.stdin) */
	stdin?: NodeJS.ReadStream;
	/** Exit when Ctrl+C is pressed (default: true) */
	exitOnCtrlC?: boolean;
	/** Enable debug mode with verbose logging (default: false) */
	debug?: boolean;
	/** Patch console methods to work with Inkx output (default: true) */
	patchConsole?: boolean;
	/** Use alternate screen buffer (default: false) */
	alternateScreen?: boolean;
}

/**
 * The instance returned by render().
 */
export interface Instance {
	/** Re-render with a new element */
	rerender: (element: ReactNode) => void;
	/** Unmount the component and clean up */
	unmount: () => void;
	/** Promise that resolves when the app exits */
	waitUntilExit: () => Promise<void>;
	/** Clear the terminal output */
	clear: () => void;
}

// ============================================================================
// Global State
// ============================================================================

/** Map of stdout streams to instances (for reuse) */
const instances = new Map<NodeJS.WriteStream, InkxInstance>();

// ============================================================================
// Layout Engine Initialization
// ============================================================================

/**
 * Initialize layout engine if not already initialized.
 * By default, uses Yoga via yoga-wasm-web/auto.
 */
async function ensureLayoutEngineInitialized(): Promise<void> {
	if (isLayoutEngineInitialized()) {
		return;
	}

	// Import the Yoga adapter and initialize
	const { initYogaEngine } = await import('./adapters/yoga-adapter.js');
	const engine = await initYogaEngine();
	setLayoutEngine(engine);
}

// ============================================================================
// Internal App Component
// ============================================================================

interface AppProps {
	children: ReactNode;
	stdin: NodeJS.ReadStream;
	stdout: NodeJS.WriteStream;
	exitOnCtrlC: boolean;
	onExit: (error?: Error) => void;
}

/**
 * Internal App component that provides all contexts.
 * This is a functional component that manages focus state and provides
 * all the context values needed by hooks.
 */
function InkxApp({ children, stdin, stdout, exitOnCtrlC, onExit }: AppProps): ReactElement {
	// Focus state
	const [focusState, setFocusState] = useState<{
		activeId: string | null;
		focusables: Array<{ id: string; isActive: boolean }>;
		isFocusEnabled: boolean;
	}>({
		activeId: null,
		focusables: [],
		isFocusEnabled: true,
	});

	// Raw mode reference count
	const rawModeCountRef = React.useRef(0);

	// Input event emitter
	const eventEmitter = useMemo(() => new EventEmitter(), []);

	// Exit handler
	const handleExit = useCallback(
		(error?: Error) => {
			onExit(error);
		},
		[onExit],
	);

	// Raw mode support check
	const isRawModeSupported = stdin.isTTY === true;

	// Focus management functions (defined before handleReadable since it depends on them)
	const addFocusable = useCallback((id: string, options?: { autoFocus?: boolean }) => {
		setFocusState((prev) => {
			const nextActiveId = !prev.activeId && options?.autoFocus ? id : prev.activeId;
			return {
				...prev,
				activeId: nextActiveId,
				focusables: [...prev.focusables, { id, isActive: true }],
			};
		});
	}, []);

	const removeFocusable = useCallback((id: string) => {
		setFocusState((prev) => ({
			...prev,
			activeId: prev.activeId === id ? null : prev.activeId,
			focusables: prev.focusables.filter((f) => f.id !== id),
		}));
	}, []);

	const activateFocusable = useCallback((id: string) => {
		setFocusState((prev) => ({
			...prev,
			focusables: prev.focusables.map((f) => (f.id === id ? { ...f, isActive: true } : f)),
		}));
	}, []);

	const deactivateFocusable = useCallback((id: string) => {
		setFocusState((prev) => ({
			...prev,
			activeId: prev.activeId === id ? null : prev.activeId,
			focusables: prev.focusables.map((f) => (f.id === id ? { ...f, isActive: false } : f)),
		}));
	}, []);

	const focus = useCallback((id: string) => {
		setFocusState((prev) => {
			const hasFocusable = prev.focusables.some((f) => f.id === id);
			if (!hasFocusable) return prev;
			return { ...prev, activeId: id };
		});
	}, []);

	const focusNext = useCallback(() => {
		setFocusState((prev) => {
			const activeIndex = prev.focusables.findIndex((f) => f.id === prev.activeId);
			for (let i = activeIndex + 1; i < prev.focusables.length; i++) {
				if (prev.focusables[i]?.isActive) {
					return { ...prev, activeId: prev.focusables[i].id };
				}
			}
			// Wrap to first active focusable
			const first = prev.focusables.find((f) => f.isActive);
			return { ...prev, activeId: first?.id ?? null };
		});
	}, []);

	const focusPrevious = useCallback(() => {
		setFocusState((prev) => {
			const activeIndex = prev.focusables.findIndex((f) => f.id === prev.activeId);
			for (let i = activeIndex - 1; i >= 0; i--) {
				if (prev.focusables[i]?.isActive) {
					return { ...prev, activeId: prev.focusables[i].id };
				}
			}
			// Wrap to last active focusable
			const activeFocusables = prev.focusables.filter((f) => f.isActive);
			const last = activeFocusables[activeFocusables.length - 1];
			return { ...prev, activeId: last?.id ?? null };
		});
	}, []);

	const enableFocus = useCallback(() => {
		setFocusState((prev) => ({ ...prev, isFocusEnabled: true }));
	}, []);

	const disableFocus = useCallback(() => {
		setFocusState((prev) => ({ ...prev, isFocusEnabled: false }));
	}, []);

	// Handle readable input
	const handleReadable = useCallback(() => {
		processInput();

		function processInput() {
			const chunk = stdin.read() as string | null;
			if (chunk === null) return;

			handleChunk(chunk);
			processInput(); // Process next chunk if available
		}

		function handleChunk(chunk: string) {
			// Handle Ctrl+C
			if (chunk === '\x03' && exitOnCtrlC) {
				handleExit();
				return;
			}

			// Handle Tab/Shift+Tab for focus
			if (focusState.isFocusEnabled) {
				if (chunk === '\t') {
					focusNext();
				} else if (chunk === '\u001B[Z') {
					focusPrevious();
				}
			}

			// Handle Escape to clear focus
			if (chunk === '\u001B' && focusState.activeId) {
				setFocusState((prev) => ({ ...prev, activeId: null }));
			}

			// Emit input event
			eventEmitter.emit('input', chunk);
		}
	}, [
		stdin,
		exitOnCtrlC,
		handleExit,
		focusState.isFocusEnabled,
		focusState.activeId,
		eventEmitter,
		focusNext,
		focusPrevious,
	]);

	// Set raw mode handler
	const setRawMode = useCallback(
		(enabled: boolean) => {
			if (!isRawModeSupported) {
				if (stdin === process.stdin) {
					throw new Error(
						'Raw mode is not supported on the current process.stdin. ' +
							'This usually happens when running without a TTY.',
					);
				}
				throw new Error('Raw mode is not supported on the provided stdin.');
			}

			stdin.setEncoding('utf8');

			if (enabled) {
				if (rawModeCountRef.current === 0) {
					stdin.ref();
					stdin.setRawMode(true);
					stdin.on('readable', handleReadable);
				}
				rawModeCountRef.current++;
			} else {
				rawModeCountRef.current = Math.max(0, rawModeCountRef.current - 1);
				if (rawModeCountRef.current === 0) {
					stdin.setRawMode(false);
					stdin.off('readable', handleReadable);
					stdin.unref();
				}
			}
		},
		[stdin, isRawModeSupported, handleReadable],
	);

	// Context values
	const appContextValue = useMemo(() => ({ exit: handleExit }), [handleExit]);

	const stdinContextValue = useMemo(
		() => ({
			stdin,
			isRawModeSupported,
			setRawMode,
		}),
		[stdin, isRawModeSupported, setRawMode],
	);

	const stdoutContextValue = useMemo(
		() => ({
			stdout,
			write: (data: string) => stdout.write(data),
		}),
		[stdout],
	);

	const inputContextValue = useMemo(
		() => ({
			eventEmitter,
			exitOnCtrlC,
		}),
		[eventEmitter, exitOnCtrlC],
	);

	const focusContextValue: FocusContextValue = useMemo(
		() => ({
			activeId: focusState.activeId,
			add: addFocusable,
			remove: removeFocusable,
			activate: activateFocusable,
			deactivate: deactivateFocusable,
			focus,
			focusNext,
			focusPrevious,
			enableFocus,
			disableFocus,
			isFocusEnabled: focusState.isFocusEnabled,
		}),
		[
			focusState.activeId,
			focusState.isFocusEnabled,
			addFocusable,
			removeFocusable,
			activateFocusable,
			deactivateFocusable,
			focus,
			focusNext,
			focusPrevious,
			enableFocus,
			disableFocus,
		],
	);

	return (
		<AppContext.Provider value={appContextValue}>
			<StdinContext.Provider value={stdinContextValue}>
				<StdoutContext.Provider value={stdoutContextValue}>
					<InputContext.Provider value={inputContextValue}>
						<FocusContext.Provider value={focusContextValue}>{children}</FocusContext.Provider>
					</InputContext.Provider>
				</StdoutContext.Provider>
			</StdinContext.Provider>
		</AppContext.Provider>
	);
}

// ============================================================================
// Internal Instance Class
// ============================================================================

/**
 * Internal class that manages a single Inkx render instance.
 */
class InkxInstance {
	private readonly stdout: NodeJS.WriteStream;
	private readonly stdin: NodeJS.ReadStream;
	private readonly exitOnCtrlC: boolean;
	private readonly debug: boolean;
	private readonly alternateScreen: boolean;

	private scheduler: RenderScheduler | null = null;
	private container: ReturnType<typeof createContainer> | null = null;
	private fiberRoot: any = null;
	private isUnmounted = false;

	private exitPromise: Promise<void> | null = null;
	private resolveExit: (() => void) | null = null;
	private rejectExit: ((error: Error) => void) | null = null;

	private resizeCleanup: (() => void) | null = null;
	private signalCleanup: (() => void) | null = null;

	constructor(options: Required<Omit<RenderOptions, 'patchConsole'>>) {
		this.stdout = options.stdout;
		this.stdin = options.stdin;
		this.exitOnCtrlC = options.exitOnCtrlC;
		this.debug = options.debug;
		this.alternateScreen = options.alternateScreen;

		// Set up exit promise
		this.exitPromise = new Promise<void>((resolve, reject) => {
			this.resolveExit = resolve;
			this.rejectExit = reject;
		});

		// Enter alternate screen if requested
		if (this.alternateScreen) {
			this.stdout.write(enterAlternateScreen());
		}

		// Set up container
		this.container = createContainer(() => {
			this.scheduler?.scheduleRender();
		});

		// Create the React fiber root
		this.fiberRoot = reconciler.createContainer(
			this.container,
			0, // LegacyRoot
			null, // hydrationCallbacks
			false, // isStrictMode
			null, // concurrentUpdatesByDefaultOverride
			'', // identifierPrefix
			() => {}, // onRecoverableError
			null, // transitionCallbacks
		);

		// Set up scheduler
		this.scheduler = new RenderScheduler({
			stdout: this.stdout,
			root: getContainerRoot(this.container),
			debug: this.debug,
		});

		// Set up resize listener
		this.setupResizeListener();

		// Set up signal handlers
		this.setupSignalHandlers();
	}

	/**
	 * Render a React element.
	 */
	render(element: ReactNode): void {
		if (this.isUnmounted || !this.fiberRoot) return;

		const tree = (
			<InkxApp
				stdin={this.stdin}
				stdout={this.stdout}
				exitOnCtrlC={this.exitOnCtrlC}
				onExit={this.handleExit}
			>
				{element}
			</InkxApp>
		);

		// Update the container with the new tree
		reconciler.updateContainer(tree, this.fiberRoot, null, () => {});
	}

	/**
	 * Rerender with a new element.
	 */
	rerender = (element: ReactNode): void => {
		this.render(element);
	};

	/**
	 * Unmount the component.
	 */
	unmount = (): void => {
		if (this.isUnmounted) return;
		this.isUnmounted = true;

		// Final render
		this.scheduler?.forceRender();

		// Clean up resources
		this.resizeCleanup?.();
		this.signalCleanup?.();

		// Leave alternate screen if we entered it
		if (this.alternateScreen) {
			this.stdout.write(leaveAlternateScreen());
		}

		// Clear the container
		if (this.fiberRoot) {
			reconciler.updateContainer(null, this.fiberRoot, null, () => {});
		}

		// Dispose scheduler
		this.scheduler?.dispose();

		// Remove from instances
		instances.delete(this.stdout);

		// Resolve exit promise
		this.resolveExit?.();
	};

	/**
	 * Wait for the app to exit.
	 */
	waitUntilExit = (): Promise<void> => {
		return this.exitPromise ?? Promise.resolve();
	};

	/**
	 * Clear the terminal output.
	 */
	clear = (): void => {
		this.scheduler?.clear();
	};

	/**
	 * Handle exit.
	 */
	private handleExit = (error?: Error): void => {
		if (this.isUnmounted) return;

		if (error) {
			this.rejectExit?.(error);
		}

		this.unmount();
	};

	/**
	 * Set up resize listener.
	 */
	private setupResizeListener(): void {
		const handleResize = () => {
			// Clear and force full redraw on resize
			this.scheduler?.clear();
			this.scheduler?.forceRender();
		};

		this.stdout.on('resize', handleResize);
		this.resizeCleanup = () => {
			this.stdout.off('resize', handleResize);
		};
	}

	/**
	 * Set up signal handlers for graceful exit.
	 */
	private setupSignalHandlers(): void {
		const handleSignal = () => {
			this.unmount();
		};

		process.on('SIGINT', handleSignal);
		process.on('SIGTERM', handleSignal);

		this.signalCleanup = () => {
			process.off('SIGINT', handleSignal);
			process.off('SIGTERM', handleSignal);
		};
	}
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Render a React element to the terminal.
 *
 * @example
 * ```tsx
 * import { render, Box, Text } from 'inkx';
 *
 * const { waitUntilExit } = render(
 *   <Box>
 *     <Text>Hello, Inkx!</Text>
 *   </Box>
 * );
 *
 * await waitUntilExit();
 * ```
 *
 * @param element - The React element to render
 * @param options - Render options
 * @returns An Instance object with control methods
 */
export async function render(
	element: ReactElement,
	options: RenderOptions = {},
): Promise<Instance> {
	// Ensure layout engine is initialized
	await ensureLayoutEngineInitialized();

	// Merge with defaults
	const resolvedOptions = {
		stdout: options.stdout ?? process.stdout,
		stdin: options.stdin ?? process.stdin,
		exitOnCtrlC: options.exitOnCtrlC ?? true,
		debug: options.debug ?? false,
		patchConsole: options.patchConsole ?? true,
		alternateScreen: options.alternateScreen ?? false,
	};

	// Get or create instance for this stdout
	let instance = instances.get(resolvedOptions.stdout);
	if (!instance) {
		instance = new InkxInstance(resolvedOptions);
		instances.set(resolvedOptions.stdout, instance);
	}

	// Render the element
	instance.render(element);

	return {
		rerender: instance.rerender,
		unmount: instance.unmount,
		waitUntilExit: instance.waitUntilExit,
		clear: instance.clear,
	};
}

/**
 * Synchronous render function for use when layout engine is already initialized.
 *
 * This is useful when you've already called setLayoutEngine() elsewhere.
 * If no layout engine is initialized, this will throw an error.
 *
 * @param element - The React element to render
 * @param options - Render options
 * @returns An Instance object with control methods
 */
export function renderSync(element: ReactElement, options: RenderOptions = {}): Instance {
	if (!isLayoutEngineInitialized()) {
		throw new Error(
			'Layout engine is not initialized. Call render() (async) first, or initialize manually with setLayoutEngine().',
		);
	}

	// Merge with defaults
	const resolvedOptions = {
		stdout: options.stdout ?? process.stdout,
		stdin: options.stdin ?? process.stdin,
		exitOnCtrlC: options.exitOnCtrlC ?? true,
		debug: options.debug ?? false,
		patchConsole: options.patchConsole ?? true,
		alternateScreen: options.alternateScreen ?? false,
	};

	// Get or create instance for this stdout
	let instance = instances.get(resolvedOptions.stdout);
	if (!instance) {
		instance = new InkxInstance(resolvedOptions);
		instances.set(resolvedOptions.stdout, instance);
	}

	// Render the element
	instance.render(element);

	return {
		rerender: instance.rerender,
		unmount: instance.unmount,
		waitUntilExit: instance.waitUntilExit,
		clear: instance.clear,
	};
}

// Re-export layout engine management for convenience
export { setLayoutEngine, isLayoutEngineInitialized } from './layout-engine.js';

// Re-export adapters for custom engine initialization
export {
	createYogaEngine,
	initYogaEngine,
	YogaLayoutEngine,
} from './adapters/yoga-adapter.js';
export {
	createFlexxEngine,
	FlexxLayoutEngine,
} from './adapters/flexx-adapter.js';
