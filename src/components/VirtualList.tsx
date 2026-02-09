import createDebug from "debug"
/**
 * VirtualList Component
 *
 * React-level virtualization for long lists. Only renders items within the
 * visible viewport plus overscan, using placeholder boxes for virtual height.
 *
 * Uses inkx overflow="scroll" internally for native scrolling support.
 *
 * @example
 * ```tsx
 * import { VirtualList } from 'inkx';
 *
 * <VirtualList
 *   items={cards}
 *   height={20}
 *   itemHeight={1}
 *   scrollTo={selectedIndex}
 *   renderItem={(card, index) => (
 *     <TreeCard key={card.id} card={card} isSelected={index === selected} />
 *   )}
 * />
 * ```
 */
import React, { forwardRef, useImperativeHandle } from "react"
import { useVirtualization } from "../hooks/useVirtualization.js"
import { Box } from "./Box.js"

const debug = createDebug("inkx:virtuallist")

// =============================================================================
// Types
// =============================================================================

export interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[]

  /** Height of the list viewport in rows */
  height: number

  /** Height of each item in rows (fixed or function for variable heights) */
  itemHeight?: number | ((item: T, index: number) => number)

  /** Index to keep visible (scrolls if off-screen) */
  scrollTo?: number

  /** Extra items to render above/below viewport for smooth scrolling (default: 5) */
  overscan?: number

  /** Maximum items to render at once (default: 100) */
  maxRendered?: number

  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode

  /** Show overflow indicators (▲N/▼N) */
  overflowIndicator?: boolean

  /** Optional key extractor (defaults to index) */
  keyExtractor?: (item: T, index: number) => string | number

  /** Width of the list (optional, uses parent width if not specified) */
  width?: number

  /** Gap between items in rows (default: 0) */
  gap?: number

  /** Render separator between items (alternative to gap) */
  renderSeparator?: () => React.ReactNode
}

export interface VirtualListHandle {
  /** Scroll to a specific item index */
  scrollToItem(index: number): void
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ITEM_HEIGHT = 1
const DEFAULT_OVERSCAN = 5
const DEFAULT_MAX_RENDERED = 100

/**
 * Padding from edge before scrolling (in items).
 *
 * Vertical lists use padding=2 for more context visibility (you typically
 * want to see what's coming when scrolling through a long list).
 *
 * @see calcEdgeBasedScrollOffset in scroll-utils.ts for the algorithm
 */
const SCROLL_PADDING = 2

// =============================================================================
// Component
// =============================================================================

/**
 * VirtualList - React-level virtualized list with native inkx scrolling.
 *
 * Only renders items within the visible viewport plus overscan.
 * Uses placeholder boxes for virtual height to maintain scrollbar position.
 *
 * Scroll state management:
 * - When scrollTo is defined: actively track and scroll to that index
 * - When scrollTo is undefined: completely freeze scroll state (do nothing)
 *
 * This freeze behavior is critical for multi-column layouts where only one
 * column is "selected" at a time. Non-selected columns must not recalculate
 * their scroll position.
 */
function VirtualListInner<T>(
  {
    items,
    height,
    itemHeight = DEFAULT_ITEM_HEIGHT,
    scrollTo,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    renderItem,
    overflowIndicator,
    keyExtractor,
    width,
    gap = 0,
    renderSeparator,
  }: VirtualListProps<T>,
  ref: React.ForwardedRef<VirtualListHandle>,
): React.ReactElement {
  // Use shared virtualization hook
  const {
    startIndex,
    endIndex,
    currentSelectedIndex,
    leadingPlaceholderSize,
    trailingPlaceholderSize,
    scrollToItem,
  } = useVirtualization({
    items,
    viewportSize: height,
    itemSize: itemHeight,
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
      <Box flexDirection="column" height={height} width={width}>
        {/* Empty - nothing to render */}
      </Box>
    )
  }

  // Get the slice of items to render
  const visibleItems = items.slice(startIndex, endIndex)

  // Calculate scrollTo index for inkx Box
  // inkx scrollTo expects the INDEX of the child to scroll into view
  // Account for top placeholder being child 0 when present
  const hasTopPlaceholder = leadingPlaceholderSize > 0
  const selectedIndexInSlice = currentSelectedIndex - startIndex
  const isSelectedInSlice =
    selectedIndexInSlice >= 0 && selectedIndexInSlice < visibleItems.length
  const scrollToIndex = hasTopPlaceholder
    ? selectedIndexInSlice + 1
    : selectedIndexInSlice

  // Pass scrollTo to inkx Box:
  // Always pass the selected child index when it's in the rendered slice.
  // This works for both declarative mode (scrollTo prop) and imperative mode
  // (scrollToItem via ref). For frozen columns, scrollState is preserved so
  // the index points to the same child as before (no visual change).
  const boxScrollTo = isSelectedInSlice
    ? Math.max(0, scrollToIndex)
    : undefined

  debug(
    "VirtualList render: scrollTo=%s boxScrollTo=%s frozen=%s start=%d end=%d currentSelected=%d isInSlice=%s",
    scrollTo,
    boxScrollTo,
    scrollTo === undefined,
    startIndex,
    endIndex,
    currentSelectedIndex,
    isSelectedInSlice,
  )

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      overflow="scroll"
      scrollTo={boxScrollTo}
      overflowIndicator={overflowIndicator}
    >
      {/* Top placeholder for virtual height */}
      {leadingPlaceholderSize > 0 && (
        <Box height={leadingPlaceholderSize} flexShrink={0} />
      )}

      {/* Render visible items */}
      {visibleItems.map((item, i) => {
        const actualIndex = startIndex + i
        const key = keyExtractor ? keyExtractor(item, actualIndex) : actualIndex
        const isLast = i === visibleItems.length - 1

        return (
          <React.Fragment key={key}>
            {renderItem(item, actualIndex)}
            {!isLast && renderSeparator && renderSeparator()}
            {!isLast && gap > 0 && !renderSeparator && (
              <Box height={gap} flexShrink={0} />
            )}
          </React.Fragment>
        )
      })}

      {/* Bottom placeholder for virtual height */}
      {trailingPlaceholderSize > 0 && (
        <Box height={trailingPlaceholderSize} flexShrink={0} />
      )}
    </Box>
  )
}

// Export with forwardRef - use type assertion for generic component
export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.ForwardedRef<VirtualListHandle> },
) => React.ReactElement
