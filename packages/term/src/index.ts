/**
 * @silvery/term — Terminal rendering target for silvery.
 *
 * Provides terminal buffer, pipeline, output, input protocols,
 * layout engine, render adapters, and Unicode text utilities.
 *
 * @packageDocumentation
 */

// =============================================================================
// Buffer
// =============================================================================

export type { TerminalBuffer, Color } from "./buffer"
export { colorEquals, DEFAULT_BG, isDefaultBg } from "./buffer"

// =============================================================================
// Pipeline
// =============================================================================

export { executeRender, type PipelineConfig, type ExecuteRenderOptions } from "./pipeline"
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

export type { LayoutEngine, LayoutNode, LayoutConstants, MeasureFunc, MeasureMode } from "./layout-engine"

// =============================================================================
// Render Adapter
// =============================================================================

export {
  setRenderAdapter,
  getRenderAdapter,
  hasRenderAdapter,
  getTextMeasurer,
  ensureRenderAdapterInitialized,
} from "./render-adapter"
export type {
  RenderAdapter,
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
  PASTE_START,
  PASTE_END,
} from "./bracketed-paste"
export type { BracketedPasteResult } from "./bracketed-paste"

// =============================================================================
// OSC 52 Clipboard
// =============================================================================

export { copyToClipboard, requestClipboard, parseClipboardResponse } from "./clipboard"

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

export { textSized, isPrivateUseArea, isTextSizingLikelySupported, detectTextSizingSupport } from "./text-sizing"

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

// =============================================================================
// CSI 14t/18t Pixel and Text Area Size
// =============================================================================

export { queryTextAreaPixels, queryTextAreaSize, queryCellSize } from "./pixel-size"

// =============================================================================
// TermDef Resolution
// =============================================================================

export { resolveTermDef, resolveFromTerm, isTerm, isTermDef, createInputEvents, type ResolvedTermDef } from "./term-def"

// =============================================================================
// Hit Registry (Mouse Support) — React-free core only
// =============================================================================
//
// The barrel exports only the pure core (class, types, constants).
// React hooks and context are available via @silvery/term/hit-registry.
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
  type SilveryMouseEvent,
  type SilveryWheelEvent,
  type MouseEventProps,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "./mouse-events"

// =============================================================================
// Non-TTY Utilities
// =============================================================================

export { isTTY, resolveNonTTYMode, stripAnsi } from "./non-tty"
export type { NonTTYOptions, ResolvedNonTTYMode } from "./non-tty"

// =============================================================================
// DevTools — available via @silvery/term/devtools (not re-exported here to
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

// withRender plugin — available via @silvery/tea/with-render (not re-exported
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
export type { Term, StyleChain } from "./ansi/index"

// Console patching
export { patchConsole } from "./ansi/index"
export type { PatchedConsole, PatchConsoleOptions, ConsoleStats } from "./ansi/index"

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
// Selection
// =============================================================================

export {
  selectionUpdate,
  createSelectionState,
  normalizeRange,
  extractText,
  type SelectionState,
  type SelectionRange,
  type SelectionPosition,
  type SelectionAction,
  type SelectionEffect,
} from "./selection"

export { renderSelectionOverlay } from "./selection-renderer"

// =============================================================================
// Virtual Scrollback
// =============================================================================

export { createVirtualScrollback, type VirtualScrollback, type VirtualScrollbackOptions } from "./virtual-scrollback"

// =============================================================================
// History Buffer
// =============================================================================

export { createHistoryBuffer, createHistoryItem, type HistoryItem, type HistoryBuffer } from "./history-buffer"

// =============================================================================
// List Document
// =============================================================================

export { createListDocument, type ListDocument, type DocumentSource } from "./list-document"

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
