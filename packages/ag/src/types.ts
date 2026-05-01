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
 *
 * Mouse selection is document/tree-aware by default: the active scope is the
 * nearest common selectable ancestor of the drag anchor and focus. `contain`
 * keeps its CSS meaning as an explicit hard boundary.
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
// Caret Types (layout output — peer of boxRect/scrollRect/screenRect)
// ============================================================================

/**
 * Terminal cursor shape (DECSCUSR).
 *
 * @deprecated Target-specific. Lives in core only as a back-compat alias for the
 * `CursorOffset.shape` deprecation cycle (see {@link CursorOffset.shape}). The
 * canonical home is `@silvery/ag-term/output#CursorShape`. Cross-target
 * renderers (canvas / DOM) must not branch on this enum — instead, they read
 * the focused-editable bit from `LayoutSignals` and map to whatever caret
 * concept their target supports. Removed in the next cycle.
 *
 * Lower-case names match the DECSCUSR vocabulary: `block` (steady #2),
 * `underline` (steady #4), `bar` (steady #6).
 */
export type CursorShape = "block" | "underline" | "bar"

/**
 * Component-relative caret position declared as a Box prop.
 *
 * When set on a Box, the layout phase computes the absolute terminal
 * coordinates by adding the parent's `scrollRect` + the box's border + padding
 * + this offset. The result is exposed via `LayoutSignals.cursorRect` and read
 * by the scheduler's cursor-suffix emission. The caret naming reflects the
 * cross-target nature: in the terminal it manifests as the hardware cursor,
 * but on canvas/DOM targets it's the text-input caret rectangle.
 *
 * This is the "caret as layout output" path — it bypasses the React effect
 * chain entirely (`useCursor` → `useScrollRect` → `setCursorState`) so the
 * very first frame after mount emits the correct caret positioning ANSI.
 * See bead `km-silvery.view-as-layout-output` (Phase 2),
 * `km-silvery.cursor-invariants`, and `km-silvercode.cursor-startup-position`.
 */
export interface CursorOffset {
  /** Column offset within the box's content area (0-indexed) */
  col: number
  /** Row offset within the box's content area (0-indexed) */
  row: number
  /** Whether the caret should be visible. Default: true */
  visible?: boolean
  /**
   * Terminal cursor shape (DECSCUSR).
   *
   * @deprecated Target-specific — DO NOT use in new code. The terminal layer
   * (`@silvery/ag-term`) derives the shape from focus + editable state at
   * scheduler/output time via the caretStyle map. Cross-target consumers
   * (canvas / DOM) ignore this field. Accepted for one cycle for back-compat;
   * removed in the next major. See `km-silvery.cursor-invariants` invariant 6.
   */
  shape?: CursorShape
}

/**
 * Semantic selection intent declared on a Box — the user's "selected
 * substring" within this node's text content, expressed as character offsets.
 *
 * This is the **input** half of the selection-as-overlay model (Phase 4b of
 * `km-silvery.view-as-layout-output`):
 *
 *  - **Input** (this type): `selectionIntent` — what the user wants selected.
 *  - **Output** (`LayoutSignals.selectionFragments`): the resolved list of
 *    rectangles (one per visual line spanned). Computed during the layout
 *    pass; consumed by the selection renderer to paint highlight bg.
 *
 * Mirrors `CursorOffset`'s shape: a small declarative payload on the owning
 * Box. The layout phase runs `computeSelectionFragments(node)` to derive the
 * geometric fragments and pushes them onto the per-node signal. Components
 * like `TextArea`, `Text` (when selectable), or any node with a selected
 * substring can declare this prop.
 *
 * **Rules**:
 *  - `from` and `to` are character offsets into the rendered text content of
 *    the owning node (post-render, post-wrap). The fragment computation
 *    walks the node's text layout to map offsets to visual rectangles.
 *  - `from <= to`. A collapsed selection (`from === to`) produces zero
 *    fragments — caret rendering is `cursorOffset`'s job.
 *  - `null`/`undefined` on a Box means "no selection on this node" — that
 *    node contributes no fragments.
 *  - Multiple Boxes may declare `selectionIntent` simultaneously; the
 *    aggregator (`findActiveSelectionFragments(root)`) concatenates fragments
 *    from all currently-mounted declarers (Phase 4b — multi-node selection
 *    is left for a future enhancement; v1 concatenation already covers the
 *    "two adjacent nodes both selected" case).
 *
 * **Cross-target hygiene**: this type is purely semantic (offsets only). The
 * resolved `Rect[]` output and the actual highlight bg color stay terminal-
 * specific (or canvas/DOM-specific in future targets). Tracking bead:
 * `km-silvery.phase4-split-focus-selection`.
 */
