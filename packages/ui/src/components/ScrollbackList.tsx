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
 * This is a thin wrapper around ScrollbackView (which adds maxHistory support).
 * The two components share identical scrollback semantics.
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

import type { ReactElement } from "react"
import type { ScrollbackMarkerCallbacks } from "@silvery/react/hooks/useScrollback"
import type { ReactNode } from "react"
import { ScrollbackView } from "./ScrollbackView"

// ============================================================================
// Types
// ============================================================================

export interface ScrollbackListProps<T> {
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
  /** @deprecated Footer now auto-sizes to content. This prop is ignored. */
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
// Component
// ============================================================================

/**
 * A list component that pushes completed items to terminal scrollback.
 *
 * Thin wrapper around ScrollbackView — delegates all rendering and scrollback
 * management to ScrollbackView without maxHistory (unlimited by default).
 */
export function ScrollbackList<T>(props: ScrollbackListProps<T>): ReactElement {
  return <ScrollbackView {...props} />
}
