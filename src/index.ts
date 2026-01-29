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
 * import { Box, Text, useContentRect, useInput, useApp, render, createTerm, term } from 'inkx';
 *
 * // Testing utilities
 * import { createTestRenderer, createLocator } from 'inkx/testing';
 * ```
 *
 * ## Quick Example
 *
 * ```tsx
 * import { render, Box, Text, useInput, useApp, createTerm } from 'inkx';
 *
 * function App() {
 *   const { exit } = useApp();
 *   useInput((input, key) => {
 *     if (input === 'q') exit();
 *   });
 *   return <Box><Text>Press q to quit</Text></Box>;
 * }
 *
 * using term = createTerm();
 * await render(term, <App />);
 * ```
 *
 * Or use the default term for simple scripts:
 *
 * ```tsx
 * import { render, Box, Text, term } from 'inkx';
 *
 * await render(term, <Box><Text>Hello</Text></Box>);
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
	// New API (preferred)
	useContentRect,
	useContentRectCallback,
	useScreenRect,
	useScreenRectCallback,
	// Deprecated aliases (backwards compatibility)
	useLayout,
	useLayoutCallback,
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

// TermContext for advanced usage (usually useTerm() is preferred)
export { TermContext } from './context.js';

// =============================================================================
// Re-exports from chalkx
// =============================================================================

// Term primitives (so consumers don't need to import from chalkx directly)
export { createTerm, term, patchConsole } from 'chalkx';
export type { Term, StyleChain, PatchedConsole, ColorLevel, ConsoleEntry } from 'chalkx';

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
 * // Async render (initializes layout engine)
 * using term = createTerm();
 * const { waitUntilExit, unmount, rerender } = await render(term, <App />);
 * await waitUntilExit();
 *
 * // Sync render (layout engine must be initialized)
 * import { renderSync, initYogaEngine, setLayoutEngine, createTerm } from 'inkx';
 * const engine = await initYogaEngine();
 * setLayoutEngine(engine);
 * using term = createTerm();
 * renderSync(term, <App />);
 * ```
 */
export {
	render,
	renderSync,
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
export { renderString, renderStringSync, type RenderStringOptions } from './render-string.js';
export { measureElement } from './measureElement.js';

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

// App types (unified render API)
export type { App } from './app.js';
export type { AutoLocator, FilterOptions } from './auto-locator.js';
export type { BoundTerm } from './bound-term.js';

// Types
export type { BoxProps } from './components/Box.js';
export type { TextProps } from './components/Text.js';
export type { Rect, ComputedLayout } from './hooks/useLayout.js';
export type { Key, InputHandler, UseInputOptions } from './hooks/useInput.js';
export type { UseAppResult } from './hooks/useApp.js';
export type { UseStdoutResult } from './hooks/useStdout.js';
export type { UseStdinResult } from './hooks/useStdin.js';
export type { UseFocusOptions, UseFocusResult } from './hooks/useFocus.js';
export type { UseFocusManagerResult } from './hooks/useFocusManager.js';
export type { RenderOptions, Instance, RenderMode, NonTTYMode } from './render.js';
export type { MeasureElementOutput } from './measureElement.js';
export type { InkxNode } from './types.js';
export type { HitTarget, HitRegion } from './hit-registry.js';

// Non-TTY utilities
export {
	isTTY,
	resolveNonTTYMode,
	stripAnsi,
} from './non-tty.js';
export type { NonTTYOptions, ResolvedNonTTYMode } from './non-tty.js';
