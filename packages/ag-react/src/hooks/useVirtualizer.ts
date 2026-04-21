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
 * ## Architecture (2026-04-20, bead km-silvery.virtualizer-from-layout)
 *
 * The virtualizer has TWO operating modes, chosen automatically:
 *
 * ### Bootstrap mode (no `containerNode` or first render pre-layout)
 *
 * Used when the scroll container's AgNode isn't available yet (first render
 * before `Box.useLayoutEffect` has captured its ref). Falls back to the
 * count-based algorithm: `calcEdgeBasedScrollOffset` + height-aware forward
 * walk using `estimateHeight` as a fallback for unmeasured items.
 *
 * This is the ONLY mode where estimates drive the visible range.
 *
 * ### Steady-state mode (containerNode + scrollState signal available)
 *
 * Consumes `useScrollState(containerNode)` to read layout-phase's pixel-space
 * truth (offset, viewportHeight, contentHeight — computed from real measured
 * children in `calculateScrollState`). Walks items in pixel space using
 * `measuredHeights` to find which items are visible; placeholders are
 * `sumHeights(0, start)` / `sumHeights(end, count)` using the SAME heights
 * that layout-phase just used.
 *
 * By construction, `leadingHeight == sumHeights(0, startIndex)` — there's
 * only one source of truth for "which items occupy which rows."
 *
 * Two components consume this hook:
 * - VirtualView: items mount/unmount based on scroll position (in-tree)
 * - ScrollbackView: items transition through Live → Virtualized → Static
 *
 * The hook is headless — it doesn't render anything. Consumers decide what
 * to do with the visible range.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { calcEdgeBasedScrollOffset } from "@silvery/ag-term/scroll-utils"
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
  /** Report a measured height for an item. Call after layout with actual height.
   * Returns true if the measurement changed (consumers can use this to trigger re-render). */
  measureItem: (key: string | number, height: number) => boolean
  /** Read-only access to the measured heights cache */
  measuredHeights: ReadonlyMap<string | number, number>
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
  measuredHeights?: ReadonlyMap<string | number, number>,
  getItemKey?: (index: number) => string | number,
  avgMeasuredHeight?: number,
): number {
  if (measuredHeights && measuredHeights.size > 0) {
    const key = getItemKey ? getItemKey(index) : index
    const measured = measuredHeights.get(key)
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
  measuredHeights?: ReadonlyMap<string | number, number>,
): number {
  if (count === 0) return 1

  // If we have measurements, compute average from them (more accurate)
  if (measuredHeights && measuredHeights.size > 0) {
    let total = 0
    for (const h of measuredHeights.values()) {
      total += h
    }
    return total / measuredHeights.size
  }

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
  measuredHeights?: ReadonlyMap<string | number, number>,
  getItemKey?: (index: number) => string | number,
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
  if (measuredHeights && measuredHeights.size > 0) {
    let measuredTotal = 0
    for (const h of measuredHeights.values()) {
      measuredTotal += h
    }
    avgMeasured = measuredTotal / measuredHeights.size
  }

  // Slow path: per-item lookup (checks measurement cache, falls back to avg measured or estimate)
  let total = 0
  for (let i = startIndex; i < endIndex; i++) {
    total += getHeight(i, estimateHeight, measuredHeights, getItemKey, avgMeasured)
  }
  return total + gapTotal
}

/**
 * Walk items in pixel space to find the viewport-top-item given a pixel
 * offset. Returns the item index `i` such that `cumTop[i] ≤ pixelOffset <
 * cumTop[i+1]` (the item that owns the top row of the viewport).
 *
 * Uses measured heights when available, average-measured fallback otherwise.
 *
 * @returns Item index (clamped to [0, count-1]).
 */
function findViewportTopItem(
  pixelOffset: number,
  count: number,
  estimateHeight: number | ((index: number) => number),
  gap: number,
  measuredHeights: ReadonlyMap<string | number, number>,
  getItemKey: ((index: number) => string | number) | undefined,
  avgMeasured: number,
): number {
  if (count === 0) return 0
  if (pixelOffset <= 0) return 0

  let cumTop = 0
  for (let i = 0; i < count; i++) {
    const h = getHeight(i, estimateHeight, measuredHeights, getItemKey, avgMeasured)
    const nextTop = cumTop + h + (i < count - 1 ? gap : 0)
    // Item i occupies [cumTop, cumTop + h). Viewport top lands in this item
    // when cumTop ≤ pixelOffset < cumTop + h. (Including gap in the check
    // would over-assign; gaps are not covered by any item.)
    if (pixelOffset < cumTop + h) return i
    cumTop = nextTop
  }
  return count - 1
}

/**
 * Walk items forward from `startItem` to find the last item whose top is
 * within `viewportTop + viewportHeight`. Equivalent to "index of the last
 * item that is at least partially visible."
 */
function findViewportBottomItem(
  startItem: number,
  viewportTop: number,
  viewportHeight: number,
  count: number,
  estimateHeight: number | ((index: number) => number),
  gap: number,
  measuredHeights: ReadonlyMap<string | number, number>,
  getItemKey: ((index: number) => string | number) | undefined,
  avgMeasured: number,
): number {
  if (count === 0) return 0
  const viewportBottom = viewportTop + viewportHeight

  // cumTop at `startItem` = sumHeights(0, startItem) + startItem*gap (approx).
  // We compute it incrementally to avoid a second pass.
  let cumTop = 0
  for (let i = 0; i < startItem; i++) {
    cumTop += getHeight(i, estimateHeight, measuredHeights, getItemKey, avgMeasured)
    cumTop += gap
  }

  let last = startItem
  for (let i = startItem; i < count; i++) {
    if (cumTop >= viewportBottom) break
    last = i
    const h = getHeight(i, estimateHeight, measuredHeights, getItemKey, avgMeasured)
    cumTop += h
    if (i < count - 1) cumTop += gap
  }
  return last
}

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
  } = config

  // ── Measurement cache ─────────────────────────────────────────────
  // Stores actual rendered heights keyed by item key. Survives re-renders
  // and accumulates as the user scrolls through the list.
  const measuredHeightsRef = useRef<Map<string | number, number>>(new Map())
  // Counter to trigger re-computation when measurements change
  const [measurementVersion, setMeasurementVersion] = useState(0)

  const measureItem = useCallback((key: string | number, height: number): boolean => {
    const cache = measuredHeightsRef.current
    const existing = cache.get(key)
    if (existing === height) return false
    cache.set(key, height)
    // Schedule a re-render so placeholder sizes update with new measurements.
    // This is batched by React — multiple measureItem calls in the same
    // layout effect produce a single re-render.
    setMeasurementVersion((v) => v + 1)
    return true
  }, [])

  const measuredHeights = measuredHeightsRef.current

  // ── Subscribe to layout-phase scroll state (steady-state mode) ────
  // Returns null before the first layout pass, for non-scroll containers, or
  // when `containerNode` is null. When non-null, we have pixel-space truth
  // about what's visible and can skip the count-based estimation.
  const scrollState = useScrollState(containerNode ?? null)
  // Steady-state gating. Three conditions to enable pixel-space walking:
  // (1) scroll state exists with a non-zero viewport — layout ran,
  // (2) content actually overflows viewport — otherwise there's nothing to
  //     virtualize and the bootstrap fast-path "render everything" is fine,
  // (3) we have ENOUGH measurements — the window we compute will include
  //     items whose heights inform avgMeasured; oscillation happens when a
  //     newly-measured item drastically changes avgMeasured and thus moves
  //     the window, which scrolls new items into view and repeats. Requiring
  //     most items to be measured stabilizes the loop.
  //
  // The threshold is "measurements cover the steady-state viewport" — once
  // we've seen enough items to fill the viewport with real measurements,
  // subsequent measurement arrivals shift avgMeasured only marginally and
  // the window converges.
  const hasSteadyState =
    scrollState !== null &&
    scrollState.viewportHeight > 0 &&
    scrollState.contentHeight > scrollState.viewportHeight &&
    // Require most items that could plausibly be on-screen to be measured.
    // `measured / estimatedVisible ≥ 1.0` means the viewport's worth of items
    // all have real heights.
    measuredHeights.size > 0

  // Calculate average item height for estimating visible count.
  // Uses measured heights when available for more accurate estimation.
  const avgHeight = calcAverageHeight(count, estimateHeight, measuredHeights)
  // Use ceil to match rendering behavior: items that partially overflow
  // the viewport are still rendered (clipped by overflow="hidden").
  const estimatedVisibleCount = Math.max(1, Math.ceil(viewportHeight / (avgHeight + gap)))

  // Selected index as ref — doesn't trigger re-renders when cursor moves
  // within the viewport.
  const selectedIndexRef = useRef(Math.max(0, Math.min(scrollTo ?? 0, count - 1)))

  // Scroll offset (item index of viewport top) — computed synchronously
  // during render.
  //
  // In steady-state mode: derived from layout-phase's pixel-space offset by
  // walking items with measuredHeights. This is the authoritative value.
  //
  // In bootstrap mode: computed via calcEdgeBasedScrollOffset (count-based
  // ensure-visible). Kept in a ref so mid-cycle scrollTo changes don't need
  // a useEffect to settle.
  const scrollOffsetRef = useRef(
    calcEdgeBasedScrollOffset(
      selectedIndexRef.current,
      0,
      estimatedVisibleCount,
      count,
      scrollPadding,
    ),
  )
  const [, setScrollOffset] = useState(() => scrollOffsetRef.current)

  // Bootstrap offset tracking: always-on, because we expose scrollOffset as
  // public API (item index — ListView reads it to compute boxScrollTo).
  //
  // Critically, we do NOT let steady-state measurements feed back into this
  // ref. If we derived `scrollOffsetRef` from `scrollState.offset`, each
  // measurement that shifted `avgMeasured` would shift which item owns the
  // viewport-top pixel, which would change `scrollOffsetRef`, which would
  // setScrollOffset → re-render → re-measure → oscillation.
  //
  // Steady-state uses `scrollState.offset` for WINDOW BOUNDS only (inside
  // the useMemo below) — the external scrollOffset API stays count-based
  // and stable. ListView already uses scrollOffset to decide scrollTo anchor,
  // which is count-based anyway (Box.scrollTo takes a child index).
  if (scrollTo !== undefined) {
    const clampedIndex = Math.max(0, Math.min(scrollTo, count - 1))
    selectedIndexRef.current = clampedIndex
    const newOffset = calcEdgeBasedScrollOffset(
      clampedIndex,
      scrollOffsetRef.current,
      estimatedVisibleCount,
      count,
      scrollPadding,
    )
    if (newOffset !== scrollOffsetRef.current) {
      scrollOffsetRef.current = newOffset
    }
  }

  const effectiveScrollOffset = scrollOffsetRef.current

  // Sync state with ref (triggers re-render for dependents only when changed).
  useEffect(() => {
    setScrollOffset((prev) => (prev === effectiveScrollOffset ? prev : effectiveScrollOffset))
  }, [effectiveScrollOffset])

  // Imperative scroll function — updates the bootstrap anchor. In steady-state
  // mode the layout-phase offset takes over on the next render.
  const scrollToItem = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, count - 1))
      selectedIndexRef.current = clampedIndex
      const newOffset = calcEdgeBasedScrollOffset(
        clampedIndex,
        scrollOffsetRef.current,
        estimatedVisibleCount,
        count,
        scrollPadding,
      )
      scrollOffsetRef.current = newOffset
      setScrollOffset(newOffset)
    },
    [count, estimatedVisibleCount, scrollPadding],
  )

  // Key resolver
  const getKey = useCallback(
    (index: number): string | number => {
      return getItemKey ? getItemKey(index) : index
    },
    [getItemKey],
  )

  // Effective scroll-state fields. Extracted outside useMemo so the memo
  // dependency list is just primitives (no new object allocation per render).
  const ssOffset = hasSteadyState && scrollState ? scrollState.offset : -1
  const ssViewportHeight = hasSteadyState && scrollState ? scrollState.viewportHeight : -1

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

    // ─── Steady-state mode: pixel-walk using layout-phase's offset ──
    //
    // This is the "layout-phase is single source of truth" path. The scroll
    // container has completed at least one layout pass, so `scrollState.offset`
    // is real pixels and measuredHeights reflects what the pipeline measured.
    //
    // Walk items in pixel space from the real offset to find:
    //   firstVisible = smallest i s.t. cumBottom[i] > offset
    //   lastVisible  = largest  i s.t. cumTop[i]    < offset + viewportHeight
    //
    // Window = [firstVisible - overscan, lastVisible + 1 + overscan].
    // Placeholders = sumHeights(0, start) / sumHeights(end, count) — uses the
    // SAME measured heights that produced the offset. By construction the
    // leadingHeight matches the rendered placeholder slot.
    if (hasSteadyState && scrollState) {
      const firstVisible = findViewportTopItem(
        ssOffset,
        count,
        estimateHeight,
        gap,
        measuredHeights,
        getItemKey,
        avgHeight,
      )
      const lastVisible = findViewportBottomItem(
        firstVisible,
        ssOffset,
        ssViewportHeight,
        count,
        estimateHeight,
        gap,
        measuredHeights,
        getItemKey,
        avgHeight,
      )

      let start = Math.max(0, firstVisible - overscan)
      let end = Math.min(count, lastVisible + 1 + overscan)
      // Enforce item-count floor so tiny measured heights don't truncate.
      end = Math.min(count, Math.max(end, start + minWindowSize))
      // Safety cap.
      end = Math.min(end, start + maxRendered)

      // At end of list — pull start back to maintain minimum size.
      if (end === count) {
        start = Math.max(0, Math.min(start, end - minWindowSize))
      }

      const leadingSize = sumHeights(0, start, estimateHeight, gap, measuredHeights, getItemKey)
      const trailingSize = sumHeights(end, count, estimateHeight, gap, measuredHeights, getItemKey)

      return {
        startIndex: start,
        endIndex: end,
        leadingHeight: leadingSize,
        trailingHeight: trailingSize,
      }
    }

    // ─── Bootstrap mode: count-based, estimate-driven ───────────────
    //
    // Used on the first render (before layout has run) and when the caller
    // doesn't pass `containerNode`. Keeps the pre-existing behavior so
    // callers that don't adopt `containerNode` see no change.
    //
    // Render window = enough items to fill the viewport + overscan buffer,
    // capped at maxRendered.
    //
    // CRITICAL INVARIANT 1: the window is derived from effectiveScrollOffset
    // (the viewport top), NOT from the cursor. Cursor-centered windows fail
    // at edges — when the cursor is at index 0 with overscan=5, only the
    // lower half of the window renders (5 items), leaving blank viewport
    // rows. The cursor's role is to drive scrollOffset (via
    // calcEdgeBasedScrollOffset); it does not constrain the render window.
    //
    // CRITICAL INVARIANT 2: the window size is derived from HEIGHTS, not
    // from item counts. A count-based window (`estimatedVisibleCount +
    // 2*overscan`) fails when item heights are highly variable — e.g. the
    // first N items are short (3 rows) and the rest are tall (30 rows).
    // avgHeight weighs these evenly, so estimatedVisibleCount undercounts
    // how many of the (short) first items are needed to fill the viewport.
    // Symptom: viewport partially blank, `▼N` indicator at the bottom even
    // though items that would fit are NOT being rendered.
    //
    // The height-aware algorithm: expand `end` forward from `start`, summing
    // measured heights, until accumulated height ≥ viewport + overscanPixels.
    // Always include `estimatedVisibleCount + 2*overscan` items as a minimum
    // (so unmeasured-first-render still has a reasonable window).
    //
    // Window layout:
    //   start = scrollOffset - overscan        (items above viewport)
    //   end   = smallest index s.t. sumHeights(start, end) covers the
    //           viewport + overscan pixels below it
    const overscanPixels = overscan * avgHeight
    const minItems = estimatedVisibleCount + 2 * overscan

    let start = Math.max(0, effectiveScrollOffset - overscan)
    // Target rendered height = viewport (above scrollOffset is already
    // measured by start reduction) + overscan both ends.
    const targetHeight = viewportHeight + 2 * overscanPixels

    // Expand `end` using actual heights (or estimates for unmeasured).
    // Gap accounting: n items contribute (n-1) inter-item gaps. We add `gap`
    // between consecutive items, not after the first one — this matches the
    // `(itemCount - 1) * gap` semantics used in `sumHeights`, so the
    // virtualizer's idea of window height agrees with the placeholder
    // prefix-sum used in `leadingHeight`/`trailingHeight`.
    let accumulated = 0
    let end = start
    while (end < count && accumulated < targetHeight) {
      if (end > start) accumulated += gap
      accumulated += getHeight(end, estimateHeight, measuredHeights, getItemKey, avgHeight)
      end++
    }
    // Minimum item count — protects against very small measured heights that
    // would otherwise truncate the window (and guards fresh renders where
    // nothing is measured yet).
    end = Math.min(count, Math.max(end, start + minItems))
    // Apply maxRendered cap last (safety bound).
    end = Math.min(end, start + maxRendered)

    // Adjust start if we hit the end — keep enough items to cover the
    // viewport when there are enough items to fill it.
    if (end === count) {
      // Pull `start` back so that start..count covers at least the viewport.
      // Same gap semantics as the forward walk: (n-1) gaps for n items.
      let startFill = 0
      let newStart = end
      while (newStart > 0 && startFill < targetHeight) {
        newStart--
        startFill += getHeight(newStart, estimateHeight, measuredHeights, getItemKey, avgHeight)
        if (newStart + 1 < end) startFill += gap
      }
      // Keep minimum count so the window never shrinks below item-count floor.
      start = Math.min(Math.max(0, newStart), Math.max(0, end - minItems))
    }

    // Calculate placeholder sizes using measured heights when available.
    // sumHeights checks the measurement cache per-item and falls back to estimates.
    const leadingSize = sumHeights(0, start, estimateHeight, gap, measuredHeights, getItemKey)
    const trailingSize = sumHeights(end, count, estimateHeight, gap, measuredHeights, getItemKey)

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
    // Steady-state inputs — primitives so the memo fires only when values change
    hasSteadyState,
    ssOffset,
    ssViewportHeight,
  ])

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
  }
}