export interface SelectionIntent {
  /**
   * Inclusive start offset (character index into the owning node's rendered
   * text content). Must be `>= 0` and `<= text.length`.
   */
  from: number
  /**
   * Exclusive end offset (character index). Must be `>= from` and
   * `<= text.length`. When `from === to` the selection is collapsed and
   * produces zero fragments.
   */
  to: number
}

// ============================================================================
// Overlay / Anchor Types (Phase 4c — overlay-anchor v1)
// ============================================================================

/**
 * Edge of an anchor's content rect that a decoration can attach to. Mirrors
 * CSS Anchor Positioning's edge vocabulary. `"center"` is reserved for v2
 * (centerline placement modes); v1 only emits the four cardinal-edge rects.
 *
 * Used by the placement algorithm in `placeFloating` to decide WHERE on the
 * anchor's bounding rect to start measuring from.
 */
export type AnchorEdge = "top" | "bottom" | "left" | "right"

/**
 * Twelve-placement vocabulary for floating decorations relative to an anchor
 * rect. The first segment names the side of the anchor the floating element
 * lives on; the second segment names the alignment along the perpendicular
 * axis (start, center, end). Mirrors Floating UI / Popper.js's vocabulary so
 * apps moving between targets can carry placement intent verbatim.
 *
 * v1 is **fixed-placement only** — the placement string maps deterministically
 * to a rect via `placeFloating`. Collision-aware auto-flip + auto-shift are
 * out of scope (v2). Apps that need flip behavior should detect overflow
 * themselves and pick a different placement.
 */
export type Placement =
  | "top-start"
  | "top-center"
  | "top-end"
  | "bottom-start"
  | "bottom-center"
  | "bottom-end"
  | "left-start"
  | "left-center"
  | "left-end"
  | "right-start"
  | "right-center"
  | "right-end"

/**
 * Declarative overlay attached to a Box. The substrate v1 shipped here covers
 * three kinds — popover, tooltip, highlight — that share the "decoration
 * derived from semantic intent during layout" shape. Caret / focus / selection
 * keep their dedicated BoxProps (`cursorOffset`, `focused`, `selectionIntent`)
 * for ergonomic + back-compat reasons; everything else routes through
 * `decorations`.
 *
 * **`kind`** drives the geometry computation:
 *   - `"popover"` and `"tooltip"`: anchor-relative placement via
 *     `placeFloating(anchorRect, size, placement)`. The `placement` field is
 *     required (no implicit default — apps must say where they want it).
 *     `content` is opaque to the substrate — the renderer owns rendering.
 *   - `"highlight"`: a rect-list output describing visible-line fragments
 *     within the owning Box's content area. v1 ships only the bounding rect;
 *     soft-wrap aware fragmentation is implemented in the same way as
 *     `selectionFragments` (Phase 4b) and arrives in v2 once the find/replace
 *     match-highlight first consumer ships.
 *
 * **`id`** is app-chosen, must be unique within a frame, and stable across
 * re-renders (consumers may key React-side state off it).
 *
 * Coordinate space is the same absolute terminal-cell space used by every
 * other rect signal (`cursorRect`, `selectionFragments`, etc.).
 *
 * **Out of scope for v1** (deferred to v2):
 *   - Generic `kind: "custom"` extension hook
 *   - Auto-flip / collision-aware placement
 *   - Z-index / paint-order overrides (paint order is fixed: caret > focus >
 *     selection > decorations > anchors)
 *
 * See `hub/silvery/design/overlay-anchor-system.md` for the design context.
 */
