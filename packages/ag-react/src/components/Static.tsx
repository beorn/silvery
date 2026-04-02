/**
 * Silvery Static Component
 *
 * Renders items that are written to the terminal once and never updated.
 * Useful for logs, progress outputs, or any content that should remain
 * visible after being rendered.
 *
 * Write-once semantics: when the items array grows, only newly added items
 * (at the end) are rendered via the children callback. Previously rendered
 * items are preserved as frozen React elements. This matches Ink's Static
 * behavior where each item is rendered exactly once.
 *
 * In inline mode (when promoteScrollback is available), Static uses
 * useScrollback to push items to terminal scrollback. Items leave the React
 * tree once promoted — the terminal owns them. This is the correct behavior
 * for inline mode where content flows into the scrollback buffer.
 *
 * In fullscreen/test mode, items remain in the React tree as frozen elements.
 */

import { useContext, useRef, type JSX, type ReactNode } from "react"
import { StdoutContext, TermContext } from "../context"
import { renderStringSync } from "../render-string"

// TODO: useScrollback was removed — inline scrollback promotion needs reimplementation
// Stub returns 0 (no items promoted) so fullscreen/test mode still works
function useScrollback(_items: unknown[], _opts: unknown): number {
  return 0
}

export interface StaticProps<T> {
  /** Items to render */
  items: T[]
  /** Render function for each item */
  children: (item: T, index: number) => ReactNode
  /** Style to apply to the container */
  style?: Record<string, unknown>
}

/**
 * Renders a list of items that are written once and never updated.
 *
 * Static content is rendered above the main UI and remains visible
 * even as the main UI updates. Each item is rendered only once.
 *
 * In inline mode, items are promoted to terminal scrollback and removed
 * from the React tree. In fullscreen/test mode, items stay in the tree.
 *
 * @example
 * ```tsx
 * const [logs, setLogs] = useState<string[]>([]);
 *
 * // Logs appear above the main UI and stay visible
 * <Static items={logs}>
 *   {(log, index) => <Text key={index}>{log}</Text>}
 * </Static>
 *
 * // Main UI continues below
 * <Box>
 *   <Text>Current status: processing...</Text>
 * </Box>
 * ```
 */
export function Static<T>({ items, children, style }: StaticProps<T>): JSX.Element {
  const stdoutCtx = useContext(StdoutContext)
  const term = useContext(TermContext)
  const useInlineScrollback = !!stdoutCtx?.promoteScrollback

  // Track previously rendered items to implement write-once semantics.
  // Once an item has been rendered, its React element is frozen and reused
  // on subsequent renders — the children callback is NOT called again for it.
  const renderedRef = useRef<ReactNode[]>([])

  // Render only new items (items beyond what we've already rendered)
  const prevCount = renderedRef.current.length
  if (items.length > prevCount) {
    for (let i = prevCount; i < items.length; i++) {
      renderedRef.current.push(children(items[i]!, i))
    }
  } else if (items.length < prevCount) {
    // Items were removed — truncate the rendered cache
    renderedRef.current.length = items.length
  }

  // In inline mode, use useScrollback to promote items to terminal scrollback.
  // All items are immediately frozen (write-once semantics = always frozen).
  const frozenCount = useScrollback(items, {
    frozen: () => useInlineScrollback,
    render: (_item: T, index: number) => {
      const element = renderedRef.current[index]
      if (!element) return ""
      try {
        return renderStringSync(element as React.ReactElement, {
          width: term?.cols ?? 80,
          plain: false,
        })
      } catch {
        return `[static item ${index}]`
      }
    },
    width: useInlineScrollback ? (term?.cols ?? 80) : undefined,
  })

  if (useInlineScrollback) {
    // In inline mode, only render items not yet promoted to scrollback.
    // Frozen items have been written to the terminal scrollback by useScrollback.
    const liveElements = renderedRef.current.slice(frozenCount)
    if (liveElements.length === 0) {
      // All items promoted — render empty container to maintain tree structure
      return <silvery-box flexDirection="column" {...style} />
    }
    return (
      <silvery-box flexDirection="column" {...style}>
        {liveElements}
      </silvery-box>
    )
  }

  // Fullscreen/test mode: render all items in the tree
  return (
    <silvery-box flexDirection="column" {...style}>
      {renderedRef.current}
    </silvery-box>
  )
}
