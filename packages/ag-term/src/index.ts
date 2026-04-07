/**
 * @silvery/ag-term — Terminal rendering target for silvery.
 *
 * Provides terminal buffer, pipeline, output, input protocols,
 * layout engine, render adapters, and Unicode text utilities.
 *
 * @packageDocumentation
 */

// =============================================================================
// Ag (tree + layout + render)
// =============================================================================

export { createAg } from "./ag"
export type { Ag, CreateAgOptions, AgLayoutOptions, AgRenderOptions, AgRenderResult } from "./ag"

// =============================================================================
// Plugin Composition (era2a)
// =============================================================================

export { create, pipe, from, withAg, withTerm } from "./compose"
export type { AppBase, AppWithAg, AppWithTerm, PipeBuilder } from "./compose"
export { withReact } from "./compose-react"
export { withTest, type AppWithTest } from "./compose-test"

// =============================================================================
// Buffer
// =============================================================================

export type { TerminalBuffer, Color } from "./buffer"
export { colorEquals, DEFAULT_BG, isDefaultBg, createTextFrame } from "./buffer"

// =============================================================================
// Pipeline
// =============================================================================

export {
  executeRender,
  silveryBenchStart,
  silveryBenchStop,
  silveryBenchReset,
  type PipelineConfig,
  type ExecuteRenderOptions,
  type SilveryBenchPhases,
} from "./pipeline"
export {
  outputPhase,
  setOutputCaps,
  createOutputPhase,
  type OutputPhaseFn,
  type OutputCaps,
} from "./pipeline/output-phase"
export type { PipelineContext } from "./pipeline/types"

// =============================================================================
// App Types
// =============================================================================

export type { App } from "./app"
export type { BoundTerm } from "./bound-term"

// =============================================================================
// Layout Engine
// =============================================================================

export type { LayoutEngine, LayoutConstants } from "./layout-engine"
export type { LayoutNode, MeasureFunc, MeasureMode } from "@silvery/ag/layout-types"

// =============================================================================
// Render Adapter Types (RenderAdapter itself is internal — not exported)
// =============================================================================

export type {
  RenderBuffer,
  RenderStyle,
  TextMeasurer,
  TextMeasureResult,
  TextMeasureStyle,
  BorderChars,
} from "./render-adapter"

// Canvas adapter
export { createCanvasAdapter, CanvasRenderBuffer } from "./adapters/canvas-adapter"
export type { CanvasAdapterConfig } from "./adapters/canvas-adapter"

// DOM adapter
export { createDOMAdapter, DOMRenderBuffer, injectDOMStyles } from "./adapters/dom-adapter"
export type { DOMAdapterConfig } from "./adapters/dom-adapter"

// =============================================================================
// ANSI Sanitizer
// =============================================================================

export {
  sanitizeAnsi,
  tokenizeAnsi,
  isCSISGR,
  extractColonSGRReplacements,
  createColonSGRTracker,
} from "./ansi-sanitize"
export type { AnsiToken, ColonSGRReplacement } from "./ansi-sanitize"

// =============================================================================
// ANSI Escape Sequences / Output
// =============================================================================

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
} from "./output"
export type { CursorShape, MouseCursorShape } from "./output"

// =============================================================================
// Bracketed Paste
// =============================================================================

export {
  enableBracketedPaste,
  disableBracketedPaste,
  parseBracketedPaste,
  createBracketedPasteEvent,
  createInternalPasteEvent,
  PASTE_START,
  PASTE_END,
} from "./bracketed-paste"
export type { BracketedPasteResult, PasteEvent } from "./bracketed-paste"

// =============================================================================
// Clipboard
// =============================================================================

export { copyToClipboard, requestClipboard, parseClipboardResponse } from "./clipboard"
export { createOsc52Backend, createInternalClipboardBackend, createCompositeClipboard } from "./clipboard"
export type { ClipboardData, ClipboardBackend, ClipboardCapabilities } from "./clipboard"

// =============================================================================
// Advanced Clipboard (OSC 5522)
// =============================================================================

