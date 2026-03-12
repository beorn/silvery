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
 * import { Box, Text, useContentRect, useInput, useApp, render, createTerm, term } from '@silvery/react'
 *
 * // Testing utilities
 * import { createRenderer, createLocator } from '@silvery/test'
 * ```
 *
 * ## Quick Example
 *
 * ```tsx
 * import { render, Box, Text, useInput, useApp, createTerm } from '@silvery/react'
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
 * import { render, Box, Text } from '@silvery/react'
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
 * import { Box, Text } from '@silvery/react';
 *
 * <Box flexDirection="row" gap={2}>
 *   <Box width={10}><Text>Left</Text></Box>
 *   <Box flexGrow={1}><Text>Center</Text></Box>
 * </Box>
 * ```
 */
export { Box } from "./components/Box"
export { Console } from "@silvery/ui/components/Console"
export { VirtualList } from "@silvery/ui/components/VirtualList"
export type {
  VirtualListProps,
  VirtualListHandle,
  ItemMeta,
} from "@silvery/ui/components/VirtualList"
export { HorizontalVirtualList } from "@silvery/ui/components/HorizontalVirtualList"
export type {
  HorizontalVirtualListProps,
  HorizontalVirtualListHandle,
} from "@silvery/ui/components/HorizontalVirtualList"
export { SplitView } from "@silvery/ui/components/SplitView"
export type { SplitViewProps } from "@silvery/ui/components/SplitView"
export type { LayoutNode as SplitLayoutNode } from "@silvery/term/pane-manager"
export {
  createLeaf,
  splitPane,
  removePane,
  getPaneIds,
  findAdjacentPane,
  resizeSplit,
  swapPanes,
  getTabOrder as getSplitTabOrder,
} from "@silvery/term/pane-manager"

/**
 * Re-export Text component - renders text content.
 *
 * @example
 * ```tsx
 * import { Text } from '@silvery/react';
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
export { ScrollbackList } from "@silvery/ui/components/ScrollbackList"
export type { ScrollbackListProps } from "@silvery/ui/components/ScrollbackList"

// Viewport Architecture (Phase 2)
export { Screen } from "@silvery/ui/components/Screen"
export type { ScreenProps } from "@silvery/ui/components/Screen"
export { ScrollbackView } from "@silvery/ui/components/ScrollbackView"
export type { ScrollbackViewProps } from "@silvery/ui/components/ScrollbackView"
export { VirtualView } from "@silvery/ui/components/VirtualView"
export type { VirtualViewProps, VirtualViewHandle } from "@silvery/ui/components/VirtualView"

