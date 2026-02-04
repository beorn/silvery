/**
 * Inkx - Next-gen Terminal UI Renderer with Layout Feedback
 *
 * React-based terminal UI framework. Ink-compatible API with components
 * that know their size via useContentRect/useScreenRect hooks.
 *
 * ## Import Syntax
 *
 * All exports are NAMED exports (no default export):
 *
 * ```tsx
 * // Components and hooks
 * import { Box, Text, useContentRect, useInput, useApp, render, createTerm, term } from 'inkx'
 *
 * // Testing utilities
 * import { createRenderer, createLocator } from 'inkx/testing'
 * ```
 *
 * ## Quick Example
 *
 * ```tsx
 * import { render, Box, Text, useInput, useApp, createTerm } from 'inkx'
 *
 * function App() {
 *   const { exit } = useApp()
 *   useInput((input, key) => {
 *     if (input === 'q') exit();
 *   })
 *   return <Box><Text>Press q to quit</Text></Box>
 * }
 *
 * // Interactive rendering with Term
 * using term = createTerm()
 * await render(<App />, term)
 * ```
 *
 * Static rendering (no terminal needed):
 *
 * ```tsx
 * import { render, Box, Text } from 'inkx'
 *
 * // Renders once and returns when stable
 * await render(<Box><Text>Hello</Text></Box>)
 *
 * // With custom dimensions
 * await render(<Report />, { width: 120 })
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Components
// =============================================================================

/**
 * Re-export Box component - flexbox container for layout.
 *
 * @example
 * ```tsx
 * import { Box, Text } from 'inkx';
 *
 * <Box flexDirection="row" gap={2}>
 *   <Box width={10}><Text>Left</Text></Box>
 *   <Box flexGrow={1}><Text>Center</Text></Box>
 * </Box>
 * ```
 */
export { Box } from './components/Box.js';
export { Console } from './components/Console.js';
export { VirtualList } from './components/VirtualList.js';
export type {
	VirtualListProps,
	VirtualListHandle,
} from './components/VirtualList.js';
export { HorizontalVirtualList } from './components/HorizontalVirtualList.js';
export type {
	HorizontalVirtualListProps,
	HorizontalVirtualListHandle,
} from './components/HorizontalVirtualList.js';

/**
 * Re-export Text component - renders text content.
 *
 * @example
 * ```tsx
 * import { Text } from 'inkx';
 * import chalk from 'chalk';
 *
 * <Text>Plain text</Text>
 * <Text color="green">Colored text</Text>
 * <Text>{chalk.bold('Chalk works too')}</Text>
 * ```
 */
export { Text } from './components/Text.js';

export { Newline } from './components/Newline.js';
export { Spacer } from './components/Spacer.js';
export { Static } from './components/Static.js';

/**
 * Re-export ErrorBoundary component - catches render errors in children.
 *
 * @example
 * ```tsx
 * import { ErrorBoundary, Box, Text } from 'inkx';
 *
 * <ErrorBoundary fallback={<Text color="red">Error!</Text>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export { ErrorBoundary } from './components/ErrorBoundary.js';
export type { ErrorBoundaryProps } from './components/ErrorBoundary.js';

// Input Components
export { TextInput } from './components/TextInput.js';
export type { TextInputProps, TextInputHandle } from './components/TextInput.js';

export { ReadlineInput } from './components/ReadlineInput.js';
export type {
	ReadlineInputProps,
	ReadlineInputHandle,
} from './components/ReadlineInput.js';

// Input Hooks
export { useReadline } from './components/useReadline.js';
export type {
	ReadlineState,
	UseReadlineOptions,
	UseReadlineResult,
} from './components/useReadline.js';

// =============================================================================
// Hooks
// =============================================================================

/**
 * Layout hooks - the main feature of inkx over ink.
 *
 * @example
 * ```tsx
 * import { useContentRect, Box, Text } from 'inkx';
 *
 * function ResponsiveCard() {
 *   // Components know their size - no width prop threading needed
 *   const { width, height } = useContentRect();
 *   return <Text>{`Size: ${width}x${height}`}</Text>;
 * }
 * ```
 */
export {
	useContentRect,
	useContentRectCallback,
	useScreenRect,
	useScreenRectCallback,
} from './hooks/useLayout.js';

/**
 * Keyboard input hook.
 *
 * @example
 * ```tsx
 * import { useInput } from 'inkx';
 *
 * useInput((input, key) => {
 *   if (input === 'q') exit();
 *   if (key.upArrow) moveUp();
 *   if (key.return) submit();
 * });
 * ```
 */
export { useInput } from './hooks/useInput.js';

/**
 * App control hook - provides exit function.
 *
 * @example
 * ```tsx
 * import { useApp } from 'inkx';
 *
 * const { exit } = useApp();
 * exit();  // Clean exit
 * exit(new Error('Failed'));  // Exit with error
 * ```
 */
export { useApp } from './hooks/useApp.js';

