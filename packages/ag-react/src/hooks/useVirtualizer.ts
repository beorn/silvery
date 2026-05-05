/**
 * useVirtualizer - Shared headless virtualization engine.
 *
 * Count-based API inspired by TanStack Virtual. Computes the visible range,
 * placeholder sizes, and scroll offsets for any scrollable view.
 *
 * Supports variable item heights via dynamic measurement: after each render,
 * consumers report actual item heights. The virtualizer uses measured heights
 * when available and falls back to `estimateHeight` for unmeasured items.
 * This eliminates the fixed-itemHeight problem where a single constant can't
 * accurately represent variable-height items (e.g., cards with 3-6 row heights).
 *
 * ## Architecture (2026-04-21, bead km-silvery.virtualizer-from-layout activated;
 * simplified 2026-04-20 per bead km-silvery.virtualizer-single-mode strategy a)
 *
 * The virtualizer has TWO operating modes, chosen automatically:
 *
 * ### Bootstrap mode (no `containerNode` or first render pre-layout)
 *
 * Used when the scroll container's AgNode isn't available yet (first render
 * before `Box.useLayoutEffect` has captured its ref). A MINIMAL count-based
 * seed: anchor the window at `scrollTo ?? 0`, render `minWindowSize` items
 * (estimatedVisibleCount + 2*overscan), and compute placeholder heights via
 * `sumHeights`. No height-aware forward walk, no mid-cycle
 * `calcEdgeBasedScrollOffset` dance — those were the feedback-loop sources
 * the old bootstrap carried over from pre-steady-state designs. The next
 * frame, steady-state takes over via `containerNode` + `scrollState` and
 * produces the authoritative window.
 *
 * ### Steady-state mode (containerNode + scrollState signal available)
 *
 * **READ, DON'T WALK.** The virtualizer consumes `useScrollState(containerNode)`
 * and reads `firstVisibleChild` / `lastVisibleChild` DIRECTLY from layout-phase.
 * It does NOT re-derive "what's visible" via its own pixel walk — that would
 * re-introduce the feedback loop where measurement arrivals shift the window
 * which shifts placeholder heights which shift scroll offsets which shift
 * which items are visible …
 *
 * The mapping `firstVisibleChild → firstVisibleItem` is straightforward:
 *   leadingOffset = leadingPlaceholder ? 1 : 0
 *   firstVisibleItem = prevStartIndex + (firstVisibleChild - leadingOffset)
 *
 * Where `prevStartIndex` is the window start we rendered LAST frame (carried
 * in a ref). Next frame's window is `[firstVisibleItem - overscan,
 * lastVisibleItem + overscan + 1)`.
 *
 * ### Convergence
 *
 * When firstVisible sits strictly inside the overscan margin of the prev
 * window, the new window equals (or is a subset of) the prev window — no
 * re-render → pipeline converges in 1-2 iterations. When firstVisible is near
 * a window edge (e.g. cursor just moved to a new item outside overscan), the
 * window shifts once and converges on the next iteration.
 *
 * Critically, avgMeasured is NOT used for the window bounds — it's only used
 * for placeholder heights (leading/trailing) via `sumHeights`, which doesn't
 * influence which items render. Measurement arrivals therefore can't feed
 * back into the window decision.
 *
 * Two components consume this hook:
 * - VirtualView: items mount/unmount based on scroll position (in-tree)
 * - ScrollbackView: items transition through Live → Virtualized → Static
 *
 * The hook is headless — it doesn't render anything. Consumers decide what
 * to do with the visible range.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AgNode } from "@silvery/ag/types"
import { useScrollState } from "./useScrollState"

// =============================================================================
// Types
// =============================================================================

export interface VirtualizerConfig {
  /** Total number of items */
  count: number
  /** Estimated height of each item in rows (fixed number or per-index function).
   * Used as fallback for items that haven't been measured yet. */
  estimateHeight: number | ((index: number) => number)
  /** Viewport height in rows */
  viewportHeight: number
  /** Index to scroll to (declarative). When undefined, scroll state freezes. */
  scrollTo?: number
  /** Padding from edge before scrolling (in items). Default: 1 */
  scrollPadding?: number
  /** Extra items to render beyond viewport. Default: 5 */
  overscan?: number
  /** Maximum items to render at once. Default: 100 */
  maxRendered?: number
  /** Gap between items in rows. Default: 0 */
  gap?: number
  /** Get a stable key for an item by index. Falls back to index if not provided. */
  getItemKey?: (index: number) => string | number
  /** Called when the visible range reaches near the end of the list (infinite scroll). */
  onEndReached?: () => void
  /** How many items from the end to trigger onEndReached. Default: 5 */
  onEndReachedThreshold?: number
  /**
   * Scroll container AgNode. When provided, the virtualizer subscribes to
   * layout-phase's scroll state for pixel-accurate window placement (no
   * count-based estimation). Obtain via a `ref` on the scroll container's
   * `<Box>` (Box's `BoxHandle.getNode()` or `setNode` pattern).
   *
   * When `null`/`undefined`, the virtualizer uses the bootstrap algorithm
   * (count-based `calcEdgeBasedScrollOffset` + estimate-driven window). This
   * is correct for the first render (before the Box has mounted) and for
   * consumers that don't wire up a container node.
   */
  containerNode?: AgNode | null
  /**
   * Number of extra AgNode children rendered AFTER the visible items (but
   * before the trailing placeholder). Used by consumers that render footer
   * content (e.g. ListView's `listFooter`) between items and trailing
   * placeholder. The virtualizer needs this to map layout-phase's
   * `lastVisibleChild` back to a virtual-item index.
   *
   * Default: 0.
   */
  trailingExtraChildren?: number
  /**
   * Current viewport width in columns. When provided, the measurement cache
   * is keyed by `(itemKey, viewportWidth)` so that resizing the pane
   * invalidates stale heights captured at the previous width — items that
   * wrap differently at a new width get re-measured cleanly. When omitted,
   * the cache is keyed by `itemKey` alone (legacy behaviour, only correct
   * for non-wrapping content). Default: undefined.
   */
  viewportWidth?: number
}

