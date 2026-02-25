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
export { Box } from "./components/Box.js"
export { Console } from "./components/Console.js"
export { VirtualList } from "./components/VirtualList.js"
export type { VirtualListProps, VirtualListHandle, ItemMeta } from "./components/VirtualList.js"
export { HorizontalVirtualList } from "./components/HorizontalVirtualList.js"
export type { HorizontalVirtualListProps, HorizontalVirtualListHandle } from "./components/HorizontalVirtualList.js"
export { SplitView } from "./components/SplitView.js"
export type { SplitViewProps } from "./components/SplitView.js"
export type { LayoutNode as SplitLayoutNode } from "./pane-manager.js"
export {
  createLeaf,
  splitPane,
  removePane,
  getPaneIds,
  findAdjacentPane,
  resizeSplit,
  swapPanes,
  getTabOrder as getSplitTabOrder,
} from "./pane-manager.js"

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
export { Text } from "./components/Text.js"

export { Link } from "./components/Link.js"
export type { LinkProps } from "./components/Link.js"
export { Transform } from "./components/Transform.js"
export type { TransformProps } from "./components/Transform.js"
export { Fill } from "./components/Fill.js"
export type { FillProps } from "./components/Fill.js"
export { Newline } from "./components/Newline.js"
export { Spacer } from "./components/Spacer.js"
export { Static } from "./components/Static.js"

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
export { ErrorBoundary } from "./components/ErrorBoundary.js"
export type { ErrorBoundaryProps } from "./components/ErrorBoundary.js"

// Input Components
export { TextInput } from "./components/TextInput.js"
export type { TextInputProps, TextInputHandle } from "./components/TextInput.js"

export { ReadlineInput } from "./components/ReadlineInput.js"
export type { ReadlineInputProps, ReadlineInputHandle } from "./components/ReadlineInput.js"

export { TextArea } from "./components/TextArea.js"
export type { TextAreaProps, TextAreaHandle } from "./components/TextArea.js"

export { EditContextDisplay } from "./components/EditContextDisplay.js"
export type { EditContextDisplayProps } from "./components/EditContextDisplay.js"

// Input Hooks
export { useReadline } from "./components/useReadline.js"
export type { ReadlineState, UseReadlineOptions, UseReadlineResult } from "./components/useReadline.js"

// Widget Components
export { Spinner } from "./components/Spinner.js"
export type { SpinnerProps } from "./components/Spinner.js"

export { ProgressBar } from "./components/ProgressBar.js"
export type { ProgressBarProps } from "./components/ProgressBar.js"

export { SelectList } from "./components/SelectList.js"
export type { SelectListProps, SelectOption } from "./components/SelectList.js"

export { Table } from "./components/Table.js"
export type { TableProps, TableColumn } from "./components/Table.js"

export { Badge } from "./components/Badge.js"
export type { BadgeProps } from "./components/Badge.js"

export { Divider } from "./components/Divider.js"
export type { DividerProps } from "./components/Divider.js"

// Image Component
export { Image } from "./image/Image.js"
export type { ImageProps } from "./image/Image.js"

// Image Protocol Encoders
export { encodeKittyImage, deleteKittyImage, isKittyGraphicsSupported } from "./image/kitty-graphics.js"
export type { KittyImageOptions } from "./image/kitty-graphics.js"
export { encodeSixel, isSixelSupported } from "./image/sixel-encoder.js"
export type { SixelImageData } from "./image/sixel-encoder.js"

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
export { useContentRect, useContentRectCallback, useScreenRect, useScreenRectCallback } from "./hooks/useLayout.js"

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
export { useInput } from "./hooks/useInput.js"

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
export { useApp } from "./hooks/useApp.js"

export { useStdout } from "./hooks/useStdout.js"
export { useStdin } from "./hooks/useStdin.js"
export { useFocusManager } from "./hooks/useFocusManager.js"

