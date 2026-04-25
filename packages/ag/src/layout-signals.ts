/**
 * withLayoutSignals — reactive signal layer for AgNode layout outputs.
 *
 * Composable plugin that wraps an AgNode with reactive signals for layout
 * rects, text content, and focus state. Engine-agnostic — works with
 * Flexily, Yoga, or any future layout engine.
 *
 * Signals are WeakMap-backed and lazily created. Nodes without subscribers
 * pay zero cost. After layout completes, the pipeline calls `syncSignals()`
 * to propagate imperative state into signals.
 *
 * ## Usage
 *
 * ```ts
 * import { getLayoutSignals, syncSignals } from "@silvery/ag/layout-signals"
 *
 * // Get (or create) signals for a node
 * const signals = getLayoutSignals(node)
 * signals.boxRect()       // read current rect
 * signals.textContent()   // read current text
 *
 * // After layout/reconciler mutations, sync imperative → reactive
 * syncSignals(node)
 * ```
 *
 * ## Three-layer stack
 *
 * Layer 0: alien-signals (signal, computed, effect)
 * Layer 1: getLayoutSignals() — this module (@silvery/ag, framework-agnostic)
 * Layer 2: useSignal(signal) — @silvery/ag-react (React bridge)
 * Layer 3: useBoxRect(), useAgNode() — semantic convenience hooks
 */

import { signal } from "@silvery/signals"
import type { AgNode, BoxProps, CursorShape, Rect } from "./types"
import { rectEqual } from "./types"

// ============================================================================
// Types
// ============================================================================

/**
 * Writable signal — call with no args to read, call with value to write.
 */
type WritableSignal<T> = {
  (): T
  (value: T): void
}

/**
 * Reactive projection of `AgNode.scrollState` — the layout-phase's pixel-space
 * truth about what's visible in an `overflow="scroll"` container.
 *
 * This is the **single source of truth** that virtualization consumers (like
 * `useVirtualizer` + `ListView`) read to decide which items to render. By
 * subscribing to this signal instead of independently computing their own
 * visible range, consumers cannot diverge from what layout-phase actually
 * laid out on screen.
 *
 * Fields are pixel-space integers already rounded by the layout engine —
 * re-using them (instead of recomputing via `sumHeights`) guarantees
 * `leadingHeight == scrollOffset` by construction.
 *
 * `null` for non-scroll containers and for scroll containers before the first
 * layout pass (bootstrap state — virtualizers must fall back to estimates).
 */
export interface ScrollStateSnapshot {
  /** Current scroll offset in terminal rows (pixel-space, pre-rounded). */
  readonly offset: number
  /** Total content height (all children) in rows. */
  readonly contentHeight: number
  /** Visible height (container height minus borders/padding). */
  readonly viewportHeight: number
  /** Index of the first visible child (flexbox-measured). */
  readonly firstVisibleChild: number
  /** Index of the last visible child (flexbox-measured). */
  readonly lastVisibleChild: number
  /** Count of items hidden above the viewport. */
  readonly hiddenAbove: number
  /** Count of items hidden below the viewport. */
  readonly hiddenBelow: number
}

/**
 * Caret rect — absolute terminal coordinates of the caret declared on a
 * Box via `cursorOffset`, computed during the layout phase as the peer of
 * `scrollRect` / `screenRect` / `boxRect` / `contentRect`.
 *
 * Width/height are always 1 (the caret occupies a single cell). The
 * `visible` flag is a separate property because layout still computes the
 * coordinates even when the caret is hidden — that lets toggling
 * `visible` re-emit the caret without re-running layout.
 *
 * `shape` is **deprecated** — the terminal layer now derives the shape
 * from focus + editable state via `resolveCaretStyle` in `@silvery/ag-term`.
 * The field is kept for one cycle so external readers that were already
 * forwarding `cursor.shape` to DECSCUSR keep working; new code MUST NOT
 * branch on this field. See bead `km-silvery.cursor-invariants` invariant 6.
 */
