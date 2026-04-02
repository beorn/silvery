/**
 * Silvery - Next-gen Terminal UI Renderer with Layout Feedback
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
 * import { Box, Text, useContentRect, useInput, useApp, render, createTerm, term } from '@silvery/ag-react'
 *
 * // Testing utilities
 * import { createRenderer, createLocator } from '@silvery/test'
 * ```
 *
 * ## Quick Example
 *
 * ```tsx
 * import { render, Box, Text, useInput, useApp, createTerm } from '@silvery/ag-react'
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
 * import { render, Box, Text } from '@silvery/ag-react'
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
 * import { Box, Text } from '@silvery/ag-react';
 *
 * <Box flexDirection="row" gap={2}>
 *   <Box width={10}><Text>Left</Text></Box>
 *   <Box flexGrow={1}><Text>Center</Text></Box>
 * </Box>
 * ```
 */
export { Box } from "./components/Box"
export { Console } from "@silvery/ag-react/ui/components"
export { ListView } from "@silvery/ag-react/ui/components"
export type {
  ListViewProps,
  ListViewHandle,
  ListItemMeta,
  ListViewCacheConfig,
  ListViewSearchConfig,
} from "@silvery/ag-react/ui/components"
export { HorizontalVirtualList } from "@silvery/ag-react/ui/components"
export type { HorizontalVirtualListProps, HorizontalVirtualListHandle } from "@silvery/ag-react/ui/components"
export { SplitView } from "@silvery/ag-react/ui/components"
export type { SplitViewProps } from "@silvery/ag-react/ui/components"
export type { LayoutNode as SplitLayoutNode } from "@silvery/ag-term/pane-manager"
export {
  createLeaf,
  splitPane,
  removePane,
  getPaneIds,
  findAdjacentPane,
  resizeSplit,
  swapPanes,
  getTabOrder as getSplitTabOrder,
} from "@silvery/ag-term/pane-manager"

/**
 * Re-export Text component - renders text content.
 *
 * @example
 * ```tsx
 * import { Text } from '@silvery/ag-react';
 * import chalk from 'chalk';
 *
 * <Text>Plain text</Text>
 * <Text color="green">Colored text</Text>
 * <Text>{chalk.bold('Chalk works too')}</Text>
 * ```
 */
export { Text } from "./components/Text"

export { Link } from "./components/Link"
export type { LinkProps } from "./components/Link"
export { Transform } from "./components/Transform"
export type { TransformProps } from "./components/Transform"
export { Fill } from "./components/Fill"
export type { FillProps } from "./components/Fill"
export { Newline } from "./components/Newline"
export { Spacer } from "./components/Spacer"
export { Static } from "./components/Static"
// Viewport Architecture (Phase 2)
export { Screen } from "@silvery/ag-react/ui/components"
export type { ScreenProps } from "@silvery/ag-react/ui/components"

