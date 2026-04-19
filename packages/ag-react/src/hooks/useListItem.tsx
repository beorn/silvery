/**
 * useListItem - Context hook for items inside a ListView.
 *
 * Provides freeze control and status information to items rendered
 * within a ListView. Items call `freeze()` to signal they are complete
 * and should be pushed to terminal cache.
 *
 * @example
 * ```tsx
 * function TaskItem({ task }: { task: Task }) {
 *   const { freeze, isCached } = useListItem()
 *
 *   useEffect(() => {
 *     if (task.status === "done") freeze()
 *   }, [task.status])
 *
 *   return <Text>{task.title}</Text>
 * }
 * ```
 */

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react"

// ============================================================================
// Types
// ============================================================================

/** Context value provided to each item inside a ListView. */
export interface ListItemContext {
  /** Signal that this item is complete and should freeze into cache.
   *  Optionally pass a snapshot JSX element to use instead of re-rendering
   *  the item's live children. */
  freeze: (snapshot?: ReactElement) => void
  /** Whether this item has already been frozen into cache. */
  isCached: boolean
  /** The index of this item in the items array. */
  index: number
  /** True when item is close to the cache boundary. */
  nearCache: boolean
}

// ============================================================================
// Context
// ============================================================================

const ListItemCtx = createContext<ListItemContext | null>(null)

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the list item context from within a ListView item.
 *
 * Must be called from a component rendered as a child of ListView.
 * Throws if used outside of that context.
 */
export function useListItem(): ListItemContext {
  const ctx = useContext(ListItemCtx)
  if (!ctx) {
    throw new Error("useListItem() must be used inside a ListView item")
  }
  return ctx
}

// ============================================================================
// Provider (internal, used by ListView)
// ============================================================================

interface ListItemProviderProps extends ListItemContext {
  children: ReactNode
}

/**
 * Wraps each item rendered by ListView with its context.
 * Internal — not exported from the package's public API.
 */
export function ListItemProvider({
  children,
  freeze,
  isCached,
  index,
  nearCache,
}: ListItemProviderProps) {
  const value = useMemo(
    () => ({ freeze, isCached, index, nearCache }),
    [freeze, isCached, index, nearCache],
  )
  return <ListItemCtx.Provider value={value}>{children}</ListItemCtx.Provider>
}
