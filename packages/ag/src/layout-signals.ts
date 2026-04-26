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
import type {
  AgNode,
  AnchorEdge,
  AnchorRef,
  BoxProps,
  CursorShape,
  Decoration,
  Rect,
  SelectionIntent,
} from "./types"
import { rectEqual } from "./types"
import { getWrapMeasurer, type WrapSlice } from "./wrap-measurer"
import { placeFloating } from "./place-floating"

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
 * Per-field equality on a list of rects. Used to skip selection-fragment
 * signal writes when nothing changed — mirrors the rect-tuple equality
 * pattern used for boxRect/scrollRect/screenRect/contentRect/cursorRect.
 *
 * Reference equality is checked first (the common no-op path); only when
 * lengths match do we walk the entries. An empty array is the canonical
 * "no fragments" state — the equality path treats `[]` and `[]` as equal
 * by length-zero, so collapsed/no-selection nodes don't churn the signal.
 */
function selectionFragmentsEqual(a: readonly Rect[], b: readonly Rect[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!rectEqual(a[i] ?? null, b[i] ?? null)) return false
  }
  return true
}

/**
 * Stable empty-rects sentinel — `selectionFragments` defaults to this when a
 * node has no `selectionIntent` declared. Reusing the same array reference
 * means subscribers see reference-stable "no selection" frames and can skip
 * downstream re-computation. The array is frozen so accidental mutation
 * never corrupts the sentinel.
 */
const EMPTY_FRAGMENTS: readonly Rect[] = Object.freeze([])

/**
 * Stable empty-decorations sentinel — `decorationRects` defaults to this when
 * a node has no `decorations` BoxProp. Same reference-stability story as
 * `EMPTY_FRAGMENTS`.
 */
const EMPTY_DECORATION_RECTS: readonly DecorationRect[] = Object.freeze([])

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

  /**
   * Focused-node id declared by this node's `BoxProps.focused`. The value is
   * the node's `id` (preferred) or `testID` when `props.focused === true`,
   * else `null`. Phase 4a of `km-silvery.view-as-layout-output` — the
   * focus-renderer reads this signal (and/or `findActiveFocusedNodeId(root)`)
   * to paint focus styling without going through the `useFocus` →
   * `FocusManager` → `useSyncExternalStore` effect chain.
   *
   * Per-node by design (peer of `cursorRect`): each Box that participates in
   * focus carries its own declared id here, and the tree-walk lookup picks
   * the deepest visible declarer. Unmount is handled by WeakMap GC + the
   * per-frame recompute in `syncRectSignals` clearing back to null when the
   * prop is removed. See bead `km-silvery.phase4-split-focus-selection`.
   */
  readonly focusedNodeId: WritableSignal<string | null>

  /**
   * Geometric output of `BoxProps.selectionIntent` — the list of rectangles
   * (one per visual line spanned) that the selection renderer should paint
   * with highlight bg this frame. Empty array when the node declares no
   * `selectionIntent` or when the intent is collapsed (`from === to`).
   *
   * Phase 4b of `km-silvery.view-as-layout-output` — peer of `cursorRect`
   * (caret) and `focusedNodeId` (focus). The selection renderer reads this
   * signal (and/or `findActiveSelectionFragments(root)`) to paint highlight
   * styling without going through the legacy `SelectionFeature` capability
   * + `useSelection` `useSyncExternalStore` chain.
   *
   * Per-node by design: each Box that participates in selection carries its
   * own fragments here. The aggregator (`findActiveSelectionFragments`)
   * concatenates fragments across all mounted declarers — multi-node
   * selection composes for free. Stale-cleanup is handled by WeakMap GC +
   * the per-frame recompute in `syncRectSignals` clearing back to the empty
   * sentinel when the prop is removed (mirrors cursor invariant 5 + focus
   * invariant 3). See bead `km-silvery.phase4-split-focus-selection`.
   */
  readonly selectionFragments: WritableSignal<readonly Rect[]>

  // Scroll state for overflow="scroll" containers (null otherwise, or until
  // first layout pass). Peer of rect signals — synced by syncRectSignals.
  readonly scrollState: WritableSignal<ScrollStateSnapshot | null>

  /**
   * Geometric output of `BoxProps.anchorRef` — the rect that other Boxes'
   * decorations resolve to when they reference this anchor by id. The
   * registered rect is the Box's `contentRect` (border + padding excluded);
   * edge-specific rects are derived by `placeFloating` at consumption time.
   *
   * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1) — peer
   * of `cursorRect`/`focusedNodeId`/`selectionFragments`. The tree-walk
   * lookup `findAnchor(root, id)` reads this signal (and falls back to
   * `computeAnchorRect` for nodes without signals).
   *
   * Null when:
   *   - the node has no `anchorRef` BoxProp, OR
   *   - `contentRect` is unavailable (pre-layout / clipped to zero size).
   */
  readonly anchorRect: WritableSignal<Rect | null>

  /**
   * Geometric output of `BoxProps.decorations` — the resolved per-decoration
   * rect list this frame. Each entry carries the source kind, id, and rects
   * (popover/tooltip → one rect at the placed position; highlight → one rect
   * within the owning Box's content area).
   *
   * v1 emits one rect per decoration. The list mirrors the BoxProp's order so
   * paint order is deterministic. When an anchor lookup fails (popover/tooltip
   * with no matching `anchorRef`), the entry's `rects` is empty — the
   * renderer skips it.
   *
   * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
   */
  readonly decorationRects: WritableSignal<readonly DecorationRect[]>

  // Node state (synced from reconciler + focus manager)
  readonly textContent: WritableSignal<string | undefined>
  readonly focused: WritableSignal<boolean>
}

