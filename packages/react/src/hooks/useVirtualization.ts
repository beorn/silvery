/**
 * useVirtualization Hook
 *
 * Items-based virtualization API for VirtualList and HorizontalVirtualList.
 * Thin adapter over the headless useVirtualizer engine.
 *
 * Key behaviors:
 * - When scrollTo is defined: actively track and scroll to that index
 * - When scrollTo is undefined: freeze scroll state (critical for multi-column layouts)
 */
import { useMemo } from "react";
import { useVirtualizer } from "./useVirtualizer";

// =============================================================================
// Types
// =============================================================================

export interface VirtualizationConfig<T> {
  /** Array of items to virtualize */
  items: T[];

  /** Size of the viewport (height for vertical, width for horizontal) */
  viewportSize: number;

  /** Size of each item (fixed number or function for variable sizes) */
  itemSize: number | ((item: T, index: number) => number);

  /** Index to keep visible (scrolls if off-screen) */
  scrollTo?: number;

  /** Padding from edge before scrolling (in items) */
  scrollPadding?: number;

  /** Extra items to render beyond viewport for smooth scrolling */
  overscan?: number;

  /** Maximum items to render at once */
  maxRendered?: number;

  /** Gap between items (for calculating visible count with variable sizes) */
  gap?: number;
}

export interface VirtualizationResult {
  /** First item index to render */
  startIndex: number;

  /** Last item index to render (exclusive) */
  endIndex: number;

  /** Current selected index (for scroll position calculation) */
  currentSelectedIndex: number;

  /** Current scroll offset */
  scrollOffset: number;

  /** Placeholder size before rendered items (for virtual scrolling) */
  leadingPlaceholderSize: number;

  /** Placeholder size after rendered items */
  trailingPlaceholderSize: number;

  /** Number of items hidden before viewport */
  hiddenBefore: number;

  /** Number of items hidden after viewport */
  hiddenAfter: number;

  /** Imperative scroll function */
  scrollToItem: (index: number) => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * useVirtualization - items-based adapter over useVirtualizer.
 *
 * Accepts an items array with per-item sizing. Internally delegates to the
 * count-based useVirtualizer engine and maps the result back to the legacy API.
 */
export function useVirtualization<T>(config: VirtualizationConfig<T>): VirtualizationResult {
  const { items, viewportSize, itemSize, scrollTo, scrollPadding, overscan, maxRendered, gap } =
    config;

  // Convert items-based itemSize to index-based estimateHeight.
  // Memoize the adapter function to avoid recreating on every render
  // when the items reference or itemSize function changes.
  const estimateHeight = useMemo(() => {
    if (typeof itemSize === "number") return itemSize;
    return (index: number) => itemSize(items[index]!, index);
  }, [items, itemSize]);

  const result = useVirtualizer({
    count: items.length,
    estimateHeight,
    viewportHeight: viewportSize,
    scrollTo,
    scrollPadding,
    overscan,
    maxRendered,
    gap,
  });

  // Compute currentSelectedIndex (not returned by useVirtualizer)
  const currentSelectedIndex =
    scrollTo !== undefined
      ? Math.max(0, Math.min(scrollTo, items.length - 1))
      : result.scrollOffset;

  return {
    startIndex: result.range.startIndex,
    endIndex: result.range.endIndex,
    currentSelectedIndex,
    scrollOffset: result.scrollOffset,
    leadingPlaceholderSize: result.leadingHeight,
    trailingPlaceholderSize: result.trailingHeight,
    hiddenBefore: result.hiddenBefore,
    hiddenAfter: result.hiddenAfter,
    scrollToItem: result.scrollToItem,
  };
}