export interface VirtualizerResult {
  /** Range of visible items [startIndex, endIndex) */
  range: { startIndex: number; endIndex: number }
  /** Height before visible range (for leading placeholder) */
  leadingHeight: number
  /** Height after visible range (for trailing placeholder) */
  trailingHeight: number
  /** Number of items hidden before viewport */
  hiddenBefore: number
  /** Number of items hidden after viewport */
  hiddenAfter: number
  /** Current scroll offset (item index of viewport top) */
  scrollOffset: number
  /** Imperatively scroll to an item index */
  scrollToItem: (index: number) => void
  /** Get the key for an item at index */
  getKey: (index: number) => string | number
  /** Report a measured height for an item. Call after layout with actual
   * height. The optional `width` argument keys the cache by `(itemKey, width)`
   * so a pane resize doesn't keep returning stale heights. Omit width on
   * non-wrapping content to preserve the legacy by-id-only cache.
   * Returns true if the measurement changed (consumers can use this to
   * trigger re-render). */
  measureItem: (key: string | number, height: number, width?: number) => boolean
  /** Read-only access to the measured heights cache. Keys are
   * `${itemKey}:${width}` strings (or just `String(itemKey)` when width is
   * omitted). */
  measuredHeights: ReadonlyMap<string, number>
  /** Monotonic counter incremented whenever an item measurement changes. */
  measurementVersion: number
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_SCROLL_PADDING = 1
const DEFAULT_OVERSCAN = 5
const DEFAULT_MAX_RENDERED = 100

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compose a width-aware cache key from an itemKey and a viewport width.
 * When `viewportWidth` is undefined the cache key reduces to `itemKey`
 * alone — preserves legacy behaviour for callers that haven't wired up
 * the width signal yet.
 *
 * Width is tracked alongside the itemKey because wrapped content's height
 * is a function of available width: a paragraph that's 3 rows at width=80
 * may be 6 rows at width=40. Caching height by id alone produces stale
 * values after a pane resize.
 */
export function makeMeasureKey(itemKey: string | number, viewportWidth?: number): string {
  return viewportWidth === undefined ? String(itemKey) : `${itemKey}:${viewportWidth}`
}

function measuredHeightValuesForWidth(
  measuredHeights: ReadonlyMap<string, number>,
  viewportWidth?: number,
): number[] {
  if (viewportWidth === undefined) return [...measuredHeights.values()]
  const suffix = `:${viewportWidth}`
  const values: number[] = []
  for (const [key, height] of measuredHeights) {
    if (key.endsWith(suffix)) values.push(height)
  }
  return values
}

export function averageMeasuredHeightForWidth(
  measuredHeights: ReadonlyMap<string, number> | undefined,
  viewportWidth?: number,
): number | undefined {
  if (!measuredHeights || measuredHeights.size === 0) return undefined
  const values = measuredHeightValuesForWidth(measuredHeights, viewportWidth)
  if (values.length === 0) return undefined
  return values.reduce((sum, height) => sum + height, 0) / values.length
}

/** Get item height for a specific index, checking measured cache first.
 *
 * When measurements exist but this specific item hasn't been measured,
 * falls back to the average measured height (if provided) rather than
 * the original estimate. This prevents leading/trailing placeholders
 * from overshooting when estimateHeight diverges from actual heights.
 */
export function getHeight(
  index: number,
  estimateHeight: number | ((index: number) => number),
  measuredHeights?: ReadonlyMap<string, number>,
  getItemKey?: (index: number) => string | number,
  avgMeasuredHeight?: number,
  viewportWidth?: number,
): number {
  if (measuredHeights && measuredHeights.size > 0) {
    const baseKey = getItemKey ? getItemKey(index) : index
    const cacheKey = makeMeasureKey(baseKey, viewportWidth)
    const measured = measuredHeights.get(cacheKey)
    if (measured !== undefined) return measured
    // Use average measured height for unmeasured items — more accurate
    // than the original estimate which may diverge from actual heights.
    if (avgMeasuredHeight !== undefined) return avgMeasuredHeight
  }
  return typeof estimateHeight === "function" ? estimateHeight(index) : estimateHeight
}

/** Calculate average item height using measurements when available, sampling estimates otherwise. */
export function calcAverageHeight(
  count: number,
  estimateHeight: number | ((index: number) => number),
  measuredHeights?: ReadonlyMap<string, number>,
  viewportWidth?: number,
): number {
  if (count === 0) return 1

  // If we have measurements, compute average from them (more accurate)
  const avgMeasured = averageMeasuredHeightForWidth(measuredHeights, viewportWidth)
  if (avgMeasured !== undefined) return avgMeasured

  if (typeof estimateHeight === "number") return estimateHeight

  const sampleSize = Math.min(count, 10)
  let total = 0
  for (let i = 0; i < sampleSize; i++) {
    total += typeof estimateHeight === "function" ? estimateHeight(i) : estimateHeight
  }
  return total / sampleSize
}

/** Sum heights for a range of items, using measurements when available.
 * Optimized: when no measurements exist, uses multiplication instead of iteration.
 *
 * When measurements exist, unmeasured items in the range use the average
 * measured height as fallback (not the original estimate). This prevents
 * leading/trailing placeholders from overshooting when estimateHeight
 * diverges from actual heights — the root cause of blank rows at the top
 * (Bug 1) and inability to scroll to the bottom (Bug 2). */
export function sumHeights(
  startIndex: number,
  endIndex: number,
  estimateHeight: number | ((index: number) => number),
  gap: number,
  measuredHeights?: ReadonlyMap<string, number>,
  getItemKey?: (index: number) => string | number,
  viewportWidth?: number,
): number {
  const itemCount = endIndex - startIndex
  if (itemCount <= 0) return 0

  const gapTotal = (itemCount - 1) * gap

  // Fast path: no measurements and fixed estimate — use multiplication
  if ((!measuredHeights || measuredHeights.size === 0) && typeof estimateHeight === "number") {
    return itemCount * estimateHeight + gapTotal
  }

  // Compute average measured height once for use as fallback for unmeasured items.
  // This is more accurate than the original estimate for items outside the render window.
  let avgMeasured: number | undefined
  avgMeasured = averageMeasuredHeightForWidth(measuredHeights, viewportWidth)

  // Slow path: per-item lookup (checks measurement cache, falls back to avg measured or estimate)
  let total = 0
  for (let i = startIndex; i < endIndex; i++) {
    total += getHeight(i, estimateHeight, measuredHeights, getItemKey, avgMeasured, viewportWidth)
  }
  return total + gapTotal
}

// Note: findViewportTopItem / findViewportBottomItem were removed on
// 2026-04-21 when steady-state switched to "read, don't walk" — those
// pixel-walk helpers used avgMeasured for unmeasured items, which produced a
// feedback loop (measurement arrival → avgMeasured shift → window shift →
// re-measure). The new steady-state reads `firstVisibleChild`/
// `lastVisibleChild` directly from layout-phase's `scrollState` instead.

// =============================================================================
// Hook
// =============================================================================

/**
 * Headless virtualization engine.
 *
 * Computes which items should be visible given a viewport size and scroll
 * position. The scroll offset is computed synchronously during render
 * (not in useEffect) to avoid one-frame delays.
 *
 * Supports dynamic height measurement: after render, consumers call
 * `measureItem(key, height)` with actual heights. The virtualizer uses
 * measured heights for accurate placeholder sizes and visible count estimation,
 * falling back to `estimateHeight` for unmeasured items.
 *
 * When `containerNode` is provided AND layout-phase has produced a scroll
 * state for it, the virtualizer uses layout-phase's pixel-space truth
 * directly — no estimate-based math. Before the first layout pass (or when
 * `containerNode` is `null`), falls back to the count-based bootstrap path.
 *
 * When scrollTo is undefined, scroll state freezes at the last known position.
 * This is critical for multi-column layouts where only one column is active.
 */
// oxlint-disable-next-line complexity/complexity -- bootstrap + steady-state + measurement branches
export function useVirtualizer(config: VirtualizerConfig): VirtualizerResult {
  const {
    count,
    estimateHeight,
    viewportHeight,
    scrollTo,
    scrollPadding = DEFAULT_SCROLL_PADDING,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    gap = 0,
    getItemKey,
    containerNode,
    trailingExtraChildren = 0,
    viewportWidth,
  } = config

  // ── Measurement cache ─────────────────────────────────────────────
  // Stores actual rendered heights keyed by `${itemKey}:${width}` (or
  // `String(itemKey)` when no width is provided). Width-keying ensures a
  // pane resize invalidates stale heights for wrapped content. Survives
  // re-renders and accumulates as the user scrolls.
  const measuredHeightsRef = useRef<Map<string, number>>(new Map())
  // Counter to trigger re-computation when measurements change
  const [measurementVersion, setMeasurementVersion] = useState(0)

  const measureItem = useCallback(
    (key: string | number, height: number, width?: number): boolean => {
      const cache = measuredHeightsRef.current
      const cacheKey = makeMeasureKey(key, width)
      const existing = cache.get(cacheKey)
      if (existing === height) return false
      cache.set(cacheKey, height)
      // Schedule a re-render so placeholder sizes update with new measurements.
      // This is batched by React — multiple measureItem calls in the same
      // layout effect produce a single re-render.
      setMeasurementVersion((v) => v + 1)
      return true
    },
    [],
  )

  const measuredHeights = measuredHeightsRef.current

  // ── Track previous rendered window structure ───────────────────────
  // Needed to interpret `scrollState.firstVisibleChild` / `lastVisibleChild`
  // (which are AgNode child indices of the scroll container) as virtual-item
  // indices. Mapping depends on what was rendered LAST frame:
  //   children = [leadingPlaceholder?, item0, item1, ..., itemN-1,
  //               ...trailingExtras (footer etc.), trailingPlaceholder?]
  //   leadingOffset = hasLeading ? 1 : 0
  //   realItemChildStart = leadingOffset
  //   realItemChildEnd   = leadingOffset + N      (exclusive)
  //
  // Invariant: mapping below reads from THIS ref (last-frame's structure),
  // NOT from the current window calc. The current window calc produces the
  // NEXT frame's structure and updates this ref.
  const prevWindowRef = useRef<{
    startIndex: number
    endIndex: number
    hasLeading: boolean
    hasTrailing: boolean
    trailingExtras: number
  }>({
    startIndex: 0,
    endIndex: 0,
    hasLeading: false,
    hasTrailing: false,
    trailingExtras: 0,
  })

  // ── Subscribe to layout-phase scroll state (steady-state mode) ────
  // Returns null before the first layout pass, for non-scroll containers, or
  // when `containerNode` is null. When non-null, we have pixel-space truth
  // about what's visible.
  //
  // REACTIVE FORM: re-render on every scroll-state change. The scroll-phase
  // is stable by construction — `calculateScrollState` handles "target taller
  // than viewport" explicitly, so the offset converges in one iteration
  // regardless of target size. Earlier versions used a callback form with a
  // window-stability debounce to absorb offset oscillation; that oscillation
  // is eliminated upstream, so the simple reactive path is correct.
  //
  // `useScrollState` only fires when a field actually changes (per-field
  // equality in `syncRectSignals`), so idle renders don't churn this hook.
  const scrollState = useScrollState(containerNode ?? null)

  // Steady-state gating. Two conditions to enable read-don't-walk mode:
  // (1) scroll state exists with a non-zero viewport — layout ran,
  // (2) content actually overflows viewport — otherwise there's nothing to
  //     virtualize and the bootstrap fast-path "render everything" is fine.
  //
  // We deliberately DO NOT require `measuredHeights.size > 0`. The old walk-
  // based steady-state used `avgMeasured` to estimate heights for unmeasured
  // items, and measurement arrivals would shift avgMeasured → shift the walk's
  // conclusions → shift the window → re-render → re-measure → loop.
  //
  // Read-don't-walk reads `firstVisibleChild` / `lastVisibleChild` DIRECTLY
  // from layout-phase. Those are child INDICES (not pixel positions), so they
  // don't depend on unmeasured-item estimates at all. The feedback loop is
  // severed by topology.
  const hasSteadyState =
    scrollState !== null &&
    scrollState.viewportHeight > 0 &&
    scrollState.contentHeight > scrollState.viewportHeight

  // Calculate average item height for estimating visible count.
  // Uses measured heights when available for more accurate estimation.
  const avgHeight = calcAverageHeight(count, estimateHeight, measuredHeights, viewportWidth)
  // Use ceil to match rendering behavior: items that partially overflow
  // the viewport are still rendered (clipped by overflow="hidden").
  const estimatedVisibleCount = Math.max(1, Math.ceil(viewportHeight / (avgHeight + gap)))

  // Selected index as ref — doesn't trigger re-renders when cursor moves
  // within the viewport.
  const selectedIndexRef = useRef(Math.max(0, Math.min(scrollTo ?? 0, count - 1)))

  // Scroll offset (item index) — the cursor / viewport anchor.
  //
  // This is the PUBLIC API field consumers read to compute their scroll anchor
  // (e.g. ListView's `boxScrollTo` fallback when `scrollTo` is undefined).
  // We no longer run `calcEdgeBasedScrollOffset` here: the edge-based
  // "ensure-visible with padding" behaviour is handled by the real scroll
  // container (`Box overflow="scroll"`) in steady-state, and during bootstrap
  // the window is small enough that the anchor doesn't need padding math.
  //
  // We also do NOT derive this ref from `scrollState.offset`. If we did, each
  // measurement that shifted `avgMeasured` would shift which item owns the
  // viewport-top pixel, which would change `scrollOffsetRef`, which would
  // setScrollOffset → re-render → re-measure → oscillation.
  const scrollOffsetRef = useRef(selectedIndexRef.current)
  const [, setScrollOffset] = useState(() => scrollOffsetRef.current)

  // Track the previous scrollTo value so we can distinguish "cursor moved"
  // from "cursor stayed; some visible item's HEIGHT changed". The latter
  // must not trigger edge-based re-scroll or clicked-to-expand jumps the
  // viewport (the growing cursor row now exceeds visibleEndExclusive and
  // gets anchored to the bottom). Net effect felt to the user: "the line
  // I clicked flies off-screen when I expand it." See bead km-silvery.
  const prevScrollToRef = useRef<number | undefined>(scrollTo)
  const prevScrollToValue = prevScrollToRef.current
  const scrollToChanged = scrollTo !== prevScrollToValue
  prevScrollToRef.current = scrollTo

  if (scrollTo !== undefined) {
    const clampedIndex = Math.max(0, Math.min(scrollTo, count - 1))
    selectedIndexRef.current = clampedIndex
    // Edge-based scroll: only adjust the anchor when scrollTo would land
    // OUTSIDE the currently visible window. Without this guard, every cursor
    // move sets `scrollOffsetRef.current = scrollTo` — making the cursor item
    // the leftmost (or topmost) visible item even when it was already in view.
    // User-visible: pressing →/l in a multi-column board would scroll the
    // board on every keypress, leaving the cursor "stuck" in column 0.
    // Bead: km-tui.cursor-stuck-col-0-h-scrolls.
    //
    // Additional guard: also only run on CURSOR-MOVE renders, not on
    // height-change renders. If `scrollTo` didn't change since last render,
    // the cursor index didn't move — skip the off-screen adjustment even
    // if item sizes shifted. Without this, expanding the cursor row (or
    // any item whose size change reduces `estimatedVisibleCount` below
    // the cursor's visible position) re-anchors the viewport to bottom.
    if (scrollToChanged) {
      const currentOffset = scrollOffsetRef.current
      const visibleEndExclusive = currentOffset + estimatedVisibleCount
      const movingLeft = prevScrollToValue !== undefined && clampedIndex < prevScrollToValue
      if (clampedIndex < currentOffset) {
        // Off-screen above: scroll so target becomes topmost.
        scrollOffsetRef.current = clampedIndex
      } else if (clampedIndex >= visibleEndExclusive) {
        // Off-screen below: scroll so target becomes bottommost.
        scrollOffsetRef.current = Math.max(0, clampedIndex - estimatedVisibleCount + 1)
      } else if (movingLeft && clampedIndex === currentOffset && currentOffset > 0) {
        // Symmetric scroll-back: cursor retreats into the leading edge with
        // items hidden before. Pull viewport back by 1 so prior context
        // becomes visible. Without this, going l,l,h leaves the viewport
        // stuck at [col2,col3] even though the cursor is on col2 — col1
        // stays hidden. Bead: km-qlib7.
        //
        // Asymmetric by design — NOT mirrored on the right side. The right-
        // side advance only fires when cursor goes OFF-SCREEN
        // (≥ visibleEndExclusive). Adding a "cursor at trailing edge moving
        // right → advance" rule would re-trigger the
        // cursor-stuck-col-0-h-scrolls bug: pressing l from col0 with
        // visible=[col0,col1] would push viewport to [col1,col2], leaving
        // cursor pinned at the leading edge. The asymmetry is necessary —
        // `movingLeft` is the discriminator: scroll-back happens when cursor
        // *retreats* into a leading edge that has hidden items behind it,
        // which never happens on cursor advance into the trailing edge.
        scrollOffsetRef.current = Math.max(0, currentOffset - 1)
      }
    }
  }

  const effectiveScrollOffset = scrollOffsetRef.current

  // Sync state with ref (triggers re-render for dependents only when changed).
  useEffect(() => {
    setScrollOffset((prev) => (prev === effectiveScrollOffset ? prev : effectiveScrollOffset))
  }, [effectiveScrollOffset])

  // Imperative scroll function — sets the anchor; the scroll container
  // handles the actual scroll (edge-based "keep in view with padding" lives
  // in Box's overflow="scroll" path, not here).
  const scrollToItem = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, count - 1))
      selectedIndexRef.current = clampedIndex
      scrollOffsetRef.current = clampedIndex
      setScrollOffset(clampedIndex)
    },
    [count],
  )

  // Key resolver
  const getKey = useCallback(
    (index: number): string | number => {
      return getItemKey ? getItemKey(index) : index
    },
    [getItemKey],
  )

  // Effective scroll-state fields for the window calc. Only firstVisibleChild
  // / lastVisibleChild influence the window (offset affects only placeholder
  // heights via sumHeights, which is stable when indices don't shift).
  //
  // Extracted outside useMemo so the memo dependency list is just primitives
  // (no new object allocation per render).
  const ssFirstVisibleChild = hasSteadyState && scrollState ? scrollState.firstVisibleChild : -1
  const ssLastVisibleChild = hasSteadyState && scrollState ? scrollState.lastVisibleChild : -1

  // Calculate virtualization window.
  // Depends on measurementVersion to recompute placeholders when measurements arrive.
  const windowCalc = useMemo(() => {
    if (count === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        leadingHeight: 0,
        trailingHeight: 0,
      }
    }

    // For tiny lists (≤ visible + overscan), render everything.
    // This bypass applies in both modes (steady-state and bootstrap) —
    // nothing to virtualize when the list already fits.
    const minWindowSize = estimatedVisibleCount + 2 * overscan
    if (count <= minWindowSize) {
      return {
        startIndex: 0,
        endIndex: count,
        leadingHeight: 0,
        trailingHeight: 0,
      }
    }

    // ─── Steady-state mode: READ, DON'T WALK ────────────────────────
    //
    // Layout-phase's `scrollState` already knows which AgNode children
    // intersect the viewport — `firstVisibleChild` and `lastVisibleChild`.
    // We map those back to virtual-item indices using the LAST FRAME's
    // rendered window structure (stored in prevWindowRef).
    //
    // Child layout last frame was:
    //   [leadingPlaceholder?, item(prevStart), ..., item(prevEnd-1),
    //    ...trailingExtras (footer etc.), trailingPlaceholder?]
    //
    //   leadingOffset       = prevHasLeading ? 1 : 0
    //   realItemChildStart  = leadingOffset
    //   realItemChildEnd    = leadingOffset + (prevEnd - prevStart)  (excl)
    //
    // Mapping a child index `c`:
    //   c < leadingOffset                    → "before window" (in leading
    //                                           placeholder)
    //   leadingOffset ≤ c < realItemChildEnd → virtual item = prevStart +
    //                                           (c - leadingOffset)
    //   otherwise                            → "after window" (extras or
    //                                           trailing placeholder)
    //
    // CRUCIAL: We do NOT consult `measuredHeights` or `avgHeight` here. The
    // window bounds are a pure function of (prevWindow, firstVisibleChild,
    // lastVisibleChild, overscan). This severs the measurement → avgMeasured
    // → window feedback loop that caused the 5-iteration layout-loop blowup
    // on the walk-based steady-state activation attempt.
    if (hasSteadyState && scrollState) {
      const prev = prevWindowRef.current
      const prevStart = prev.startIndex
      const prevEnd = prev.endIndex
      const prevVisibleCount = prevEnd - prevStart
      const leadingOffset = prev.hasLeading ? 1 : 0
      const realItemChildEnd = leadingOffset + prevVisibleCount

      // Degenerate: no items rendered last frame (e.g. bootstrap transition).
      // Fall through to bootstrap below — the prev ref is empty.
      if (prevVisibleCount > 0) {
        type Mapped = { kind: "item"; idx: number } | { kind: "before" } | { kind: "after" }
        const mapChild = (c: number): Mapped => {
          if (c < leadingOffset) return { kind: "before" }
          if (c >= realItemChildEnd) return { kind: "after" }
          return { kind: "item", idx: prevStart + (c - leadingOffset) }
        }

        const firstMapped = mapChild(ssFirstVisibleChild)
        const lastMapped = mapChild(ssLastVisibleChild)

        // Derive the anchor window — the virtual-item range that MUST be
        // in the next frame's window (plus overscan). When firstVisible maps
        // to "before" (leading placeholder visible), shift start earlier.
        // When lastVisible maps to "after" (trailing visible), extend end.
        let firstVisibleItem: number
        let lastVisibleItem: number

        if (firstMapped.kind === "item") {
          firstVisibleItem = firstMapped.idx
        } else if (firstMapped.kind === "before") {
          // Leading placeholder is the first visible child. Items before
          // prevStart are visible. Anchor as "0..prevStart-1 may be visible"
          // — shift anchor earlier to pull items in. We don't know HOW many
          // items of the leading placeholder are visible (it's a single
          // opaque Box), so shift by a conservative amount: enough to
          // guarantee the next window will include prevStart - overscan at
          // minimum, which forces a further shift next frame if still short.
          firstVisibleItem = Math.max(0, prevStart - overscan)
        } else {
          // Leading placeholder gone AND firstVisible points past real items
          // — unusual (would mean viewport shows only footer/trailing).
          // Defensive anchor at prev window.
          firstVisibleItem = prevStart
        }

        if (lastMapped.kind === "item") {
          lastVisibleItem = lastMapped.idx
        } else if (lastMapped.kind === "after") {
          // Trailing placeholder (or footer) is the last visible child.
          // Items after prevEnd-1 may be visible. Shift anchor later to
          // pull more items in.
          lastVisibleItem = Math.min(count - 1, prevEnd - 1 + overscan)
        } else {
          // lastVisible < leadingOffset: entire viewport is in leading
          // placeholder (cursor above window). Extend anchor earlier.
          lastVisibleItem = firstVisibleItem
        }

        // Clamp to valid range.
        firstVisibleItem = Math.max(0, Math.min(firstVisibleItem, count - 1))
        lastVisibleItem = Math.max(firstVisibleItem, Math.min(lastVisibleItem, count - 1))

        // Cursor-anchor expansion: when the consumer moved the cursor
        // (via `scrollTo`) to an item outside the current window, expand
        // the visible range to include it. Without this, steady-state
        // would stay anchored to the last-rendered viewport range even
        // after a cursor jump, because layout-phase's `firstVisibleChild`
        // still points at items from the PRIOR frame (not the cursor).
        //
        // The scrollState-based read handles scroll-driven changes (user
        // wheel, boxScrollTo-triggered scroll settles within a few frames);
        // this branch handles cursor-driven jumps (G, PgDn, typed index).
        let firstAnchor = firstVisibleItem
        let lastAnchor = lastVisibleItem
        if (scrollTo !== undefined) {
          const cursor = Math.max(0, Math.min(scrollTo, count - 1))
          if (cursor < firstAnchor) firstAnchor = cursor
          if (cursor > lastAnchor) lastAnchor = cursor
        }

        // Choose new window with symmetric overscan, plus a superset with
        // the previous window so small cursor nudges don't shift items in
        // and out rapidly (reduces re-render churn on near-boundary moves).
        let start = Math.max(0, firstAnchor - overscan)
        let end = Math.min(count, lastAnchor + 1 + overscan)

        // Union with previous window to dampen oscillations. We only union
        // when the previous window already covered the new anchor — this
        // avoids never shrinking when the user genuinely scrolled far.
        if (prevStart <= firstAnchor && lastAnchor < prevEnd) {
          start = Math.min(start, prevStart)
          end = Math.max(end, prevEnd)
        }

        // Enforce minimum item count.
        end = Math.min(count, Math.max(end, start + minWindowSize))
        // Pull start earlier if we hit end-of-list and window too small.
        if (end === count && end - start < minWindowSize) {
          start = Math.max(0, end - minWindowSize)
        }
        // Safety cap — bounds overscan/union expansion, NOT the cursor. The
        // cap must never evict the CURSOR (scrollTo). Extrapolated anchors
        // from scrollState (trailing-placeholder inference, etc.) must stay
        // under the cap, otherwise a perpetually-visible trailing placeholder
        // would expand the window frame over frame until count is reached.
        //
        // So: floor end at `cursor + 1` (only the declarative scrollTo), then
        // cap at `start + maxRendered`.
        const cursorFloor =
          scrollTo !== undefined ? Math.max(0, Math.min(scrollTo, count - 1)) + 1 : 0
        const cappedEnd = Math.max(cursorFloor, start + maxRendered)
        end = Math.min(end, cappedEnd)

        const leadingSize = sumHeights(
          0,
          start,
          estimateHeight,
          gap,
          measuredHeights,
          getItemKey,
          viewportWidth,
        )
        const trailingSize = sumHeights(
          end,
          count,
          estimateHeight,
          gap,
          measuredHeights,
          getItemKey,
          viewportWidth,
        )

        return {
          startIndex: start,
          endIndex: end,
          leadingHeight: leadingSize,
          trailingHeight: trailingSize,
        }
      }
    }

    // ─── Bootstrap mode: minimal count-based seed ───────────────────
    //
    // Used on the first render (before layout has run) and when the caller
    // doesn't pass `containerNode`. The goal is just to produce SOMETHING
    // reasonable so tests that inspect the first-render output see content;
    // the NEXT render (once `containerNode` is captured and `scrollState`
    // flows in) hands control to the steady-state branch above.
    //
    // Window: anchor at `effectiveScrollOffset` (= cursor or 0), render
    // `minWindowSize` items (estimatedVisibleCount + 2*overscan). Placeholder
    // heights come from `sumHeights` so `representsItems` / ▲N ▼N counts
    // still reflect the full list.
    //
    // The old bootstrap did a height-aware forward walk + mid-cycle
    // `calcEdgeBasedScrollOffset` dance. That was the source of the
    // measurement → avgMeasured → window-shift feedback loop we severed
    // upstream; steady-state makes the walk redundant because layout-phase
    // already knows what's visible. Simpler seed + one-frame handoff.
    const minItems = estimatedVisibleCount + 2 * overscan

    let start = Math.max(0, effectiveScrollOffset - overscan)
    let end = Math.min(count, start + minItems)
    // If we hit the end, pull start back to keep the window at `minItems`.
    if (end === count) {
      start = Math.max(0, end - minItems)
    }
    // Safety cap — bounds overscan, NOT the cursor. When the viewport is
    // tall enough that `minItems > maxRendered` the naive cap `end = min(end,
    // start + maxRendered)` can clamp end BEFORE the cursor, leaving the Box
    // unable to scroll to it → layout loop spins. Floor end at cursor+1.
    // Note: `effectiveScrollOffset` IS the cursor on bootstrap (it's seeded
    // from `scrollTo` on mount), so this bounds correctly.
    const cappedEnd = Math.max(effectiveScrollOffset + 1, start + maxRendered)
    end = Math.min(end, cappedEnd)

    // Placeholder sizes using measured heights when available; sumHeights
    // falls back to estimate for unmeasured items.
    const leadingSize = sumHeights(
      0,
      start,
      estimateHeight,
      gap,
      measuredHeights,
      getItemKey,
      viewportWidth,
    )
    const trailingSize = sumHeights(
      end,
      count,
      estimateHeight,
      gap,
      measuredHeights,
      getItemKey,
      viewportWidth,
    )

    return {
      startIndex: start,
      endIndex: end,
      leadingHeight: leadingSize,
      trailingHeight: trailingSize,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measuredHeights is a stable ref; measurementVersion triggers recomputation
  }, [
    count,
    effectiveScrollOffset,
    maxRendered,
    overscan,
    estimateHeight,
    avgHeight,
    gap,
    viewportHeight,
    measurementVersion,
    getItemKey,
    trailingExtraChildren,
    // Steady-state inputs — primitives so the memo fires only when values change.
    // scrollState itself is a stable ref between layouts (per-field equality in
    // layout-signals), so any relevant change shows up via these derived primitives.
    hasSteadyState,
    ssFirstVisibleChild,
    ssLastVisibleChild,
    // Width-keyed measurement cache: re-sum placeholders when the viewport
    // width changes (cache lookups will pull a different slice of entries).
    viewportWidth,
  ])

  // Update previous-window ref AFTER the memo computes the new window. The
  // ref captures what we're about to render THIS frame — next frame will
  // map `scrollState.*` through this structure.
  prevWindowRef.current = {
    startIndex: windowCalc.startIndex,
    endIndex: windowCalc.endIndex,
    hasLeading: windowCalc.leadingHeight > 0,
    hasTrailing: windowCalc.trailingHeight > 0,
    trailingExtras: trailingExtraChildren,
  }

  // ── onEndReached ─────────────────────────────────────────────────────
  // Fire once when the visible window reaches near the end. Resets when
  // count changes (i.e. new items were loaded).
  const onEndReachedRef = useRef(config.onEndReached)
  onEndReachedRef.current = config.onEndReached
  const firedForCountRef = useRef(-1)

  const threshold = config.onEndReachedThreshold ?? DEFAULT_OVERSCAN
  const { endIndex } = windowCalc

  useEffect(() => {
    if (!onEndReachedRef.current || count === 0) return
    if (endIndex >= count - threshold && firedForCountRef.current !== count) {
      firedForCountRef.current = count
      onEndReachedRef.current()
    }
  }, [endIndex, count, threshold])

  return {
    range: { startIndex: windowCalc.startIndex, endIndex: windowCalc.endIndex },
    leadingHeight: windowCalc.leadingHeight,
    trailingHeight: windowCalc.trailingHeight,
    hiddenBefore: windowCalc.startIndex,
    hiddenAfter: count - windowCalc.endIndex,
    scrollOffset: effectiveScrollOffset,
    scrollToItem,
    getKey,
    measureItem,
    measuredHeights,
    measurementVersion,
  }
}
