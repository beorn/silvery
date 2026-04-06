/**
 * ListView - Unified unmounted list component.
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

import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { useVirtualizer } from "@silvery/ag-react/hooks/useVirtualizer"
import { useInput } from "@silvery/ag-react/hooks/useInput"
import { Box } from "@silvery/ag-react/components/Box"
import { CacheBackendContext, StdoutContext, TermContext } from "@silvery/ag-react/context"
import { renderStringSync } from "@silvery/ag-react/render-string"
import { createHistoryBuffer, createHistoryItem } from "@silvery/ag-term/history-buffer"
import type { HistoryBuffer } from "@silvery/ag-term/history-buffer"
import { createListDocument } from "@silvery/ag-term/list-document"
import type { LiveItemBlock } from "@silvery/ag-term/list-document"
import { createTextSurface } from "@silvery/ag-term/text-surface"
import type { TextSurface } from "@silvery/ag-term/text-surface"
import { composeViewport } from "@silvery/ag-term/viewport-compositor"
import type { ComposedViewport } from "@silvery/ag-term/viewport-compositor"
import { stripAnsi } from "@silvery/ag-term/unicode"
import { isLayoutEngineInitialized } from "@silvery/ag-term/layout-engine"
import { useSearchOptional } from "@silvery/ag-react/providers/SearchProvider"
import type { SearchMatch } from "@silvery/ag-term/search-overlay"

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
  /**
   * Cache backend mode:
   * - "none": No caching
   * - "virtual": In-memory HistoryBuffer ring buffer (fullscreen/panes)
   * - "terminal": Write to stdout as native scrollback via promoteScrollback (inline mode)
   * - "auto": Auto-select based on CacheBackendContext (set by runtime from rendering mode)
   */
  mode: "none" | "virtual" | "terminal" | "auto"
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

  /** Predicate for items already unmounted (cached, pushed to scrollback).
   * Only a contiguous prefix of matching items is removed from the list. */
  unmounted?: (item: T, index: number) => boolean

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
    unmounted,
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
  // ── Term context for cache capture width ─────────────────────────
  const term = useContext(TermContext)

  // ── Cache backend context (set by runtime from rendering mode) ───
  const cacheBackendFromContext = useContext(CacheBackendContext)
  const stdoutCtx = useContext(StdoutContext)

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
  // When cache=true, use "auto" mode which reads CacheBackendContext.
  // When cache={ mode: "auto" }, also reads context. Otherwise use the explicit mode.
  const cacheConfig = typeof cacheProp === "object" ? cacheProp : cacheProp ? { mode: "auto" as const } : undefined
  const rawCacheMode = cacheConfig?.mode ?? "none"
  // Resolve "auto" → context-driven backend selection
  const cacheMode =
    rawCacheMode === "auto" ? (cacheBackendFromContext === "terminal" ? "terminal" : "virtual") : rawCacheMode
  const cacheBufferRef = useRef<HistoryBuffer | null>(null)
  if (cacheMode === "virtual" && !cacheBufferRef.current) {
    cacheBufferRef.current = createHistoryBuffer(cacheConfig?.capacity ?? 10_000)
  }
  const cacheBuffer = cacheBufferRef.current

  // ── Resolve search config ─────────────────────────────────────────
  const searchConfig = typeof searchProp === "object" ? searchProp : searchProp ? {} : undefined
  const getText = searchConfig?.getText ?? (searchConfig ? (item: T) => String(item) : undefined)

  // Compute cached prefix from isCacheable
  let cachedCount = 0
  if ((cacheMode === "virtual" || cacheMode === "terminal") && cacheConfig?.isCacheable) {
    for (let i = 0; i < items.length; i++) {
      if (!cacheConfig.isCacheable(items[i]!, i)) break
      cachedCount++
    }
  }

  // Push newly cached items to buffer or terminal scrollback
  const prevCachedRef = useRef(0)
  if (cachedCount > prevCachedRef.current && (cacheMode === "virtual" || cacheMode === "terminal")) {
    const captureWidth = width ?? term?.cols ?? 80
    const canCapture = isLayoutEngineInitialized()
    for (let i = prevCachedRef.current; i < cachedCount; i++) {
      const item = items[i]!
      const key = getKey?.(item, i) ?? i
      let ansi: string
      if (canCapture) {
        // Render the item's element through the pipeline to get real ANSI
        // (borders, padding, colors — everything the user saw)
        try {
          const element = renderItem(item, i, { isCursor: false })
          ansi = renderStringSync(element as React.ReactElement, {
            width: captureWidth,
            plain: false,
            trimTrailingWhitespace: true,
            trimEmptyLines: false,
          })
        } catch {
          // Fallback to plain text if render fails
          ansi = getText?.(item) ?? String(item)
        }
      } else {
        // Layout engine not ready — fallback to plain text
        ansi = getText?.(item) ?? String(item)
      }

      if (cacheMode === "terminal") {
        // Terminal mode: write to stdout as native scrollback via promoteScrollback.
        // The terminal IS the buffer — no need to store in HistoryBuffer.
        const lineCount = ansi.split("\n").length
        stdoutCtx?.promoteScrollback?.(`${ansi}\x1b[K\r\n`, lineCount)
      } else if (cacheBuffer) {
        // Virtual mode: store in HistoryBuffer ring buffer
        cacheBuffer.push(createHistoryItem(key, ansi, captureWidth))
      }
    }
    prevCachedRef.current = cachedCount
  }

  // Merge cached prefix with external unmounted prop.
  // Only unmount cached items when the cache backend can display them:
  // - "terminal": items promoted to real terminal scrollback (inline mode)
  // - "virtual": items stored in HistoryBuffer for virtual scrollback viewer
  // - "retain": items cached but kept in the render tree (plain fullscreen
  //   without virtual scrollback — unmounting would make items invisible)
  const shouldUnmountCached = cacheBackendFromContext !== "retain" && cachedCount > 0
  const effectiveUnmounted = useMemo(() => {
    if (!shouldUnmountCached) return unmounted
    if (!unmounted) {
      return (_item: T, index: number) => index < cachedCount
    }
    return (item: T, index: number) => {
      if (index < cachedCount) return true
      return unmounted(item, index)
    }
  }, [shouldUnmountCached, cachedCount, unmounted])

  // ── Virtual prefix computation ──────────────────────────────────────
  let unmountedCount = 0
  if (effectiveUnmounted) {
    for (let i = 0; i < items.length; i++) {
      if (!effectiveUnmounted(items[i]!, i)) break
      unmountedCount++
    }
  }

  // Slice items to exclude virtual prefix
  const activeItems = unmountedCount > 0 ? items.slice(unmountedCount) : items

  // Adjust scrollTo to account for virtual items
  const adjustedScrollTo = scrollTo !== undefined ? Math.max(0, scrollTo - unmountedCount) : undefined

  // ── Adapt estimateHeight for unmounted offset ──────────────────
  const adjustedEstimateHeight = useMemo(() => {
    if (typeof estimateHeight === "number") return estimateHeight
    if (unmountedCount > 0) {
      return (index: number) => estimateHeight(index + unmountedCount)
    }
    return estimateHeight
  }, [estimateHeight, unmountedCount])

  // ── useVirtualizer ──────────────────────────────────────────────
  const wrappedGetKey = useMemo(() => {
    if (!getKey) return undefined
    if (unmountedCount === 0) return (index: number) => getKey(activeItems[index]!, index)
    return (index: number) => getKey(activeItems[index]!, index + unmountedCount)
  }, [getKey, activeItems, unmountedCount])

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

  // ── Surface / search registration ────────────────────────────────
  const textSurfaceRef = useRef<TextSurface | null>(null)
  const composedViewportRef = useRef<ComposedViewport | null>(null)
  const searchCtx = useSearchOptional()

  // Stable refs for the effect closure to avoid re-running on every items change
  const itemsRef = useRef(items)
  itemsRef.current = items
  const unmountedCountRef = useRef(unmountedCount)
  unmountedCountRef.current = unmountedCount
  const getTextRef = useRef(getText)
  if (getText) getTextRef.current = getText
  const getKeyRef = useRef(getKey)
  getKeyRef.current = getKey

  // Stable ref to scrollToItem so the search reveal closure doesn't go stale
  const scrollToItemRef = useRef(scrollToItem)
  scrollToItemRef.current = scrollToItem

  // Create and maintain ListDocument + TextSurface when surfaceId is set
  useEffect(() => {
    if (!surfaceId || cacheMode !== "virtual" || !cacheBuffer) return

    const getLiveItems = (): LiveItemBlock[] => {
      const currentItems = itemsRef.current
      const currentUnmountedCount = unmountedCountRef.current
      const currentGetText = getTextRef.current
      const currentGetKey = getKeyRef.current
      const live: LiveItemBlock[] = []
      for (let i = currentUnmountedCount; i < currentItems.length; i++) {
        const item = currentItems[i]!
        const text = currentGetText?.(item) ?? String(item)
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

    return () => {
      textSurfaceRef.current = null
    }
  }, [surfaceId, cacheMode, cacheBuffer])

  // ── Search registration ──────────────────────────────────────────
  // Register as Searchable in SearchProvider when `search` prop is set.
  // The search function scans all items' text for query matches.
  // The reveal function scrolls the matching item into view.
  useEffect(() => {
    if (!searchConfig || !searchCtx || !surfaceId) return

    const searchable = {
      search(query: string): SearchMatch[] {
        if (!query) return []
        const currentItems = itemsRef.current
        const currentGetText = getTextRef.current
        const lowerQuery = query.toLowerCase()
        const matches: SearchMatch[] = []
        let row = 0
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i]!
          const text = currentGetText?.(item) ?? String(item)
          const lines = text.split("\n")
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx]!
            const lowerLine = line.toLowerCase()
            let col = 0
            while (col < lowerLine.length) {
              const found = lowerLine.indexOf(lowerQuery, col)
              if (found === -1) break
              matches.push({ row: row + lineIdx, startCol: found, endCol: found + query.length })
              col = found + 1
            }
          }
          row += lines.length
        }
        return matches
      },
      reveal(match: SearchMatch): void {
        // Find which item contains this row
        const currentItems = itemsRef.current
        const currentGetText = getTextRef.current
        let row = 0
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i]!
          const text = currentGetText?.(item) ?? String(item)
          const lineCount = text.split("\n").length
          if (match.row < row + lineCount) {
            // This item contains the match — scroll to it
            scrollToItemRef.current(Math.max(0, i - unmountedCountRef.current))
            return
          }
          row += lineCount
        }
      },
    }

    return searchCtx.registerSearchable(surfaceId, searchable)
  }, [searchConfig, searchCtx, surfaceId])

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
        scrollToItem(Math.max(0, index - unmountedCount))
      },
      getHistoryBuffer(): HistoryBuffer | null {
        return cacheBufferRef.current
      },
      getComposedViewport(): ComposedViewport | null {
        return composedViewportRef.current
      },
    }),
    [scrollToItem, unmountedCount],
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
        const originalIndex = startIndex + i + unmountedCount
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
