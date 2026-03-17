/**
 * ListView - Unified virtualized list component.
 *
 * Merges VirtualView's core (useVirtualizer, viewport rendering, placeholders)
 * with VirtualList's navigation (keyboard, mouse wheel, cursor state) into
 * a single component.
 *
 * @example
 * ```tsx
 * // Passive (parent controls scroll)
 * <ListView
 *   items={logs}
 *   height={20}
 *   renderItem={(item, index) => <LogEntry data={item} />}
 *   estimateHeight={() => 3}
 * />
 *
 * // Navigable (built-in j/k, arrows, PgUp/PgDn, Home/End, G, mouse wheel)
 * <ListView
 *   items={items}
 *   height={20}
 *   navigable
 *   renderItem={(item, i, meta) => (
 *     <Text>{meta.isCursor ? '> ' : '  '}{item.name}</Text>
 *   )}
 *   onSelect={(index) => openItem(items[index])}
 * />
 * ```
 */

import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react"
import { useVirtualizer } from "@silvery/react/hooks/useVirtualizer"
import { useInput } from "@silvery/react/hooks/useInput"
import { Box } from "@silvery/react/components/Box"

// =============================================================================
// Types
// =============================================================================

/** Metadata passed to renderItem in the third argument */
export interface ListItemMeta {
  /** Whether this item is at the cursor position (navigable mode only) */
  isCursor: boolean
}

export interface ListViewProps<T> {
  /** Array of items to render */
  items: T[]

  /** Height of the viewport in rows */
  height: number

  /** Estimated height of each item in rows (fixed or per-index function). Default: 1 */
  estimateHeight?: number | ((index: number) => number)

  /** Render function for each item. Third arg provides cursor metadata. */
  renderItem: (item: T, index: number, meta: ListItemMeta) => React.ReactNode

  /** Index to scroll to (declarative). When undefined, scroll state freezes. Ignored when navigable=true. */
  scrollTo?: number

  /** Extra items to render beyond viewport for smooth scrolling. Default: 5 */
  overscan?: number

  /** Maximum items to render at once. Default: 100 */
  maxRendered?: number

  /** Padding from edge before scrolling (in items). Default: 2 */
  scrollPadding?: number

  /** Show overflow indicators (▲N/▼N). Default: false */
  overflowIndicator?: boolean

  /** Key extractor (defaults to index) */
  getKey?: (item: T, index: number) => string | number

  /** Width of the viewport (optional, uses parent width if not specified) */
  width?: number

  /** Gap between items in rows. Default: 0 */
  gap?: number

  /** Render separator between items (alternative to gap) */
  renderSeparator?: () => React.ReactNode

  /** Mouse wheel handler for scrolling (passive mode only, navigable handles its own) */
  onWheel?: (event: { deltaY: number }) => void

  /** Called when the visible range reaches near the end of the list (infinite scroll). */
  onEndReached?: () => void
  /** How many items from the end to trigger onEndReached. Default: 5 */
  onEndReachedThreshold?: number

  /** Content rendered after all items inside the scroll container (e.g., hidden count indicator) */
  listFooter?: React.ReactNode

  /** Predicate for items already virtualized (e.g. pushed to scrollback).
   * Only a contiguous prefix of matching items is removed from the list. */
  virtualized?: (item: T, index: number) => boolean

  // ── Navigable mode ──────────────────────────────────────────────

  /** Enable built-in keyboard (j/k, arrows, PgUp/PgDn, Home/End, G) and mouse wheel */
  navigable?: boolean

  /** Currently focused cursor index (controlled). Managed internally when not provided. */
  cursorIndex?: number

  /** Called when cursor position changes (keyboard or mouse wheel navigation) */
  onCursorIndexChange?: (index: number) => void

  /** Called when Enter is pressed on the cursor item */
  onSelect?: (index: number) => void

  /** Whether this ListView is active for keyboard input. Default: true.
   * Set to false when another pane has focus in multi-pane layouts. */
  active?: boolean
}