export type Decoration =
  | {
      kind: "popover"
      id: string
      /** Anchor target by id, looked up via `findAnchor(root, anchorId)`. */
      anchorId?: string
      placement?: Placement
      /** Intrinsic size for the floating rect (cells). Required for placement math. */
      size?: { width: number; height: number }
      /** Optional perpendicular offset from the anchor edge (cells). */
      offset?: number
      /** Renderer-owned content. The substrate doesn't inspect this. */
      content?: unknown
    }
  | {
      kind: "tooltip"
      id: string
      anchorId?: string
      placement?: Placement
      size?: { width: number; height: number }
      offset?: number
      content?: unknown
    }
  | {
      kind: "highlight"
      id: string
      /**
       * Highlight rect within the owning Box's content area, expressed in the
       * Box's local content-relative coordinates (origin = contentRect.{x,y},
       * size in cells). v1 emits one rect; soft-wrap fragmentation lands in
       * v2 alongside the find/replace consumer.
       */
      rect?: { x: number; y: number; width: number; height: number }
    }

/**
 * Layout-anchor identifier — names this Box as a lookup target so other
 * Boxes' decorations can reference it via `Decoration.anchorId`.
 *
 * The id is app-chosen, must be unique within a tree, and stable enough across
 * re-renders to survive React reconciliation without identity churn (use a
 * literal string from props, not a `useId()` value, unless you persist it).
 *
 * Anchors are recorded into a tree-scoped map at the end of layout phase by
 * `findAnchor(root, id)`. The map's value is the Box's `contentRect` (full
 * inner area) — placement math then derives edge rects via `placeFloating`.
 */
export interface AnchorRef {
  id: string
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
  alignContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "stretch"
    | "space-between"
    | "space-around"
    | "space-evenly"
  justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly"

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
  /**
   * Child index to ensure visible. Declarative — the Box fires edge-based
   * ensure-visible when this value CHANGES (or on mount). Re-renders with
   * the same value are no-ops; content-height changes do not re-trigger
   * the ensure-visible pass.
   *
   * This "fire on change" semantic prevents viewport jumps when a visible
   * child grows (e.g. user clicks to expand a collapsible row): the Box no
   * longer re-anchors on every render. Matches the convention used by
   * `@tanstack/virtual`, `react-window`, iOS `UIScrollView.setContentOffset`
   * — imperative intent is separate from declarative anchor state.
   *
   * To re-fire ensure-visible against the SAME target (e.g. "scroll to
   * cursor, even though cursor didn't change"), toggle the value via undefined
   * first, or drive scroll via the explicit `scrollOffset` prop.
   */
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
 * Named underline styles — the string half of `underline: boolean | UnderlineStyleName`.
 * Excludes `false` so the boolean-or-string union doesn't have two falsy branches.
 */
export type UnderlineStyleName = Exclude<UnderlineStyle, false>

/**
 * Style properties for text rendering.
 */
export interface StyleProps {
  color?: string
  backgroundColor?: string
  bold?: boolean
  italic?: boolean
  /**
   * Enable underline. Accepts:
   * - `true` — standard single underline (equivalent to `"single"`)
   * - `false` — no underline
   * - `"single" | "double" | "curly" | "dotted" | "dashed"` — specific style variant
   *
   * A style name is equivalent to setting `underline=true` with that style.
   */
  underline?: boolean | UnderlineStyleName
  /**
   * @deprecated Pass the style name directly to `underline` instead
   * (e.g. `underline="curly"`). `underlineStyle` is retained for backwards
   * compatibility and still takes precedence over `underline` when both are set.
   * Will be removed in a future major.
   */
  underlineStyle?: UnderlineStyle
  /**
   * Underline color (independent of text color).
   * Uses SGR 58 (underline color). Falls back to text color if not specified.
   */
  underlineColor?: string
  /**
   * Overline the cell — SGR 53/55. Independent of underline.
   *
   * SGR 53 places a line ABOVE the character cell; SGR 55 removes it.
   * Use this for top-edge indicators (e.g. overscroll-at-top), where an
   * underline on the first row would read as "this row is underlined" rather
   * than "you're bumped against the top". Overline on the top row and
   * underline on the bottom row are the semantically correct pair.
   *
   * Supported by most modern terminals (Ghostty, iTerm2, xterm with
   * `allowExtendedUnderlines` equivalent). The output phase skips SGR 53/55
   * when {@link TerminalCaps#overline} is false.
   */
  overline?: boolean
  /**
   * Overline color — reserved. Currently not plumbed through the pipeline;
   * see bead `km-silvery.overline-color` for the follow-up that mirrors
   * {@link underlineColor}'s SGR 58 wiring for overline. Setting this today
   * is a no-op.
   */
  overlineColor?: string
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
   * Outline style — renders border characters OUTSIDE the box without affecting layout.
   *
   * Unlike `borderStyle` which adds border dimensions inside the box (shrinking the
   * content area), `outlineStyle` draws one cell beyond each edge — in the gap/margin
   * space between siblings. The layout engine sees no border at all.
   *
   * This matches CSS `outline` semantics: outside the border box, no layout impact.
   *
   * Use cases: focus rings, hover highlights, selection indicators, edit bounds —
   * anything that should visually frame a box without affecting layout or content.
   */
  outlineStyle?:
    | "single"
    | "double"
    | "round"
    | "bold"
    | "singleDouble"
    | "doubleSingle"
    | "classic"
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
  theme?: import("@silvery/ansi").Theme

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