/**
 * Re-export ErrorBoundary component - catches render errors in children.
 *
 * @example
 * ```tsx
 * import { ErrorBoundary, Box, Text } from '@silvery/ag-react';
 *
 * <ErrorBoundary fallback={<Text color="red">Error!</Text>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export { ErrorBoundary } from "@silvery/ag-react/ui/components"
export type { ErrorBoundaryProps } from "@silvery/ag-react/ui/components"

// Lightweight runtime-level error boundary (used as default root in createApp/run)
export { SilveryErrorBoundary } from "./error-boundary"
export type { SilveryErrorBoundaryProps } from "./error-boundary"

// Input Components
export { TextInput } from "@silvery/ag-react/ui/components"
export type { TextInputProps, TextInputHandle } from "@silvery/ag-react/ui/components"

export { TextArea } from "@silvery/ag-react/ui/components"
export type { TextAreaProps, TextAreaHandle, TextAreaSelection } from "@silvery/ag-react/ui/components"

export { useTextArea, clampScroll } from "@silvery/ag-react/ui/components"
export type { UseTextAreaOptions, UseTextAreaResult } from "@silvery/ag-react/ui/components"

export { EditContextDisplay } from "@silvery/ag-react/ui/components"
export type { EditContextDisplayProps } from "@silvery/ag-react/ui/components"

// Display Components
export { CursorLine } from "@silvery/ag-react/ui/components"
export type { CursorLineProps } from "@silvery/ag-react/ui/components"

// Dialog Components
export { ModalDialog, formatTitleWithHotkey } from "@silvery/ag-react/ui/components"
export type { ModalDialogProps } from "@silvery/ag-react/ui/components"

export { PickerDialog } from "@silvery/ag-react/ui/components"
export type { PickerDialogProps } from "@silvery/ag-react/ui/components"

export { PickerList } from "@silvery/ag-react/ui/components"
export type { PickerListProps } from "@silvery/ag-react/ui/components"

// Typography Presets
export {
  H1,
  H2,
  H3,
  P,
  Lead,
  Muted,
  Small,
  Strong,
  Em,
  Code,
  Kbd,
  Blockquote,
  CodeBlock,
  HR,
  UL,
  OL,
  LI,
} from "@silvery/ag-react/ui/components"
export type { TypographyProps } from "@silvery/ag-react/ui/components"

// Focusable Controls
export { Toggle } from "@silvery/ag-react/ui/components"
export type { ToggleProps } from "@silvery/ag-react/ui/components"

export { Button } from "@silvery/ag-react/ui/components"
export type { ButtonProps } from "@silvery/ag-react/ui/components"

// Input Hooks
export { useReadline } from "@silvery/ag-react/ui/components"
export type { ReadlineState, UseReadlineOptions, UseReadlineResult } from "@silvery/ag-react/ui/components"

// Widget Components
export { Spinner } from "@silvery/ag-react/ui/components"
export type { SpinnerProps } from "@silvery/ag-react/ui/components"

export { ProgressBar } from "@silvery/ag-react/ui/components"
export type { ProgressBarProps } from "@silvery/ag-react/ui/components"

export { SelectList } from "@silvery/ag-react/ui/components"
export type { SelectListProps, SelectOption } from "@silvery/ag-react/ui/components"

export { Table } from "./components/Table"
export type { TableProps, Column, Column as TableColumn } from "./components/Table"

export { Badge } from "@silvery/ag-react/ui/components"
export type { BadgeProps } from "@silvery/ag-react/ui/components"

export { Divider } from "@silvery/ag-react/ui/components"
export type { DividerProps } from "@silvery/ag-react/ui/components"

// Form Components
export { Form, FormField } from "@silvery/ag-react/ui/components"
export type { FormProps, FormFieldProps } from "@silvery/ag-react/ui/components"

// Toast / Notification
export { useToast, ToastContainer, ToastItem } from "@silvery/ag-react/ui/components"
export type {
  ToastData,
  ToastOptions,
  ToastVariant,
  UseToastResult,
  ToastContainerProps,
  ToastItemProps,
} from "@silvery/ag-react/ui/components"

// Command Palette
export { CommandPalette } from "@silvery/ag-react/ui/components"
export type { CommandPaletteProps, CommandItem } from "@silvery/ag-react/ui/components"

// Tree View
export { TreeView } from "@silvery/ag-react/ui/components"
export type { TreeViewProps, TreeNode } from "@silvery/ag-react/ui/components"

// Breadcrumb
export { Breadcrumb } from "@silvery/ag-react/ui/components"
export type { BreadcrumbProps, BreadcrumbItem } from "@silvery/ag-react/ui/components"

// Tabs
export { Tabs, TabList, Tab, TabPanel } from "@silvery/ag-react/ui/components"
export type { TabsProps, TabListProps, TabProps, TabPanelProps } from "@silvery/ag-react/ui/components"

// Tooltip
export { Tooltip } from "@silvery/ag-react/ui/components"
export type { TooltipProps } from "@silvery/ag-react/ui/components"

// Skeleton
export { Skeleton } from "@silvery/ag-react/ui/components"
export type { SkeletonProps } from "@silvery/ag-react/ui/components"

// Image Component
export { Image } from "@silvery/ag-react/ui/image"
export type { ImageProps } from "@silvery/ag-react/ui/image"

// Image Protocol Encoders
export { encodeKittyImage, deleteKittyImage, isKittyGraphicsSupported } from "@silvery/ag-react/ui/image"
export type { KittyImageOptions } from "@silvery/ag-react/ui/image"
export { encodeSixel, isSixelSupported } from "@silvery/ag-react/ui/image"
export type { SixelImageData } from "@silvery/ag-react/ui/image"

// =============================================================================
// Hooks
// =============================================================================

/**
 * Layout hooks - the main feature of silvery over ink.
 *
 * @example
 * ```tsx
 * import { useContentRect, Box, Text } from '@silvery/ag-react';
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
  useRenderRect,
  useRenderRectCallback,
} from "./hooks/useLayout"

/**
 * Keyboard input hook.
 *
 * @example
 * ```tsx
 * import { useInput } from '@silvery/ag-react';
 *
 * useInput((input, key) => {
 *   if (input === 'q') exit();
 *   if (key.upArrow) moveUp();
 *   if (key.return) submit();
 * });
 * ```
 */