export {
  createAdvancedClipboard,
  parseOsc5522Response,
  parsePasteData,
  ENABLE_PASTE_EVENTS,
  DISABLE_PASTE_EVENTS,
} from "./ansi/advanced-clipboard"
export type { AdvancedClipboard, AdvancedClipboardOptions, ClipboardEntry } from "./ansi/advanced-clipboard"

// =============================================================================
// OSC 4 Palette Color Query/Set
// =============================================================================

export { queryPaletteColor, setPaletteColor, parsePaletteResponse, queryMultiplePaletteColors } from "./osc-palette"

// =============================================================================
// OSC 133 Semantic Prompt Markers
// =============================================================================

export { OSC133 } from "./osc-markers"

// =============================================================================
// Kitty Protocol Detection
// =============================================================================

export { detectKittySupport, detectKittyFromStdio, type KittyDetectResult } from "./kitty-detect"

// =============================================================================
// Kitty Protocol Manager
// =============================================================================

export { createKittyManager, type KittyManager, type KittyManagerOptions } from "./kitty-manager"

// =============================================================================
// Terminal Capability Detection
// =============================================================================

export { detectTerminalCaps, defaultCaps, type TerminalCaps } from "./terminal-caps"

// =============================================================================
// Terminal Capability Visual Test
// =============================================================================

export { runTermtest, TERMTEST_SECTIONS, type TermtestSection, type TermtestOptions } from "./termtest"

// =============================================================================
// Text Sizing (OSC 66)
// =============================================================================

export {
  textSized,
  textScaled,
  resetTextScale,
  isPrivateUseArea,
  isTextSizingLikelySupported,
  detectTextSizingSupport,
} from "./text-sizing"

// =============================================================================
// CSI 6n Cursor Position Query
// =============================================================================

export { queryCursorPosition, queryCursorFromStdio } from "./cursor-query"

// =============================================================================
// OSC 10/11/12 Terminal Color Queries
// =============================================================================

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
} from "./terminal-colors"

// =============================================================================
// Color Scheme Detection (Mode 2031) — re-exported from @silvery/ansi
// =============================================================================

export {
  createColorSchemeDetector,
  parseColorSchemeResponse,
  ENABLE_COLOR_SCHEME_REPORTING,
  DISABLE_COLOR_SCHEME_REPORTING,
  type ColorSchemeDetector,
  type ColorSchemeDetectorOptions,
} from "@silvery/ansi"

// =============================================================================
// Width Detection (DEC 1020-1023)
// =============================================================================

export {
  createWidthDetector,
  applyWidthConfig,
  DEFAULT_WIDTH_CONFIG,
  type WidthDetector,
  type TerminalWidthConfig,
} from "./ansi/width-detection"

// =============================================================================
// DA1/DA2/DA3 + XTVERSION Device Attribute Queries
// =============================================================================

export {
  queryPrimaryDA,
  querySecondaryDA,
  queryTertiaryDA,
  queryTerminalVersion,
  queryDeviceAttributes,
  type DeviceAttributes,
} from "./device-attrs"

// =============================================================================
// Focus Reporting
// =============================================================================

export { enableFocusReporting, disableFocusReporting, parseFocusEvent } from "./focus-reporting"

// =============================================================================
// DECRQM Mode Query
// =============================================================================

export { queryMode, queryModes, DecMode } from "./mode-query"

// DEC Width Mode Detection additional exports (WidthMode, WidthDetectorOptions)
export { WidthMode } from "./ansi/width-detection"
export type { WidthDetectorOptions } from "./ansi/width-detection"

// =============================================================================
// CSI 14t/18t Pixel and Text Area Size
// =============================================================================

export { queryTextAreaPixels, queryTextAreaSize, queryCellSize } from "./pixel-size"

// =============================================================================
// TermDef Resolution
// =============================================================================

// TermDef and related terminal-specific types
export type {
  TermDef,
  RenderOptions as TermDefRenderOptions,
  RenderInstance as TermDefRenderInstance,
} from "./term-def"
// TermDef resolution — internal. Use createTerm() instead of TermDef.
// isTerm and createInputEvents are still public utilities.
export { isTerm, createInputEvents } from "./term-def"

