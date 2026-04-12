/**
 * Silvery Types
 *
 * Core types for the Silvery renderer architecture.
 */

import type { DragEventProps } from "./drag-event-types"
import type { FocusEventProps } from "./focus-events"
import type { LayoutNode } from "./layout-types"
import type { MouseEventProps } from "./mouse-event-types"

// ============================================================================
// Layout Types
// ============================================================================

// ============================================================================
// Selection Types
// ============================================================================

/**
 * CSS user-select equivalent for controlling text selectability.
 * - "auto": inherit from parent (root resolves to "text")
 * - "none": not selectable
 * - "text": force selectable (overrides parent "none")
 * - "contain": selectable, but selection cannot escape this node's bounds
 */
export type UserSelect = "auto" | "none" | "text" | "contain"

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
// Interactive State Types
// ============================================================================

/**
 * Per-node interactive state — written by pointer/selection/focus state machines,
 * read by theme/render for automatic styling.
 *
 * These are plain mutable booleans, NOT reactive signals. State machines set them
 * synchronously during event processing, and the next render reads them.
 * React re-renders are driven by the event processing, not signal subscriptions.
 *
 * The object is lazily created on first write to avoid overhead on non-interactive nodes.
 */
export interface InteractiveState {
  /** Pointer is over this node (mouseenter/mouseleave) */
  hovered: boolean
  /** Pointer-down on this node, awaiting pointer-up (will receive click) */
  armed: boolean
  /** Node is in the current selection set */
  selected: boolean
  /** Node has keyboard focus */
  focused: boolean
  /** A drag operation is hovering over this node */
  dropTarget: boolean
}

// ============================================================================
// Node Types
// ============================================================================

/**
 * Silvery node types - the primitive elements in the render tree.
 */
export type AgNodeType = "silvery-root" | "silvery-box" | "silvery-text"

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
  alignContent?: "flex-start" | "flex-end" | "center" | "stretch" | "space-between" | "space-around" | "space-evenly"
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
  columnGap?: number
  rowGap?: number

  // Position
  position?: "relative" | "absolute" | "sticky" | "static"

  // Position offsets (used with position='absolute' or position='relative')
  top?: number | string
  left?: number | string
  bottom?: number | string
  right?: number | string

  // Sticky offsets (only used when position='sticky')
  // The element will "stick" when it reaches this offset from the container edge
  stickyTop?: number
  stickyBottom?: number

  // Aspect ratio
  aspectRatio?: number

  // Display
  display?: "flex" | "none"

  // Overflow
  overflow?: "visible" | "hidden" | "scroll"
  overflowX?: "visible" | "hidden"
  overflowY?: "visible" | "hidden"

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

  /**
   * Text size scale factor via OSC 66 (Kitty v0.40+).
   *
   * Float multiplier: 2.0 = double (headings), 1.0 = normal, 0.5 = half (small print).
   * The terminal renders subsequent text at this scale until reset.
   * Requires a terminal that supports the kitty text sizing protocol.
   * Terminals without support silently ignore the escape sequence.
   */
  textSize?: number
}

/**
 * Props for Box component.
 */
