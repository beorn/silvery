/**
 * Inkx Types
 *
 * Core types for the Inkx renderer architecture.
 */

import type { FocusEventProps } from "./focus-events.js"
import type { LayoutNode } from "./layout-engine.js"
import type { MouseEventProps } from "./mouse-events.js"

// ============================================================================
// Layout Types
// ============================================================================

/**
 * A rectangle with position and size.
 * All values are in terminal columns/rows (integers).
 */
export interface Rect {
  /** X position (0-indexed terminal column) */
  x: number
  /** Y position (0-indexed terminal row) */
  y: number
  /** Width in terminal columns */
  width: number
  /** Height in terminal rows */
  height: number
}

/**
 * Check if two rects are equal (same position and size).
 */
export function rectEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

// ============================================================================
// Node Types
// ============================================================================

/**
 * Inkx node types - the primitive elements in the render tree.
 */
export type InkxNodeType = "inkx-root" | "inkx-box" | "inkx-text"

/**
 * Flexbox properties that can be applied to Box nodes.
 */
export interface FlexboxProps {
  // Size
  width?: number | string
  height?: number | string
  minWidth?: number | string
  minHeight?: number | string
  maxWidth?: number | string
  maxHeight?: number | string

  // Flex
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number | string
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse"
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse"

  // Alignment
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
  alignSelf?: "auto" | "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
  alignContent?: "flex-start" | "flex-end" | "center" | "stretch" | "space-between" | "space-around"
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly"

  // Spacing
  padding?: number
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  paddingX?: number
  paddingY?: number
  margin?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  marginX?: number
  marginY?: number
  gap?: number

  // Position
  position?: "relative" | "absolute" | "sticky"

  // Sticky offsets (only used when position='sticky')
  // The element will "stick" when it reaches this offset from the container edge
  stickyTop?: number
  stickyBottom?: number

  // Display
  display?: "flex" | "none"

  // Overflow
  overflow?: "visible" | "hidden" | "scroll"

  // Scroll control (only used when overflow='scroll')
  /** Child index to ensure visible (edge-based: only scrolls if off-screen) */
  scrollTo?: number
  /** Explicit scroll offset in rows (used when scrollTo is undefined for frozen scroll state) */
  scrollOffset?: number
}

/**
 * Props for testing and identification.
 * These props are stored in the node for DOM query access.
 */
export interface TestProps {
  /** Element ID for DOM queries and visual debugging */
  id?: string
  /** Test ID for querying nodes (like Playwright's data-testid) */
  testID?: string
  /** Allow arbitrary data-* attributes for testing */
  [key: `data-${string}`]: unknown
}

/**
 * Underline style variants (SGR 4:x codes).
 * - false: no underline
 * - 'single': standard underline (SGR 4 or 4:1)
 * - 'double': double underline (SGR 4:2)
 * - 'curly': curly/wavy underline (SGR 4:3)
 * - 'dotted': dotted underline (SGR 4:4)
 * - 'dashed': dashed underline (SGR 4:5)
 */
export type UnderlineStyle = false | "single" | "double" | "curly" | "dotted" | "dashed"

/**
 * Style properties for text rendering.
 */
export interface StyleProps {
  color?: string
  backgroundColor?: string
  bold?: boolean
  dim?: boolean
  /** Alias for dim (Ink compatibility) */
  dimColor?: boolean
  italic?: boolean
  /** Enable underline. Use underlineStyle for style variants. */
  underline?: boolean
  /**
   * Underline style variant: 'single' | 'double' | 'curly' | 'dotted' | 'dashed'.
   * Setting this implies underline=true. Takes precedence over underline prop.
   */
  underlineStyle?: UnderlineStyle
  /**
   * Underline color (independent of text color).
   * Uses SGR 58 (underline color). Falls back to text color if not specified.
   */
  underlineColor?: string
  strikethrough?: boolean
  inverse?: boolean
}

/**
 * Props for Box component.
 */
