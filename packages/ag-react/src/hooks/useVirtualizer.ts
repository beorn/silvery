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
 * ## Architecture (2026-04-21, bead km-silvery.virtualizer-from-layout activated)
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

  // Effective scroll-state fields for the window calc. Only firstVisibleChild
  // / lastVisibleChild influence the window (offset affects only placeholder
  // heights via sumHeights, which is stable when indices don't shift).
  //
  // Extracted outside useMemo so the memo dependency list is just primitives
  // (no new object allocation per render).
  const ssFirstVisibleChild =
    hasSteadyState && scrollState ? scrollState.firstVisibleChild : -1
  const ssLastVisibleChild =
    hasSteadyState && scrollState ? scrollState.lastVisibleChild : -1

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
        // Safety cap.
        end = Math.min(end, start + maxRendered)

        const leadingSize = sumHeights(0, start, estimateHeight, gap, measuredHeights, getItemKey)
        const trailingSize = sumHeights(end, count, estimateHeight, gap, measuredHeights, getItemKey)

        return {
          startIndex: start,
          endIndex: end,
          leadingHeight: leadingSize,
          trailingHeight: trailingSize,
        }
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
    trailingExtraChildren,
    // Steady-state inputs — primitives so the memo fires only when values change.
    // scrollState itself is a stable ref between layouts (per-field equality in
    // layout-signals), so any relevant change shows up via these derived primitives.
    hasSteadyState,
    ssFirstVisibleChild,
    ssLastVisibleChild,
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
  }
}