export { useInput } from "./hooks/useInput"

/**
 * App control hook - provides exit function.
 *
 * @example
 * ```tsx
 * import { useApp } from '@silvery/ag-react';
 *
 * const { exit } = useApp();
 * exit();  // Clean exit
 * exit(new Error('Failed'));  // Exit with error
 * ```
 */
export { useApp } from "./hooks/useApp"

export { useStdout } from "./hooks/useStdout"
export { useStderr } from "./hooks/useStderr"
export { useFocusManager } from "./hooks/useFocusManager"

// Focus system (tree-based)
export { createFocusManager } from "@silvery/ag/focus-manager"
export type {
  FocusManager,
  FocusManagerOptions,
  FocusChangeCallback,
  FocusOrigin,
  FocusSnapshot,
} from "@silvery/ag/focus-manager"
export {
  findFocusableAncestor,
  findEnclosingScope,
  getTabOrder,
  findByTestID,
  findSpatialTarget,
  getExplicitFocusLink,
} from "@silvery/ag/focus-queries"
export { createKeyEvent, createFocusEvent, dispatchKeyEvent, dispatchFocusEvent } from "@silvery/ag/focus-events"
export type { SilveryKeyEvent, SilveryFocusEvent, FocusEventProps } from "@silvery/ag/focus-events"
export { useFocusable } from "./hooks/useFocusable"
export type { UseFocusableResult } from "./hooks/useFocusable"
export { useFocusWithin } from "./hooks/useFocusWithin"

// Terminal focus state
export { useTerminalFocused } from "./hooks/useTerminalFocused"

// Modifier key tracking
export { useModifierKeys, getModifierState, lastModifierState } from "./hooks/useModifierKeys"
export type { ModifierState, UseModifierKeysOptions } from "./hooks/useModifierKeys"

// Mouse cursor shape
export { useMouseCursor } from "./hooks/useMouseCursor"

export { useTerm, shallow } from "./hooks/useTerm"
export { useWindowSize } from "./hooks/useWindowSize"
export { useConsole } from "./hooks/useConsole"
export {
  useCursor,
  resetCursorState,
  getCursorState,
  subscribeCursor,
  createCursorStore,
  CursorProvider,
} from "./hooks/useCursor"
export type { CursorPosition, CursorState, CursorAccessors, CursorStore } from "./hooks/useCursor"
export { useSelection, useSelectionContext, SelectionProvider } from "./hooks/useSelection"
export type { UseSelectionResult } from "./hooks/useSelection"
export { useVirtualizer } from "./hooks/useVirtualizer"
export type { VirtualizerConfig, VirtualizerResult } from "./hooks/useVirtualizer"
export { useListItem } from "./hooks/useListItem"
export type { ListItemContext } from "./hooks/useListItem"

// App-level Providers (Phase 4)
export { SearchProvider, useSearch, useSearchOptional } from "./providers/SearchProvider"
export type { Searchable, SearchContextValue } from "./providers/SearchProvider"
export { SearchBar } from "@silvery/ag-react/ui/components"

