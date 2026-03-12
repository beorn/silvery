/**
 * HorizontalVirtualList Component
 *
 * React-level virtualization for horizontal lists. Only renders items within the
 * visible viewport plus overscan. Items outside the viewport are not rendered —
 * scrolling is achieved by changing which items are in the render window.
 *
 * Uses the shared useVirtualization hook for scroll state management.
 *
 * @example
 * ```tsx
 * import { HorizontalVirtualList } from '@silvery/react';
 *
 * <HorizontalVirtualList
 *   items={columns}
 *   width={80}
 *   itemWidth={20}
 *   scrollTo={selectedIndex}
 *   renderItem={(column, index) => (
 *     <Column key={column.id} column={column} isSelected={index === selected} />
 *   )}
 * />
 * ```
 */
import React, { forwardRef, useImperativeHandle } from "react"
import { useVirtualization } from "@silvery/react/hooks/useVirtualization"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface HorizontalVirtualListProps<T> {
  /** Array of items to render */
  items: T[]

  /** Width of the list viewport in columns */
  width: number

  /** Width of each item (fixed number or function for variable widths) */
  itemWidth: number | ((item: T, index: number) => number)

  /** Index to keep visible (scrolls if off-screen) */
  scrollTo?: number

  /** Extra items to render left/right of viewport for smooth scrolling (default: 1) */
  overscan?: number

  /** Maximum items to render at once (default: 20) */
  maxRendered?: number

  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode

  /** Show built-in overflow indicators (◀N/▶N) */
  overflowIndicator?: boolean

  /** Custom overflow indicator renderer. Replaces built-in indicators when provided. */
  renderOverflowIndicator?: (direction: "before" | "after", hiddenCount: number) => React.ReactNode

  /** Width in chars of each overflow indicator (default: 0). Reserves viewport space for indicators. */
  overflowIndicatorWidth?: number

  /** Optional key extractor (defaults to index) */
  keyExtractor?: (item: T, index: number) => string | number

  /** Height of the list (optional, uses parent height if not specified) */
  height?: number

  /** Gap between items in columns (default: 0) */
  gap?: number

  /** Render separator between items (alternative to gap) */
  renderSeparator?: () => React.ReactNode
}