export { useStdout } from './hooks/useStdout.js';
export { useStdin } from './hooks/useStdin.js';
export { useFocus, resetFocusIdCounter } from './hooks/useFocus.js';
export { useFocusManager } from './hooks/useFocusManager.js';
export { useTerm } from './hooks/useTerm.js';
export { useConsole } from './hooks/useConsole.js';

/**
 * Re-export React concurrent features for TUI responsiveness.
 *
 * @example
 * ```tsx
 * import { useTransition, useDeferredValue } from 'inkx';
 *
 * function Search() {
 *   const [query, setQuery] = useState('');
 *   const deferredQuery = useDeferredValue(query);
 *   const [isPending, startTransition] = useTransition();
 *
 *   // Typing stays responsive while filtering is deferred
 *   const filtered = useMemo(() => filterItems(deferredQuery), [deferredQuery]);
 *
 *   // Heavy updates can be marked as low-priority
 *   const handleChange = (value: string) => {
 *     setQuery(value);
 *     startTransition(() => {
 *       loadMoreData(value);
 *     });
 *   };
 * }
 * ```
 */
export { useTransition, useDeferredValue, useId } from 'react';

// Contexts for advanced usage (usually hooks are preferred)
export { TermContext, EventsContext } from './context.js';

// =============================================================================
// Re-exports from chalkx
// =============================================================================

// Term primitives (so consumers don't need to import from chalkx directly)
export { createTerm, term, patchConsole } from 'chalkx';
export type {
	Term,
	StyleChain,
	PatchedConsole,
	PatchConsoleOptions,
	ColorLevel,
	ConsoleEntry,
} from 'chalkx';

// Hit Registry (mouse support)
export {
	HitRegistry,
	HitRegistryContext,
	useHitRegistry,
	useHitRegion,
	useHitRegionCallback,
	resetHitRegionIdCounter,
	Z_INDEX,
} from './hit-registry.js';

// =============================================================================
// Render Functions
// =============================================================================

/**
 * Render functions and layout engine management.
 *
 * NOTE: render() is async - it initializes the layout engine on first call.
 * Use renderSync() if you've already initialized the layout engine.
 *
 * @example
 * ```tsx
 * import { render, Box, Text, createTerm } from 'inkx';
 *
 * // Interactive render with Term
 * using term = createTerm();
 * const { waitUntilExit, unmount, rerender } = await render(<App />, term);
 * await waitUntilExit();
 *
 * // Static render (no terminal needed)
 * await render(<Summary />);
 * await render(<Report />, { width: 120 });
 *
 * // Sync render (layout engine must be initialized)
 * import { renderSync, initYogaEngine, setLayoutEngine, createTerm } from 'inkx';
 * const engine = await initYogaEngine();
 * setLayoutEngine(engine);
 * using term = createTerm();
 * renderSync(<App />, term);
 * ```
 */
export {
	render,
	renderSync,
	renderStatic,
	setLayoutEngine,
	isLayoutEngineInitialized,
	// Yoga adapter
	createYogaEngine,
	initYogaEngine,
	YogaLayoutEngine,
	// Flexx adapter
	createFlexxEngine,
	FlexxLayoutEngine,
} from './render.js';
export {
	renderString,
	renderStringSync,
	type RenderStringOptions,
} from './render-string.js';
export { measureElement } from './measureElement.js';

// TermDef resolution utilities
export {
	resolveTermDef,
	resolveFromTerm,
	isTerm,
	isTermDef,
	createInputEvents,
	type ResolvedTermDef,
} from './term-def.js';

// ANSI escape sequences for terminal control
export { ANSI, enableMouse, disableMouse } from './output.js';

// Layout engine types
export type {
	LayoutEngine,
	LayoutNode,
	LayoutConstants,
	MeasureFunc,
	MeasureMode,
} from './layout-engine.js';

// Render adapter (for canvas, DOM, etc.)
export {
	setRenderAdapter,
	getRenderAdapter,
	hasRenderAdapter,
	getTextMeasurer,
	ensureRenderAdapterInitialized,
} from './render-adapter.js';
export type {
	RenderAdapter,
	RenderBuffer,
	RenderStyle,
	TextMeasurer,
	TextMeasureResult,
	TextMeasureStyle,
	BorderChars,
} from './render-adapter.js';

// Canvas adapter
export {
	createCanvasAdapter,
	CanvasRenderBuffer,
} from './adapters/canvas-adapter.js';
export type { CanvasAdapterConfig } from './adapters/canvas-adapter.js';

// DOM adapter
export {
	createDOMAdapter,
	DOMRenderBuffer,
	injectDOMStyles,
} from './adapters/dom-adapter.js';
export type { DOMAdapterConfig } from './adapters/dom-adapter.js';

// App types (unified render API)
export type { App } from './app.js';
export type { AutoLocator, FilterOptions } from './auto-locator.js';
export type { BoundTerm } from './bound-term.js';