export interface BoxProps extends FlexboxProps, StyleProps, TestProps, MouseEventProps, FocusEventProps {
  borderStyle?: "single" | "double" | "round" | "bold" | "singleDouble" | "doubleSingle" | "classic"
  borderColor?: string
  borderTop?: boolean
  borderBottom?: boolean
  borderLeft?: boolean
  borderRight?: boolean
  onLayout?: (layout: Rect) => void

  /**
   * Show scroll overflow indicators (▲N / ▼N) for scrollable containers.
   *
   * For bordered containers, indicators appear on the border.
   * For borderless containers, indicators overlay the content at top-right/bottom-right.
   *
   * Only applies when overflow='scroll'.
   */
  overflowIndicator?: boolean
}

/**
 * Props for Text component.
 */
export interface TextProps extends StyleProps, TestProps, MouseEventProps {
  children?: React.ReactNode
  wrap?: "wrap" | "truncate" | "truncate-start" | "truncate-middle" | "truncate-end" | boolean
  /** Internal transform function applied to each rendered line. Used by Transform component. */
  internal_transform?: (line: string, index: number) => string
}

/**
 * The core Inkx node - represents an element in the render tree.
 *
 * Each node has:
 * - A Yoga node for layout calculation
 * - Computed layout after Yoga runs
 * - Subscribers that get notified when layout changes
 * - Dirty flags for incremental updates
 */
export interface InkxNode {
  /** Node type */
  type: InkxNodeType

  /** Props passed to this node */
  props: BoxProps | TextProps | Record<string, unknown>

  /** Child nodes */
  children: InkxNode[]

  /** Parent node (null for root) */
  parent: InkxNode | null

  /** The layout node for layout calculation (null for raw text nodes) */
  layoutNode: LayoutNode | null

  /** Computed layout from previous render (for change detection) */
  prevLayout: Rect | null

  /**
   * Content-relative position (like CSS offsetTop/offsetLeft).
   * Position within the scrollable content, ignoring scroll offsets.
   * Set after layout phase.
   */
  contentRect: Rect | null

  /**
   * Screen-relative position (like CSS getBoundingClientRect).
   * Actual position on the terminal screen, accounting for scroll offsets.
   * Set after screen rect phase.
   */
  screenRect: Rect | null

  /** Previous screen rect (for change detection in notifyLayoutSubscribers) */
  prevScreenRect: Rect | null

  /** True if layout-affecting props changed and Yoga needs recalculation.
   *  Set by reconciler on prop changes. Cleared after layout phase. */
  layoutDirty: boolean

  /** True if content changed but layout didn't (e.g., text content update).
   *  Set by reconciler. Cleared by content phase after rendering.
   *  NOTE: measure phase may clear this for its text-collection cache —
   *  paintDirty acts as the surviving witness for style changes. */
  contentDirty: boolean

  /** True if visual props changed (color, backgroundColor, borderStyle, etc.).
   *  Set by reconciler alongside contentDirty. Survives measure phase clearing
   *  of contentDirty, ensuring content phase still detects style changes.
   *  Cleared by content phase after rendering. */
  paintDirty: boolean

  /** True if backgroundColor specifically changed (added, modified, or removed).
   *  Set by reconciler when backgroundColor prop changes. Used by content phase
   *  to avoid cascading re-renders for border-only paint changes (borderColor
   *  doesn't affect the content area). Cleared by content phase. */
  bgDirty: boolean

  /** True if this node or any descendant has dirty content/layout.
   *  Propagated upward by reconciler when any descendant is dirtied.
   *  When only subtreeDirty (no other flags), the node's OWN rendering is
   *  skipped — only descendants are traversed. Cleared by content phase. */
  subtreeDirty: boolean

  /** True if direct children were added, removed, or reordered.
   *  Set by reconciler on child list changes. Triggers own repaint
   *  (gap regions may need clearing) and forces child re-render.
   *  Cleared by content phase. */
  childrenDirty: boolean

  /** Callbacks subscribed to layout changes (used by useContentRect) */
  layoutSubscribers: Set<() => void>

  /** Text content for text nodes */
  textContent?: string

