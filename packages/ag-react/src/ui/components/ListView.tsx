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
 *   nav
 *   renderItem={(item, i, meta) => (
 *     <Text>{meta.isCursor ? '> ' : '  '}{item.name}</Text>
 *   )}
 *   onSelect={(index) => openItem(items[index])}
 * />
 * ```
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@silvery/ag-react/hooks/useVirtualizer"
import { useInput } from "@silvery/ag-react/hooks/useInput"
import { Box } from "@silvery/ag-react/components/Box"
import { createHistoryBuffer, createHistoryItem } from "@silvery/ag-term/history-buffer"
import type { HistoryBuffer } from "@silvery/ag-term/history-buffer"
import { createListDocument } from "@silvery/ag-term/list-document"
import type { LiveItemBlock } from "@silvery/ag-term/list-document"
import { createTextSurface } from "@silvery/ag-term/text-surface"
import type { TextSurface } from "@silvery/ag-term/text-surface"
import { composeViewport } from "@silvery/ag-term/viewport-compositor"
import type { ComposedViewport } from "@silvery/ag-term/viewport-compositor"
import { stripAnsi } from "@silvery/ag-term/unicode"
// TODO: Replace with search-machine registration (km-silvery.search-machine)
const useSurfaceRegistryOptional = (): any => null

// =============================================================================
// Types
// =============================================================================

/** Metadata passed to renderItem in the third argument */
export interface ListItemMeta {
  /** Whether this item is at the cursor position (nav mode only) */
  isCursor: boolean
}

/** Cache configuration for ListView */
export interface ListViewCacheConfig<T> {
  mode: "none" | "virtual"
  /** Predicate for items that can be cached (removed from React tree). */
  isCacheable?: (item: T, index: number) => boolean
  /** Maximum rows in cache buffer. Default: 10_000 */
  capacity?: number
}

/** Search configuration for ListView */
export interface ListViewSearchConfig<T> {
  /** Extract searchable text from an item. When omitted, auto-extracts from rendered content. */
  getText?: (item: T) => string
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

  /** Index to scroll to (declarative). When undefined, scroll state freezes. Ignored when nav=true. */
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

  /** Mouse wheel handler for scrolling (passive mode only, nav handles its own) */
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
  nav?: boolean

  /** Currently focused cursor key (controlled). Managed internally when not provided. */
  cursorKey?: number

  /** Called when cursor position changes (keyboard or mouse wheel navigation) */
  onCursor?: (index: number) => void

  /** Called when Enter is pressed on the cursor item */
  onSelect?: (index: number) => void

  /** Whether this ListView is active for keyboard input. Default: true.
   * Set to false when another pane has focus in multi-pane layouts. */
  active?: boolean

  // ── History / Surface ─────────────────────────────────────────

  /** Surface identity for search/selection routing */
  surfaceId?: string

  /** Search configuration (true = auto-extract text from rendered content) */
  search?: boolean | ListViewSearchConfig<T>

  /** Cache configuration (true = auto-cache items above viewport) */
  cache?: boolean | ListViewCacheConfig<T>
}

export interface ListViewHandle {
  /** Imperatively scroll to a specific item index */
  scrollToItem(index: number): void
  /** Get the history buffer (if history.mode === "virtual") */
  getHistoryBuffer(): HistoryBuffer | null
  /** Get the composed viewport (if history.mode === "virtual") */
  getComposedViewport(): ComposedViewport | null
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
// Measurement
// =============================================================================

/**
 * Wrapper that measures its child's rendered height after layout.
 * Reports the measurement to the virtualizer via measureItem callback.
 * Uses Box's onLayout prop to get the actual rendered height.
 * Does NOT add any layout of its own — the child determines the height.
 */
function MeasuredItem({
  itemKey,
  measureItem,
  children,
}: {
  itemKey: string | number
  measureItem: (key: string | number, height: number) => boolean
  children: React.ReactNode
}): React.ReactElement {
  // Use a ref to always have the latest key/measureItem without re-subscribing.
  // This avoids creating a new onLayout callback on every render.
  const keyRef = useRef(itemKey)
  keyRef.current = itemKey
  const measureRef = useRef(measureItem)
  measureRef.current = measureItem

  const handleLayout = useCallback((rect: { height: number }) => {
    if (rect.height > 0) {
      measureRef.current(keyRef.current, rect.height)
    }
  }, [])

  // Render children inside a transparent wrapper Box with onLayout.
  // The Box inherits the parent's column layout direction and doesn't
  // constrain the child — it simply provides a node for measurement.
  return (
    <Box flexDirection="column" flexShrink={0} onLayout={handleLayout}>
      {children}
    </Box>
  )
}

// =============================================================================
// Component
// =============================================================================

// oxlint-disable-next-line complexity/complexity -- React component — JSX ternaries inflate score
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
    nav,
    cursorKey: cursorKeyProp,
    onCursor,
    onSelect,
    active,
    surfaceId,
    search: searchProp,
    cache: cacheProp,
  }: ListViewProps<T>,
  ref: React.ForwardedRef<ListViewHandle>,
): React.ReactElement {
  // ── Nav mode: controlled/uncontrolled cursor ─────────
  const isControlled = cursorKeyProp !== undefined
  const [uncontrolledCursor, setUncontrolledCursor] = useState(0)
  const activeCursor = nav ? (isControlled ? cursorKeyProp! : uncontrolledCursor) : -1

  const moveTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, items.length - 1))
      if (!isControlled) setUncontrolledCursor(clamped)
      onCursor?.(clamped)
    },
    [isControlled, items.length, onCursor],
  )

  // Keyboard input for nav mode
  useInput(
    (input, key) => {
      if (!nav) return
      const cur = activeCursor
      if (input === "j" || key.downArrow) moveTo(cur + 1)
      else if (input === "k" || key.upArrow) moveTo(cur - 1)
      else if (input === "G" || key.end) moveTo(items.length - 1)
      else if (key.home) moveTo(0)
      else if (key.pageDown || (input === "d" && key.ctrl)) moveTo(cur + Math.floor(height / 2))
      else if (key.pageUp || (input === "u" && key.ctrl)) moveTo(cur - Math.floor(height / 2))
      else if (key.return) onSelect?.(cur)
    },
    { isActive: nav && active !== false },
  )

  // In nav mode, scrollTo is derived from cursor
  const scrollTo = nav ? activeCursor : scrollToProp

  // ── Resolve cache config ─────────────────────────────────────────
  const cacheConfig = typeof cacheProp === "object" ? cacheProp : cacheProp ? { mode: "virtual" as const } : undefined
  const cacheMode = cacheConfig?.mode ?? "none"
  const cacheBufferRef = useRef<HistoryBuffer | null>(null)
  if (cacheMode === "virtual" && !cacheBufferRef.current) {
    cacheBufferRef.current = createHistoryBuffer(cacheConfig?.capacity ?? 10_000)
  }
  const cacheBuffer = cacheBufferRef.current

  // ── Resolve search config ─────────────────────────────────────────
  const searchConfig = typeof searchProp === "object" ? searchProp : searchProp ? {} : undefined
  const textAdapter = searchConfig ? { getItemText: searchConfig.getText ?? ((item: T) => String(item)) } : undefined

  // Compute cached prefix from isCacheable
  let frozenCount = 0
  if (cacheMode === "virtual" && cacheConfig?.isCacheable) {
    for (let i = 0; i < items.length; i++) {
      if (!cacheConfig.isCacheable(items[i]!, i)) break
      frozenCount++
    }
  }

  // Push newly cached items to buffer
  const prevFrozenRef = useRef(0)
  if (frozenCount > prevFrozenRef.current && cacheBuffer) {
    for (let i = prevFrozenRef.current; i < frozenCount; i++) {
      const item = items[i]!
      const text = textAdapter?.getItemText?.(item) ?? String(item)
      cacheBuffer.push(createHistoryItem(getKey?.(item, i) ?? i, text, 80))
    }
    prevFrozenRef.current = frozenCount
  }

  // Merge frozen prefix with external virtualized prop
  const effectiveVirtualized = useMemo(() => {
    if (frozenCount === 0) return virtualized
    if (!virtualized) {
      return (_item: T, index: number) => index < frozenCount
    }
    return (item: T, index: number) => {
      if (index < frozenCount) return true
      return virtualized(item, index)
    }
  }, [frozenCount, virtualized])

  // ── Virtual prefix computation ──────────────────────────────────────
  let virtualizedCount = 0
  if (effectiveVirtualized) {
    for (let i = 0; i < items.length; i++) {
      if (!effectiveVirtualized(items[i]!, i)) break
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

  const { range, leadingHeight, trailingHeight, scrollOffset, scrollToItem, measureItem, measuredHeights } =
    useVirtualizer({
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

  // ── Surface registration ─────────────────────────────────────────
  const textSurfaceRef = useRef<TextSurface | null>(null)
  const composedViewportRef = useRef<ComposedViewport | null>(null)
  const registry = useSurfaceRegistryOptional()

  // Stable refs for the effect closure to avoid re-running on every items change
  const itemsRef = useRef(items)
  itemsRef.current = items
  const virtualizedCountRef = useRef(virtualizedCount)
  virtualizedCountRef.current = virtualizedCount
  const textAdapterRef = useRef(textAdapter)
  if (textAdapter) textAdapterRef.current = textAdapter
  const getKeyRef = useRef(getKey)
  getKeyRef.current = getKey

  // Create and maintain ListDocument + TextSurface when surfaceId is set
  useEffect(() => {
    if (!surfaceId || cacheMode !== "virtual" || !cacheBuffer) return

    const getLiveItems = (): LiveItemBlock[] => {
      const currentItems = itemsRef.current
      const currentVirtualizedCount = virtualizedCountRef.current
      const currentTextAdapter = textAdapterRef.current
      const currentGetKey = getKeyRef.current
      const live: LiveItemBlock[] = []
      for (let i = currentVirtualizedCount; i < currentItems.length; i++) {
        const item = currentItems[i]!
        const text = currentTextAdapter?.getItemText?.(item) ?? String(item)
        const rows = text.split("\n")
        const plainTextRows = rows.map((r) => stripAnsi(r))
        live.push({
          key: currentGetKey?.(item, i) ?? i,
          itemIndex: i,
          rows,
          plainTextRows,
        })
      }
      return live
    }

    const document = createListDocument(cacheBuffer, getLiveItems)
    const surface = createTextSurface({
      id: surfaceId,
      document,
      viewportToDocument: (viewportRow: number) => viewportRow + cacheBuffer.totalRows,
      onReveal: () => {
        // Could be extended later for scroll-to-row
      },
      capabilities: {
        paneSafe: true,
        searchableHistory: true,
        selectableHistory: true,
        overlayHistory: true,
      },
    })

    textSurfaceRef.current = surface

    // Register with SurfaceRegistry if provider is in the tree
    if (registry) {
      registry.register(surface)
    }

    return () => {
      textSurfaceRef.current = null
      if (registry) {
        registry.unregister(surfaceId)
      }
    }
  }, [surfaceId, cacheMode, cacheBuffer, registry])

  // Compute composed viewport when history is active
  if (cacheMode === "virtual" && cacheBuffer) {
    composedViewportRef.current = composeViewport({
      history: cacheBuffer,
      viewportHeight: height,
      scrollOffset: 0, // At tail by default; scroll offset would come from external state
    })
  }

  // ── Ref ───────────────────────────────────────────────────────────
  // Wrap scrollToItem to accept original indices (before virtual adjustment)
  useImperativeHandle(
    ref,
    () => ({
      scrollToItem(index: number) {
        scrollToItem(Math.max(0, index - virtualizedCount))
      },
      getHistoryBuffer(): HistoryBuffer | null {
        return cacheBufferRef.current
      },
      getComposedViewport(): ComposedViewport | null {
        return composedViewportRef.current
      },
    }),
    [scrollToItem, virtualizedCount],
  )

  // ── Mouse wheel handler ─────────────────────────────────────────
  const onWheel = useMemo(() => {
    if (nav && active !== false) {
      return (e: { deltaY: number }) => {
        const delta = e.deltaY > 0 ? WHEEL_STEP : -WHEEL_STEP
        moveTo(activeCursor + delta)
      }
    }
    return onWheelProp
  }, [nav, active, activeCursor, moveTo, onWheelProp])

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

      {/* Render visible items with height measurement */}
      {visibleItems.map((item, i) => {
        const originalIndex = startIndex + i + virtualizedCount
        const key = getKey ? getKey(item, originalIndex) : startIndex + i
        const isLast = i === visibleItems.length - 1
        const meta: ListItemMeta = { isCursor: originalIndex === activeCursor }
        // Use wrappedGetKey (index within activeItems) for measurement cache
        const measureKey = wrappedGetKey ? wrappedGetKey(startIndex + i) : startIndex + i

        return (
          <React.Fragment key={key}>
            <MeasuredItem itemKey={measureKey} measureItem={measureItem}>
              {renderItem(item, originalIndex, meta)}
            </MeasuredItem>
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