// =============================================================================
// Hit Registry (Mouse Support) — React-free core only
// =============================================================================
//
// The barrel exports only the pure core (class, types, constants).
// React hooks and context are available via @silvery/ag-term/hit-registry.
//

export { HitRegistry, resetHitRegionIdCounter, Z_INDEX } from "./hit-registry-core"
export type { HitTarget, HitRegion } from "./hit-registry-core"

// =============================================================================
// Mouse Parsing (SGR mode 1006)
// =============================================================================

export { parseMouseSequence, isMouseSequence, type ParsedMouse } from "./mouse"

// =============================================================================
// Mouse Events (DOM-level)
// =============================================================================

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
  resolveNodeDraggable,
  type SilveryMouseEvent,
  type SilveryWheelEvent,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
  type KeyboardModifierState,
  updateKeyboardModifiers,
} from "./mouse-events"
export type { MouseEventProps } from "@silvery/ag/mouse-event-types"

// =============================================================================
// Non-TTY Utilities
// =============================================================================

export { isTTY, resolveNonTTYMode, stripAnsi } from "./non-tty"
export type { NonTTYOptions, ResolvedNonTTYMode } from "./non-tty"

// =============================================================================
// DevTools — available via @silvery/ag-term/devtools (not re-exported here to
// keep this barrel React-free; devtools imports the React reconciler)
// =============================================================================

// =============================================================================
// Inspector
// =============================================================================

export {
  enableInspector,
  disableInspector,
  isInspectorEnabled,
  inspectTree,
  inspectFrame,
  autoEnableInspector,
} from "./inspector"
export type { InspectorOptions } from "./inspector"

// =============================================================================
// Unicode Text Utilities
// =============================================================================

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
} from "./unicode"
export type { StyledSegment } from "./unicode"

// Width measurer factory
export { createWidthMeasurer, createMeasurer, runWithMeasurer, type Measurer, type WidthMeasurer } from "./unicode"

// Measurer composition (term + measurement)
export { withMeasurer, createPipeline, type MeasuredTerm } from "./measurer"

// withRender plugin — available via @silvery/create/with-render (not re-exported
// here to keep this barrel React-free; withRender's renderStatic() pulls React)

// =============================================================================
// Scroll Utilities
// =============================================================================

export { calcEdgeBasedScrollOffset } from "./scroll-utils"

