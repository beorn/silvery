/**
 * ScrollbackList - Declarative wrapper around useScrollback.
 *
 * Manages a list of items where completed items freeze into terminal
 * scrollback. Items signal completion by calling `freeze()` from the
 * useScrollbackItem hook. Frozen items are written to stdout in order
 * and removed from the live render area.
 *
 * The component enforces a contiguous prefix invariant: items freeze
 * in order from the start. If item 3 calls freeze() but items 0-2
 * have not yet frozen, item 3 is marked but won't flush to scrollback
 * until 0-2 are also frozen.
 *
 * @example
 * ```tsx
 * function App() {
 *   const [tasks, setTasks] = useState<Task[]>(initialTasks)
 *
 *   return (
 *     <ScrollbackList
 *       items={tasks}
 *       keyExtractor={(t) => t.id}
 *       footer={<Text>Status bar</Text>}
 *     >
 *       {(task) => <TaskItem task={task} />}
 *     </ScrollbackList>
 *   )
 * }
 *
 * function TaskItem({ task }: { task: Task }) {
 *   const { freeze } = useScrollbackItem()
 *   useEffect(() => { if (task.done) freeze() }, [task.done])
 *   return <Text>{task.title}</Text>
 * }
 * ```
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react"

import type { ScrollbackMarkerCallbacks } from "../hooks/useScrollback.js"
import { useScrollback } from "../hooks/useScrollback.js"
import { renderStringSync } from "../render-string.js"
import { ScrollbackItemProvider } from "../hooks/useScrollbackItem.js"

// ============================================================================
// Types
// ============================================================================

export interface ScrollbackListProps<T> {
  /** Array of items to render. */
  items: T[]
  /** Render function for each item. Receives item and its index. */
  children: (item: T, index: number) => ReactNode
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

/** Get terminal rows, falling back to 24 for non-TTY environments. */
function getTermRows(): number {
  return process.stdout.rows ?? 24
}

/** Get terminal columns, falling back to 80 for non-TTY environments. */
function getTermCols(): number {
  return process.stdout.columns ?? 80
}

// ============================================================================
// Component
// ============================================================================

/**
 * A list component that pushes completed items to terminal scrollback.
 *
 * Items rendered inside ScrollbackList have access to `useScrollbackItem()`
 * which provides a `freeze()` function. When an item calls freeze(), it is
 * marked for scrollback. Once a contiguous prefix of items are all frozen,
 * they are rendered to strings and written to stdout via useScrollback.
 */
export function ScrollbackList<T>({
  items,
  children,
  keyExtractor,
  isFrozen: isFrozenProp,
  footer,
  footerHeight = 1,
  markers,
  width,
  stdout = process.stdout as unknown as { write(data: string): boolean },
  onRecovery,
}: ScrollbackListProps<T>): ReactElement {
  const effectiveWidth = width ?? getTermCols()

  // Track terminal height for pinning footer at bottom
  const [termRows, setTermRows] = useState(getTermRows)

  useEffect(() => {
    const onResize = () => setTermRows(getTermRows())
    process.stdout.on("resize", onResize)
    return () => {
      process.stdout.off("resize", onResize)
    }
  }, [])

  // Set of item keys that have been marked as frozen via freeze()
  const [frozenKeys, setFrozenKeys] = useState<Set<string | number>>(() => new Set())

  // Optional snapshot overrides: key -> ReactElement
  const snapshotRef = useRef<Map<string | number, ReactElement>>(new Map())

  // Create freeze callback for a specific item key
  const createFreeze = useCallback((key: string | number) => {
    return (snapshot?: ReactElement) => {
      if (snapshot) {
        snapshotRef.current.set(key, snapshot)
      }
      setFrozenKeys((prev) => {
        if (prev.has(key)) return prev
        const next = new Set(prev)
        next.add(key)
        return next
      })
    }
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
  // Wraps in a ScrollbackItemProvider so items that call useScrollbackItem()
  // get a valid context even during static rendering.
  const renderFrozen = useCallback(
    (item: T, index: number): string => {
      const key = keyExtractor(item, index)
      const snapshot = snapshotRef.current.get(key)
      const noop = () => {}
      const inner = snapshot ?? (children(item, index) as ReactElement)
      const element = (
        <ScrollbackItemProvider freeze={noop} isFrozen={true} index={index} nearScrollback={false}>
          {inner}
        </ScrollbackItemProvider>
      )
      try {
        return renderStringSync(element, { width: effectiveWidth, plain: false })
      } catch {
        // If renderStringSync fails (e.g., layout engine not ready),
        // return a placeholder. This shouldn't happen in normal usage.
        return `[frozen item ${index}]`
      }
    },
    [children, keyExtractor, effectiveWidth],
  )

  // Use the underlying useScrollback hook to manage stdout writes
  const frozenCount = useScrollback(items, {
    frozen: frozenPredicate,
    render: renderFrozen,
    stdout,
    markers,
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
      onRecovery?.()
    }
  }, [items, keyExtractor, frozenKeys, onRecovery])

  // Build context values for each live (non-frozen) item
  const liveItems = useMemo(() => {
    const result: Array<{ item: T; index: number; key: string | number }> = []
    for (let i = frozenCount; i < items.length; i++) {
      const key = keyExtractor(items[i]!, i)
      result.push({ item: items[i]!, index: i, key })
    }
    return result
  }, [items, frozenCount, keyExtractor])

  // Render live items with ScrollbackItemProvider wrappers
  return (
    <inkx-box flexDirection="column" height={termRows}>
      {/* Content area: live (unfrozen) items */}
      <inkx-box flexDirection="column" flexGrow={1} overflow="hidden">
        {liveItems.map(({ item, index, key }) => (
          <ScrollbackItemProvider
            key={key}
            freeze={createFreeze(key)}
            isFrozen={false}
            index={index}
            nearScrollback={false}
          >
            {children(item, index)}
          </ScrollbackItemProvider>
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