/**
 * Re-export React concurrent features for TUI responsiveness.
 *
 * @example
 * ```tsx
 * import { useTransition, useDeferredValue } from '@silvery/ag-react';
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

// Runtime hook
export { useRuntime } from "./hooks/useRuntime"

// Contexts for advanced usage (usually hooks are preferred)
export { CacheBackendContext, TermContext, FocusManagerContext, RuntimeContext, StderrContext } from "./context"
export type { CacheBackend, RuntimeContextValue, BaseRuntimeEvents } from "./context"

// Theming
export { ThemeProvider } from "./ThemeProvider"
export { useTheme } from "@silvery/theme/ThemeContext"
export type { ThemeProviderProps } from "./ThemeProvider"
export {
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  builtinThemes,
  getThemeByName,
  resolveThemeColor,
  generateTheme,
  detectTheme,
  deriveTheme,
} from "@silvery/theme"
export type { Theme, AnsiPrimary, DetectThemeOptions } from "@silvery/theme"

// =============================================================================
// Re-exports from term/ansi
// =============================================================================

// Term primitives (so consumers don't need to import from term directly)
export { createTerm, term, patchConsole } from "@silvery/ag-term/ansi"
export type {
  Term,
  StyleChain,
  PatchedConsole,
  PatchConsoleOptions,
  ConsoleStats,
  ColorLevel,
  ConsoleEntry,
} from "@silvery/ag-term/ansi"

// Hit Registry (mouse support)
export {
  HitRegistry,
  HitRegistryContext,
  useHitRegistry,
  useHitRegion,
  useHitRegionCallback,
  resetHitRegionIdCounter,
  Z_INDEX,
} from "@silvery/ag-term/hit-registry"

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
 * import { render, Box, Text, createTerm } from '@silvery/ag-react';
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
 * import { renderSync, initYogaEngine, setLayoutEngine, createTerm } from '@silvery/ag-react';
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
  // Flexily adapter
  createFlexilyEngine,
  FlexilyLayoutEngine,
} from "./render"
export { renderString, renderStringSync, type RenderStringOptions } from "./render-string"
export { measureElement } from "./measureElement"

// Accessibility (screen reader mode)
export { renderScreenReaderOutput } from "./accessibility"
export type { AriaState } from "./accessibility"

// Term utilities (TermDef/resolveTermDef are internal — use createTerm() instead)
export { isTerm, createInputEvents } from "@silvery/ag-term/term-def"

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
  setCursorStyle,
  resetCursorStyle,
  setMouseCursorShape,
  resetMouseCursorShape,
} from "@silvery/ag-term/output"
export type { CursorShape, MouseCursorShape } from "@silvery/ag-term/output"

// Bracketed paste mode (DEC private mode 2004)
export {
  enableBracketedPaste,
  disableBracketedPaste,
  parseBracketedPaste,
  PASTE_START,
  PASTE_END,
} from "@silvery/ag-term/bracketed-paste"
export type { BracketedPasteResult } from "@silvery/ag-term/bracketed-paste"

// OSC 52 clipboard support
export { copyToClipboard, requestClipboard, parseClipboardResponse } from "@silvery/ag-term/clipboard"

// OSC 4 palette color query/set
export {
  queryPaletteColor,
  setPaletteColor,
  parsePaletteResponse,
  queryMultiplePaletteColors,
} from "@silvery/ag-term/osc-palette"

// OSC 133 semantic prompt markers
export { OSC133 } from "@silvery/ag-term/osc-markers"

// Kitty protocol detection
export { detectKittySupport, detectKittyFromStdio, type KittyDetectResult } from "@silvery/ag-term/kitty-detect"

// Terminal capability detection
export { detectTerminalCaps, defaultCaps, type TerminalCaps } from "@silvery/ag-term/terminal-caps"

// Terminal capability visual test
export { runTermtest, TERMTEST_SECTIONS, type TermtestSection, type TermtestOptions } from "@silvery/ag-term/termtest"

// Output-phase capability configuration (suppress unsupported SGR codes)
export {
  setOutputCaps,
  createOutputPhase,
  type OutputPhaseFn,
  type OutputCaps,
} from "@silvery/ag-term/pipeline/output-phase"

// Pipeline configuration
export { type PipelineConfig, type PipelineContext } from "@silvery/ag-term/pipeline"

// withRender plugin
export { withRender, type RenderTerm } from "@silvery/create/with-render"

// Text sizing protocol (OSC 66) — PUA character width control
export {
  textSized,
  isPrivateUseArea,
  isTextSizingLikelySupported,
  detectTextSizingSupport,
} from "@silvery/ag-term/text-sizing"

// CSI 6n cursor position query
export { queryCursorPosition, queryCursorFromStdio } from "@silvery/ag-term/cursor-query"

// OSC 10/11/12 terminal color queries
export {
  queryForegroundColor,
  queryBackgroundColor,
  queryCursorColor,
  setForegroundColor,
  setBackgroundColor,
  setCursorColor,
  resetForegroundColor,
  resetBackgroundColor,
  resetCursorColor,
  detectColorScheme,
} from "@silvery/ag-term/terminal-colors"

// DA1/DA2/DA3 + XTVERSION device attribute queries
export {
  queryPrimaryDA,
  querySecondaryDA,
  queryTertiaryDA,
  queryTerminalVersion,
  queryDeviceAttributes,
  type DeviceAttributes,
} from "@silvery/ag-term/device-attrs"

// Focus reporting (CSI ?1004h)
export { enableFocusReporting, disableFocusReporting, parseFocusEvent } from "@silvery/ag-term/focus-reporting"

// DECRQM mode query
export { queryMode, queryModes, DecMode } from "@silvery/ag-term/mode-query"

// CSI 14t/18t pixel and text area size queries
export { queryTextAreaPixels, queryTextAreaSize, queryCellSize } from "@silvery/ag-term/pixel-size"

// Layout engine types
export type { LayoutEngine, LayoutConstants } from "@silvery/ag-term/layout-engine"
export type { LayoutNode, MeasureFunc, MeasureMode } from "@silvery/ag/layout-types"

// Render adapter types (RenderAdapter itself is internal — use term.paint() instead)
export type {
  RenderBuffer,
  RenderStyle,
  TextMeasurer,
  TextMeasureResult,
  TextMeasureStyle,
  BorderChars,
} from "@silvery/ag-term/render-adapter"

// Canvas adapter
export { createCanvasAdapter, CanvasRenderBuffer } from "@silvery/ag-term/adapters/canvas-adapter"
export type { CanvasAdapterConfig } from "@silvery/ag-term/adapters/canvas-adapter"

// DOM adapter
export { createDOMAdapter, DOMRenderBuffer, injectDOMStyles } from "@silvery/ag-term/adapters/dom-adapter"
export type { DOMAdapterConfig } from "@silvery/ag-term/adapters/dom-adapter"

// App types (unified render API)
export type { App } from "@silvery/ag-term/app"
export type { AutoLocator, FilterOptions } from "@silvery/test/auto-locator"
export type { BoundTerm } from "@silvery/ag-term/bound-term"

// Types
export type { BoxProps, BoxHandle } from "./components/Box"
export type { TextProps, TextHandle } from "./components/Text"
export type { Rect } from "@silvery/ag/types"
export type { Key, InputHandler, UseInputOptions } from "./hooks/useInput"
export {
  keyToName,
  keyToModifiers,
  parseHotkey,
  matchHotkey,
  parseKeypress,
  parseKey,
  emptyKey,
} from "@silvery/ag/keys"
export type { ParsedKeypress, ParsedHotkey } from "@silvery/ag/keys"
export type { UseAppResult } from "./hooks/useApp"
export type { UseStdoutResult } from "./hooks/useStdout"
export type { UseStderrResult } from "./hooks/useStderr"
export type { UseFocusManagerResult } from "./hooks/useFocusManager"
export type { RenderOptions, Instance, RenderMode, NonTTYMode } from "./render"
export type { MeasureElementOutput } from "./measureElement"
export type {
  AgNode,
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
} from "@silvery/ag/types"
export type { HitTarget, HitRegion } from "@silvery/ag-term/hit-registry"

// Mouse parsing (SGR mode 1006)
export { parseMouseSequence, isMouseSequence, type ParsedMouse } from "@silvery/ag-term/mouse"

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
  type SilveryMouseEvent,
  type SilveryWheelEvent,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "@silvery/ag-term/mouse-events"
export type { MouseEventProps } from "@silvery/ag/mouse-event-types"

// Non-TTY utilities
export { isTTY, resolveNonTTYMode, stripAnsi } from "@silvery/ag-term/non-tty"
export type { NonTTYOptions, ResolvedNonTTYMode } from "@silvery/ag-term/non-tty"

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
 * import { connectDevTools } from '@silvery/ag-react';
 * await connectDevTools();
 *
 * // Or use env var: DEBUG_DEVTOOLS=1 bun run app.ts
 * ```
 */