  /**
   * Capture pointer-style mouse events after mousedown.
   *
   * When true, a mousedown inside this node makes subsequent mousemove and
   * mouseup events for that press bubble from this node even if the cursor
   * leaves its one-cell hit box. Hover enter/leave still follows the real
   * cursor target. This is the terminal equivalent of pointer capture for
   * narrow draggable controls such as scrollbars.
   */
  mouseCapture?: boolean

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

  /**
   * Declarative focus marker — "this Box is focused." When set on a Box, the
   * layout phase writes the node's id (or testID) to `LayoutSignals.focusedNodeId`
   * and the focus-renderer reads from that signal to paint the focus ring /
   * dim styling — bypassing the `useFocus` → `FocusManager` → `useSyncExternalStore`
   * chain on the first frame after mount.
   *
   * This is the **focus-as-layout-output** path (Phase 4a of
   * `km-silvery.view-as-layout-output`). It mirrors `cursorOffset` exactly:
   * a semantic boolean declared on the outer Box, resolved into a layout
   * signal during `syncRectSignals`, with a tree-walk lookup
   * (`findActiveFocusedNodeId`) that the renderer / scheduler consumes.
   *
   * **Precedence across nodes** (mirrors cursor invariant 1):
   * 1. Deepest visible focused declarer in paint-order wins. If two siblings
   *    both have `focused === true`, the post-order tree walk picks the
   *    later-rendered one — consistent with cursor's deepest-wins fallback.
   * 2. Otherwise null.
   *
   * **Identity**: the signal value is the node's `id` if present, else its
   * `testID`, else null. Apps that need stable focus identity should set one
   * of those props alongside `focused={true}`.
   *
   * **Cross-target hygiene**: `focused` is a semantic boolean. Terminal-specific
   * focus styling (dim, bold borders, focus ring) lives in `@silvery/ag-term`
   * or component-level styling. Canvas/DOM targets read the same id-level
   * signal but render their own focus indicator.
   *
   * **Back-compat**: `useFocus` continues to work as a deprecated wrapper that
   * routes through the legacy `FocusManager` path. Migrate to `focused={…}`
   * to opt into the layout-output path.
   */
  focused?: boolean

  /**
   * Component-relative caret position. When set, the layout phase computes
   * absolute terminal coordinates (border + padding + offset relative to the
   * box's `scrollRect`) and writes them to `LayoutSignals.cursorRect`. The
   * scheduler reads this value to emit caret positioning ANSI on the very
   * first frame after mount — bypassing the React effect chain that
   * `useCursor` relies on.
   *
   * This is the "caret as layout output" path. The legacy `useCursor` hook
   * remains as a back-compat wrapper but its signal-effect bridge is unsafe
   * across conditional mounts (see `km-silvercode.cursor-startup-position`).
   *
   * **Precedence across nodes** (locked by `km-silvery.cursor-invariants` #1):
   * 1. Focused-editable wins — a Box that is `focused` AND has visible
   *    `cursorOffset` always beats a non-focused declarer.
   * 2. Otherwise deepest-in-paint-order (post-order tree walk) wins.
   * 3. Otherwise null.
   *
   * **Clipping** (invariant #4): if the caret falls outside the nearest
   * `overflow="scroll"` / `"hidden"` ancestor's visible region, it is hidden
   * (no caret ANSI emitted, signal returns null). Caret rect at the exact
   * clip edge is treated as visible.
   */
  cursorOffset?: CursorOffset