export interface CursorRect {
  /** Absolute terminal X column (0-indexed) */
  readonly x: number
  /** Absolute terminal Y row (0-indexed) */
  readonly y: number
  /** Whether the caret should be visible on this frame. */
  readonly visible: boolean
  /**
   * @deprecated Target-specific. Read focus state from the active cursor
   * node via `resolveCaretStyle` in `@silvery/ag-term` instead. Removed in
   * the next cycle.
   */
  readonly shape?: CursorShape
}

function cursorRectEqual(a: CursorRect | null, b: CursorRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.visible === b.visible && a.shape === b.shape
}

/**
 * All reactive signals for an AgNode.
 *
 * Combined rect signals (layout outputs) + node signals (content/state).
 * One interface, one WeakMap, one sync function.
 */
export interface LayoutSignals {
  // Layout rects (synced after layout + scroll + sticky phases)
  readonly boxRect: WritableSignal<Rect | null>
  readonly scrollRect: WritableSignal<Rect | null>
  readonly screenRect: WritableSignal<Rect | null>

  /**
   * Content-box rect — `boxRect` minus border and padding (CSS content area).
   * Peer of `boxRect`/`scrollRect`/`screenRect`, synced after layout. Null
   * when the node has no boxRect yet (pre-layout) or is not a Box.
   *
   * This is the canonical origin for caret positioning, popover anchors,
   * selection fragments, and any feature that needs to draw "inside" a Box's
   * content area without re-deriving the border/padding math at the call
   * site. `computeCursorRect` reads from this rect — Phase 4 / overlay-anchor
   * work will too. See `km-silvery.cursor-invariants` invariant 3.
   */
  readonly contentRect: WritableSignal<Rect | null>

  /**
   * Absolute terminal coordinates of the caret declared by this node's
   * `BoxProps.cursorOffset`. Null when the node has no cursorOffset prop, or
   * before the first layout pass populates `scrollRect`.
   *
   * Phase 2 of `km-silvery.view-as-layout-output` — the scheduler reads this
   * signal (rather than `cursorStore.getCursorState()`) to emit caret
   * positioning ANSI. Because layout phase runs synchronously before each
   * render, the very first frame after mount sees the correct caret — no
   * effect-chain stale-read on conditional mounts.
   */
  readonly cursorRect: WritableSignal<CursorRect | null>

  // Scroll state for overflow="scroll" containers (null otherwise, or until
  // first layout pass). Peer of rect signals — synced by syncRectSignals.
  readonly scrollState: WritableSignal<ScrollStateSnapshot | null>

  // Node state (synced from reconciler + focus manager)
  readonly textContent: WritableSignal<string | undefined>
  readonly focused: WritableSignal<boolean>
}

// ============================================================================
// Cache
// ============================================================================

const signalMap = new WeakMap<AgNode, LayoutSignals>()

/**
 * Get or create layout signals for a node.
 *
 * Lazily created on first access. Automatically garbage-collected
 * when the node is removed from the tree (WeakMap semantics).
 */
export function getLayoutSignals(node: AgNode): LayoutSignals {
  let s = signalMap.get(node)
  if (!s) {
    s = {
      boxRect: signal<Rect | null>(node.boxRect),
      scrollRect: signal<Rect | null>(node.scrollRect),
      screenRect: signal<Rect | null>(node.screenRect),
      contentRect: signal<Rect | null>(computeContentRect(node)),
      cursorRect: signal<CursorRect | null>(computeCursorRect(node)),
      scrollState: signal<ScrollStateSnapshot | null>(snapshotScrollState(node)),
      textContent: signal<string | undefined>(node.textContent),
      focused: signal<boolean>(node.interactiveState?.focused ?? false),
    }
    signalMap.set(node, s)
  }
  return s
}

/**
 * Compute the content-box rect for a node — `scrollRect` minus border and
 * padding (CSS content area in absolute terminal coordinates).
 *
 * Returns null when `scrollRect` is not yet populated (pre-layout) or when
 * border + padding would shrink the area to zero/negative width or height
 * (clipped/empty content area).
 *
 * The math is the canonical "border + padding" calculation that the layout
 * engine uses internally. Lifted here so consumers (cursor positioning,
 * popover anchors, selection overlays) read one signal instead of re-deriving
 * the offsets at every call site.
 */