// Focus system (tree-based)
export { createFocusManager } from "./focus-manager.js"
export type {
  FocusManager,
  FocusManagerOptions,
  FocusChangeCallback,
  FocusOrigin,
  FocusSnapshot,
} from "./focus-manager.js"
export {
  findFocusableAncestor,
  getTabOrder,
  findByTestID,
  findSpatialTarget,
  getExplicitFocusLink,
} from "./focus-queries.js"
export { createKeyEvent, createFocusEvent, dispatchKeyEvent, dispatchFocusEvent } from "./focus-events.js"
export type { InkxKeyEvent, InkxFocusEvent, FocusEventProps } from "./focus-events.js"
export { useFocusable } from "./hooks/useFocusable.js"
export type { UseFocusableResult } from "./hooks/useFocusable.js"
export { useFocusWithin } from "./hooks/useFocusWithin.js"

// Ink-compatible focus hooks
export { useFocus, useInkFocusManager } from "./hooks/ink-compat.js"
export type { UseFocusOptions, UseFocusResult, InkUseFocusManagerResult } from "./hooks/ink-compat.js"
export { useTerm } from "./hooks/useTerm.js"
export { useConsole } from "./hooks/useConsole.js"
export { useCursor, resetCursorState, getCursorState, subscribeCursor } from "./hooks/useCursor.js"
export type { CursorPosition, CursorState } from "./hooks/useCursor.js"
export { useScrollback } from "./hooks/useScrollback.js"
export type { UseScrollbackOptions, ScrollbackMarkerCallbacks } from "./hooks/useScrollback.js"

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
export { useTransition, useDeferredValue, useId } from "react"

// Contexts for advanced usage (usually hooks are preferred)
export { TermContext, EventsContext, FocusManagerContext } from "./context.js"

// Theming
export { ThemeProvider, useTheme } from "./contexts/ThemeContext.js"
export type { ThemeProviderProps } from "./contexts/ThemeContext.js"
export {
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  builtinThemes,
  getThemeByName,
  resolveThemeColor,
} from "./theme-defs.js"
export type { Theme } from "./theme-defs.js"

// =============================================================================
// Re-exports from chalkx
// =============================================================================

// Term primitives (so consumers don't need to import from chalkx directly)
export { createTerm, term, patchConsole } from "chalkx"
export type {
  Term,
  StyleChain,
  PatchedConsole,
  PatchConsoleOptions,
  ConsoleStats,
  ColorLevel,
  ConsoleEntry,
} from "chalkx"

// Hit Registry (mouse support)
export {
  HitRegistry,
  HitRegistryContext,
  useHitRegistry,
  useHitRegion,
  useHitRegionCallback,
  resetHitRegionIdCounter,
  Z_INDEX,
} from "./hit-registry.js"

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
} from "./render.js"
export { renderString, renderStringSync, type RenderStringOptions } from "./render-string.js"
export { measureElement } from "./measureElement.js"

// TermDef resolution utilities
export {
  resolveTermDef,
  resolveFromTerm,
  isTerm,
  isTermDef,
  createInputEvents,
  type ResolvedTermDef,
} from "./term-def.js"

// ANSI escape sequences for terminal control
export {
  ANSI,
  BEL,
  enableMouse,
  disableMouse,
  KittyFlags,
  enableKittyKeyboard,
  disableKittyKeyboard,
  queryKittyKeyboard,
  notify,
  notifyITerm2,
  notifyKitty,
  reportDirectory,
  setWindowTitle,
  setWindowAndIconTitle,
  resetWindowTitle,
} from "./output.js"

// Bracketed paste mode (DEC private mode 2004)
export {
  enableBracketedPaste,
  disableBracketedPaste,
  parseBracketedPaste,
  PASTE_START,
  PASTE_END,
} from "./bracketed-paste.js"
export type { BracketedPasteResult } from "./bracketed-paste.js"