export { connectDevTools, isDevToolsConnected } from "@silvery/ag-term/devtools"

// =============================================================================
// Inspector (silvery-native debug introspection)
// =============================================================================

/**
 * silvery Inspector — render pipeline debug introspection.
 *
 * Distinct from React DevTools. Provides silvery-specific info: render stats,
 * component tree with layout rects, dirty flags, focus path.
 *
 * @example
 * ```ts
 * // Manual
 * import { enableInspector } from '@silvery/ag-react';
 * enableInspector({ logFile: '/tmp/silvery-inspector.log' });
 *
 * // Or use env var: SILVERY_DEV=1 bun run app.ts
 * // With log file: SILVERY_DEV=1 SILVERY_DEV_LOG=/tmp/silvery.log bun run app.ts
 * ```
 */
export {
  enableInspector,
  disableInspector,
  isInspectorEnabled,
  inspectTree,
  inspectFrame,
  autoEnableInspector,
} from "@silvery/ag-term/inspector"
export type { InspectorOptions } from "@silvery/ag-term/inspector"

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
  sliceByWidthRange,
  sliceByWidthFromEnd,
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
  // Text-presentation emoji width
  setTextEmojiWide,
  // Buffer writing
  writeTextToBuffer,
  writeTextTruncated,
  writeLinesToBuffer,
  // Utilities
  normalizeText,
  getFirstCodePoint,
} from "@silvery/ag-term/unicode"

