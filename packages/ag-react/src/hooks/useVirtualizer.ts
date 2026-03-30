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
 * Two components consume this hook:
 * - VirtualView: items mount/unmount based on scroll position (in-tree)
 * - ScrollbackView: items transition through Live → Virtualized → Static (scrollback)
 *
 * The hook is headless — it doesn't render anything. Consumers decide what
 * to do with the visible range.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { calcEdgeBasedScrollOffset } from "@silvery/ag-term/scroll-utils"

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
 * When scrollTo is undefined, scroll state freezes at the last known position.
 * This is critical for multi-column layouts where only one column is active.
 */
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

  // Calculate average item height for estimating visible count.
  // Uses measured heights when available for more accurate estimation.
  const avgHeight = calcAverageHeight(count, estimateHeight, measuredHeights)
  // Use ceil to match rendering behavior: items that partially overflow
  // the viewport are still rendered (clipped by overflow="hidden").
  const estimatedVisibleCount = Math.max(1, Math.ceil(viewportHeight / (avgHeight + gap)))

  // Selected index as ref — doesn't trigger re-renders when cursor moves
  // within the viewport.
  const selectedIndexRef = useRef(Math.max(0, Math.min(scrollTo ?? 0, count - 1)))

  // Scroll offset — computed synchronously during render.
  //
  // Previously this was useState + useEffect, which caused a one-frame delay:
  // passive effects don't flush within the same doRender() cycle, so the scroll
  // offset update was deferred until the next keypress.
  const scrollOffsetRef = useRef(
    calcEdgeBasedScrollOffset(selectedIndexRef.current, 0, estimatedVisibleCount, count, scrollPadding),
  )
  const [, setScrollOffset] = useState(() => scrollOffsetRef.current)

  // Synchronous scroll offset computation during render.
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

  // Imperative scroll function
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

    // For tiny lists (≤ visible + overscan), render everything
    const minWindowSize = estimatedVisibleCount + 2 * overscan
    if (count <= minWindowSize) {
      return {
        startIndex: 0,
        endIndex: count,
        leadingHeight: 0,
        trailingHeight: 0,
      }
    }

    // Render window = visible items + overscan buffer, capped at maxRendered
    const renderCount = Math.min(estimatedVisibleCount + 2 * overscan, maxRendered)

    // Center the render window around the selected item
    const viewportCenter = selectedIndexRef.current
    const halfWindow = Math.floor(renderCount / 2)
    let start = Math.max(0, viewportCenter - halfWindow)
    const end = Math.min(count, start + renderCount)

    // Adjust start if we hit the end
    if (end === count) {
      start = Math.max(0, end - renderCount)
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
    measurementVersion,
    getItemKey,
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
