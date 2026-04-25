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
 * Cursor rect — absolute terminal coordinates of the cursor declared on a
 * Box via `cursorOffset`, computed during the layout phase as the peer of
 * `scrollRect` / `screenRect` / `boxRect`.
 *
 * Width/height are always 1 (the cursor occupies a single cell). The
 * `visible` flag is a separate property because layout still computes the
 * coordinates even when the cursor is hidden — that lets toggling
 * `visible` re-emit the cursor without re-running layout.
 */
export interface CursorRect {
  /** Absolute terminal X column (0-indexed) */
  readonly x: number
  /** Absolute terminal Y row (0-indexed) */
  readonly y: number
  /** Whether the cursor should be visible on this frame. */
  readonly visible: boolean
  /** Optional terminal cursor shape (DECSCUSR). */
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
   * Absolute terminal coordinates of the cursor declared by this node's
   * `BoxProps.cursorOffset`. Null when the node has no cursorOffset prop, or
   * before the first layout pass populates `scrollRect`.
   *
   * Phase 2 of `km-silvery.view-as-layout-output` — the scheduler reads this
   * signal (rather than `cursorStore.getCursorState()`) to emit cursor
   * positioning ANSI. Because layout phase runs synchronously before each
   * render, the very first frame after mount sees the correct cursor — no
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
 * Compute the absolute cursor rect for a node based on its `cursorOffset`
 * prop and current `scrollRect`. Mirrors the math `useCursor` performs at
 * effect time — but lifted into the layout phase so the value is available
 * synchronously before scheduler emit.
 *
 * Returns null when the node has no `cursorOffset` prop OR when `scrollRect`
 * is not yet populated (pre-layout).
 */
export function computeCursorRect(node: AgNode): CursorRect | null {
  const props = node.props as BoxProps | undefined
  const offset = props?.cursorOffset
  if (!offset) return null
  const scroll = node.scrollRect
  if (!scroll) return null

  // Border + padding offsets (mirrors useCursor.ts:171-180). When present,
  // border adds 1 cell, padding values are taken with the same precedence as
  // the layout engine: paddingX / paddingY > padding shorthand.
  const padLeft = props.paddingLeft ?? props.paddingX ?? props.padding ?? 0
  const padTop = props.paddingTop ?? props.paddingY ?? props.padding ?? 0
  const borderLeft = props.borderStyle ? 1 : 0
  const borderTop = props.borderStyle ? 1 : 0

  return {
    x: scroll.x + borderLeft + padLeft + offset.col,
    y: scroll.y + borderTop + padTop + offset.row,
    visible: offset.visible !== false,
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
  // For cursor-bearing nodes, allocate signals lazily so the scheduler walk
  // (`findActiveCursorRect`) sees them via `getLayoutSignals`. Without this,
  // a node that ONLY uses `cursorOffset` (no useBoxRect / useScrollRect
  // consumers) would never have signals allocated, and the cursor would
  // never reach the scheduler. This is the prop-as-output equivalent of
  // `useCursor`'s former `useScrollRect` subscription.
  const props = (node.props as BoxProps | undefined) ?? undefined
  const hasCursorOffset = !!props?.cursorOffset
  const s = hasCursorOffset ? getLayoutSignals(node) : signalMap.get(node)
  if (!s) return

  if (node.boxRect !== s.boxRect()) s.boxRect(node.boxRect)
  if (node.scrollRect !== s.scrollRect()) s.scrollRect(node.scrollRect)
  if (node.screenRect !== s.screenRect()) s.screenRect(node.screenRect)

  // Sync cursorRect — peer of the other rect signals, computed from the
  // node's `cursorOffset` BoxProp + scrollRect. Only nodes with
  // `cursorOffset` have a non-null cursorRect; clearing back to null when
  // the prop is removed is handled by `computeCursorRect` returning null.
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
 * Walk the tree and find the active cursor rect — the deepest visible
 * cursor declared via `BoxProps.cursorOffset`. Returns null when no node
 * has a visible cursor.
 *
 * Visited in tree order (depth-first, post-order). The deepest match wins
 * because cursor is "last writer wins" by convention — a TextArea inside a
 * Modal should win over a TextInput in the underlying form. Tree-order
 * stability gives this property without needing tie-breaker fields.
 *
 * Called by the scheduler before emitting cursor positioning ANSI (replaces
 * the legacy `cursorStore.getCursorState()` lookup). Walking is O(N) but
 * only checks `props.cursorOffset` per node — no per-node signal access
 * unless a cursor exists. For trees without any cursor consumers, returns
 * null after a single tree traversal.
 */
export function findActiveCursorRect(root: AgNode): CursorRect | null {
  let result: CursorRect | null = null

  function walk(node: AgNode): void {
    for (const child of node.children) {
      walk(child)
    }
    const props = node.props as BoxProps | undefined
    if (!props?.cursorOffset) return
    const s = signalMap.get(node)
    const rect = s ? s.cursorRect() : computeCursorRect(node)
    if (rect && rect.visible) {
      // Last write wins — accept the latest (deepest in post-order) match.
      result = rect
    }
  }

  walk(root)
  return result
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