export function computeContentRect(node: AgNode): Rect | null {
  const props = node.props as BoxProps | undefined
  const scroll = node.scrollRect
  if (!scroll) return null

  // Border + padding offsets. Per the layout engine's own precedence:
  // paddingLeft / paddingRight / paddingTop / paddingBottom
  //   override paddingX / paddingY which override `padding` shorthand.
  const padLeft = props?.paddingLeft ?? props?.paddingX ?? props?.padding ?? 0
  const padRight = props?.paddingRight ?? props?.paddingX ?? props?.padding ?? 0
  const padTop = props?.paddingTop ?? props?.paddingY ?? props?.padding ?? 0
  const padBottom = props?.paddingBottom ?? props?.paddingY ?? props?.padding ?? 0
  const borderLeft = props?.borderStyle ? 1 : 0
  const borderRight = props?.borderStyle ? 1 : 0
  const borderTop = props?.borderStyle ? 1 : 0
  const borderBottom = props?.borderStyle ? 1 : 0

  const x = scroll.x + borderLeft + padLeft
  const y = scroll.y + borderTop + padTop
  const width = scroll.width - borderLeft - borderRight - padLeft - padRight
  const height = scroll.height - borderTop - borderBottom - padTop - padBottom

  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/**
 * Compute the absolute caret rect for a node based on its `cursorOffset`
 * prop and current `contentRect`. Caret coordinates are content-area-relative
 * (inside border + padding), so this delegates to `computeContentRect` for
 * the origin instead of redoing the border/padding math here.
 *
 * Returns null when:
 * - the node has no `cursorOffset` prop, OR
 * - `scrollRect` is not yet populated (pre-layout), OR
 * - the content box collapsed to zero/negative size (no place to draw).
 *
 * `computeContentRect` keeps cursor positioning and overlay anchoring on the
 * same origin — Phase 4 / overlay-anchor consumers read `contentRect`
 * directly and won't drift from where the caret lands. See bead
 * `km-silvery.cursor-invariants` invariant 3.
 */
export function computeCursorRect(node: AgNode): CursorRect | null {
  const props = node.props as BoxProps | undefined
  const offset = props?.cursorOffset
  if (!offset) return null
  const content = computeContentRect(node)
  if (!content) return null

  return {
    x: content.x + offset.col,
    y: content.y + offset.row,
    visible: offset.visible !== false,
    // shape is deprecated (invariant 6) — terminal layer derives the shape
    // from focus + editable state via resolveCaretStyle. Forwarded here for
    // one-cycle back-compat with callers still reading cursor.shape.
    shape: offset.shape,
  }
}

/**
 * Project AgNode.scrollState → ScrollStateSnapshot (the subset the virtualizer
 * needs). Returns null if the node has no scroll state yet (non-scroll
 * containers or fresh scroll containers pre-layout).
 *
 * Keeping this projection tight means callers can compare snapshots by
 * per-field equality without pulling the mutable underlying object into
 * consumer code.
 */
function snapshotScrollState(node: AgNode): ScrollStateSnapshot | null {
  const ss = node.scrollState
  if (!ss) return null
  return {
    offset: ss.offset,
    contentHeight: ss.contentHeight,
    viewportHeight: ss.viewportHeight,
    firstVisibleChild: ss.firstVisibleChild,
    lastVisibleChild: ss.lastVisibleChild,
    hiddenAbove: ss.hiddenAbove,
    hiddenBelow: ss.hiddenBelow,
  }
}

/** Per-field equality check for ScrollStateSnapshot (skips allocation). */
function scrollStateEqual(
  a: ScrollStateSnapshot | null,
  b: ScrollStateSnapshot | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.offset === b.offset &&
    a.contentHeight === b.contentHeight &&
    a.viewportHeight === b.viewportHeight &&
    a.firstVisibleChild === b.firstVisibleChild &&
    a.lastVisibleChild === b.lastVisibleChild &&
    a.hiddenAbove === b.hiddenAbove &&
    a.hiddenBelow === b.hiddenBelow
  )
}