// OSC 52 clipboard support
export { copyToClipboard, requestClipboard, parseClipboardResponse } from "./clipboard.js"

// OSC 4 palette color query/set
export { queryPaletteColor, setPaletteColor, parsePaletteResponse, queryMultiplePaletteColors } from "./osc-palette.js"

// OSC 133 semantic prompt markers
export { OSC133 } from "./osc-markers.js"

// Kitty protocol detection
export { detectKittySupport, detectKittyFromStdio, type KittyDetectResult } from "./kitty-detect.js"

// Terminal capability detection
export { detectTerminalCaps, type TerminalCaps } from "./terminal-caps.js"

// Text sizing protocol (OSC 66) — PUA character width control
export { textSized, isPrivateUseArea, isTextSizingLikelySupported, detectTextSizingSupport } from "./text-sizing.js"

// Layout engine types
export type { LayoutEngine, LayoutNode, LayoutConstants, MeasureFunc, MeasureMode } from "./layout-engine.js"

// Render adapter (for canvas, DOM, etc.)
export {
  setRenderAdapter,
  getRenderAdapter,
  hasRenderAdapter,
  getTextMeasurer,
  ensureRenderAdapterInitialized,
} from "./render-adapter.js"
export type {
  RenderAdapter,
  RenderBuffer,
  RenderStyle,
  TextMeasurer,
  TextMeasureResult,
  TextMeasureStyle,
  BorderChars,
} from "./render-adapter.js"

// Canvas adapter
export { createCanvasAdapter, CanvasRenderBuffer } from "./adapters/canvas-adapter.js"
export type { CanvasAdapterConfig } from "./adapters/canvas-adapter.js"

// DOM adapter
export { createDOMAdapter, DOMRenderBuffer, injectDOMStyles } from "./adapters/dom-adapter.js"
export type { DOMAdapterConfig } from "./adapters/dom-adapter.js"

// App types (unified render API)
export type { App } from "./app.js"
export type { AutoLocator, FilterOptions } from "./auto-locator.js"
export type { BoundTerm } from "./bound-term.js"

// Types
export type { BoxProps, BoxHandle } from "./components/Box.js"
export type { TextProps, TextHandle } from "./components/Text.js"
export type { Rect } from "./types.js"
export type { Key, InputHandler, UseInputOptions } from "./hooks/useInput.js"
export { keyToName, keyToModifiers, parseHotkey, matchHotkey, parseKeypress, parseKey, emptyKey } from "./keys.js"
export type { ParsedKeypress, ParsedHotkey } from "./keys.js"
export type { UseAppResult } from "./hooks/useApp.js"
export type { UseStdoutResult } from "./hooks/useStdout.js"
export type { UseStdinResult } from "./hooks/useStdin.js"
export type { UseFocusManagerResult } from "./hooks/useFocusManager.js"
export type { RenderOptions, Instance, RenderMode, NonTTYMode } from "./render.js"
export type { MeasureElementOutput } from "./measureElement.js"
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
} from "./types.js"
export type { HitTarget, HitRegion } from "./hit-registry.js"

// Mouse parsing (SGR mode 1006)
export { parseMouseSequence, isMouseSequence, type ParsedMouse } from "./mouse.js"