export interface BoxProps
  extends FlexboxProps, StyleProps, TestProps, MouseEventProps, DragEventProps, FocusEventProps {
  /** Text truncation mode for child text content (passed through to Text children). */
  wrap?:
    | "wrap"
    | "hard"
    | "even"
    | "truncate"
    | "truncate-start"
    | "truncate-middle"
    | "truncate-end"
    | "clip"
    | boolean
  borderStyle?: "single" | "double" | "round" | "bold" | "singleDouble" | "doubleSingle" | "classic"
  borderColor?: string
  /** Background color for all border sides (shorthand). Per-side props override this. */
  borderBackgroundColor?: string
  /** Background color for the top border (overrides borderBackgroundColor). */
  borderTopBackgroundColor?: string
  /** Background color for the bottom border (overrides borderBackgroundColor). */
  borderBottomBackgroundColor?: string
  /** Background color for the left border (overrides borderBackgroundColor). */
  borderLeftBackgroundColor?: string
  /** Background color for the right border (overrides borderBackgroundColor). */
  borderRightBackgroundColor?: string
  borderTop?: boolean
  borderBottom?: boolean
  borderLeft?: boolean
  borderRight?: boolean

  /**
   * Outline style — renders border characters at the box edges without affecting layout.
   *
   * Unlike `borderStyle` which adds border dimensions to the layout (making the content
   * area smaller), `outlineStyle` draws border characters that OVERLAP the content area.
   * The layout engine sees no border at all — outline is purely visual.
   *
   * Use cases: selection indicators, hover highlights, focus rings — anything that
   * should visually frame a box without shifting content.
   */
  outlineStyle?: "single" | "double" | "round" | "bold" | "singleDouble" | "doubleSingle" | "classic"
  /** Foreground color for the outline */
  outlineColor?: string
  /** Apply dim styling to the outline */
  outlineDimColor?: boolean
  /** Show top outline edge (default: true) */
  outlineTop?: boolean
  /** Show bottom outline edge (default: true) */
  outlineBottom?: boolean
  /** Show left outline edge (default: true) */
  outlineLeft?: boolean
  /** Show right outline edge (default: true) */
  outlineRight?: boolean

  /**
   * Override theme for this subtree — $token colors resolve against this theme.
   * Pushed onto the context theme stack during render phase tree walk.
   */
  theme?: import("@silvery/theme").Theme

  /** CSS pointer-events equivalent. "none" makes this node and its subtree invisible to hit testing. */
  pointerEvents?: "auto" | "none"

  /**
   * CSS user-select equivalent. Controls whether text in this node is selectable.
   * - "auto" (default): inherit from parent. Root resolves to "text".
   * - "none": not selectable. Mouse-drag on this node does not start text selection.
   * - "text": force selectable, even if parent is "none".
   * - "contain": selectable, but selection range cannot escape this node's bounds.
   */
  userSelect?: UserSelect

  /**
   * Whether this node can be dragged via mouse.
   * When true, mousedown + drag past threshold initiates a node drag gesture
   * instead of text selection. Not inherited — only the node with draggable=true
   * is draggable, not its children.
   */
  draggable?: boolean

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
  wrap?:
    | "wrap"
    | "hard"
    | "even"
    | "truncate"
    | "truncate-start"
    | "truncate-middle"
    | "truncate-end"
    | "clip"
    | boolean
  /** Internal transform function applied to each rendered line. Used by Transform component. */
  internal_transform?: (line: string, index: number) => string
}

/**
 * The core Silvery node - represents an element in the render tree.
 *
 * Each node has:
 * - A Yoga node for layout calculation
 * - Computed layout after Yoga runs
 * - Subscribers that get notified when layout changes
 * - Dirty flags for incremental updates
 */
export interface AgNode {
  /** Node type */
  type: AgNodeType

  /** Props passed to this node */
  props: BoxProps | TextProps | Record<string, unknown>

  /** Child nodes */
  children: AgNode[]

  /** Parent node (null for root) */
  parent: AgNode | null

  /** The layout node for layout calculation (null for raw text nodes) */
  layoutNode: LayoutNode | null

  /** Computed layout from previous render (for change detection) */
  prevLayout: Rect | null

  /**
   * Content-relative position (like CSS offsetTop/offsetLeft).
   * Position within the scrollable content, ignoring scroll offsets.
   * Set after layout phase.
   */
  boxRect: Rect | null

  /**
   * Screen-relative position (like CSS getBoundingClientRect).
   * Actual position on the terminal screen, accounting for scroll offsets.
   * Set after screen rect phase.
   *
   * Note: For sticky children, this reflects the node's layout position
   * adjusted for scroll offsets, NOT the actual render position. Use
   * `screenRect` for the actual pixel position on screen.
   */
  scrollRect: Rect | null

  /** Previous screen rect (for change detection in notifyLayoutSubscribers) */
  prevScrollRect: Rect | null

