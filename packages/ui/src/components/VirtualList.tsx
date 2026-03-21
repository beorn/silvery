/**
 * VirtualList Component
 *
 * @deprecated Use ListView instead. VirtualList is now a thin wrapper.
 *
 * React-level virtualization for long lists. Only renders items within the
 * visible viewport plus overscan, using placeholder boxes for virtual height.
 *
 * Thin wrapper around ListView that maps old prop names to new ones:
 * - `interactive` → `navigable`
 * - `selectedIndex` → `cursorIndex`
 * - `onSelectionChange` → `onCursorIndexChange`
 * - `keyExtractor` → `getKey`
 * - `itemHeight` → `estimateHeight`
 * - `isSelected` in ItemMeta → `isCursor` in ListItemMeta
 *
 * @example
 * ```tsx
 * // Declarative (parent controls scroll position)
 * <VirtualList
 *   items={cards}
 *   height={20}
 *   itemHeight={1}
 *   scrollTo={selectedIndex}
 *   renderItem={(card, index) => (
 *     <TreeCard key={card.id} card={card} isSelected={index === selected} />
 *   )}
 * />
 *
 * // Interactive (built-in j/k, arrows, PgUp/PgDn, Home/End, G, mouse wheel)
 * <VirtualList
 *   items={items}
 *   height={20}
 *   itemHeight={1}
 *   interactive
 *   onSelect={(index) => openItem(items[index])}
 *   renderItem={(item, index, meta) => (
 *     <Text>{meta?.isSelected ? '> ' : '  '}{item.name}</Text>
 *   )}
 * />
 * ```
 */
import React, { forwardRef, useCallback, useMemo } from "react"
import { ListView } from "./ListView"
import type { ListViewHandle, ListItemMeta } from "./ListView"

// =============================================================================
// Types
// =============================================================================

/** Metadata passed to renderItem in the third argument */
export interface ItemMeta {
  /** Whether this item is the currently selected item (interactive mode only) */
  isSelected: boolean
}

export interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[]

  /** Height of the list viewport in rows */
  height: number

  /** Height of each item in rows (fixed or function for variable heights) */
  itemHeight?: number | ((item: T, index: number) => number)

  /** Index to keep visible (scrolls if off-screen). Ignored when interactive=true. */
  scrollTo?: number

  /** Extra items to render above/below viewport for smooth scrolling (default: 5) */
  overscan?: number

  /** Maximum items to render at once (default: 100) */
  maxRendered?: number

  /** Render function for each item. Third arg provides selection metadata. */
  renderItem: (item: T, index: number, meta?: ItemMeta) => React.ReactNode

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

  /** Predicate for items already virtualized (e.g. pushed to scrollback).
   * Only a contiguous prefix of matching items is removed from the list.
   * Virtualized items are excluded from rendering — callers can use Static or
   * useScrollback to push them to terminal scrollback separately. */
  virtualized?: (item: T, index: number) => boolean

  // ── Interactive mode ──────────────────────────────────────────────

  /** Enable built-in keyboard (j/k, arrows, PgUp/PgDn, Home/End, G) and mouse wheel */
  interactive?: boolean

  /** Currently selected index (controlled). Managed internally when not provided. */
  selectedIndex?: number

  /** Called when selection changes (keyboard or mouse wheel navigation) */
  onSelectionChange?: (index: number) => void

  /** Called when Enter is pressed on the selected item */
  onSelect?: (index: number) => void

  /** Called when the visible range reaches near the end of the list (infinite scroll). */
  onEndReached?: () => void
  /** How many items from the end to trigger onEndReached. Default: 5 */
  onEndReachedThreshold?: number

  /** Content rendered after all items inside the scroll container */
  listFooter?: React.ReactNode
}

export interface VirtualListHandle {
  /** Scroll to a specific item index */
  scrollToItem(index: number): void
}

// =============================================================================
// Component
// =============================================================================

/**
 * @deprecated Use ListView instead.
 *
 * VirtualList - React-level virtualized list with native silvery scrolling.
 * Now delegates to ListView with prop mapping.
 */
function VirtualListInner<T>(
  {
    items,
    height,
    itemHeight = 1,
    scrollTo,
    overscan,
    maxRendered,
    renderItem,
    overflowIndicator,
    keyExtractor,
    width,
    gap,
    renderSeparator,
    virtualized,
    interactive,
    selectedIndex,
    onSelectionChange,
    onSelect,
    onEndReached,
    onEndReachedThreshold,
    listFooter,
  }: VirtualListProps<T>,
  ref: React.ForwardedRef<VirtualListHandle>,
): React.ReactElement {
  // Convert itemHeight (item, index) => number to estimateHeight (index) => number
  const estimateHeight = useMemo(() => {
    if (typeof itemHeight === "number") return itemHeight
    return (index: number) => itemHeight(items[index]!, index)
  }, [itemHeight, items])

  // Wrap renderItem to map ListItemMeta → ItemMeta
  const wrappedRenderItem = useCallback(
    (item: T, index: number, meta: ListItemMeta): React.ReactNode => {
      const oldMeta: ItemMeta = { isSelected: meta.isCursor }
      return renderItem(item, index, oldMeta)
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
      overflowIndicator={overflowIndicator}
      getKey={keyExtractor}
      width={width}
      gap={gap}
      renderSeparator={renderSeparator}
      virtualized={virtualized}
      navigable={interactive}
      cursorIndex={selectedIndex}
      onCursorIndexChange={onSelectionChange}
      onSelect={onSelect}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      listFooter={listFooter}
    />
  )
}

// Export with forwardRef - use type assertion for generic component
export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.ForwardedRef<VirtualListHandle> },
) => React.ReactElement