  /** True if this is a raw text node (created by createTextInstance) */
  isRawText?: boolean

  /** True if this node is hidden (for Suspense support) */
  hidden?: boolean

  /** Scroll state for overflow='scroll' containers */
  scrollState?: {
    /** Current scroll offset (in terminal rows) */
    offset: number
    /** Previous scroll offset from last render (for incremental rendering) */
    prevOffset: number
    /** Total content height (all children) */
    contentHeight: number
    /** Visible height (container height minus borders/padding) */
    viewportHeight: number
    /** Index of first visible child */
    firstVisibleChild: number
    /** Index of last visible child */
    lastVisibleChild: number
    /** Previous first visible child from last render (for incremental rendering) */
    prevFirstVisibleChild: number
    /** Previous last visible child from last render (for incremental rendering) */
    prevLastVisibleChild: number
    /** Count of items hidden above viewport */
    hiddenAbove: number
    /** Count of items hidden below viewport */
    hiddenBelow: number
    /** Sticky children with their computed render positions */
    stickyChildren?: Array<{
      /** Index of the sticky child */
      index: number
      /** Computed Y offset to render at (relative to viewport, not content) */
      renderOffset: number
      /** Original natural Y position (before sticky adjustment) */
      naturalTop: number
      /** Height of the sticky element */
      height: number
    }>
  }
}

// ============================================================================
// Terminal Buffer Types
// ============================================================================

/**
 * Text attributes that can be applied to a cell.
 */
export interface CellAttrs {
  bold?: boolean
  dim?: boolean
  italic?: boolean
  /** Simple underline flag (for backwards compatibility) */
  underline?: boolean
  /**
   * Underline style: 'single' | 'double' | 'curly' | 'dotted' | 'dashed'.
   * When set, takes precedence over the underline boolean.
   */
  underlineStyle?: UnderlineStyle
  strikethrough?: boolean
  inverse?: boolean
}

/**
 * A single cell in the terminal buffer.
 */
export interface Cell {
  /** The character (grapheme cluster) in this cell */
  char: string
  /** Foreground color (ANSI code or RGB) */
  fg: string | null
  /** Background color (ANSI code or RGB) */
  bg: string | null
  /** Text attributes */
  attrs: CellAttrs
  /** True if this is a wide character (CJK) that takes 2 cells */
  wide: boolean
  /** True if this cell is the continuation of a wide character */
  continuation: boolean
}

/**
 * Interface for the terminal buffer.
 */
