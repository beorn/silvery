/**
 * VirtualView - App-managed scrolling within a Screen rectangle.
 *
 * @deprecated Use ListView instead. VirtualView is now a thin wrapper.
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

import React, { forwardRef, useCallback } from "react"
import { ListView } from "./ListView"
import type { ListViewHandle, ListItemMeta } from "./ListView"

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
// Component
// =============================================================================

/**
 * @deprecated Use ListView instead.
 *
 * App-managed scrollable view with virtualization.
 * Now delegates to ListView with prop mapping.
 */
function VirtualViewInner<T>(
  {
    items,
    height,
    estimateHeight,
    renderItem,
    scrollTo,
    overscan,
    maxRendered,
    scrollPadding,
    overflowIndicator,
    keyExtractor,
    width,
    gap,
    renderSeparator,
    onWheel,
    onEndReached,
    onEndReachedThreshold,
    listFooter,
  }: VirtualViewProps<T>,
  ref: React.ForwardedRef<VirtualViewHandle>,
): React.ReactElement {
  // Wrap renderItem to strip the ListItemMeta third arg
  const wrappedRenderItem = useCallback(
    (item: T, index: number, _meta: ListItemMeta): React.ReactNode => {
      return renderItem(item, index)
    },
    [renderItem],
  )

  return (
    <ListView
      ref={ref as any}
      items={items}
      height={height}
      estimateHeight={estimateHeight}
      renderItem={wrappedRenderItem}
      scrollTo={scrollTo}
      overscan={overscan}
      maxRendered={maxRendered}
      scrollPadding={scrollPadding}
      overflowIndicator={overflowIndicator}
      getKey={keyExtractor}
      width={width}
      gap={gap}
      renderSeparator={renderSeparator}
      onWheel={onWheel}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      listFooter={listFooter}
    />
  )
}

// Export with forwardRef - use type assertion for generic component
export const VirtualView = forwardRef(VirtualViewInner) as <T>(
  props: VirtualViewProps<T> & { ref?: React.ForwardedRef<VirtualViewHandle> },
) => React.ReactElement