/**
 * Re-export ErrorBoundary component - catches render errors in children.
 *
 * @example
 * ```tsx
 * import { ErrorBoundary, Box, Text } from '@silvery/react';
 *
 * <ErrorBoundary fallback={<Text color="red">Error!</Text>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export { ErrorBoundary } from "@silvery/ui/components/ErrorBoundary"
export type { ErrorBoundaryProps } from "@silvery/ui/components/ErrorBoundary"

// Lightweight runtime-level error boundary (used as default root in createApp/run)
export { SilveryErrorBoundary } from "./error-boundary"
export type { SilveryErrorBoundaryProps } from "./error-boundary"

// Input Components
export { TextInput } from "@silvery/ui/components/TextInput"
export type { TextInputProps, TextInputHandle } from "@silvery/ui/components/TextInput"

export { TextArea } from "@silvery/ui/components/TextArea"
export type {
  TextAreaProps,
  TextAreaHandle,
  TextAreaSelection,
} from "@silvery/ui/components/TextArea"

export { useTextArea, clampScroll } from "@silvery/ui/components/useTextArea"
export type { UseTextAreaOptions, UseTextAreaResult } from "@silvery/ui/components/useTextArea"

export { EditContextDisplay } from "@silvery/ui/components/EditContextDisplay"
export type { EditContextDisplayProps } from "@silvery/ui/components/EditContextDisplay"

// Display Components
export { CursorLine } from "@silvery/ui/components/CursorLine"
export type { CursorLineProps } from "@silvery/ui/components/CursorLine"

// Dialog Components
export { ModalDialog, formatTitleWithHotkey } from "@silvery/ui/components/ModalDialog"
export type { ModalDialogProps } from "@silvery/ui/components/ModalDialog"

export { PickerDialog } from "@silvery/ui/components/PickerDialog"
export type { PickerDialogProps } from "@silvery/ui/components/PickerDialog"

export { PickerList } from "@silvery/ui/components/PickerList"
export type { PickerListProps } from "@silvery/ui/components/PickerList"

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
} from "@silvery/ui/components/Typography"
export type { TypographyProps } from "@silvery/ui/components/Typography"

// Focusable Controls
export { Toggle } from "@silvery/ui/components/Toggle"
export type { ToggleProps } from "@silvery/ui/components/Toggle"

export { Button } from "@silvery/ui/components/Button"
export type { ButtonProps } from "@silvery/ui/components/Button"

// Input Hooks
export { useReadline } from "@silvery/ui/components/useReadline"
export type {
  ReadlineState,
  UseReadlineOptions,
  UseReadlineResult,
} from "@silvery/ui/components/useReadline"

// Widget Components
export { Spinner } from "@silvery/ui/components/Spinner"
export type { SpinnerProps } from "@silvery/ui/components/Spinner"

export { ProgressBar } from "@silvery/ui/components/ProgressBar"
export type { ProgressBarProps } from "@silvery/ui/components/ProgressBar"

export { SelectList } from "@silvery/ui/components/SelectList"
export type { SelectListProps, SelectOption } from "@silvery/ui/components/SelectList"

export { Table } from "@silvery/ui/components/Table"
export type { TableProps, TableColumn } from "@silvery/ui/components/Table"

export { Badge } from "@silvery/ui/components/Badge"
export type { BadgeProps } from "@silvery/ui/components/Badge"

export { Divider } from "@silvery/ui/components/Divider"
export type { DividerProps } from "@silvery/ui/components/Divider"

// Form Components
export { Form, FormField } from "@silvery/ui/components/Form"
export type { FormProps, FormFieldProps } from "@silvery/ui/components/Form"

// Toast / Notification
export { useToast, ToastContainer, ToastItem } from "@silvery/ui/components/Toast"
export type {
  ToastData,
  ToastOptions,
  ToastVariant,
  UseToastResult,
  ToastContainerProps,
  ToastItemProps,
} from "@silvery/ui/components/Toast"

// Command Palette
export { CommandPalette } from "@silvery/ui/components/CommandPalette"
export type { CommandPaletteProps, CommandItem } from "@silvery/ui/components/CommandPalette"

// Tree View
export { TreeView } from "@silvery/ui/components/TreeView"
export type { TreeViewProps, TreeNode } from "@silvery/ui/components/TreeView"

// Breadcrumb
export { Breadcrumb } from "@silvery/ui/components/Breadcrumb"
export type { BreadcrumbProps, BreadcrumbItem } from "@silvery/ui/components/Breadcrumb"

// Tabs
export { Tabs, TabList, Tab, TabPanel } from "@silvery/ui/components/Tabs"
export type { TabsProps, TabListProps, TabProps, TabPanelProps } from "@silvery/ui/components/Tabs"

// Tooltip
export { Tooltip } from "@silvery/ui/components/Tooltip"
export type { TooltipProps } from "@silvery/ui/components/Tooltip"

// Skeleton
export { Skeleton } from "@silvery/ui/components/Skeleton"
export type { SkeletonProps } from "@silvery/ui/components/Skeleton"

// Image Component
export { Image } from "@silvery/ui/image/Image"
export type { ImageProps } from "@silvery/ui/image/Image"

// Image Protocol Encoders
export {
  encodeKittyImage,
  deleteKittyImage,
  isKittyGraphicsSupported,
} from "@silvery/ui/image/kitty-graphics"
export type { KittyImageOptions } from "@silvery/ui/image/kitty-graphics"
export { encodeSixel, isSixelSupported } from "@silvery/ui/image/sixel-encoder"
export type { SixelImageData } from "@silvery/ui/image/sixel-encoder"

// =============================================================================
// Hooks
// =============================================================================

/**
 * Layout hooks - the main feature of silvery over ink.
 *
 * @example
 * ```tsx
 * import { useContentRect, Box, Text } from '@silvery/react';
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
} from "./hooks/useLayout"

/**
 * Keyboard input hook.
 *
 * @example
 * ```tsx
 * import { useInput } from '@silvery/react';
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
 * import { useApp } from '@silvery/react';
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
export { createFocusManager } from "@silvery/tea/focus-manager"
export type {
  FocusManager,
  FocusManagerOptions,
  FocusChangeCallback,
  FocusOrigin,
  FocusSnapshot,
} from "@silvery/tea/focus-manager"
export {
  findFocusableAncestor,
  findEnclosingScope,
  getTabOrder,
  findByTestID,
  findSpatialTarget,
  getExplicitFocusLink,
} from "@silvery/tea/focus-queries"
export {
  createKeyEvent,
  createFocusEvent,
  dispatchKeyEvent,
  dispatchFocusEvent,
} from "@silvery/tea/focus-events"
export type { SilveryKeyEvent, SilveryFocusEvent, FocusEventProps } from "@silvery/tea/focus-events"
export { useFocusable } from "./hooks/useFocusable"
export type { UseFocusableResult } from "./hooks/useFocusable"
export { useFocusWithin } from "./hooks/useFocusWithin"

// Terminal focus state
export { useTerminalFocused } from "./hooks/useTerminalFocused"

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
export { useScrollback } from "./hooks/useScrollback"
export type { UseScrollbackOptions, ScrollbackMarkerCallbacks } from "./hooks/useScrollback"
export { useVirtualizer } from "./hooks/useVirtualizer"
export type { VirtualizerConfig, VirtualizerResult } from "./hooks/useVirtualizer"
export { useScrollbackItem } from "./hooks/useScrollbackItem"
export type { ScrollbackItemContext } from "./hooks/useScrollbackItem"

/**
 * Re-export React concurrent features for TUI responsiveness.
 *
 * @example
 * ```tsx
 * import { useTransition, useDeferredValue } from '@silvery/react';
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
export { TermContext, FocusManagerContext, RuntimeContext, StderrContext } from "./context"
export type { RuntimeContextValue, BaseRuntimeEvents } from "./context"

// Theming
export { ThemeProvider, useTheme } from "@silvery/theme/ThemeContext"
export type { ThemeProviderProps } from "@silvery/theme/ThemeContext"
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
export { createTerm, term, patchConsole } from "@silvery/term/ansi"
export type {
  Term,
  StyleChain,
  PatchedConsole,
  PatchConsoleOptions,
  ConsoleStats,
  ColorLevel,
  ConsoleEntry,
} from "@silvery/term/ansi"

// Hit Registry (mouse support)
export {
  HitRegistry,
  HitRegistryContext,
  useHitRegistry,
  useHitRegion,
  useHitRegionCallback,
  resetHitRegionIdCounter,
  Z_INDEX,
} from "@silvery/term/hit-registry"

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
 * import { render, Box, Text, createTerm } from '@silvery/react';
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
 * import { renderSync, initYogaEngine, setLayoutEngine, createTerm } from '@silvery/react';
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

// TermDef resolution utilities
export {
  resolveTermDef,
  resolveFromTerm,
  isTerm,
  isTermDef,
  createInputEvents,
  type ResolvedTermDef,
} from "@silvery/term/term-def"

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
} from "@silvery/term/output"
export type { CursorShape, MouseCursorShape } from "@silvery/term/output"

// Bracketed paste mode (DEC private mode 2004)
export {
  enableBracketedPaste,
  disableBracketedPaste,
  parseBracketedPaste,
  PASTE_START,
  PASTE_END,
} from "@silvery/term/bracketed-paste"
export type { BracketedPasteResult } from "@silvery/term/bracketed-paste"

// OSC 52 clipboard support
export { copyToClipboard, requestClipboard, parseClipboardResponse } from "@silvery/term/clipboard"

// OSC 4 palette color query/set
export {
  queryPaletteColor,
  setPaletteColor,
  parsePaletteResponse,
  queryMultiplePaletteColors,
} from "@silvery/term/osc-palette"

// OSC 133 semantic prompt markers
export { OSC133 } from "@silvery/term/osc-markers"

// Kitty protocol detection
export {
  detectKittySupport,
  detectKittyFromStdio,
  type KittyDetectResult,
} from "@silvery/term/kitty-detect"

// Terminal capability detection
export { detectTerminalCaps, defaultCaps, type TerminalCaps } from "@silvery/term/terminal-caps"

// Terminal capability visual test
export {
  runTermtest,
  TERMTEST_SECTIONS,
  type TermtestSection,
  type TermtestOptions,
} from "@silvery/term/termtest"

// Output-phase capability configuration (suppress unsupported SGR codes)
export {
  setOutputCaps,
  createOutputPhase,
  type OutputPhaseFn,
  type OutputCaps,
} from "@silvery/term/pipeline/output-phase"

// Pipeline configuration
export { type PipelineConfig, type PipelineContext } from "@silvery/term/pipeline"

// withRender plugin
export { withRender, type RenderTerm } from "@silvery/tea/with-render"

// Text sizing protocol (OSC 66) — PUA character width control
export {
  textSized,
  isPrivateUseArea,
  isTextSizingLikelySupported,
  detectTextSizingSupport,
} from "@silvery/term/text-sizing"

// CSI 6n cursor position query
export { queryCursorPosition, queryCursorFromStdio } from "@silvery/term/cursor-query"

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
} from "@silvery/term/terminal-colors"

// DA1/DA2/DA3 + XTVERSION device attribute queries
export {
  queryPrimaryDA,
  querySecondaryDA,
  queryTertiaryDA,
  queryTerminalVersion,
  queryDeviceAttributes,
  type DeviceAttributes,
} from "@silvery/term/device-attrs"

// Focus reporting (CSI ?1004h)
export {
  enableFocusReporting,
  disableFocusReporting,
  parseFocusEvent,
} from "@silvery/term/focus-reporting"

// DECRQM mode query
export { queryMode, queryModes, DecMode } from "@silvery/term/mode-query"

// CSI 14t/18t pixel and text area size queries
export { queryTextAreaPixels, queryTextAreaSize, queryCellSize } from "@silvery/term/pixel-size"

// Layout engine types
export type {
  LayoutEngine,
  LayoutNode,
  LayoutConstants,
  MeasureFunc,
  MeasureMode,
} from "@silvery/term/layout-engine"

// Render adapter (for canvas, DOM, etc.)
export {
  setRenderAdapter,
  getRenderAdapter,
  hasRenderAdapter,
  getTextMeasurer,
  ensureRenderAdapterInitialized,
} from "@silvery/term/render-adapter"
export type {
  RenderAdapter,
  RenderBuffer,
  RenderStyle,
  TextMeasurer,
  TextMeasureResult,
  TextMeasureStyle,
  BorderChars,
} from "@silvery/term/render-adapter"

// Canvas adapter
export { createCanvasAdapter, CanvasRenderBuffer } from "@silvery/term/adapters/canvas-adapter"
export type { CanvasAdapterConfig } from "@silvery/term/adapters/canvas-adapter"

// DOM adapter
export {
  createDOMAdapter,
  DOMRenderBuffer,
  injectDOMStyles,
} from "@silvery/term/adapters/dom-adapter"
export type { DOMAdapterConfig } from "@silvery/term/adapters/dom-adapter"

// App types (unified render API)
export type { App } from "@silvery/term/app"
export type { AutoLocator, FilterOptions } from "@silvery/test/auto-locator"
export type { BoundTerm } from "@silvery/term/bound-term"

// Types
export type { BoxProps, BoxHandle } from "./components/Box"
export type { TextProps, TextHandle } from "./components/Text"
export type { Rect } from "@silvery/tea/types"
export type { Key, InputHandler, UseInputOptions } from "./hooks/useInput"
export {
  keyToName,
  keyToModifiers,
  parseHotkey,
  matchHotkey,
  parseKeypress,
  parseKey,
  emptyKey,
} from "@silvery/tea/keys"
export type { ParsedKeypress, ParsedHotkey } from "@silvery/tea/keys"
export type { UseAppResult } from "./hooks/useApp"
export type { UseStdoutResult } from "./hooks/useStdout"
export type { UseStderrResult } from "./hooks/useStderr"
export type { UseFocusManagerResult } from "./hooks/useFocusManager"
export type { RenderOptions, Instance, RenderMode, NonTTYMode } from "./render"
export type { MeasureElementOutput } from "./measureElement"
export type {
  TeaNode,
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
} from "@silvery/tea/types"
export type { HitTarget, HitRegion } from "@silvery/term/hit-registry"

// Mouse parsing (SGR mode 1006)
export { parseMouseSequence, isMouseSequence, type ParsedMouse } from "@silvery/term/mouse"

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
  type MouseEventProps,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "@silvery/term/mouse-events"

// Non-TTY utilities
export { isTTY, resolveNonTTYMode, stripAnsi } from "@silvery/term/non-tty"
export type { NonTTYOptions, ResolvedNonTTYMode } from "@silvery/term/non-tty"

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
 * import { connectDevTools } from '@silvery/react';
 * await connectDevTools();
 *
 * // Or use env var: DEBUG_DEVTOOLS=1 bun run app.ts
 * ```
 */