export interface TerminalBuffer {
  readonly width: number
  readonly height: number
  getCell(x: number, y: number): Cell
  setCell(x: number, y: number, cell: Cell): void
  clear(): void
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Keyboard event with key information and modifiers.
 */
export interface KeyEvent {
  type: "key"
  /** The key pressed (character or key name like 'ArrowUp') */
  key: string
  /** Ctrl modifier was held */
  ctrl?: boolean
  /** Meta/Alt modifier was held */
  meta?: boolean
  /** Shift modifier was held */
  shift?: boolean
  /** Alt/Option modifier was held */
  alt?: boolean
  /** Super/Cmd modifier was held. Requires Kitty protocol. */
  super?: boolean
  /** Hyper modifier was held. Requires Kitty protocol. */
  hyper?: boolean
  /** Kitty event type: 1=press, 2=repeat, 3=release. Requires Kitty flag 2. */
  eventType?: 1 | 2 | 3
  /** CapsLock is active. Kitty modifier bit 6. */
  capsLock?: boolean
  /** NumLock is active. Kitty modifier bit 7. */
  numLock?: boolean
}

/**
 * Mouse event with position and button information.
 */
export interface MouseEvent {
  type: "mouse"
  /** X position in terminal columns (0-indexed) */
  x: number
  /** Y position in terminal rows (0-indexed) */
  y: number
  /** Mouse button (0=left, 1=middle, 2=right) */
  button: number
  /** Event action */
  action: "down" | "up" | "move" | "wheel"
  /** Wheel delta for scroll events */
  delta?: number
}

/**
 * Terminal resize event.
 */
export interface ResizeEvent {
  type: "resize"
  /** New width in columns */
  width: number
  /** New height in rows */
  height: number
}

/**
 * Terminal focus event.
 */
export interface FocusEvent {
  type: "focus"
}

/**
 * Terminal blur event.
 */
export interface BlurEvent {
  type: "blur"
}

/**
 * Signal event (SIGINT, SIGTERM, etc.).
 */
export interface SignalEvent {
  type: "signal"
  /** Signal name (e.g., 'SIGINT', 'SIGTERM') */
  signal: string
}

/**
 * Custom event for extensibility.
 */
export interface CustomEvent {
  type: "custom"
  /** Event name */
  name: string
  /** Event data */
  data: unknown
}

/**
 * Union of all event types.
 *
 * Events drive the render loop in interactive mode. When events are present,
 * the render loop runs until exit() is called. When events are absent,
 * the render completes when the UI is stable.
 */
export type Event = KeyEvent | MouseEvent | ResizeEvent | FocusEvent | BlurEvent | SignalEvent | CustomEvent

/**
 * Event source that can be subscribed to and unsubscribed from.
 */
export interface EventSource {
  /** Subscribe to events, returns unsubscribe function */
  subscribe(handler: (event: Event) => void): () => void
  /** Convert to async iterable */
  [Symbol.asyncIterator](): AsyncIterator<Event>
}

// ============================================================================
// TermDef - Minimal Render Configuration
// ============================================================================

// ColorLevel is re-exported from chalkx in index.ts
// Import here for use in TermDef
import type { ColorLevel } from "chalkx"

/**
 * Minimal surface for configuring render().
 *
 * TermDef provides a simple way to configure rendering without requiring
 * a full Term instance. It's useful for:
 * - Static rendering (just width/height, no events)
 * - Testing (mock dimensions and events)
 * - Quick scripts (auto-detect everything from stdin/stdout)
 *
 * The presence of `events` (or `stdin` which auto-creates events)
 * determines the render mode:
 * - No events → static mode (render until stable)
 * - Has events → interactive mode (render until exit() called)
 *
 * @example
 * ```tsx
 * // Static render with custom width
 * const output = await render(<App />, { width: 100 })
 *
 * // Interactive with stdin/stdout
 * await render(<App />, { stdin: process.stdin, stdout: process.stdout })
 *
 * // Custom events
 * await render(<App />, { events: myEventSource })
 * ```
 */
export interface TermDef {
  // -------------------------------------------------------------------------
  // Output Configuration
  // -------------------------------------------------------------------------

  /** Output stream (used for dimensions if not specified) */
  stdout?: NodeJS.WriteStream

  /** Width in columns (default: stdout?.columns ?? 80) */
  width?: number

  /** Height in rows (default: stdout?.rows ?? 24) */
  height?: number

  /** Color support (true=detect, false=none, or specific level) */
  colors?: boolean | ColorLevel | null

  // -------------------------------------------------------------------------
  // Input Configuration
  // -------------------------------------------------------------------------

  /**
   * Event source for interactive mode.
   *
   * When present, render runs until exit() is called.
   * When absent, render completes when UI is stable.
   */
  events?: AsyncIterable<Event> | EventSource

  /**
   * Standard input stream.
   *
   * When provided (and events is not), automatically creates input events
   * from stdin, enabling interactive mode.
   */
  stdin?: NodeJS.ReadStream
}

// ============================================================================
// Render Context Types
// ============================================================================

/**
 * Options passed to the render function.
 */
export interface RenderOptions {
  stdout?: NodeJS.WriteStream
  stdin?: NodeJS.ReadStream
  exitOnCtrlC?: boolean
  debug?: boolean
}

/**
 * The render instance returned by render().
 */
export interface RenderInstance {
  /** Re-render with new element */
  rerender: (element: React.ReactNode) => void
  /** Unmount and clean up */
  unmount: () => void
  /** Wait for render to complete */
  waitUntilExit: () => Promise<void>
  /** Clear terminal output */
  clear: () => void
}