/** Check whether a node has signals allocated (for testing). */
export function hasLayoutSignals(node: AgNode): boolean {
  return signalMap.has(node)
}

// ============================================================================
// Sync: imperative state → signals
// ============================================================================

/**
 * Sync all rect signals from the node's current values.
 *
 * Called from notifyLayoutSubscribers after layout + scroll + sticky
 * phases complete. Only syncs nodes that have signals allocated.
 * Reference-equality check prevents unnecessary downstream updates.
 */
export function syncRectSignals(node: AgNode): void {
  // For caret-bearing nodes, allocate signals lazily so the scheduler walk
  // (`findActiveCursorRect`) sees them via `getLayoutSignals`. Without this,
  // a node that ONLY uses `cursorOffset` (no useBoxRect / useScrollRect
  // consumers) would never have signals allocated, and the caret would
  // never reach the scheduler. This is the prop-as-output equivalent of
  // `useCursor`'s former `useScrollRect` subscription.
  const props = (node.props as BoxProps | undefined) ?? undefined
  const hasCursorOffset = !!props?.cursorOffset
  const s = hasCursorOffset ? getLayoutSignals(node) : signalMap.get(node)
  if (!s) return

  if (node.boxRect !== s.boxRect()) s.boxRect(node.boxRect)
  if (node.scrollRect !== s.scrollRect()) s.scrollRect(node.scrollRect)
  if (node.screenRect !== s.screenRect()) s.screenRect(node.screenRect)

  // Sync contentRect — peer of the rect trio (invariant 3). Recomputed
  // every layout pass because border/padding can change without `scrollRect`
  // changing reference (e.g., theme swap → border style toggle).
  const nextContentRect = computeContentRect(node)
  if (!rectEqual(nextContentRect, s.contentRect())) {
    s.contentRect(nextContentRect)
  }

  // Sync cursorRect — peer of the other rect signals, computed from the
  // node's `cursorOffset` BoxProp + contentRect. Only nodes with
  // `cursorOffset` have a non-null cursorRect; clearing back to null when
  // the prop is removed is handled by `computeCursorRect` returning null.
  //
  // **Invariant 2 (prop-change recompute)**: `computeCursorRect` reads from
  // `node.props.cursorOffset` directly, so col/row/visible/shape changes
  // pick up the new value even when `boxRect`/`scrollRect`/`contentRect`
  // didn't change. The reference-inequality writes above are intentionally
  // not gated on rect inequality.
  const nextCursorRect = computeCursorRect(node)
  if (!cursorRectEqual(nextCursorRect, s.cursorRect())) {
    s.cursorRect(nextCursorRect)
  }

  // Sync scrollState signal — projects AgNode.scrollState (layout-phase's
  // pixel-space truth) into a reactive snapshot. `useScrollState` consumers
  // re-render only when a field changes, not on every layout pass.
  //
  // Per-field equality check below means the signal stays reference-stable
  // when layout runs without state changes — critical for avoiding spurious
  // re-renders in virtualizer consumers (they'd otherwise re-evaluate their
  // window on every frame, defeating the point of subscribing).
  const nextScrollState = snapshotScrollState(node)
  if (!scrollStateEqual(nextScrollState, s.scrollState())) {
    s.scrollState(nextScrollState)
  }
}

// ============================================================================
// Active cursor lookup (for scheduler)
// ============================================================================