export { connectDevTools, isDevToolsConnected } from "@silvery/term/devtools"

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
 * import { enableInspector } from '@silvery/react';
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
} from "@silvery/term/inspector"
export type { InspectorOptions } from "@silvery/term/inspector"

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
} from "@silvery/term/unicode"

export type { StyledSegment } from "@silvery/term/unicode"

// Width measurer factory
export {
  createWidthMeasurer,
  createMeasurer,
  runWithMeasurer,
  type Measurer,
  type WidthMeasurer,
} from "@silvery/term/unicode"

// Measurer composition (term + measurement)
export { withMeasurer, createPipeline, type MeasuredTerm } from "@silvery/term/measurer"

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
 * import { cursorToRowCol, cursorMoveDown } from '@silvery/react'
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
} from "@silvery/tea/text-cursor"
export type { WrappedLine } from "@silvery/tea/text-cursor"

// =============================================================================
// Edit Context
// =============================================================================

/**
 * Terminal Edit Context -- W3C EditContext-aligned interface for terminal
 * text editing, plus invertible text operations for undo/redo.
 *
 * @example
 * ```ts
 * import { createTermEditContext, applyTextOp, invertTextOp } from '@silvery/react'
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

export { applyTextOp, invertTextOp, mergeTextOps } from "@silvery/tea/text-ops"
export type { TextOp } from "@silvery/tea/text-ops"

export { useEditContext, activeEditContextRef, activeEditTargetRef } from "./hooks/use-edit-context"
export type {
  UseEditContextOptions,
  UseEditContextResult,
  EditTarget,
} from "./hooks/use-edit-context"

// =============================================================================
// Scroll Utilities
// =============================================================================

/**
 * Scroll utility for edge-based scrolling.
 *
 * @example
 * ```tsx
 * import { calcEdgeBasedScrollOffset } from '@silvery/react';
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
export { calcEdgeBasedScrollOffset } from "@silvery/term/scroll-utils"

// Scroll Region Optimization (DECSTBM)
export {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "@silvery/term/scroll-region"
export type { ScrollRegionConfig } from "@silvery/term/scroll-region"

// =============================================================================
// Plugin Composition (SlateJS-style)
// =============================================================================

/**
 * Plugin composition for command systems.
 *
 * @example
 * ```tsx
 * import { withCommands, withKeybindings, render } from '@silvery/react';
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
export { withCommands } from "@silvery/tea/with-commands"
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
} from "@silvery/tea/with-commands"

export { withKeybindings } from "@silvery/tea/with-keybindings"
export type {
  WithKeybindingsOptions,
  KeybindingContext,
  ExtendedKeybindingDef,
} from "@silvery/tea/with-keybindings"

// Diagnostic tools - prefer importing from '@silvery/term/toolbelt' for new code
export { withDiagnostics, VirtualTerminal } from "@silvery/tea/with-diagnostics"
export type { DiagnosticOptions } from "@silvery/tea/with-diagnostics"

// Scheduler errors (for catching incremental render mismatches)
export { IncrementalRenderMismatchError } from "@silvery/term/scheduler"

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
 * import { InputLayerProvider, useInputLayer } from '@silvery/react';
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
 * import { PositionRegistryProvider, GridCell, usePositionRegistry } from '@silvery/react';
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
export {
  PositionRegistryProvider,
  usePositionRegistry,
  createPositionRegistry,
} from "./hooks/usePositionRegistry"
export type { PositionRegistry, ScreenRect } from "./hooks/usePositionRegistry"
export { useGridPosition } from "./hooks/useGridPosition"
export { GridCell } from "@silvery/ui/components/GridCell"
export type { GridCellProps } from "@silvery/ui/components/GridCell"

// =============================================================================
// Animation
// =============================================================================

/**
 * Animation utilities for smooth terminal UI animations (~30fps).
 *
 * @example
 * ```tsx
 * import { useAnimation, easings } from '@silvery/react';
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
} from "@silvery/ui/animation"
export { useTransition as useAnimatedTransition } from "@silvery/ui/animation/index"
export type {
  EasingFn,
  EasingName,
  UseAnimationOptions,
  UseAnimationResult,
  UseTransitionOptions,
} from "@silvery/ui/animation"

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
export { useTea } from "@silvery/ui/hooks/useTea"
export { fx, collect } from "@silvery/tea"
export type { TeaResult, EffectLike, TimerEffect } from "@silvery/tea"