export type { StyledSegment } from "@silvery/ag-term/unicode"

// Width measurer factory
export {
  createWidthMeasurer,
  createMeasurer,
  runWithMeasurer,
  type Measurer,
  type WidthMeasurer,
} from "@silvery/ag-term/unicode"

// Measurer composition (term + measurement)
export { withMeasurer, createPipeline, type MeasuredTerm } from "@silvery/ag-term/measurer"

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
 * import { cursorToRowCol, cursorMoveDown } from '@silvery/ag-react'
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
} from "@silvery/create/text-cursor"
export type { WrappedLine } from "@silvery/create/text-cursor"

// =============================================================================
// Edit Context
// =============================================================================

/**
 * Terminal Edit Context -- W3C EditContext-aligned interface for terminal
 * text editing, plus invertible text operations for undo/redo.
 *
 * @example
 * ```ts
 * import { createTermEditContext, applyTextOp, invertTextOp } from '@silvery/ag-react'
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
export { createTermEditContext } from "./edit-context"
export type { EditContextLike, TermEditContext, TermEditContextOptions } from "./edit-context"

export { applyTextOp, invertTextOp, mergeTextOps } from "@silvery/create/text-ops"
export type { TextOp } from "@silvery/create/text-ops"

export { useEditContext, activeEditContextRef, activeEditTargetRef } from "./hooks/use-edit-context"
export type { UseEditContextOptions, UseEditContextResult, EditTarget } from "./hooks/use-edit-context"

// =============================================================================
// Scroll Utilities
// =============================================================================

/**
 * Scroll utility for edge-based scrolling.
 *
 * @example
 * ```tsx
 * import { calcEdgeBasedScrollOffset } from '@silvery/ag-react';
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
export { calcEdgeBasedScrollOffset } from "@silvery/ag-term/scroll-utils"

// Scroll Region Optimization (DECSTBM)
export {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "@silvery/ag-term/scroll-region"
export type { ScrollRegionConfig } from "@silvery/ag-term/scroll-region"

// =============================================================================
// Plugin Composition (SlateJS-style)
// =============================================================================

/**
 * Plugin composition for command systems.
 *
 * @example
 * ```tsx
 * import { withCommands, withKeybindings, render } from '@silvery/ag-react';
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
export { withCommands } from "@silvery/commands/with-commands"
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
} from "@silvery/commands/with-commands"

export { withKeybindings } from "@silvery/commands/with-keybindings"
export type {
  WithKeybindingsOptions,
  KeybindingContext,
  ExtendedKeybindingDef,
} from "@silvery/commands/with-keybindings"

// Diagnostic tools - prefer importing from '@silvery/ag-term/toolbelt' for new code
export { withDiagnostics, VirtualTerminal } from "@silvery/create/with-diagnostics"
export type { DiagnosticOptions } from "@silvery/create/with-diagnostics"

// Scheduler errors (for catching incremental render mismatches)
export { IncrementalRenderMismatchError } from "@silvery/ag-term/scheduler"

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
 * import { InputLayerProvider, useInputLayer } from '@silvery/ag-react';
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
 * @see docs/future/silvery-command-api-research.md
 */