  /**
   * Semantic selection intent — the user's selected substring within this
   * Box's text content, declared as character offsets `{ from, to }`. The
   * layout phase resolves this into a list of rectangles
   * (`LayoutSignals.selectionFragments`) that the selection renderer reads
   * to paint highlight bg.
   *
   * This is the **selection-as-overlay** path (Phase 4b of
   * `km-silvery.view-as-layout-output`). It mirrors `cursorOffset` exactly:
   * a semantic declaration on the outer Box, resolved into geometric output
   * during `syncRectSignals`, with a tree-walk lookup
   * (`findActiveSelectionFragments`) that the renderer consumes.
   *
   * **Geometry**:
   * - Collapsed (`from === to`) → zero fragments. Caret rendering is
   *   `cursorOffset`'s responsibility, not selection's.
   * - Single visual line → one rectangle from `from` to `to`.
   * - Multi-line (text contains `\n` characters) → one rectangle per visual
   *   line: the first runs from `from` to end-of-line, middle lines span the
   *   full content area width, the last runs from start-of-line to `to`.
   * - Wrap-aware fragment computation across word-wrapped visual lines is
   *   limited in v1 — only embedded `\n` produces multi-line fragments. A
   *   future iteration will register a wrap measurer so soft-wrapped text
   *   produces the correct per-visual-line fragments. Track at
   *   `km-silvery.overlay-anchor-system` (Phase 4c).
   *
   * **Multi-node selection**: each Box declares its own intent;
   * `findActiveSelectionFragments(root)` concatenates fragments across all
   * mounted declarers. Two adjacent nodes both selected is supported. Full
   * cross-node range selection (selecting from middle of node A through
   * node B) is a future enhancement.
   *
   * **Cross-target hygiene**: `selectionIntent` is purely semantic. The
   * resolved `Rect[]` is purely geometric. Terminal-specific bg highlight
   * styling lives in `@silvery/ag-term` (selection-renderer); canvas/DOM
   * targets read the same fragments and render their own highlight.
   *
   * **Back-compat**: `useSelection` continues to work as a deprecated
   * wrapper that reads from the legacy `SelectionFeature` capability.
   * Migrate to `selectionIntent={…}` to opt into the layout-output path.
   */
  selectionIntent?: SelectionIntent

  /**
   * Names this Box as a layout-anchor lookup target. Other Boxes' decorations
   * can reference the id via `Decoration.anchorId` and the substrate resolves
   * the position via `findAnchor(root, id)`.
   *
   * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1). The
   * registered rect is the Box's `contentRect` (border + padding excluded);
   * edge-specific rects are derived by `placeFloating` at consumption time.
   *
   * Pass a string for the simple case (`anchorRef="dropdown-trigger"`) or an
   * AnchorRef object if a future v2 wants to extend with edge metadata.
   *
   * **Stability**: ids should be stable across re-renders — React reconciler
   * preserves the AgNode identity, but registering a new id per render makes
   * `findAnchor` flap and breaks decoration layout. Use a literal string from
   * props, not a `useId()` value, unless persisted.
   */
  anchorRef?: string | AnchorRef

  /**
   * Declarative overlays attached to this Box — popovers, tooltips,
   * highlights. Each entry is resolved into a geometric `DecorationRect` in
   * `LayoutSignals.decorationRects` during layout phase, and aggregated into
   * the per-frame `OverlayLayer` artifact returned alongside `term.frame`.
   *
   * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
   *
   * **Paint order** is fixed (no z-index): caret > focus > selection >
   * decorations > anchors. Within `decorations` itself, list order determines
   * paint order (later entries paint on top of earlier ones).
   *
   * **Anchor lookup**: popover/tooltip kinds reference an `anchorId`; the
   * substrate calls `findAnchor(root, id)` at layout time. If the anchor
   * isn't found this frame, the decoration emits an empty rect list (the
   * renderer skips it). This is the v1 fixed-placement contract — collision
   * detection and auto-flip are deferred to v2.
   *
   * **Stable identity**: pass a memoized array if React's referential equality
   * matters for downstream consumers; the substrate itself recomputes
   * decoration rects every layout pass, so referential identity isn't load-
   * bearing on the substrate side.
   */
  decorations?: readonly Decoration[]