/**
 * Walk the tree and find the active caret rect — the caret to render this
 * frame, applying the precedence + clipping rules locked by bead
 * `km-silvery.cursor-invariants`. Returns null when no caret should be
 * shown.
 *
 * **Precedence (invariant 1)**:
 *   1. **Focused-editable wins**: a Box with `cursorOffset.visible !== false`
 *      AND `interactiveState.focused === true`. If multiple focused-editables
 *      exist (rare — typically one input is focused at a time), the deepest
 *      one in paint order wins.
 *   2. **Otherwise deepest-in-paint-order**: if no node is focused-editable,
 *      fall back to the deepest visible declarer (post-order tree walk).
 *      This covers Ink-compat consumers and `useCursor` callers that don't
 *      participate in the focus tree.
 *   3. **Otherwise null**: no visible caret declared anywhere.
 *
 * **Clipping (invariant 4)**: at each scroll/clip ancestor (a Box with
 * `overflow="scroll"` / `"hidden"` / `overflowY="hidden"`), the caret's
 * position is checked against the ancestor's `scrollRect`. If the caret
 * falls outside the visible region, the caret is treated as not-present.
 * Default behavior is **hide** (no caret ANSI emitted) — never clamp. A
 * caret rect at the exact clip edge is treated as visible.
 *
 * Visited in tree order (depth-first, post-order). Per-node cost is one
 * `props.cursorOffset` check + one signal lookup; trees without any caret
 * declarer return null after a single traversal.
 */
export function findActiveCursorRect(root: AgNode): CursorRect | null {
  // Two parallel tracks — focused-editable wins outright (invariant 1.1).
  // Falling back to deepest-visible covers Ink-compat / useCursor consumers
  // (invariant 1.2). We track both during the walk and pick at the end so a
  // shallow focused declarer always wins over a deeper non-focused one.
  let focusedResult: CursorRect | null = null
  let fallbackResult: CursorRect | null = null

  // Stack of clip rects (innermost last). A null entry represents "no clip
  // at this level" so we don't allocate for every non-clipping Box.
  const clipStack: Array<Rect | null> = []

  function isClipped(rect: CursorRect): boolean {
    for (let i = clipStack.length - 1; i >= 0; i--) {
      const clip = clipStack[i]
      if (!clip) continue
      // Caret is a single cell at (x, y). Edge of clip region counts as
      // visible — strict-less-than for upper bounds.
      if (
        rect.x < clip.x ||
        rect.y < clip.y ||
        rect.x >= clip.x + clip.width ||
        rect.y >= clip.y + clip.height
      ) {
        return true
      }
    }
    return false
  }

  function isClipAncestor(node: AgNode): boolean {
    const props = node.props as BoxProps | undefined
    if (!props) return false
    if (props.overflow === "scroll" || props.overflow === "hidden") return true
    if (props.overflowY === "hidden") return true
    return false
  }

  function walk(node: AgNode): void {
    const isClip = isClipAncestor(node)
    if (isClip) {
      // scrollRect is the rendered viewport for scroll containers (after
      // scroll offset is applied). For overflow=hidden it's the box rect.
      // Either way, scrollRect is the cell range that actually appears on
      // screen for this container.
      clipStack.push(node.scrollRect ?? null)
    }

    for (const child of node.children) {
      walk(child)
    }

    const props = node.props as BoxProps | undefined
    if (props?.cursorOffset) {
      const s = signalMap.get(node)
      const rect = s ? s.cursorRect() : computeCursorRect(node)
      if (rect && rect.visible && !isClipped(rect)) {
        // Last-write-wins (deeper post-order entries overwrite shallower).
        fallbackResult = rect
        if (node.interactiveState?.focused) {
          focusedResult = rect
        }
      }
    }

    if (isClip) {
      clipStack.pop()
    }
  }

  walk(root)
  return focusedResult ?? fallbackResult
}

/**
 * Sync textContent signal from the node's current value.
 *
 * Called from commitTextUpdate in the reconciler.
 */
export function syncTextContentSignal(node: AgNode): void {
  const s = signalMap.get(node)
  if (!s) return

  if (node.textContent !== s.textContent()) s.textContent(node.textContent)
}

/**
 * Sync focused signal for a node.
 *
 * Called from FocusManager when focus changes.
 */
export function syncFocusedSignal(node: AgNode, focused: boolean): void {
  const s = signalMap.get(node)
  if (!s) return

  if (focused !== s.focused()) s.focused(focused)
}