// Mouse events (DOM-level)
export {
  hitTest,
  createMouseEvent,
  createWheelEvent,
  dispatchMouseEvent,
  processMouseEvent,
  createMouseEventProcessor,
  checkDoubleClick,
  createDoubleClickState,
  computeEnterLeave,
  type InkxMouseEvent,
  type InkxWheelEvent,
  type MouseEventProps,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "./mouse-events.js"

// Non-TTY utilities
export { isTTY, resolveNonTTYMode, stripAnsi } from "./non-tty.js"
export type { NonTTYOptions, ResolvedNonTTYMode } from "./non-tty.js"

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
export { connectDevTools, isDevToolsConnected } from "./devtools.js"

// =============================================================================
// Inspector (inkx-native debug introspection)
// =============================================================================

/**
 * inkx Inspector — render pipeline debug introspection.
 *
 * Distinct from React DevTools. Provides inkx-specific info: render stats,
 * component tree with layout rects, dirty flags, focus path.
 *
 * @example
 * ```ts
 * // Manual
 * import { enableInspector } from 'inkx';
 * enableInspector({ logFile: '/tmp/inkx-inspector.log' });
 *
 * // Or use env var: INKX_DEV=1 bun run app.ts
 * // With log file: INKX_DEV=1 INKX_DEV_LOG=/tmp/inkx.log bun run app.ts
 * ```
 */
export {
  enableInspector,
  disableInspector,
  isInspectorEnabled,
  inspectTree,
  inspectFrame,
  autoEnableInspector,
} from "./inspector.js"
export type { InspectorOptions } from "./inspector.js"

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
  // Text sizing state
  setTextSizingEnabled,
  isTextSizingEnabled,
  // Buffer writing
  writeTextToBuffer,
  writeTextTruncated,
  writeLinesToBuffer,
  // Utilities
  normalizeText,
  getFirstCodePoint,
} from "./unicode.js"

export type { StyledSegment } from "./unicode.js"

// =============================================================================
// Text Cursor Utilities
// =============================================================================

/**
 * Pure functions for mapping between flat character offsets and visual
 * positions in word-wrapped text. Uses the same wrapText() as the
 * rendering pipeline, guaranteeing cursor positions match display.
 *
 * Architecture layer 0 — no state, no hooks, no components.
 *
 * @example
 * ```ts
 * import { cursorToRowCol, cursorMoveDown } from 'inkx'
 *
 * const { row, col } = cursorToRowCol("hello world", 5, 8)
 * const next = cursorMoveDown("hello world\nfoo", 3, 8)
 * ```
 */
export {
  cursorToRowCol,
  getWrappedLines,
  rowColToCursor,
  cursorMoveUp,
  cursorMoveDown,
  countVisualLines,
} from "./text-cursor.js"
export type { WrappedLine } from "./text-cursor.js"

// =============================================================================
// Edit Context
// =============================================================================

/**
 * Terminal Edit Context -- W3C EditContext-aligned interface for terminal
 * text editing, plus invertible text operations for undo/redo.
 *
 * @example
 * ```ts
 * import { createTermEditContext, applyTextOp, invertTextOp } from 'inkx'
 *
 * using ctx = createTermEditContext({ text: "hello", wrapWidth: 40 })
 * ctx.onTextUpdate((op) => undoStack.push(op))
 * ctx.insertChar("!")  // "hello!"
 *
 * const op: TextOp = { type: "insert", offset: 0, text: "hi " }
 * const result = applyTextOp("world", op)  // "hi world"
 * const inv = invertTextOp(op)              // delete "hi " at 0
 * ```
 */
export { createTermEditContext } from "./edit-context.js"
export type { EditContextLike, TermEditContext, TermEditContextOptions } from "./edit-context.js"

export { applyTextOp, invertTextOp, mergeTextOps } from "./text-ops.js"
export type { TextOp } from "./text-ops.js"

export { useEditContext, activeEditContextRef, activeEditTargetRef } from "./hooks/use-edit-context.js"
export type { UseEditContextOptions, UseEditContextResult, EditTarget } from "./hooks/use-edit-context.js"

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
export { calcEdgeBasedScrollOffset } from "./scroll-utils.js"

// Scroll Region Optimization (DECSTBM)
export {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "./scroll-region.js"
export type { ScrollRegionConfig } from "./scroll-region.js"

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
export { withCommands } from "./with-commands.js"
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
} from "./with-commands.js"

export { withKeybindings } from "./with-keybindings.js"
export type { WithKeybindingsOptions, KeybindingContext, ExtendedKeybindingDef } from "./with-keybindings.js"