  /**
   * Virtualization-internal: set only by virtual list placeholders (e.g.
   * ListView's leading/trailing spacer Boxes). **Do not set on ordinary Box
   * children** — the default (1 visual = 1 logical item) is correct.
   *
   * For a child of an `overflow="scroll"` container: declare that this child
   * is a placeholder representing multiple logical items. When the child is
   * fully scrolled out above/below the viewport, the parent's
   * `hiddenAbove`/`hiddenBelow` count is incremented by this value instead of
   * 1, so `▲N`/`▼N` indicators reflect real items rather than rendered
   * placeholder boxes.
   *
   * Only read by the parent scroll container. Defaults to 1 (treat as a
   * single visual item). Must be >= 0.
   *
   * @internal
   */
  representsItems?: number
}

/**
 * Props for Text component.
 */
/**
 * Flex item subset of FlexboxProps — the props that make sense on a leaf
 * (Text). Box accepts the full FlexboxProps; Text only accepts the props
 * that affect how it participates as a flex item (sizing, growth, shrink)
 * — not props that affect how it lays out its non-existent children
 * (flexDirection, justifyContent, alignItems, gap, ...).
 *
 * This is the canonical CSS escape hatch: instead of wrapping Text in a
 * Box to apply `flexShrink={0}` or `minWidth={0}`, set them directly on
 * the Text. See bead km-silvery.text-intrinsic-vs-render.
 */
export interface TextFlexItemProps {
  /** CSS `flex-grow` — proportion of free positive space along main axis. */
  flexGrow?: number
  /** CSS `flex-shrink` — proportion of negative free space along main axis. */
  flexShrink?: number
  /** CSS `flex-basis` — initial main-size before grow/shrink distribution. */
  flexBasis?: number | string
  /** Cross-axis self-alignment override. */
  alignSelf?: "auto" | "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
  /** CSS `min-width` — floor for shrink distribution. */
  minWidth?: number | string
  /** CSS `min-height`. */
  minHeight?: number | string
  /** CSS `max-width` — ceiling for grow distribution. */
  maxWidth?: number | string
  /** CSS `max-height`. */
  maxHeight?: number | string
}

export interface TextProps extends StyleProps, TextFlexItemProps, TestProps, MouseEventProps {
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
   * Outlines do NOT get a dirty bit — the decoration phase redraws them
   * every frame with per-cell snapshots (see pipeline/decoration-phase.ts).
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
   * Render-phase flag: "did this Box have an attr overlay (underline /
   * strikethrough / etc.) applied in the previous frame?" Written by the
   * render phase after `applyBoxAttrOverlay`. Read next frame to decide
   * whether `stylePropsDirty` on the Box must escalate to `contentAreaAffected`
   * (so the prev-frame merge-attr bits can be cleared via re-render).
   *
   * `mergeAttrsInRect` OR-combines — it can't clear bits. So when a Box's
   * attr overlay goes away (true → false, or style change), the clone buffer
   * still carries the old attr bits. This flag lets us detect the "had overlay
   * in prev frame" case without storing prev props.
   *
   * Only meaningful for silvery-box nodes. Defaults to undefined / false.
   * @internal
   */
  hadBoxAttrOverlay?: boolean

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
    /**
     * The `scrollTo` prop value processed in the previous frame.
     *
     * Used to distinguish "new intent" (scrollTo changed — user pressed a key
     * or an external setter moved the target) from "same intent" (scrollTo
     * unchanged — this frame is just a re-render caused by content growth or
     * style changes).
     *
     * Edge-based ensure-visible fires for NEW intent. Same intent skips
     * re-anchoring when the target's top edge is still in the viewport —
     * otherwise growing a visible item would shift the viewport down and
     * push content above it out of view ("the whole page jumps on click").
     */
    prevScrollTo?: number
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
export type Event =
  | KeyEvent
  | MouseEvent
  | ResizeEvent
  | FocusEvent
  | BlurEvent
  | SignalEvent
  | CustomEvent

/**
 * Event source that can be subscribed to and unsubscribed from.
 */
export interface EventSource {
  /** Subscribe to events, returns unsubscribe function */
  subscribe(handler: (event: Event) => void): () => void
  /** Convert to async iterable */
  [Symbol.asyncIterator](): AsyncIterator<Event>
}