export interface HorizontalVirtualListHandle {
  /** Scroll to a specific item index */
  scrollToItem(index: number): void
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OVERSCAN = 1
const DEFAULT_MAX_RENDERED = 20

/**
 * Padding from edge before scrolling (in items).
 *
 * Horizontal lists use padding=1 since columns are wider and fewer fit on screen.
 * Vertical lists (VirtualList) use padding=2 for more context visibility.
 *
 * @see calcEdgeBasedScrollOffset in scroll-utils.ts for the algorithm
 */
const SCROLL_PADDING = 1

// =============================================================================
// Helpers
// =============================================================================

// /** Calculate average item width for estimating visible count. */
// function calcAvgItemWidth<T>(items: T[], itemWidth: number | ((item: T, index: number) => number)): number {
//   if (typeof itemWidth === "number") return itemWidth
//   if (items.length === 0) return 1
//   const n = Math.min(items.length, 10)
//   let sum = 0
//   for (let i = 0; i < n; i++) sum += itemWidth(items[i], i)
//   return sum / n
// }

/**
 * Calculate total width of all items including gaps.
 */
function calcTotalItemsWidth<T>(
  items: T[],
  itemWidth: number | ((item: T, index: number) => number),
  gap: number,
): number {
  if (items.length === 0) return 0
  if (typeof itemWidth === "number") return items.length * itemWidth + (items.length - 1) * gap
  let total = 0
  for (let i = 0; i < items.length; i++) {
    total += itemWidth(items[i], i) + (i > 0 ? gap : 0)
  }
  return total
}

/**
 * Count how many items actually fit in the viewport starting from a given index.
 * More accurate than average-based estimation for variable widths.
 */
function calcActualVisibleCount<T>(
  items: T[],
  startFrom: number,
  viewport: number,
  itemWidth: number | ((item: T, index: number) => number),
  gap: number,
): number {
  // Use ceil to include items that partially overflow the viewport.
  // HVL's rendering loop includes such items (clipped by overflow="hidden"),
  // so the visible count should match for accurate overflow indicators.
  if (typeof itemWidth === "number") {
    return Math.max(1, Math.ceil(viewport / (itemWidth + gap)))
  }
  let usedSize = 0
  let count = 0
  for (let i = startFrom; i < items.length; i++) {
    const size = itemWidth(items[i], i)
    const sizeWithGap = size + (count > 0 ? gap : 0)
    usedSize += sizeWithGap
    count++
    if (usedSize >= viewport) break
  }
  return Math.max(1, count)
}

/**
 * Calculate the physical right edge position of a target item relative to
 * the viewport, given a scroll offset. Returns the pixel position past the
 * viewport right edge (positive = clipped, zero/negative = fully visible).
 */
function calcItemOverflow<T>(
  items: T[],
  scrollOffset: number,
  targetIndex: number,
  viewport: number,
  itemWidth: number | ((item: T, index: number) => number),
  gap: number,
): number {
  if (targetIndex < scrollOffset || targetIndex >= items.length) return 0
  // Sum widths from scrollOffset to targetIndex (inclusive)
  let pos = 0
  for (let i = scrollOffset; i <= targetIndex; i++) {
    const w = typeof itemWidth === "number" ? itemWidth : itemWidth(items[i]!, i)
    pos += w + (i > scrollOffset ? gap : 0)
  }
  return pos - viewport
}

// =============================================================================
// Component
// =============================================================================

/**
 * HorizontalVirtualList - React-level virtualized horizontal list.
 *
 * Only renders items within the visible viewport plus overscan.
 *
 * Scroll state management (via useVirtualization hook):
 * - When scrollTo is defined: actively track and scroll to that index
 * - When scrollTo is undefined: completely freeze scroll state (do nothing)
 *
 * This freeze behavior is critical for multi-column layouts where only one
 * column is "selected" at a time. Non-selected columns must not recalculate
 * their scroll position.
 */
function HorizontalVirtualListInner<T>(
  {
    items,
    width,
    itemWidth,
    scrollTo,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    renderItem,
    overflowIndicator,
    renderOverflowIndicator,
    overflowIndicatorWidth = 0,
    keyExtractor,
    height,
    gap = 0,
    renderSeparator,
  }: HorizontalVirtualListProps<T>,
  ref: React.ForwardedRef<HorizontalVirtualListHandle>,
): React.ReactElement {
  // Always reserve indicator space when an overflow indicator is configured.
  // This prevents layout shift: without reservation, the first render uses full width,
  // then a second render detects overflow and shrinks the viewport by 2 chars,
  // causing all columns to reflow visibly.
  const totalItemsWidth = calcTotalItemsWidth(items, itemWidth, gap)
  const allItemsFit = totalItemsWidth <= width
  const hasIndicatorRenderer = renderOverflowIndicator != null || overflowIndicator === true
  const indicatorReserved = hasIndicatorRenderer ? overflowIndicatorWidth * 2 : 0
  const effectiveViewport = Math.max(1, width - indicatorReserved)

  // Use shared virtualization hook for scroll state management
  const { startIndex, endIndex, scrollOffset, scrollToItem } = useVirtualization({
    items,
    viewportSize: effectiveViewport,
    itemSize: itemWidth,
    scrollTo,
    scrollPadding: SCROLL_PADDING,
    overscan,
    maxRendered,
    gap,
  })

  // Expose scrollToItem method via ref for imperative scrolling
  useImperativeHandle(ref, () => ({ scrollToItem }), [scrollToItem])

  // Empty state
  if (items.length === 0) {
    return (
      <Box flexDirection="row" width={width} height={height}>
        {/* Empty - nothing to render */}
      </Box>
    )
  }

  // When all items fit, override scrollOffset to 0. useVirtualization may compute
  // a non-zero offset due to average-based estimation with variable widths
  // (e.g., collapsed=3 vs expanded=76 averages to 39.5, underestimating visible count).
  let displayScrollOffset = allItemsFit ? 0 : scrollOffset

  // Fix partial visibility: useVirtualization reserves space for both overflow
  // indicators (left + right), but at the edges only one shows. Recalculate
  // with the actual indicator overhead to see if items truly don't fit.
  // If they do fit with actual indicators, keep the current offset.
  // If they don't, bump the offset to fully reveal the cursor item.
  if (scrollTo !== undefined && !allItemsFit && scrollTo >= displayScrollOffset) {
    // Determine which indicators would show at the current offset
    const wouldShowLeft = hasIndicatorRenderer && displayScrollOffset > 0
    const prelimVisibleCount = calcActualVisibleCount(
      items,
      displayScrollOffset,
      effectiveViewport,
      itemWidth,
      gap,
    )
    const wouldShowRight =
      hasIndicatorRenderer && items.length - displayScrollOffset - prelimVisibleCount > 0
    // Actual viewport uses only the indicators that will actually render
    const actualIndicatorWidth =
      (wouldShowLeft ? overflowIndicatorWidth : 0) + (wouldShowRight ? overflowIndicatorWidth : 0)
    const actualViewport = Math.max(1, width - actualIndicatorWidth)

    const overflow = calcItemOverflow(
      items,
      displayScrollOffset,
      scrollTo,
      actualViewport,
      itemWidth,
      gap,
    )
    if (overflow > 0) {
      // Scroll right by 1 to push the partially clipped item into full view.
      const maxOffset = Math.max(0, items.length - 1)
      displayScrollOffset = Math.min(maxOffset, displayScrollOffset + 1)
    }
  }

  // Compute how many items actually fit starting from the display scroll offset.
  // Uses actual item widths rather than averages for accurate overflow detection.
  const visibleCount = calcActualVisibleCount(
    items,
    displayScrollOffset,
    effectiveViewport,
    itemWidth,
    gap,
  )

  // Viewport-based item window: render items from displayScrollOffset that fit in the
  // viewport, intersected with useVirtualization's render window (respects maxRendered).
  // No overscan beyond the viewport edge — terminal UI doesn't benefit from pre-rendering
  // off-screen items, and they'd appear in the DOM tree despite being visually clipped.
  const vpStart = Math.max(startIndex, displayScrollOffset)
  const rawVpEnd = Math.min(endIndex, displayScrollOffset + visibleCount + overscan)
  let vpEnd = vpStart
  let usedWidth = 0
  for (let i = vpStart; i < rawVpEnd; i++) {
    const w = typeof itemWidth === "number" ? itemWidth : itemWidth(items[i]!, i)
    usedWidth += w + (vpEnd > vpStart ? gap : 0)
    vpEnd = i + 1
    if (usedWidth >= effectiveViewport) break // This item fills/exceeds viewport, include but stop
  }
  const visibleItems = items.slice(vpStart, vpEnd)

  // Viewport-based overflow detection
  const overflowBefore = displayScrollOffset
  const overflowAfter = Math.max(0, items.length - displayScrollOffset - visibleCount)

  // Only render overflow indicators when there are actually hidden items in that direction.
  // Space is still reserved via indicatorReserved/effectiveViewport to prevent layout shift;
  // when an indicator is not shown, an empty spacer of the same width fills its slot.
  const hasCustomIndicator = renderOverflowIndicator != null
  const showIndicators = hasCustomIndicator || overflowIndicator === true
  const showLeftIndicator = showIndicators && overflowBefore > 0
  const showRightIndicator = showIndicators && overflowAfter > 0

  return (
    <Box flexDirection="row" width={width} height={height}>
      {/* Left overflow indicator — outside overflow container to avoid being clipped */}
      {showLeftIndicator &&
        (hasCustomIndicator ? (
          renderOverflowIndicator("before", overflowBefore)
        ) : (
          <Box flexShrink={0}>
            <Text color="$inverse" backgroundColor="$inverse-bg">
              ◀{overflowBefore}
            </Text>
          </Box>
        ))}
      {/* Reserve indicator space when configured but not showing (prevents layout shift) */}
      {showIndicators && !showLeftIndicator && overflowIndicatorWidth > 0 && (
        <Box width={overflowIndicatorWidth} flexShrink={0} />
      )}

      {/* Overflow container — clips items that extend beyond the viewport */}
      <Box flexGrow={1} flexDirection="row" overflow="hidden">
        {/* Render visible items — flexShrink={0} prevents flex from shrinking
            overscan items; they render at full size and get clipped by overflow="hidden" */}
        {visibleItems.map((item, i) => {
          const actualIndex = vpStart + i
          const key = keyExtractor ? keyExtractor(item, actualIndex) : actualIndex
          const isLast = i === visibleItems.length - 1

          return (
            <React.Fragment key={key}>
              <Box flexShrink={0}>{renderItem(item, actualIndex)}</Box>
              {!isLast && renderSeparator && renderSeparator()}
              {!isLast && gap > 0 && !renderSeparator && <Box width={gap} flexShrink={0} />}
            </React.Fragment>
          )
        })}
      </Box>

      {/* Right overflow indicator — outside overflow container to avoid being clipped */}
      {showRightIndicator &&
        (hasCustomIndicator ? (
          renderOverflowIndicator("after", overflowAfter)
        ) : (
          <Box flexShrink={0}>
            <Text color="$inverse" backgroundColor="$inverse-bg">
              {overflowAfter}▶
            </Text>
          </Box>
        ))}
      {/* Reserve indicator space when configured but not showing (prevents layout shift) */}
      {showIndicators && !showRightIndicator && overflowIndicatorWidth > 0 && (
        <Box width={overflowIndicatorWidth} flexShrink={0} />
      )}
    </Box>
  )
}

// Export with forwardRef - use type assertion for generic component
export const HorizontalVirtualList = forwardRef(HorizontalVirtualListInner) as <T>(
  props: HorizontalVirtualListProps<T> & {
    ref?: React.ForwardedRef<HorizontalVirtualListHandle>
  },
) => React.ReactElement