export {
  InputLayerProvider,
  InputLayerContext,
  useInputLayer,
  useInputLayerContext,
} from "./contexts/InputLayerContext"
export type {
  InputLayerHandler,
  InputLayer,
  InputLayerContextValue,
  InputLayerProviderProps,
} from "./contexts/InputLayerContext"

export { InputBoundary } from "./contexts/InputBoundary"
export type { InputBoundaryProps } from "./contexts/InputBoundary"

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
 * import { PositionRegistryProvider, GridCell, usePositionRegistry } from '@silvery/ag-react';
 *
 * <PositionRegistryProvider>
 *   {columns.map((col, i) => (
 *     <ListView items={col.items} renderItem={(item, idx) => (
 *       <GridCell sectionIndex={i} itemIndex={idx}>
 *         <Card {...item} />
 *       </GridCell>
 *     )} />
 *   ))}
 * </PositionRegistryProvider>
 * ```
 */
export { PositionRegistryProvider, usePositionRegistry, createPositionRegistry } from "./hooks/usePositionRegistry"
export type { PositionRegistry, ScreenRect } from "./hooks/usePositionRegistry"
export { useGridPosition } from "./hooks/useGridPosition"
export { GridCell } from "@silvery/ag-react/ui/components"
export type { GridCellProps } from "@silvery/ag-react/ui/components"

// =============================================================================
// Animation
// =============================================================================

/**
 * Animation utilities for smooth terminal UI animations (~30fps).
 *
 * @example
 * ```tsx
 * import { useAnimation, easings } from '@silvery/ag-react';
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
export {
  easings,
  resolveEasing,
  useAnimation,
  useInterval,
  useTimeout,
  useLatest,
} from "@silvery/ag-react/ui/animation"
export { useAnimatedTransition } from "@silvery/ag-react/ui/animation"
export type {
  EasingFn,
  EasingName,
  UseAnimationOptions,
  UseAnimationResult,
  UseTransitionOptions,
} from "@silvery/ag-react/ui/animation"

// =============================================================================
// TEA State Machines
// =============================================================================

/**
 * TEA (The Elm Architecture) for React.
 *
 * `useTea` is like `useReducer` but the reducer can return `[state, effects]`.
 * Effects are plain data — timer effects (delay, interval, cancel) are built-in.
 * All timers auto-cleanup on unmount. Pure update functions are testable with `collect()`.
 *
 * ```tsx
 * import { useTea } from "silvery"
 * import { fx, collect } from "silvery"
 *
 * function update(state, msg) {
 *   switch (msg.type) {
 *     case "start": return [{ ...state, phase: "go" }, [fx.delay(1000, { type: "done" })]]
 *     case "done": return { ...state, phase: "idle" }
 *   }
 * }
 *
 * // In React:
 * const [state, send] = useTea(initialState, update)
 *
 * // In tests (no React, no timers):
 * const [newState, effects] = collect(update(state, { type: "start" }))
 * expect(effects).toContainEqual(fx.delay(1000, { type: "done" }))
 * ```
 */
export { useTea } from "@silvery/ag-react/ui/hooks/useTea"
export { fx, collect } from "@silvery/create"
export type { TeaResult, EffectLike, TimerEffect } from "@silvery/create"
