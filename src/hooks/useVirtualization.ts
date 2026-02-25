/**
 * useVirtualization Hook
 *
 * Shared virtualization logic for VirtualList and HorizontalVirtualList.
 * Handles scroll state management and window calculation for both axes.
 *
 * Key behaviors:
 * - When scrollTo is defined: actively track and scroll to that index
 * - When scrollTo is undefined: freeze scroll state (critical for multi-column layouts)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { calcEdgeBasedScrollOffset } from "../scroll-utils.js"

// =============================================================================
// Types
// =============================================================================

export interface VirtualizationConfig<T> {
  /** Array of items to virtualize */
  items: T[]

  /** Size of the viewport (height for vertical, width for horizontal) */
  viewportSize: number

  /** Size of each item (fixed number or function for variable sizes) */
  itemSize: number | ((item: T, index: number) => number)

  /** Index to keep visible (scrolls if off-screen) */
  scrollTo?: number

  /** Padding from edge before scrolling (in items) */
  scrollPadding?: number

  /** Extra items to render beyond viewport for smooth scrolling */
  overscan?: number

  /** Maximum items to render at once */
  maxRendered?: number

  /** Gap between items (for calculating visible count with variable sizes) */
  gap?: number
}

export interface VirtualizationResult {
  /** First item index to render */
  startIndex: number

  /** Last item index to render (exclusive) */
  endIndex: number

  /** Current selected index (for scroll position calculation) */
  currentSelectedIndex: number

  /** Current scroll offset */
  scrollOffset: number

  /** Placeholder size before rendered items (for virtual scrolling) */
  leadingPlaceholderSize: number

  /** Placeholder size after rendered items */
  trailingPlaceholderSize: number

  /** Number of items hidden before viewport */
  hiddenBefore: number

  /** Number of items hidden after viewport */
  hiddenAfter: number

