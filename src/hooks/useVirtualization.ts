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

/**
 * Calculate how many items fit in the viewport starting from a given index.
 * Handles variable item sizes.
 */
function calcVisibleCount<T>(
  items: T[],
  startIndex: number,
  viewportSize: number,
  itemSize: number | ((item: T, index: number) => number),
  gap: number,
): number {
  // Fast path for fixed sizes
  if (typeof itemSize === "number") {
    return Math.max(1, Math.floor(viewportSize / (itemSize + gap)))
  }

  // Variable sizes - count items that fit
  let usedSize = 0
  let count = 0

  for (let i = startIndex; i < items.length && usedSize < viewportSize; i++) {
    const size = getItemSize(items[i], i, itemSize)
    usedSize += size + (count > 0 ? gap : 0)
    count++
  }

  return Math.max(1, count)
}

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
  const estimatedVisibleCount = Math.max(1, Math.floor(viewportSize / (avgItemSize + gap)))

  // Selected index as ref — doesn't trigger re-renders when cursor moves
  // within the viewport. Only scrollOffset (state) triggers re-renders.
  const selectedIndexRef = useRef(Math.max(0, Math.min(scrollTo ?? 0, items.length - 1)))

  // Scroll offset as state — VirtualList re-renders only when offset changes
  // (cursor exits viewport). Cursor moves within viewport skip re-render entirely.
  const [scrollOffset, setScrollOffset] = useState(() =>
    calcEdgeBasedScrollOffset(selectedIndexRef.current, 0, estimatedVisibleCount, items.length, scrollPadding),
  )

  // Imperative scroll function — updates ref always, state only when offset changes
  const scrollToItem = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1))
      selectedIndexRef.current = clampedIndex
      setScrollOffset((prevOffset) => {
        const newOffset = calcEdgeBasedScrollOffset(
          clampedIndex,
          prevOffset,
          estimatedVisibleCount,
          items.length,
          scrollPadding,
        )
        return newOffset === prevOffset ? prevOffset : newOffset
      })
    },
    [items.length, estimatedVisibleCount, scrollPadding],
  )

  // Update scroll state when scrollTo prop changes (only when defined).
  // When scrollTo becomes undefined, we freeze state.
  // Uses functional updater to read prevOffset (avoids oscillation from
  // position-sensitive calcEdgeBasedScrollOffset).
  useEffect(() => {
    if (scrollTo === undefined) {
      return // Frozen: do not update state
    }

    const clampedIndex = Math.max(0, Math.min(scrollTo, items.length - 1))
    selectedIndexRef.current = clampedIndex
    setScrollOffset((prevOffset) => {
      const newOffset = calcEdgeBasedScrollOffset(
        clampedIndex,
        prevOffset,
        estimatedVisibleCount,
        items.length,
        scrollPadding,
      )
      return newOffset === prevOffset ? prevOffset : newOffset
    })
  }, [scrollTo, items.length, estimatedVisibleCount, scrollPadding])

  // Determine the current selected index to use for rendering
  const currentSelectedIndex =
    scrollTo !== undefined ? Math.max(0, Math.min(scrollTo, items.length - 1)) : selectedIndexRef.current

  // Calculate virtualization window
  // Depends on scrollOffset (not currentSelectedIndex) so that cursor moves
  // within the visible window don't trigger recalculation. This prevents
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

    // For small lists, render everything
    if (totalItems <= maxRendered) {
      return {
        startIndex: 0,
        endIndex: totalItems,
        leadingPlaceholderSize: 0,
        trailingPlaceholderSize: 0,
      }
    }

    // Center the render window around the selected item.
    // Dep is scrollOffset (not selectedIndex) so cursor moves within the
    // visible window don't trigger recalculation. When scrollOffset changes
    // (cursor leaves viewport), the memo fires and uses the latest selectedIndex.
    const viewportCenter = selectedIndexRef.current
    const halfWindow = Math.floor(maxRendered / 2)
    let start = Math.max(0, viewportCenter - halfWindow)
    let end = Math.min(totalItems, start + maxRendered)

    // Adjust start if we hit the end
    if (end === totalItems) {
      start = Math.max(0, end - maxRendered)
    }

    // Add overscan
    start = Math.max(0, start - overscan)
    end = Math.min(totalItems, end + overscan)

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
  }, [items.length, scrollOffset, maxRendered, overscan, itemSize, avgItemSize, gap])

  return {
    startIndex: windowCalc.startIndex,
    endIndex: windowCalc.endIndex,
    currentSelectedIndex,
    scrollOffset,
    leadingPlaceholderSize: windowCalc.leadingPlaceholderSize,
    trailingPlaceholderSize: windowCalc.trailingPlaceholderSize,
    hiddenBefore: windowCalc.startIndex,
    hiddenAfter: items.length - windowCalc.endIndex,
    scrollToItem,
  }
}