// Diagnostic tools - prefer importing from 'inkx/toolbelt' for new code
export { withDiagnostics, VirtualTerminal } from "./with-diagnostics.js"
export type { DiagnosticOptions } from "./with-diagnostics.js"

// Scheduler errors (for catching incremental render mismatches)
export { IncrementalRenderMismatchError } from "./scheduler.js"

// =============================================================================
// Input Layer Stack
// =============================================================================

/**
 * Input layer stack for DOM-style event bubbling.
 *
 * Layers register synchronously via useLayoutEffect and receive input
 * in child-first order (like DOM event bubbling from target to ancestors).
 *
 * @example
 * ```tsx
 * import { InputLayerProvider, useInputLayer } from 'inkx';
 *
 * function App() {
 *   return (
 *     <InputLayerProvider>
 *       <Board>
 *         <Dialog />
 *       </Board>
 *     </InputLayerProvider>
 *   );
 * }
 *
 * function Dialog() {
 *   useInputLayer('dialog-input', (input, key) => {
 *     if (key.backspace) { ... return true }  // consumed
 *     if (input >= ' ') { ... return true }   // consumed
 *     return false  // bubble (e.g., escape to parent)
 *   });
 * }
 * ```
 *
 * @see docs/future/inkx-command-api-research.md
 */
export {
  InputLayerProvider,
  InputLayerContext,
  useInputLayer,
  useInputLayerContext,
} from "./contexts/InputLayerContext.js"
export type {
  InputLayerHandler,
  InputLayer,
  InputLayerContextValue,
  InputLayerProviderProps,
} from "./contexts/InputLayerContext.js"

export { InputBoundary } from "./contexts/InputBoundary.js"
export type { InputBoundaryProps } from "./contexts/InputBoundary.js"

// =============================================================================
// Position Registry (2D Grid Virtualization)
// =============================================================================

/**
 * Position tracking for 2D virtualized grid layouts.
 *
 * Items auto-register on mount and auto-unregister on unmount,
 * eliminating stale-entry bugs in virtualized lists.
 *
 * @example
 * ```tsx
 * import { PositionRegistryProvider, GridCell, usePositionRegistry } from 'inkx';
 *
 * <PositionRegistryProvider>
 *   {columns.map((col, i) => (
 *     <VirtualList items={col.items} renderItem={(item, idx) => (
 *       <GridCell sectionIndex={i} itemIndex={idx}>
 *         <Card {...item} />
 *       </GridCell>
 *     )} />
 *   ))}
 * </PositionRegistryProvider>
 * ```
 */
export { PositionRegistryProvider, usePositionRegistry, createPositionRegistry } from "./hooks/usePositionRegistry.js"
export type { PositionRegistry, ScreenRect } from "./hooks/usePositionRegistry.js"
export { useGridPosition } from "./hooks/useGridPosition.js"
export { GridCell } from "./components/GridCell.js"
export type { GridCellProps } from "./components/GridCell.js"

// =============================================================================
// Animation
// =============================================================================

/**
 * Animation utilities for smooth terminal UI animations (~30fps).
 *
 * @example
 * ```tsx
 * import { useAnimation, easings } from 'inkx';
 *
 * function FadeIn() {
 *   const { value } = useAnimation({ duration: 300, easing: "easeOut" });
 *   return <Text dimColor={value < 1}>Hello</Text>;
 * }
 * ```
 *
 * Note: `useAnimatedTransition` is the animation interpolation hook.
 * React's `useTransition` (concurrent mode) is exported separately above.
 */
export { easings, resolveEasing, useAnimation, useInterval } from "./animation/index.js"
export { useTransition as useAnimatedTransition } from "./animation/index.js"
export type {
  EasingFn,
  EasingName,
  UseAnimationOptions,
  UseAnimationResult,
  UseTransitionOptions,
} from "./animation/index.js"
