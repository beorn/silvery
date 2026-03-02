/**
 * ScrollbackView - Native scrollback root component.
 *
 * Uses the normal terminal buffer. Children flow vertically. As items scroll
 * off the top of the screen, they transition through the virtualization
 * lifecycle (Live → Virtualized → Static) and are committed to terminal
 * scrollback.
 *
 * The user scrolls with their terminal's native scroll (mouse wheel, scrollbar,
 * Shift+PageUp). Text selection is free. Content becomes part of the terminal's
 * permanent history.
 *
 * This is an evolution of ScrollbackList with automatic lifecycle management
 * via the shared useVirtualizer() engine.
 *
 * @example
 * ```tsx
 * <ScrollbackView footer={<StatusBar />}>
 *   {messages.map(m => <Message key={m.id} data={m} />)}
 * </ScrollbackView>
 * ```
 *
 * @example
 * ```tsx
 * // With item-level lifecycle control via useScrollbackItem
 * <ScrollbackView
 *   items={tasks}
 *   keyExtractor={(t) => t.id}
 *   isFrozen={(t) => t.done}
 *   footer={<Text>Status bar</Text>}
 * >
 *   {(task) => <TaskItem task={task} />}
 * </ScrollbackView>
 * ```
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react"
import type { ScrollbackMarkerCallbacks } from "../hooks/useScrollback.js"
import { useScrollback } from "../hooks/useScrollback.js"
import { renderStringSync } from "../render-string.js"
import { ScrollbackItemProvider } from "../hooks/useScrollbackItem.js"

// ============================================================================
// Types
// ============================================================================

export interface ScrollbackViewProps<T> {
  /** Array of items to render. */
  items: T[]
  /** Render function for each item. Receives item and its index. */
  children?: (item: T, index: number) => ReactNode
  /** Render function for each item. Alternative to children — prefer this for performance
   *  as it can be wrapped in useCallback for memoization. */
  renderItem?: (item: T, index: number) => ReactNode
  /** Extract a unique key for each item. */
  keyExtractor: (item: T, index: number) => string | number
  /**
   * Data-driven frozen predicate. Items matching this predicate are frozen
   * immediately on render (no effect roundtrip needed). Works in addition
   * to the freeze() callback from useScrollbackItem.
   */
  isFrozen?: (item: T, index: number) => boolean
  /** Optional footer pinned at the bottom of the terminal. */
  footer?: ReactNode
  /** Height of the footer in rows. Default: 1. */
  footerHeight?: number
  /**
   * Maximum lines to retain in dynamic scrollback before promoting to static.
   * Items beyond this boundary become static (data dropped, terminal owns them).
   * Default: 10000
   */
  maxHistory?: number
  /** OSC 133 marker configuration, forwarded to useScrollback. */
  markers?: boolean | ScrollbackMarkerCallbacks<T>
  /** Terminal width in columns. Default: process.stdout.columns. */
  width?: number
  /** Output stream for writing frozen items. Default: process.stdout. */
  stdout?: { write(data: string): boolean }
  /** Called when recovery from inconsistent state occurs. */
  onRecovery?: () => void
}

// ============================================================================
// Helpers
// ============================================================================

/** Get terminal columns, falling back to 80 for non-TTY environments. */
function getTermCols(): number {
  return process.stdout.columns ?? 80
}

// ============================================================================
// Component
// ============================================================================

/**
 * Native scrollback view with automatic item lifecycle management.
 *
 * Items rendered inside ScrollbackView have access to `useScrollbackItem()`
 * which provides a `freeze()` function. When an item calls freeze(), it is
 * marked for scrollback. Once a contiguous prefix of items are all frozen,
 * they are rendered to strings and written to stdout via useScrollback.
 *
 * This is the native-scrollback counterpart to VirtualView. Where
 * VirtualView keeps everything in the React tree, ScrollbackView commits
 * completed items to the terminal's scrollback buffer.
 */