export interface ListViewHandle {
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
/** Items to move per mouse wheel tick */
const WHEEL_STEP = 3

// =============================================================================
// Component
// =============================================================================

function ListViewInner<T>(
  {
    items,
    height,
    estimateHeight = DEFAULT_ESTIMATE_HEIGHT,
    renderItem,
    scrollTo: scrollToProp,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    scrollPadding = DEFAULT_SCROLL_PADDING,
    overflowIndicator,
    getKey,
    width,
    gap = 0,
    renderSeparator,
    onWheel: onWheelProp,
    onEndReached,
    onEndReachedThreshold,
    listFooter,
    virtualized,
    navigable,
    cursorIndex: cursorIndexProp,
    onCursorIndexChange,
    onSelect,
    active,
  }: ListViewProps<T>,
  ref: React.ForwardedRef<ListViewHandle>,
): React.ReactElement {
  // ── Navigable mode: controlled/uncontrolled cursor ─────────
  const isControlled = cursorIndexProp !== undefined
  const [uncontrolledCursor, setUncontrolledCursor] = useState(0)
  const activeCursor = navigable ? (isControlled ? cursorIndexProp! : uncontrolledCursor) : -1

  const moveTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, items.length - 1))
      if (!isControlled) setUncontrolledCursor(clamped)
      onCursorIndexChange?.(clamped)
    },
    [isControlled, items.length, onCursorIndexChange],
  )

  // Keyboard input for navigable mode
  useInput(
    (input, key) => {
      if (!navigable) return
      const cur = activeCursor
      if (input === "j" || key.downArrow) moveTo(cur + 1)
      else if (input === "k" || key.upArrow) moveTo(cur - 1)
      else if (input === "G" || key.end) moveTo(items.length - 1)
      else if (key.home) moveTo(0)
      else if (key.pageDown || (input === "d" && key.ctrl)) moveTo(cur + Math.floor(height / 2))
      else if (key.pageUp || (input === "u" && key.ctrl)) moveTo(cur - Math.floor(height / 2))
      else if (key.return) onSelect?.(cur)
    },
    { isActive: navigable && active !== false },
  )

  // In navigable mode, scrollTo is derived from cursor
  const scrollTo = navigable ? activeCursor : scrollToProp

  // ── Virtual prefix computation ──────────────────────────────────────
  let virtualizedCount = 0
  if (virtualized) {
    for (let i = 0; i < items.length; i++) {
      if (!virtualized(items[i]!, i)) break
      virtualizedCount++
    }
  }

  // Slice items to exclude virtual prefix
  const activeItems = virtualizedCount > 0 ? items.slice(virtualizedCount) : items

  // Adjust scrollTo to account for virtual items
  const adjustedScrollTo = scrollTo !== undefined ? Math.max(0, scrollTo - virtualizedCount) : undefined

  // ── Adapt estimateHeight for virtualized offset ──────────────────
  const adjustedEstimateHeight = useMemo(() => {
    if (typeof estimateHeight === "number") return estimateHeight
    if (virtualizedCount > 0) {
      return (index: number) => estimateHeight(index + virtualizedCount)
    }
    return estimateHeight
  }, [estimateHeight, virtualizedCount])

  // ── useVirtualizer ──────────────────────────────────────────────
  const wrappedGetKey = useMemo(() => {
    if (!getKey) return undefined
    if (virtualizedCount === 0) return (index: number) => getKey(activeItems[index]!, index)
    return (index: number) => getKey(activeItems[index]!, index + virtualizedCount)
  }, [getKey, activeItems, virtualizedCount])

  const { range, leadingHeight, trailingHeight, scrollOffset, scrollToItem } = useVirtualizer({
    count: activeItems.length,
    estimateHeight: adjustedEstimateHeight,
    viewportHeight: height,
    scrollTo: adjustedScrollTo,
    scrollPadding,
    overscan,
    maxRendered,
    gap,
    getItemKey: wrappedGetKey,
    onEndReached,
    onEndReachedThreshold,
  })

  // ── Ref ───────────────────────────────────────────────────────────
  // Wrap scrollToItem to accept original indices (before virtual adjustment)
  useImperativeHandle(
    ref,
    () => ({
      scrollToItem(index: number) {
        scrollToItem(Math.max(0, index - virtualizedCount))
      },
    }),
    [scrollToItem, virtualizedCount],
  )

  // ── Mouse wheel handler ─────────────────────────────────────────
  const onWheel = useMemo(() => {
    if (navigable && active !== false) {
      return (e: { deltaY: number }) => {
        const delta = e.deltaY > 0 ? WHEEL_STEP : -WHEEL_STEP
        moveTo(activeCursor + delta)
      }
    }
    return onWheelProp
  }, [navigable, active, activeCursor, moveTo, onWheelProp])

  // ── Empty state ─────────────────────────────────────────────────
  if (activeItems.length === 0) {
    return (
      <Box flexDirection="column" height={height} width={width}>
        {/* Empty - nothing to render */}
      </Box>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  const { startIndex, endIndex } = range
  const visibleItems = activeItems.slice(startIndex, endIndex)

  // Calculate scrollTo index for silvery Box overflow="scroll"
  const hasTopPlaceholder = leadingHeight > 0
  const currentScrollTarget =
    adjustedScrollTo !== undefined ? Math.max(0, Math.min(adjustedScrollTo, activeItems.length - 1)) : scrollOffset
  const selectedIndexInSlice = currentScrollTarget - startIndex
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
        const originalIndex = startIndex + i + virtualizedCount
        const key = getKey ? getKey(item, originalIndex) : startIndex + i
        const isLast = i === visibleItems.length - 1
        const meta: ListItemMeta = { isCursor: originalIndex === activeCursor }

        return (
          <React.Fragment key={key}>
            {renderItem(item, originalIndex, meta)}
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
export const ListView = forwardRef(ListViewInner) as <T>(
  props: ListViewProps<T> & { ref?: React.ForwardedRef<ListViewHandle> },
) => React.ReactElement