  /** Imperative scroll function */
  scrollToItem: (index: number) => void
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
 * Get size for a specific item.
 */
function getItemSize<T>(item: T, index: number, itemSize: number | ((item: T, index: number) => number)): number {
  return typeof itemSize === "function" ? itemSize(item, index) : itemSize
}

// /** Calculate how many items fit in the viewport starting from a given index. Handles variable item sizes. */
// function calcVisibleCount<T>(
//   items: T[],
//   startIndex: number,
//   viewportSize: number,
//   itemSize: number | ((item: T, index: number) => number),
//   gap: number,
// ): number {
//   if (typeof itemSize === "number") {
//     return Math.max(1, Math.floor(viewportSize / (itemSize + gap)))
//   }
//   let usedSize = 0
//   let count = 0
//   for (let i = startIndex; i < items.length && usedSize < viewportSize; i++) {
//     const size = getItemSize(items[i], i, itemSize)
//     usedSize += size + (count > 0 ? gap : 0)
//     count++
//   }
//   return Math.max(1, count)
// }

/**
 * Calculate average item size for estimating visible count.
 */
function calcAverageItemSize<T>(items: T[], itemSize: number | ((item: T, index: number) => number)): number {
  if (items.length === 0) return 1
  if (typeof itemSize === "number") return itemSize

  // Sample first few items for average
  const sampleSize = Math.min(items.length, 10)
  let totalSize = 0
  for (let i = 0; i < sampleSize; i++) {
    totalSize += getItemSize(items[i], i, itemSize)
  }
  return totalSize / sampleSize
}

// =============================================================================
// Hook
// =============================================================================

/**
 * useVirtualization - shared virtualization logic for both axes.
 */
export function useVirtualization<T>(config: VirtualizationConfig<T>): VirtualizationResult {
  const {
    items,
    viewportSize,
    itemSize,
    scrollTo,
    scrollPadding = DEFAULT_SCROLL_PADDING,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    gap = 0,
  } = config

  // Calculate average item size for estimating visible count
  const avgItemSize = calcAverageItemSize(items, itemSize)
  // Use ceil to match HVL's rendering behavior: items that partially overflow
  // the viewport are still rendered (clipped by overflow="hidden"). Using floor
  // here would under-count visible items, causing the scroll algorithm to scroll
  // more aggressively than needed.
  const estimatedVisibleCount = Math.max(1, Math.ceil(viewportSize / (avgItemSize + gap)))

  // Selected index as ref — doesn't trigger re-renders when cursor moves
  // within the viewport. Only scrollOffset (state) triggers re-renders.
  const selectedIndexRef = useRef(Math.max(0, Math.min(scrollTo ?? 0, items.length - 1)))

  // Scroll offset — computed synchronously during render when scrollTo changes.
  //
  // Previously this was useState + useEffect, which caused a one-frame delay in
  // production (createApp): passive effects from useEffect don't flush within
  // the same doRender() cycle, so the scroll offset update was deferred until
  // the next keypress. This made the viewport not scroll when entering an
  // off-screen column from the board header.
  //
  // The ref stores the current offset for the "freeze" behavior (when scrollTo
  // is undefined). The state triggers re-renders when the offset changes.
  const scrollOffsetRef = useRef(
    calcEdgeBasedScrollOffset(selectedIndexRef.current, 0, estimatedVisibleCount, items.length, scrollPadding),
  )
  const [, /* scrollOffset */ setScrollOffset] = useState(() => scrollOffsetRef.current)

  // Synchronous scroll offset computation during render.
  // When scrollTo is defined, compute the new offset immediately so the
  // component renders with the correct viewport in a single pass.
  // When scrollTo is undefined, return the frozen (last known) offset.
  if (scrollTo !== undefined) {
    const clampedIndex = Math.max(0, Math.min(scrollTo, items.length - 1))
    selectedIndexRef.current = clampedIndex
    const newOffset = calcEdgeBasedScrollOffset(
      clampedIndex,
      scrollOffsetRef.current,
      estimatedVisibleCount,
      items.length,
      scrollPadding,
    )
    if (newOffset !== scrollOffsetRef.current) {
      scrollOffsetRef.current = newOffset
    }
  }
  // The effective offset used for rendering — always up-to-date, no effect delay.
  const effectiveScrollOffset = scrollOffsetRef.current

  // Sync state with ref (triggers re-render for dependents only when changed).
  // This is a no-op when the offset hasn't changed, avoiding render loops.
  useEffect(() => {
    setScrollOffset((prev) => (prev === effectiveScrollOffset ? prev : effectiveScrollOffset))
  }, [effectiveScrollOffset])

  // Imperative scroll function — updates ref and state
  const scrollToItem = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1))
      selectedIndexRef.current = clampedIndex
      const newOffset = calcEdgeBasedScrollOffset(
        clampedIndex,
        scrollOffsetRef.current,
        estimatedVisibleCount,
        items.length,
        scrollPadding,
      )
      scrollOffsetRef.current = newOffset
      setScrollOffset(newOffset)
    },
    [items.length, estimatedVisibleCount, scrollPadding],
  )

  // Determine the current selected index to use for rendering
  const currentSelectedIndex =
    scrollTo !== undefined ? Math.max(0, Math.min(scrollTo, items.length - 1)) : selectedIndexRef.current

  // Calculate virtualization window
  // Depends on effectiveScrollOffset (not currentSelectedIndex) so that cursor
  // moves within the visible window don't trigger recalculation. This prevents
  // VirtualList re-renders when the scroll position hasn't actually changed.
  const windowCalc = useMemo(() => {
    const totalItems = items.length

    // Empty list
    if (totalItems === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        leadingPlaceholderSize: 0,
        trailingPlaceholderSize: 0,
      }
    }

    // For tiny lists (≤ visible + overscan), render everything — no windowing needed.
    // Previously this used maxRendered as the threshold, which disabled virtualization
    // for any list under 50 items — too generous when each item is expensive.
    const minWindowSize = estimatedVisibleCount + 2 * overscan
    if (totalItems <= minWindowSize) {
      return {
        startIndex: 0,
        endIndex: totalItems,
        leadingPlaceholderSize: 0,
        trailingPlaceholderSize: 0,
      }
    }

    // Render window = visible items + overscan buffer, capped at maxRendered.
    // This auto-sizes the window based on viewport — no manual tuning needed.
    const renderCount = Math.min(estimatedVisibleCount + 2 * overscan, maxRendered)

    // Center the render window around the selected item.
    // Dep is effectiveScrollOffset (not selectedIndex) so cursor moves within
    // the visible window don't trigger recalculation. When offset changes
    // (cursor leaves viewport), the memo fires and uses the latest selectedIndex.
    const viewportCenter = selectedIndexRef.current
    const halfWindow = Math.floor(renderCount / 2)
    let start = Math.max(0, viewportCenter - halfWindow)
    let end = Math.min(totalItems, start + renderCount)

    // Adjust start if we hit the end
    if (end === totalItems) {
      start = Math.max(0, end - renderCount)
    }

    // Calculate placeholder sizes (for fixed item sizes)
    // For variable sizes, we'd need to sum actual sizes
    const fixedItemSize = typeof itemSize === "number" ? itemSize : avgItemSize
    const leadingSize = start * (fixedItemSize + gap)
    const trailingSize = (totalItems - end) * (fixedItemSize + gap)

    return {
      startIndex: start,
      endIndex: end,
      leadingPlaceholderSize: leadingSize,
      trailingPlaceholderSize: trailingSize,
    }
  }, [items.length, effectiveScrollOffset, maxRendered, overscan, itemSize, avgItemSize, gap])

  return {
    startIndex: windowCalc.startIndex,
    endIndex: windowCalc.endIndex,
    currentSelectedIndex,
    scrollOffset: effectiveScrollOffset,
    leadingPlaceholderSize: windowCalc.leadingPlaceholderSize,
    trailingPlaceholderSize: windowCalc.trailingPlaceholderSize,
    hiddenBefore: windowCalc.startIndex,
    hiddenAfter: items.length - windowCalc.endIndex,
    scrollToItem,
  }
}