  /**
   * Actual render position on the terminal screen.
   * For non-sticky nodes, this equals `scrollRect`.
   * For sticky nodes (position="sticky"), this accounts for sticky render
   * offsets — the position where pixels are actually painted.
   *
   * Use this for hit testing, cursor positioning, and any feature that
   * needs to know where a node visually appears on screen.
   * Set after screen rect phase.
   */
  screenRect: Rect | null

  /** Previous render rect (for change detection) */
  prevScreenRect: Rect | null

  /** Epoch when layout changed (position or size).
   *  Set by propagateLayout in layout phase. Compared against renderEpoch by render phase.
   *  This is the authoritative signal for "did layout change?" — unlike
   *  !rectEqual(prevLayout, boxRect) which becomes stale when layout
   *  phase skips (no dirty nodes).
   *  Value: renderEpoch when dirty, INITIAL_EPOCH (-1) when clean. */
  layoutChangedThisFrame: number

  /**
   * Bit-packed dirty flags for the current epoch.
   *
   * Seven dirty flags packed into a single number:
   *   bit 0 (CONTENT_BIT):        content changed (text content or content-affecting props)
   *   bit 1 (STYLE_PROPS_BIT):    visual props changed (color, bg, border, etc.)
   *   bit 2 (BG_BIT):             backgroundColor specifically changed
   *   bit 3 (CHILDREN_BIT):       direct children added/removed/reordered
   *   bit 4 (SUBTREE_BIT):        this node or any descendant has dirty content/layout
   *   bit 5 (ABS_CHILD_BIT):      absolute child had structural changes
   *   bit 6 (DESC_OVERFLOW_BIT):  descendant overflow changed
   *
   * Check: `isDirty(node.dirtyBits, node.dirtyEpoch, BIT)`
   * Set:   `node.dirtyBits = setDirtyBit(node.dirtyBits, node.dirtyEpoch, BIT); node.dirtyEpoch = getRenderEpoch()`
   * Clear: `advanceRenderEpoch()` — all nodes instantly become clean
   *
   * NOTE: measure phase may clear CONTENT_BIT — STYLE_PROPS_BIT acts as the
   * surviving witness for style changes. See render-phase.ts contentAreaAffected.
   */
  dirtyBits: number

  /**
   * Epoch when dirtyBits was last written.
   * When `dirtyEpoch !== renderEpoch`, all bits are stale (node is clean).
   * Value: renderEpoch when any bit is dirty, INITIAL_EPOCH (-1) when clean.
   */
  dirtyEpoch: number

  /** Text content for text nodes */
  textContent?: string

  /** True if this is a raw text node (created by createTextInstance) */
  isRawText?: boolean

  /** True if this node is hidden (for Suspense support) */
  hidden?: boolean

  /** Sticky children with computed render positions (for non-scroll containers).
   *  When a parent has sticky children but is NOT a scroll container, this array
   *  holds the computed render offsets. Same shape as scrollState.stickyChildren. */
  stickyChildren?: Array<{
    /** Index of the sticky child */
    index: number
    /** Computed Y offset to render at (relative to parent content area) */
    renderOffset: number
    /** Original natural Y position (relative to parent content area) */
    naturalTop: number
    /** Height of the sticky element */
    height: number
  }>

  /** Inline rects for virtual text nodes (no layout node). Computed during text rendering.
   *  Array for wrapped text (one rect per line fragment). Enables hit testing on nested Text. */
  inlineRects?: Array<{ x: number; y: number; width: number; height: number }> | null

  /**
   * Interactive state signals — written by pointer/selection/focus state machines,
   * read by theme/render for automatic styling (hover highlights, focus rings, etc.).
   *
   * Lazily created on first write. Null means no interactive state has been set.
   * See InteractiveState for field docs.
   */
  interactiveState?: InteractiveState | null

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
  /** Kitty event type. Requires Kitty flag 2. */
  eventType?: "press" | "repeat" | "release"
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