// Scroll Region Optimization (DECSTBM)
export {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "./scroll-region"
export type { ScrollRegionConfig } from "./scroll-region"

// =============================================================================
// Pane Manager
// =============================================================================

export type { LayoutNode as SplitLayoutNode } from "./pane-manager"
export {
  createLeaf,
  splitPane,
  removePane,
  getPaneIds,
  findAdjacentPane,
  resizeSplit,
  swapPanes,
  getTabOrder as getSplitTabOrder,
} from "./pane-manager"

// =============================================================================
// Scheduler
// =============================================================================

export { IncrementalRenderMismatchError } from "./errors"

// =============================================================================
// ANSI Primitives (merged from @silvery/ansi)
// =============================================================================

// Term factory and lazy instance
export { createTerm, term } from "./ansi/index"
export type { Term, StyleChain, TermEmulatorBackend } from "./ansi/index"

// Console patching
export { patchConsole } from "./ansi/index"
export type { PatchedConsole, PatchConsoleOptions, ConsoleStats } from "./ansi/index"

// Output guard (alt screen protection)
export { createOutputGuard } from "./ansi/index"
export type { OutputGuard, OutputGuardOptions } from "./ansi/index"

// Types
export type {
  UnderlineStyle,
  RGB,
  ColorLevel,
  Color as AnsiColor,
  AnsiColorName,
  StyleOptions,
  ConsoleMethod,
  ConsoleEntry,
  CreateTermOptions,
} from "./ansi/index"

// Detection
export { detectCursor, detectInput, detectColor, detectUnicode, detectExtendedUnderline } from "./ansi/index"

// Utilities
export { ANSI_REGEX, displayLength } from "./ansi/index"

// Underline functions
export {
  underline as ansiUnderline,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
} from "./ansi/index"

// Hyperlinks
export { hyperlink } from "./ansi/index"

// ANSI control helpers (re-exported as ansi* to avoid conflicts with term's own)
export {
  enterAltScreen,
  leaveAltScreen,
  clearScreen,
  clearLine,
  cursorTo,
  cursorHome,
  cursorHide,
  cursorShow,
  cursorStyle as ansiCursorStyle,
  setTitle,
  enableSyncUpdate,
  disableSyncUpdate,
} from "./ansi/index"

// Background override
export { BG_OVERRIDE_CODE, bgOverride } from "./ansi/index"

// =============================================================================
// Interactive Signals (re-exported from @silvery/ag)
// =============================================================================

export {
  ensureInteractiveState,
  setHovered,
  setArmed,
  setSelected,
  setFocused,
  setDropTarget,
  clearInteractiveState,
} from "@silvery/ag/interactive-signals"

// =============================================================================
// Selection (re-exported from @silvery/headless)
// =============================================================================

export {
  terminalSelectionUpdate,
  createTerminalSelectionState,
  normalizeRange,
  extractText,
  findWordBoundary,
  findLineBoundary,
  type TerminalSelectionState,
  type SelectionRange,
  type SelectionPosition,
  type SelectionAction,
  type SelectionEffect,
  type SelectionGranularity,
} from "@silvery/headless/selection"

export { renderSelectionOverlay } from "./selection-renderer"
export { extractHtml } from "./extract-html"

// =============================================================================
// Find (re-exported from @silvery/headless)
// =============================================================================

export {
  findUpdate,
  createFindState,
  searchBuffer,
  type FindState,
  type FindMatch,
  type FindResult,
  type FindProvider,
  type FindAction,
  type FindEffect,
} from "@silvery/headless/find"

// FindFeature service
export { createFindFeature } from "./find-feature"
export type { FindFeature, FindFeatureOptions } from "./find-feature"

// =============================================================================
// Copy Mode (re-exported from @silvery/headless)
// =============================================================================

export {
  copyModeUpdate,
  createCopyModeState,
  type CopyModeState,
  type CopyModePosition,
  type CopyModeBuffer,
  type CopyModeAction,
  type CopyModeEffect,
} from "@silvery/headless/copy-mode"

// =============================================================================
// Pointer State Machine (re-exported from @silvery/headless)
// =============================================================================

export {
  pointerStateUpdate,
  createPointerState,
  createPointerDoubleClickState,
  checkPointerDoubleClick,
  DRAG_THRESHOLD,
  type PointerState,
  type PointerAction,
  type PointerEffect,
  type Position as PointerPosition,
  type PointerDoubleClickState,
} from "@silvery/headless/pointer"

// =============================================================================
// Drag Events
// =============================================================================

export {
  createDragEvent,
  createDragState,
  isDropTarget,
  findDropTarget,
  type DragState,
  type DragEvent,
  type DragEventProps,
} from "./drag-events"

// =============================================================================
// Virtual Scrollback
// =============================================================================

export { createVirtualScrollback, type VirtualScrollback, type VirtualScrollbackOptions } from "./virtual-scrollback"

// =============================================================================
// History Buffer
// =============================================================================

export { createHistoryBuffer, createHistoryItem, type HistoryItem, type HistoryBuffer } from "./history-buffer"

// =============================================================================
// Viewport Compositor
// =============================================================================

export { composeViewport, type ViewportCompositorConfig, type ComposedViewport } from "./viewport-compositor"

// =============================================================================
// List Document
// =============================================================================

export { createListDocument, type ListDocument, type DocumentSource, type LiveItemBlock } from "./list-document"

// =============================================================================
// Text Surface
// =============================================================================

export { createTextSurface, type TextSurface, type SurfaceCapabilities } from "./text-surface"

// =============================================================================
// Search Overlay
// =============================================================================

export {
  createSearchState,
  searchUpdate,
  renderSearchBar,
  type SearchState,
  type SearchMatch,
  type SearchAction,
  type SearchEffect,
} from "./search-overlay"
