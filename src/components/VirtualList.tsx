/**
 * VirtualList Component
 *
 * React-level virtualization for long lists. Only renders items within the
 * visible viewport plus overscan, using placeholder boxes for virtual height.
 *
 * Thin wrapper around VirtualScrollView that adds:
 * - Interactive mode: keyboard navigation (j/k, arrows, PgUp/PgDn, Home/End, G), mouse wheel, selection state
 * - Frozen items: `frozen` prop for contiguous prefix exclusion
 * - ItemMeta: Third arg to renderItem with `{ isSelected }`
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
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useInput } from "../hooks/useInput.js"
import { VirtualScrollView } from "./VirtualScrollView.js"
import type { VirtualScrollViewHandle } from "./VirtualScrollView.js"

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

  /** Predicate to determine if an item should be frozen (skipped from rendering).
   * Only a contiguous prefix of frozen items is removed from the list.
   * Frozen items are excluded from rendering -- callers can use Static or
   * useScrollback to push them to terminal scrollback separately. */
  frozen?: (item: T, index: number) => boolean

  // ── Interactive mode ──────────────────────────────────────────────

  /** Enable built-in keyboard (j/k, arrows, PgUp/PgDn, Home/End, G) and mouse wheel */
  interactive?: boolean

  /** Currently selected index (controlled). Managed internally when not provided. */
  selectedIndex?: number

  /** Called when selection changes (keyboard or mouse wheel navigation) */
  onSelectionChange?: (index: number) => void

  /** Called when Enter is pressed on the selected item */
  onSelect?: (index: number) => void
}

export interface VirtualListHandle {
  /** Scroll to a specific item index */
  scrollToItem(index: number): void
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ITEM_HEIGHT = 1
/** Items to move per mouse wheel tick */
const WHEEL_STEP = 3

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
 * Thin wrapper around VirtualScrollView that adds interactive mode (keyboard +
 * mouse), frozen item prefix exclusion, and selection metadata injection.
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
    scrollTo: scrollToProp,
    overscan,
    maxRendered,
    renderItem,
    overflowIndicator,
    keyExtractor,
    width,
    gap,
    renderSeparator,
    frozen,
    interactive,
    selectedIndex: selectedIndexProp,
    onSelectionChange,
    onSelect,
  }: VirtualListProps<T>,
  ref: React.ForwardedRef<VirtualListHandle>,
): React.ReactElement {
  // ── Interactive mode: internal selection state ────────────────────
  // Semi-controlled: internal state is the source of truth.
  // Prop syncs initial value and external updates.
  const [internalIndex, setInternalIndex] = useState(selectedIndexProp ?? 0)
  const lastPropRef = useRef(selectedIndexProp)
  if (selectedIndexProp !== undefined && selectedIndexProp !== lastPropRef.current) {
    lastPropRef.current = selectedIndexProp
    setInternalIndex(selectedIndexProp)
  }
  const activeSelection = interactive ? internalIndex : -1

  const moveTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, items.length - 1))
      setInternalIndex(clamped)
      onSelectionChange?.(clamped)
    },
    [items.length, onSelectionChange],
  )

  // Keyboard input for interactive mode
  useInput(
    (input, key) => {
      if (!interactive) return
      const cur = activeSelection
      if (input === "j" || key.downArrow) moveTo(cur + 1)
      else if (input === "k" || key.upArrow) moveTo(cur - 1)
      else if (input === "G" || key.end) moveTo(items.length - 1)
      else if (key.home) moveTo(0)
      else if (key.pageDown || (input === "d" && key.ctrl)) moveTo(cur + Math.floor(height / 2))
      else if (key.pageUp || (input === "u" && key.ctrl)) moveTo(cur - Math.floor(height / 2))
      else if (key.return) onSelect?.(cur)
    },
    { isActive: interactive },
  )

  // In interactive mode, scrollTo is derived from selection
  const scrollTo = interactive ? activeSelection : scrollToProp

  // ── Frozen prefix computation ──────────────────────────────────────
  let frozenCount = 0
  if (frozen) {
    for (let i = 0; i < items.length; i++) {
      if (!frozen(items[i]!, i)) break
      frozenCount++
    }
  }

  // Slice items to exclude frozen prefix
  const activeItems = frozenCount > 0 ? items.slice(frozenCount) : items

  // Adjust scrollTo to account for frozen items
  const adjustedScrollTo = scrollTo !== undefined ? Math.max(0, scrollTo - frozenCount) : undefined

  // ── Adapt props for VirtualScrollView ──────────────────────────────

  // Convert itemHeight (item,index)=>number to estimateHeight (index)=>number
  const estimateHeight = useMemo(() => {
    if (typeof itemHeight === "number") return itemHeight
    if (frozenCount > 0) {
      return (index: number) => itemHeight(activeItems[index]!, index + frozenCount)
    }
    return (index: number) => itemHeight(activeItems[index]!, index)
  }, [itemHeight, activeItems, frozenCount])

  // Wrap renderItem to inject ItemMeta (3rd arg) and adjust indices for frozen prefix
  const wrappedRenderItem = useCallback(
    (item: T, index: number): React.ReactNode => {
      const originalIndex = index + frozenCount
      const meta: ItemMeta = { isSelected: originalIndex === activeSelection }
      return renderItem(item, originalIndex, meta)
    },
    [renderItem, frozenCount, activeSelection],
  )

  // Wrap keyExtractor to adjust indices for frozen prefix
  const wrappedKeyExtractor = useMemo(() => {
    if (!keyExtractor) return undefined
    if (frozenCount === 0) return keyExtractor
    return (item: T, index: number) => keyExtractor(item, index + frozenCount)
  }, [keyExtractor, frozenCount])

  // Mouse wheel handler for interactive mode
  const onWheel = useMemo(() => {
    if (!interactive) return undefined
    return (e: { deltaY: number }) => {
      const delta = e.deltaY > 0 ? WHEEL_STEP : -WHEEL_STEP
      moveTo(activeSelection + delta)
    }
  }, [interactive, activeSelection, moveTo])

  // ── Ref wrapping ───────────────────────────────────────────────────
  const innerRef = useRef<VirtualScrollViewHandle>(null)

  // Wrap scrollToItem to accept original indices (before frozen adjustment)
  useImperativeHandle(
    ref,
    () => ({
      scrollToItem(index: number) {
        innerRef.current?.scrollToItem(Math.max(0, index - frozenCount))
      },
    }),
    [frozenCount],
  )

  // ── Delegate to VirtualScrollView ──────────────────────────────────
  return (
    <VirtualScrollView
      ref={innerRef}
      items={activeItems}
      height={height}
      estimateHeight={estimateHeight}
      scrollTo={adjustedScrollTo}
      scrollPadding={SCROLL_PADDING}
      overscan={overscan}
      maxRendered={maxRendered}
      renderItem={wrappedRenderItem}
      overflowIndicator={overflowIndicator}
      keyExtractor={wrappedKeyExtractor}
      width={width}
      gap={gap}
      renderSeparator={renderSeparator}
      onWheel={onWheel}
    />
  )
}

// Export with forwardRef - use type assertion for generic component
export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.ForwardedRef<VirtualListHandle> },
) => React.ReactElement