// Types
export type { BoxProps, BoxHandle } from './components/Box.js';
export type { TextProps, TextHandle } from './components/Text.js';
export type { Rect } from './hooks/useLayout.js';
export type { Key, InputHandler, UseInputOptions } from './hooks/useInput.js';
export type { UseAppResult } from './hooks/useApp.js';
export type { UseStdoutResult } from './hooks/useStdout.js';
export type { UseStdinResult } from './hooks/useStdin.js';
export type { UseFocusOptions, UseFocusResult } from './hooks/useFocus.js';
export type { UseFocusManagerResult } from './hooks/useFocusManager.js';
export type {
	RenderOptions,
	Instance,
	RenderMode,
	NonTTYMode,
} from './render.js';
export type { MeasureElementOutput } from './measureElement.js';
export type {
	InkxNode,
	// Event types
	Event,
	KeyEvent,
	MouseEvent,
	ResizeEvent,
	FocusEvent,
	BlurEvent,
	SignalEvent,
	CustomEvent,
	EventSource,
	// TermDef for render configuration
	TermDef,
} from './types.js';
export type { HitTarget, HitRegion } from './hit-registry.js';

// Non-TTY utilities
export { isTTY, resolveNonTTYMode, stripAnsi } from './non-tty.js';
export type { NonTTYOptions, ResolvedNonTTYMode } from './non-tty.js';

// =============================================================================
// DevTools
// =============================================================================

/**
 * React DevTools integration.
 *
 * Optional connection to React DevTools standalone for debugging component trees.
 * Requires `react-devtools-core` (optional peer dependency).
 *
 * @example
 * ```ts
 * // Manual connection
 * import { connectDevTools } from 'inkx';
 * await connectDevTools();
 *
 * // Or use env var: DEBUG_DEVTOOLS=1 bun run app.ts
 * ```
 */
export { connectDevTools, isDevToolsConnected } from './devtools.js';

// =============================================================================
// Unicode Text Utilities
// =============================================================================

/**
 * Unicode-aware text manipulation functions.
 * Handle ANSI codes, wide characters (CJK), and emoji correctly.
 */
export {
	// Measurement
	displayWidth,
	displayWidthAnsi,
	measureText,
	// Manipulation
	wrapText,
	truncateText,
	padText,
	constrainText,
	sliceByWidth,
	// ANSI handling
	hasAnsi,
	parseAnsiText,
	stripAnsi as stripAnsiUnicode,
	truncateAnsi,
	// Grapheme operations
	splitGraphemes,
	graphemeCount,
	graphemeWidth,
	// Character detection
	isWideGrapheme,
	isZeroWidthGrapheme,
	isCJK,
	isLikelyEmoji,
	hasWideCharacters,
	hasZeroWidthCharacters,
	// Emoji presentation
	ensureEmojiPresentation,
	// Buffer writing
	writeTextToBuffer,
	writeTextTruncated,
	writeLinesToBuffer,
	// Utilities
	normalizeText,
	getFirstCodePoint,
} from './unicode.js';

export type { StyledSegment } from './unicode.js';

// =============================================================================
// Scroll Utilities
// =============================================================================

/**
 * Scroll utility for edge-based scrolling.
 *
 * @example
 * ```tsx
 * import { calcEdgeBasedScrollOffset } from 'inkx';
 *
 * const newOffset = calcEdgeBasedScrollOffset(
 *   selectedIndex,
 *   currentOffset,
 *   visibleCount,
 *   totalCount,
 *   padding  // optional, default: 1
 * );
 * ```
 */
export { calcEdgeBasedScrollOffset } from './scroll-utils.js';

// =============================================================================
// Plugin Composition (SlateJS-style)
// =============================================================================

/**
 * Plugin composition for command systems.
 *
 * @example
 * ```tsx
 * import { withCommands, withKeybindings, render } from 'inkx';
 *
 * const app = withKeybindings(withCommands(render(<Board />), {
 *   registry: commandRegistry,
 *   getContext: () => buildContext(state),
 *   handleAction: (action) => dispatch(action),
 *   getKeybindings: () => keybindings,
 * }), {
 *   bindings: keybindings,
 *   getKeyContext: () => ({ mode: 'normal', hasSelection: false }),
 * });
 *
 * await app.cmd.down();         // Direct command invocation
 * await app.press('j');         // Key → command → action
 * console.log(app.cmd.down.help); // Command metadata
 * ```
 */
export { withCommands } from './with-commands.js';
export type {
	WithCommandsOptions,
	CommandDef,
	CommandRegistryLike,
	CommandInfo,
	Command,
	Cmd,
	AppWithCommands,
	AppState,
	KeybindingDef,
} from './with-commands.js';

export { withKeybindings } from './with-keybindings.js';
export type {
	WithKeybindingsOptions,
	KeybindingContext,
	ExtendedKeybindingDef,
} from './with-keybindings.js';
