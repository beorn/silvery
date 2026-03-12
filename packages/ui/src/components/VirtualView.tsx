/**
 * VirtualView - App-managed scrolling within a Screen rectangle.
 *
 * A scrollable area where items mount/unmount based on scroll position,
 * managed entirely by the app. Uses the shared useVirtualizer() engine.
 *
 * Unlike ScrollbackView (which uses native terminal scrollback), VirtualView
 * keeps everything in the React tree. Items are simply unmounted when they
 * scroll out of the viewport and remounted when they scroll back in.
 *
 * Trade-offs vs ScrollbackView:
 * - Mouse events work on scrolled-off items (if you scroll back)
 * - App controls scroll position (no snap-to-bottom issue)
 * - Text selection requires Shift+drag (mouse tracking active)
 * - Memory lives in the React tree, not the terminal buffer
 *
 * @example
 * ```tsx
 * <Screen>
 *   <Header />
 *   <VirtualView
 *     items={logs}
 *     height={20}
 *     renderItem={(item, index) => <LogEntry key={item.id} data={item} />}
 *     estimateHeight={() => 3}
 *   />
 *   <StatusBar />
 * </Screen>
 * ```
 */

import React, { forwardRef, useImperativeHandle } from "react"
import { useVirtualizer } from "@silvery/react/hooks/useVirtualizer"
import { Box } from "@silvery/react/components/Box"

// =============================================================================
// Types
// =============================================================================

export interface VirtualViewProps<T> {
  /** Array of items to render */
  items: T[]

  /** Height of the viewport in rows */
  height: number

  /** Estimated height of each item in rows (fixed or per-index function). Default: 1 */
  estimateHeight?: number | ((index: number) => number)

  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode

  /** Index to scroll to (declarative). When undefined, scroll state freezes. */
  scrollTo?: number

  /** Extra items to render beyond viewport for smooth scrolling. Default: 5 */
  overscan?: number

  /** Maximum items to render at once. Default: 100 */
  maxRendered?: number

  /** Padding from edge before scrolling (in items). Default: 2 */
  scrollPadding?: number

  /** Show overflow indicators (▲N/▼N). Default: false */
  overflowIndicator?: boolean

  /** Optional key extractor (defaults to index) */
  keyExtractor?: (item: T, index: number) => string | number

  /** Width of the viewport (optional, uses parent width if not specified) */
  width?: number

  /** Gap between items in rows. Default: 0 */
  gap?: number

  /** Render separator between items (alternative to gap) */
  renderSeparator?: () => React.ReactNode

  /** Mouse wheel handler for scrolling */
  onWheel?: (event: { deltaY: number }) => void

  /** Called when the visible range reaches near the end of the list (infinite scroll). */
  onEndReached?: () => void
  /** How many items from the end to trigger onEndReached. Default: 5 */
  onEndReachedThreshold?: number

  /** Content rendered after all items inside the scroll container (e.g., hidden count indicator) */
  listFooter?: React.ReactNode
}

export interface VirtualViewHandle {
  /** Imperatively scroll to a specific item index */
  scrollToItem(index: number): void
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ESTIMATE_HEIGHT = 1
const DEFAULT_OVERSCAN = 5
const DEFAULT_MAX_RENDERED = 100
const DEFAULT_SCROLL_PADDING = 2

// =============================================================================
// Component
// =============================================================================

/**
 * App-managed scrollable view with virtualization.
 *
 * Items mount/unmount based on scroll position within a fixed-height viewport.
 * Scroll state management:
 * - When scrollTo is defined: actively track and scroll to that index
 * - When scrollTo is undefined: freeze scroll state (critical for multi-column layouts)
 */
function VirtualViewInner<T>(
  {
    items,
    height,
    estimateHeight = DEFAULT_ESTIMATE_HEIGHT,
    renderItem,
    scrollTo,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    scrollPadding = DEFAULT_SCROLL_PADDING,
    overflowIndicator,
    keyExtractor,
    width,
    gap = 0,
    renderSeparator,
    onWheel,
    onEndReached,
    onEndReachedThreshold,
    listFooter,
  }: VirtualViewProps<T>,
  ref: React.ForwardedRef<VirtualViewHandle>,
): React.ReactElement {
  // Convert item-based estimateHeight to index-based for useVirtualizer
  const indexEstimate = typeof estimateHeight === "function" ? estimateHeight : estimateHeight

  const { range, leadingHeight, trailingHeight, scrollOffset, scrollToItem } = useVirtualizer({
    count: items.length,
    estimateHeight: indexEstimate,
    viewportHeight: height,
    scrollTo,
    scrollPadding,
    overscan,
    maxRendered,
    gap,
    getItemKey: keyExtractor ? (index) => keyExtractor(items[index]!, index) : undefined,
    onEndReached,
    onEndReachedThreshold,
  })

  // Expose scrollToItem method via ref
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
  const { startIndex, endIndex } = range
  const visibleItems = items.slice(startIndex, endIndex)

  // Calculate scrollTo index for silvery Box overflow="scroll"
  const hasTopPlaceholder = leadingHeight > 0
  const currentSelectedIndex =
    scrollTo !== undefined ? Math.max(0, Math.min(scrollTo, items.length - 1)) : scrollOffset
  const selectedIndexInSlice = currentSelectedIndex - startIndex
  const isSelectedInSlice = selectedIndexInSlice >= 0 && selectedIndexInSlice < visibleItems.length
  const scrollToIndex = hasTopPlaceholder ? selectedIndexInSlice + 1 : selectedIndexInSlice
  const boxScrollTo = isSelectedInSlice ? Math.max(0, scrollToIndex) : undefined

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      overflow="scroll"
      scrollTo={boxScrollTo}
      overflowIndicator={overflowIndicator}
      onWheel={onWheel}
    >
      {/* Leading placeholder for virtual height */}
      {leadingHeight > 0 && <Box height={leadingHeight} flexShrink={0} />}

      {/* Render visible items */}
      {visibleItems.map((item, i) => {
        const originalIndex = startIndex + i
        const key = keyExtractor ? keyExtractor(item, originalIndex) : originalIndex
        const isLast = i === visibleItems.length - 1

        return (
          <React.Fragment key={key}>
            {renderItem(item, originalIndex)}
            {!isLast && renderSeparator && renderSeparator()}
            {!isLast && gap > 0 && !renderSeparator && <Box height={gap} flexShrink={0} />}
          </React.Fragment>
        )
      })}

      {/* Footer content (e.g., filter hidden count) */}
      {listFooter}

      {/* Trailing placeholder for virtual height */}
      {trailingHeight > 0 && <Box height={trailingHeight} flexShrink={0} />}
    </Box>
  )
}

// Export with forwardRef - use type assertion for generic component
export const VirtualView = forwardRef(VirtualViewInner) as <T>(
  props: VirtualViewProps<T> & { ref?: React.ForwardedRef<VirtualViewHandle> },
) => React.ReactElement