export function ScrollbackView<T>({
  items,
  children,
  renderItem,
  keyExtractor,
  isFrozen: isFrozenProp,
  footer,
  footerHeight = 1,
  maxHistory: _maxHistory = 10000,
  markers,
  width,
  stdout = process.stdout as unknown as { write(data: string): boolean },
  onRecovery,
}: ScrollbackViewProps<T>): ReactElement {
  // Track terminal width reactively so we re-render on resize.
  // Without this, getTermCols() is only called during render — if no React
  // state changes on resize, the component never re-renders and useScrollback
  // never detects the width change (frozen items aren't re-emitted).
  const [termWidth, setTermWidth] = useState(getTermCols)
  useEffect(() => {
    if (width !== undefined) return // Parent controls width — skip listener
    // Use the stdout prop (defaults to process.stdout) — works with both
    // real terminals and test mocks that emit "resize" events.
    const stream = stdout as { on?: Function; off?: Function; columns?: number }
    if (!stream?.on || !stream?.columns) return
    const onResize = () => setTermWidth((stream as { columns: number }).columns ?? 80)
    stream.on("resize", onResize)
    return () => { stream.off?.("resize", onResize) }
  }, [width, stdout])

  const effectiveWidth = width ?? termWidth

  // Resolve render function: renderItem takes precedence over children
  const render = renderItem ?? children
  if (!render) {
    throw new Error("ScrollbackView requires either a `renderItem` prop or `children` render function")
  }

  // Set of item keys that have been marked as frozen via freeze()
  const [frozenKeys, setFrozenKeys] = useState<Set<string | number>>(() => new Set())

  // Optional snapshot overrides: key -> ReactElement
  const snapshotRef = useRef<Map<string | number, ReactElement>>(new Map())

  // Cached freeze functions per key — stable references for memoization
  const freezeCache = useRef(new Map<string | number, (snapshot?: ReactElement) => void>())

  const getFreeze = useCallback((key: string | number) => {
    let fn = freezeCache.current.get(key)
    if (!fn) {
      fn = (snapshot?: ReactElement) => {
        if (snapshot) snapshotRef.current.set(key, snapshot)
        setFrozenKeys((prev) => {
          if (prev.has(key)) return prev
          const next = new Set(prev)
          next.add(key)
          return next
        })
      }
      freezeCache.current.set(key, fn)
    }
    return fn
  }, [])

  // Frozen predicate for useScrollback: combine data-driven isFrozen prop
  // with the imperative freeze() callback (frozenKeys set).
  const frozenPredicate = useCallback(
    (item: T, index: number): boolean => {
      if (isFrozenProp?.(item, index)) return true
      const key = keyExtractor(item, index)
      return frozenKeys.has(key)
    },
    [frozenKeys, keyExtractor, isFrozenProp],
  )

  // Render callback for useScrollback: render frozen item to string.
  const renderFrozen = useCallback(
    (item: T, index: number): string => {
      const key = keyExtractor(item, index)
      const snapshot = snapshotRef.current.get(key)
      const noop = () => {}
      const inner = snapshot ?? (render(item, index) as ReactElement)
      const element = (
        <ScrollbackItemProvider freeze={noop} isFrozen={true} index={index} nearScrollback={false}>
          {inner}
        </ScrollbackItemProvider>
      )
      try {
        return renderStringSync(element, { width: effectiveWidth, plain: false })
      } catch {
        return `[frozen item ${index}]`
      }
    },
    [render, keyExtractor, effectiveWidth],
  )

  // Use the underlying useScrollback hook to manage stdout writes
  const frozenCount = useScrollback(items, {
    frozen: frozenPredicate,
    render: renderFrozen,
    stdout,
    markers,
    width: effectiveWidth,
  })

  // Clean up snapshot refs for items that have been flushed to scrollback
  useEffect(() => {
    if (frozenCount > 0) {
      for (let i = 0; i < frozenCount; i++) {
        const key = keyExtractor(items[i]!, i)
        snapshotRef.current.delete(key)
      }
    }
  }, [frozenCount, items, keyExtractor])

  // Recovery: detect if frozen keys reference items no longer in the list
  useEffect(() => {
    if (frozenKeys.size === 0) return
    const currentKeys = new Set(items.map((item, i) => keyExtractor(item, i)))
    let hasStale = false
    for (const key of frozenKeys) {
      if (!currentKeys.has(key)) {
        hasStale = true
        break
      }
    }
    if (hasStale) {
      setFrozenKeys((prev) => {
        const next = new Set<string | number>()
        for (const key of prev) {
          if (currentKeys.has(key)) next.add(key)
        }
        return next
      })
      // Clean up stale freeze cache entries
      for (const key of freezeCache.current.keys()) {
        if (!currentKeys.has(key)) freezeCache.current.delete(key)
      }
      onRecovery?.()
    }
  }, [items, keyExtractor, frozenKeys, onRecovery])

  // Build live (non-frozen) items
  const liveItems = useMemo(() => {
    const result: Array<{ item: T; index: number; key: string | number }> = []
    for (let i = frozenCount; i < items.length; i++) {
      const key = keyExtractor(items[i]!, i)
      result.push({ item: items[i]!, index: i, key })
    }
    return result
  }, [items, frozenCount, keyExtractor])

  // Render live items with memoized wrappers
  return (
    <inkx-box flexDirection="column">
      {/* Content area: live (unfrozen) items */}
      <inkx-box flexDirection="column">
        {liveItems.map(({ item, index, key }) => (
          <MemoItem key={key} item={item} index={index} freeze={getFreeze(key)} renderFn={render} />
        ))}
      </inkx-box>

      {/* Footer pinned at bottom */}
      {footer != null && (
        <inkx-box flexDirection="column" height={footerHeight} flexShrink={0}>
          {footer}
        </inkx-box>
      )}
    </inkx-box>
  )
}

// ============================================================================
// MemoItem — skips reconciliation when item/index/freeze/renderFn are stable
// ============================================================================

interface MemoItemProps<T> {
  item: T
  index: number
  freeze: (snapshot?: ReactElement) => void
  renderFn: (item: T, index: number) => ReactNode
}

const MemoItem = memo(function MemoItem<T>({ item, index, freeze, renderFn }: MemoItemProps<T>) {
  return (
    <ScrollbackItemProvider freeze={freeze} isFrozen={false} index={index} nearScrollback={false}>
      {renderFn(item, index)}
    </ScrollbackItemProvider>
  )
}) as <T>(props: MemoItemProps<T> & { key?: React.Key }) => ReactElement