/**
 * Geometric output of one `Decoration` entry — the resolved rects for paint
 * time, plus the source kind/id so the renderer can dispatch by kind.
 *
 * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
 *
 * v1 emits one rect per decoration. Soft-wrap aware highlight fragmentation
 * (multiple rects per highlight) is deferred to v2 — same path as
 * `selectionFragments` once the find/replace consumer ships.
 *
 * `rects` may be empty when an anchor lookup failed (popover/tooltip with a
 * missing `anchorId`); consumers SHOULD skip empty entries rather than
 * paint a 0×0 rect.
 */
export interface DecorationRect {
  /** Decoration kind from the source `Decoration` entry. */
  readonly kind: Decoration["kind"]
  /** Stable id from the source `Decoration` entry. */
  readonly id: string
  /** Resolved rects in absolute terminal cell space. May be empty. */
  readonly rects: readonly Rect[]
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
      focusedNodeId: signal<string | null>(computeFocusedNodeId(node)),
      selectionFragments: signal<readonly Rect[]>(computeSelectionFragments(node)),
      scrollState: signal<ScrollStateSnapshot | null>(snapshotScrollState(node)),
      anchorRect: signal<Rect | null>(computeAnchorRect(node)),
      decorationRects: signal<readonly DecorationRect[]>(EMPTY_DECORATION_RECTS),
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
 * Compute the focused-node id for a node based on its `focused` BoxProp.
 *
 * Returns the node's `id` (preferred) or `testID` when `props.focused === true`,
 * else `null`. This is the per-node value carried in
 * `LayoutSignals.focusedNodeId` — the tree-walk lookup
 * `findActiveFocusedNodeId(root)` picks the deepest non-null among all
 * declarers (Phase 4a precedence rule).
 *
 * Identity priority: `id` > `testID`. Apps that want stable focus identity
 * should set one of those props alongside `focused={true}`. When neither is
 * set but `focused === true`, an opaque sentinel (`"__focused__"`) is
 * returned so the signal is still observable as "something is focused" —
 * downstream consumers should not depend on the sentinel value beyond
 * non-null/null.
 */
export function computeFocusedNodeId(node: AgNode): string | null {
  const props = node.props as (BoxProps & { id?: string; testID?: string }) | undefined
  if (!props?.focused) return null
  // Prefer `id` (typed on TestProps) then `testID`, then a sentinel so the
  // signal remains observable even on anonymous focused declarers.
  if (typeof props.id === "string" && props.id.length > 0) return props.id
  if (typeof props.testID === "string" && props.testID.length > 0) return props.testID
  return "__focused__"
}

// ============================================================================
// Anchor rect (Phase 4c — overlay-anchor v1)
// ============================================================================

/**
 * Resolve the `anchorRef` BoxProp into a string id. Accepts the shorthand
 * `anchorRef="my-id"` and the structured `anchorRef={{ id: "my-id" }}` form.
 *
 * Returns `null` when no anchorRef is present, or when the prop is malformed
 * (empty id string). Apps that need stable anchor identity should always pass
 * a non-empty string.
 */
function resolveAnchorId(node: AgNode): string | null {
  const props = node.props as BoxProps | undefined
  const ref = props?.anchorRef
  if (!ref) return null
  if (typeof ref === "string") return ref.length > 0 ? ref : null
  // Structured form: AnchorRef object with `id` field.
  const ar = ref as AnchorRef
  if (typeof ar.id === "string" && ar.id.length > 0) return ar.id
  return null
}

/**
 * Compute the anchor rect for a Box that declares `anchorRef`. The registered
 * rect is the Box's `contentRect` — the inner area inside border + padding
 * — which is the canonical origin for placement math. Edge-specific rects
 * (top/bottom/left/right) are derived by `placeFloating` at consumption time
 * rather than baked into the registry.
 *
 * Returns `null` when:
 *   - the node has no `anchorRef` BoxProp (or it's empty), OR
 *   - `contentRect` is unavailable (pre-layout / clipped to zero size).
 *
 * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
 */
export function computeAnchorRect(node: AgNode): Rect | null {
  const id = resolveAnchorId(node)
  if (id === null) return null
  return computeContentRect(node)
}

/**
 * Walk the tree and find the rect for an anchor by id. Returns `null` when
 * no Box declares `anchorRef` with a matching id, or when the matching Box's
 * `contentRect` is unavailable this frame (pre-layout / clipped).
 *
 * **Optional `edge` parameter** — when supplied, returns a 1-cell-thick rect
 * along the requested edge of the anchor (`top`, `bottom`, `left`, `right`).
 * Convenience for callers that want to draw against a specific edge without
 * threading the full content rect through `placeFloating`. Without `edge`,
 * returns the full content rect.
 *
 * **Walk order**: post-order (deepest-first). If two anchors share an id —
 * the contract says they shouldn't, but the substrate doesn't enforce
 * uniqueness — the deeper / later-rendered one wins. This matches the
 * deepest-wins precedence used by cursor and focus walks.
 *
 * Per-node cost: one `props.anchorRef` check + one signal lookup (or one
 * direct compute when no signal is allocated). Trees with no anchors return
 * `null` after a single traversal.
 *
 * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
 */
export function findAnchor(root: AgNode, id: string, edge?: AnchorEdge): Rect | null {
  let result: Rect | null = null

  function walk(node: AgNode): void {
    for (const child of node.children) {
      walk(child)
    }
    const nodeId = resolveAnchorId(node)
    if (nodeId !== id) return
    const s = signalMap.get(node)
    const rect = s ? s.anchorRect() : computeAnchorRect(node)
    if (rect) {
      // Last-write-wins (deepest in post-order).
      result = rect
    }
  }

  walk(root)

  if (result === null || edge === undefined) return result

  // Slice the requested edge into a 1-cell-thick rect. Coordinates are
  // absolute, mirroring `cursorRect` / `selectionFragments` conventions.
  const r: Rect = result
  switch (edge) {
    case "top":
      return { x: r.x, y: r.y, width: r.width, height: 1 }
    case "bottom":
      return { x: r.x, y: r.y + Math.max(0, r.height - 1), width: r.width, height: 1 }
    case "left":
      return { x: r.x, y: r.y, width: 1, height: r.height }
    case "right":
      return { x: r.x + Math.max(0, r.width - 1), y: r.y, width: 1, height: r.height }
  }
}

// ============================================================================
// Decoration rects (Phase 4c — overlay-anchor v1)
// ============================================================================

/**
 * Compute the resolved decoration rects for a node based on its `decorations`
 * BoxProp. Each entry produces one `DecorationRect` whose `rects` may be empty
 * when an anchor lookup fails.
 *
 * **Behavior by kind**:
 *   - `popover` / `tooltip`: requires `anchorId` + `placement` + `size`. The
 *     anchor rect is looked up via `findAnchor(root, anchorId)`; if found and
 *     all required fields are present, `placeFloating` produces the placed
 *     rect. Missing anchor or missing required fields → empty rect list.
 *   - `highlight`: the `rect` field, if present, is translated from
 *     content-relative coordinates into absolute terminal coordinates by
 *     adding the owning Box's `contentRect.{x, y}`. Missing rect or no
 *     contentRect → empty rect list.
 *
 * **Per-frame**: this runs in the layout-phase notify pass, so anchor rects
 * are populated for the same frame. Anchors declared deeper in the tree
 * resolve correctly because the function takes the root tree as input rather
 * than relying on a separately-built map.
 *
 * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
 */
export function computeDecorationRects(node: AgNode, root: AgNode): readonly DecorationRect[] {
  const props = node.props as BoxProps | undefined
  const decos = props?.decorations
  if (!decos || decos.length === 0) return EMPTY_DECORATION_RECTS

  const out: DecorationRect[] = []
  const content = computeContentRect(node)

  for (const d of decos) {
    if (d.kind === "popover" || d.kind === "tooltip") {
      // Floating decoration — requires anchor + placement + size.
      if (!d.anchorId || !d.placement || !d.size) {
        out.push({ kind: d.kind, id: d.id, rects: [] })
        continue
      }
      const anchor = findAnchor(root, d.anchorId)
      if (!anchor) {
        out.push({ kind: d.kind, id: d.id, rects: [] })
        continue
      }
      const placed = placeFloating(anchor, d.size, d.placement)
      out.push({ kind: d.kind, id: d.id, rects: [placed] })
    } else if (d.kind === "highlight") {
      if (!d.rect || !content) {
        out.push({ kind: d.kind, id: d.id, rects: [] })
        continue
      }
      // Highlight rect is content-relative; translate to absolute coords.
      out.push({
        kind: d.kind,
        id: d.id,
        rects: [
          {
            x: content.x + d.rect.x,
            y: content.y + d.rect.y,
            width: d.rect.width,
            height: d.rect.height,
          },
        ],
      })
    }
  }

  return out.length === 0 ? EMPTY_DECORATION_RECTS : out
}

/**
 * Per-field equality on a list of `DecorationRect`. Used to skip
 * `decorationRects` signal writes when nothing changed — mirrors the
 * `selectionFragmentsEqual` pattern.
 */
function decorationRectsEqual(a: readonly DecorationRect[], b: readonly DecorationRect[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    if (ai.kind !== bi.kind) return false
    if (ai.id !== bi.id) return false
    if (ai.rects.length !== bi.rects.length) return false
    for (let j = 0; j < ai.rects.length; j++) {
      if (!rectEqual(ai.rects[j] ?? null, bi.rects[j] ?? null)) return false
    }
  }
  return true
}

/**
 * Walk the tree and collect every resolved decoration rect. Concatenated in
 * tree order (post-order — same shape as `findActiveSelectionFragments`).
 *
 * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
 *
 * Per-node cost: one `props.decorations` check + one signal lookup. Trees
 * with no decorations return `[]` after a single traversal.
 */
export function findActiveDecorationRects(root: AgNode): readonly DecorationRect[] {
  const out: DecorationRect[] = []

  function walk(node: AgNode): void {
    for (const child of node.children) {
      walk(child)
    }
    const props = node.props as BoxProps | undefined
    if (props?.decorations && props.decorations.length > 0) {
      const s = signalMap.get(node)
      const rects = s ? s.decorationRects() : computeDecorationRects(node, root)
      for (const r of rects) out.push(r)
    }
  }

  walk(root)
  return out
}

// ============================================================================
// Selection fragments (Phase 4b — selection as overlay/decoration)
// ============================================================================

/**
 * Collect the textual content of a selection-declaring Box.
 *
 * The selection-fragment math operates on the rendered text content of the
 * owning Box — `selectionIntent.{from,to}` are character offsets into this
 * string. For Box nodes, the canonical content is the concatenation of
 * descendant `silvery-text` nodes' `textContent` (in tree order), with `\n`
 * separators between adjacent Text/Box children that introduce visual line
 * breaks.
 *
 * v1 behaviour (kept intentionally minimal):
 * - A Box with `silvery-text` children: concatenates `textContent` strings
 *   from those children. Two adjacent text children produce one logical
 *   line; if you want a line break, embed `\n` in the text.
 * - A Box with mixed children: same — only `silvery-text` descendants
 *   contribute. Nested Box children don't add line breaks (they're treated
 *   as transparent for content purposes).
 * - A `silvery-text` node directly carrying the prop: its own `textContent`
 *   is the content.
 *
 * This keeps the v1 model honest: declare `selectionIntent` on a Box (or
 * Text) whose text content is the source of truth for the selection. Apps
 * that want per-line semantics can split the selection across multiple
 * intent declarations.
 */
function collectSelectionText(node: AgNode): string {
  if (node.type === "silvery-text") {
    return node.textContent ?? ""
  }
  // Box (or root): concatenate descendant text. Walk DFS, gather
  // `silvery-text` content in tree order.
  let out = ""
  const stack: AgNode[] = [node]
  while (stack.length) {
    const cur = stack.pop()!
    // Push children in reverse so DFS visits them in order.
    for (let i = cur.children.length - 1; i >= 0; i--) {
      const child = cur.children[i]
      if (child) stack.push(child)
    }
    if (cur === node) continue
    if (cur.type === "silvery-text" && cur.textContent !== undefined) {
      out += cur.textContent
    }
  }
  return out
}

/**
 * Compute the geometric fragments for a node's `selectionIntent` — the list
 * of rectangles (one per visual line spanned) that the selection renderer
 * should paint with highlight bg this frame.
 *
 * Returns:
 * - `[]` when the node has no `selectionIntent` prop, or when the intent is
 *   collapsed (`from === to`), or when the content rect is unavailable
 *   (pre-layout / clipped to zero size).
 * - `[Rect]` for a single-visual-line selection.
 * - `[Rect, Rect, ...]` for multi-line selections (split per visual line).
 *
 * **Geometry** (mirrors text-editor / ProseMirror conventions):
 * - First line: from `(content.x + fromCol, content.y + fromLine)` to the
 *   end of the line. If single-line, runs to `toCol`.
 * - Middle lines: full content-rect width, one row each.
 * - Last line: from `(content.x, content.y + toLine)` to `toCol` chars.
 *
 * Coordinates are absolute terminal cells, matching `cursorRect`'s
 * coordinate space. Width is in cells (one rect per visual line).
 *
 * **Soft-wrap awareness (Option B)**: when a wrap measurer is registered
 * via `setWrapMeasurer({ wrapText })` AND the content rect width is known,
 * this function splits on the measurer's per-visual-line slices — a
 * 60-char paragraph wrapped at width 20 produces 3 fragments rather than
 * one wide rectangle. The terminal runtime (`@silvery/ag-term`) registers
 * its grapheme-aware `wrapText` at startup; pure `@silvery/ag` consumers
 * (no terminal) fall back to `\n`-only splitting which preserves the
 * pre-Option-B behavior bit-for-bit. See `wrap-measurer.ts` for the
 * registry contract. Closes Phase 4b deferred wrap-spanning (bead
 * `km-silvery.softwrap-selection-fragments`).
 */
export function computeSelectionFragments(node: AgNode): readonly Rect[] {
  const props = node.props as (BoxProps & { selectionIntent?: SelectionIntent }) | undefined
  const intent = props?.selectionIntent
  if (!intent) return EMPTY_FRAGMENTS
  // Collapsed selection: caret is rendered separately (cursorOffset).
  if (intent.from >= intent.to) return EMPTY_FRAGMENTS
  const content = computeContentRect(node)
  if (!content) return EMPTY_FRAGMENTS

  const text = collectSelectionText(node)
  if (text.length === 0) return EMPTY_FRAGMENTS

  // Build the per-visual-line slice list. Two paths:
  //   (a) Wrap measurer registered AND content width is known → walk every
  //       paragraph (split on `\n`) through the measurer to get
  //       grapheme-correct soft-wrap slices. The measurer returns []
  //       for paragraphs that fit unchanged; we fabricate a single-slice
  //       passthrough in that case so the downstream loop has uniform
  //       input.
  //   (b) No measurer (or width <=0) → `\n`-only split, preserving the
  //       pre-Option-B behavior bit-for-bit. Pure-`@silvery/ag` unit tests
  //       hit this branch.
  const measurer = getWrapMeasurer()
  const visualLines: VisualLine[] =
    measurer !== null && content.width > 0
      ? buildVisualLinesWithMeasurer(text, content.width, measurer.wrapText)
      : buildVisualLinesNewlineOnly(text)

  // Selection range projected onto each visual line. Each line either
  // contributes one rect (clamped to its slice window) or zero (selection
  // doesn't overlap that line).
  const fragments: Rect[] = []
  for (let i = 0; i < visualLines.length; i++) {
    const line = visualLines[i]!
    // Skip lines entirely before the selection start.
    if (line.endOffset <= intent.from) continue
    // Stop once we pass the selection end. (Lines are in order.)
    if (line.startOffset >= intent.to) break

    const localFrom = Math.max(0, intent.from - line.startOffset)
    const localTo = Math.min(line.text.length, intent.to - line.startOffset)
    const width = Math.max(0, localTo - localFrom)
    if (width === 0) continue

    fragments.push({
      x: content.x + localFrom,
      y: content.y + i,
      width,
      height: 1,
    })
  }

  return fragments.length === 0 ? EMPTY_FRAGMENTS : fragments
}

/**
 * One visual line in the canonical fragment-builder format: the visible
 * text plus the original-text offsets that produced it. Used by both
 * the wrap-measurer path and the `\n`-only fallback so the projection
 * loop in `computeSelectionFragments` is uniform.
 */
interface VisualLine {
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
}

/**
 * Walk paragraphs (split on `\n`) through the registered wrap measurer to
 * produce per-visual-line slices. When a paragraph fits within the width
 * unchanged, the measurer returns `[]` — we synthesize a single-slice
 * passthrough so the downstream loop sees uniform input.
 *
 * Maintains the invariant that visual-line offsets are monotone and cover
 * the full input (including the `\n` terminator counted as a zero-width
 * boundary so cross-paragraph selections stay aligned).
 */
function buildVisualLinesWithMeasurer(
  text: string,
  width: number,
  wrapText: (text: string, maxWidth: number) => readonly WrapSlice[],
): VisualLine[] {
  const out: VisualLine[] = []
  // Walk paragraphs. We re-scan the source string ourselves (rather than
  // calling `text.split('\n')`) because we need per-paragraph offsets to
  // translate measurer offsets (which are paragraph-local) into source
  // offsets (which are what selectionIntent.from/to use).
  let paraStart = 0
  for (let i = 0; i <= text.length; i++) {
    const isEnd = i === text.length
    const isNewline = !isEnd && text.charCodeAt(i) === 10 /* \n */
    if (!isEnd && !isNewline) continue

    const para = text.slice(paraStart, i)
    const slices = wrapText(para, width)
    if (slices.length === 0) {
      // Measurer signaled "no wrap needed" — passthrough the paragraph as
      // one visual line. Empty paragraphs (consecutive `\n`) also land here
      // and produce a zero-length line, which keeps line indexing aligned.
      out.push({
        text: para,
        startOffset: paraStart,
        endOffset: paraStart + para.length,
      })
    } else {
      for (const slice of slices) {
        out.push({
          text: slice.text,
          startOffset: paraStart + slice.startOffset,
          endOffset: paraStart + slice.endOffset,
        })
      }
    }

    // Advance past the `\n` terminator. The newline cell is not its own
    // visual line — it's the boundary between paragraphs — so we just bump
    // `paraStart` to the next paragraph and let the loop continue.
    paraStart = i + 1
  }
  return out
}

/**
 * Fallback: split on `\n` only. Preserves pre-Option-B geometry exactly so
 * unit tests that exercise the framework-only layer (no terminal Term
 * registered) keep passing without changes.
 *
 * The `endOffset` of each line is the position of the `\n` (or `text.length`
 * for the trailing line) — this matches the convention used by
 * `buildVisualLinesWithMeasurer`, where the newline is a zero-width
 * paragraph boundary rather than a visual line of its own.
 */
function buildVisualLinesNewlineOnly(text: string): VisualLine[] {
  const out: VisualLine[] = []
  let lineStart = 0
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10 /* \n */) {
      out.push({
        text: text.slice(lineStart, i),
        startOffset: lineStart,
        endOffset: i,
      })
      lineStart = i + 1
    }
  }
  return out
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
function scrollStateEqual(a: ScrollStateSnapshot | null, b: ScrollStateSnapshot | null): boolean {
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
  // For caret-bearing nodes AND focus-declaring nodes, allocate signals
  // lazily so tree-walk lookups (`findActiveCursorRect`,
  // `findActiveFocusedNodeId`) see them via `getLayoutSignals`. Without
  // this, a node that ONLY uses `cursorOffset` / `focused` (no useBoxRect /
  // useScrollRect consumers) would never have signals allocated, and the
  // caret/focus would never reach the renderer. This is the prop-as-output
  // equivalent of `useCursor`'s former `useScrollRect` subscription and
  // `useFocus`'s former `useSyncExternalStore` subscription.
  const props = (node.props as BoxProps | undefined) ?? undefined
  const hasCursorOffset = !!props?.cursorOffset
  const hasFocused = !!props?.focused
  const hasSelectionIntent = !!props?.selectionIntent
  // anchorRef + decorations follow the same lazy-allocation rule as
  // cursorOffset/focused/selectionIntent: a node that ONLY uses anchorRef
  // (no useBoxRect / useScrollRect consumers) must still get signals
  // allocated so `findAnchor` / `findActiveDecorationRects` see it via
  // `getLayoutSignals`. Without this, anchored popovers wouldn't reach the
  // overlay layer until the first useScrollRect subscriber happens to mount.
  const hasAnchorRef = !!props?.anchorRef
  const hasDecorations = !!(props?.decorations && props.decorations.length > 0)
  const s =
    hasCursorOffset || hasFocused || hasSelectionIntent || hasAnchorRef || hasDecorations
      ? getLayoutSignals(node)
      : signalMap.get(node)
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

  // Sync focusedNodeId — Phase 4a peer of cursorRect. `computeFocusedNodeId`
  // reads from `node.props.focused` directly so toggling the prop without
  // any rect change still propagates to subscribers (mirrors cursor
  // invariant 2 — prop-change recompute). When the prop is removed, the
  // computed id becomes null and the signal clears, so per-frame walks
  // can't see ghost focuses on stale nodes (mirrors invariant 5).
  const nextFocusedId = computeFocusedNodeId(node)
  if (nextFocusedId !== s.focusedNodeId()) {
    s.focusedNodeId(nextFocusedId)
  }

  // Sync selectionFragments — Phase 4b peer of cursorRect/focusedNodeId.
  // `computeSelectionFragments` reads from `node.props.selectionIntent`
  // directly so toggling `from`/`to` (or removing the prop) propagates to
  // subscribers without any rect change (mirrors cursor invariant 2 + focus
  // invariant 2). Empty intents collapse to the shared EMPTY_FRAGMENTS
  // sentinel — subscribers see reference-stable "no selection" frames so
  // downstream `findActiveSelectionFragments` walks short-circuit.
  const nextFragments = computeSelectionFragments(node)
  if (!selectionFragmentsEqual(nextFragments, s.selectionFragments())) {
    s.selectionFragments(nextFragments)
  }

  // Sync anchorRect — Phase 4c peer of the rect signals. Driven by
  // `node.props.anchorRef` + `contentRect`; null when the prop is absent or
  // the content rect collapses. Mirrors invariant 2 (prop-change recompute):
  // toggling `anchorRef` clears/reinstates the rect in the same frame.
  // `decorationRects` is NOT synced here — it requires the root tree for
  // anchor lookups and is synced in a second pass below
  // (syncDecorationRects). See `syncRectSignals` JSDoc.
  const nextAnchorRect = computeAnchorRect(node)
  if (!rectEqual(nextAnchorRect, s.anchorRect())) {
    s.anchorRect(nextAnchorRect)
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

/**
 * Second-pass sync for `decorationRects` — must run AFTER `syncRectSignals`
 * has populated every anchor rect this frame, because decoration resolution
 * calls `findAnchor(root, id)` and needs the freshest anchor rects.
 *
 * Walks the tree, recomputes per-node decoration rects, and writes the signal
 * only when the result differs (per-field equality via `decorationRectsEqual`).
 *
 * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
 *
 * Per-node cost: one `props.decorations` length check (zero-allocation
 * short-circuit) + one signal lookup + one decoration recompute when present.
 * Trees without decorations pay only the prop check at every node.
 */
export function syncDecorationRects(root: AgNode): void {
  function walk(node: AgNode): void {
    const props = node.props as BoxProps | undefined
    const hasDecorations = !!(props?.decorations && props.decorations.length > 0)
    if (hasDecorations) {
      // Lazy-allocate signals for decoration-bearing nodes (mirrors the
      // anchorRef/cursorOffset/focused/selectionIntent rule in
      // syncRectSignals). Without this, decoration-only Boxes never get
      // their rects published.
      const s = getLayoutSignals(node)
      const next = computeDecorationRects(node, root)
      if (!decorationRectsEqual(next, s.decorationRects())) {
        s.decorationRects(next)
      }
    } else {
      // Clear any previously-allocated signal back to the empty sentinel so
      // removing the prop drops decorations on the same frame (mirrors
      // selectionFragments invariant 2).
      const s = signalMap.get(node)
      if (s && s.decorationRects().length > 0) {
        s.decorationRects(EMPTY_DECORATION_RECTS)
      }
    }
    for (const child of node.children) {
      walk(child)
    }
  }
  walk(root)
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

// ============================================================================
// Active focus lookup (Phase 4a — focus as layout output)
// ============================================================================

/**
 * Walk the tree and find the active focused-node id — the node that should
 * be painted with focus styling this frame. Mirrors `findActiveCursorRect`'s
 * shape (post-order walk, deepest-wins). Returns null when no Box declares
 * `focused === true`.
 *
 * **Precedence**: deepest declarer in paint order wins. If multiple nodes
 * have `focused === true` (rare — typically one boundary is focused at a
 * time), the post-order walk picks the later/deeper one. No "focused-editable
 * tiebreak" exists for focus itself (cursor's invariant 1 specifically
 * disambiguates between caret declarers, which don't apply here).
 *
 * **Visibility / clipping**: this walk does NOT yet apply scroll/clip
 * filtering. Phase 4a treats focus as a semantic id — actually painting a
 * focus ring is a downstream renderer concern, and that renderer may have
 * its own clipping logic via `screenRect`. The cursor invariants doc covers
 * the rationale (caret pixels must be hidden across clip ancestors; a
 * focused node's id can still be reported even when its border is clipped
 * — the renderer decides what to draw).
 *
 * Per-node cost: one `props.focused` check + one signal lookup. Trees with
 * no focused declarer return null after a single traversal.
 */
export function findActiveFocusedNodeId(root: AgNode): string | null {
  let result: string | null = null

  function walk(node: AgNode): void {
    for (const child of node.children) {
      walk(child)
    }
    const props = node.props as BoxProps | undefined
    if (props?.focused) {
      const s = signalMap.get(node)
      const id = s ? s.focusedNodeId() : computeFocusedNodeId(node)
      if (id !== null) {
        // Last-write-wins (deeper post-order entries overwrite shallower).
        result = id
      }
    }
  }

  walk(root)
  return result
}

// ============================================================================
// Active selection lookup (Phase 4b — selection as overlay/decoration)
// ============================================================================

/**
 * Walk the tree and collect every fragment from every Box that declares
 * `selectionIntent`. Concatenated in tree order (post-order — same shape as
 * `findActiveFocusedNodeId`/`findActiveCursorRect`).
 *
 * Empty array when no node declares a selection or all declarers have
 * collapsed/empty intents. The walk reads from `LayoutSignals.selectionFragments`
 * when allocated (the production fast path), falling back to direct compute
 * for nodes without signals (rare — happens only during teardown).
 *
 * **Multi-node selection** (v1): two adjacent Boxes both declaring
 * `selectionIntent` produce concatenated fragments — the renderer paints
 * highlight bg on every rect. Full cross-node range selection (selecting
 * from middle of node A through node B) is a future enhancement and would
 * be expressed by setting `selectionIntent` on each spanned node, with
 * `to: text.length` on A and `from: 0` on B.
 *
 * **Cleanup on unmount**: the walk only visits currently-mounted nodes, so
 * an unmounted node's stale fragments cannot contribute (mirrors cursor
 * invariant 5 + focus invariant 3). Per-frame recompute in `syncRectSignals`
 * additionally clears the signal back to `EMPTY_FRAGMENTS` when the prop is
 * removed without unmount.
 *
 * Per-node cost: one `props.selectionIntent` check + one signal lookup.
 * Trees with no selection declarer return `[]` after a single traversal.
 */
export function findActiveSelectionFragments(root: AgNode): readonly Rect[] {
  const out: Rect[] = []

  function walk(node: AgNode): void {
    for (const child of node.children) {
      walk(child)
    }
    const props = node.props as BoxProps | undefined
    if (props?.selectionIntent) {
      const s = signalMap.get(node)
      const fragments = s ? s.selectionFragments() : computeSelectionFragments(node)
      if (fragments.length > 0) {
        // Concat — multi-node selections compose for free.
        for (const r of fragments) out.push(r)
      }
    }
  }

  walk(root)
  return out
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
