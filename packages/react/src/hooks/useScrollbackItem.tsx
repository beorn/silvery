/**
 * useScrollbackItem - Context hook for items inside ScrollbackList.
 *
 * Provides freeze control and status information to items rendered
 * within a ScrollbackList. Items call `freeze()` to signal they are
 * complete and should be pushed to terminal scrollback.
 *
 * @example
 * ```tsx
 * function TaskItem({ task }: { task: Task }) {
 *   const { freeze, isFrozen } = useScrollbackItem()
 *
 *   useEffect(() => {
 *     if (task.status === "done") freeze()
 *   }, [task.status])
 *
 *   return <Text>{task.title}</Text>
 * }
 * ```
 */

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react";

// ============================================================================
// Types
// ============================================================================

/** Context value provided to each item inside a ScrollbackList. */
export interface ScrollbackItemContext {
  /** Signal that this item is complete and should freeze into scrollback.
   *  Optionally pass a snapshot JSX element to use instead of re-rendering
   *  the item's live children. */
  freeze: (snapshot?: ReactElement) => void;
  /** Whether this item has already been frozen into scrollback. */
  isFrozen: boolean;
  /** The index of this item in the items array. */
  index: number;
  /** True when item is close to the scrollback boundary (Phase 2 feature). */
  nearScrollback: boolean;
}

// ============================================================================
// Context
// ============================================================================

const ScrollbackItemCtx = createContext<ScrollbackItemContext | null>(null);

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the scrollback item context from within a ScrollbackList item.
 *
 * Must be called from a component rendered as a child of ScrollbackList.
 * Throws if used outside of a ScrollbackList.
 */
export function useScrollbackItem(): ScrollbackItemContext {
  const ctx = useContext(ScrollbackItemCtx);
  if (!ctx) {
    throw new Error("useScrollbackItem() must be used inside a ScrollbackList item");
  }
  return ctx;
}

// ============================================================================
// Provider (internal, used by ScrollbackList)
// ============================================================================

interface ScrollbackItemProviderProps extends ScrollbackItemContext {
  children: ReactNode;
}

/**
 * Wraps each item rendered by ScrollbackList with its context.
 * Internal — not exported from the package's public API.
 */
export function ScrollbackItemProvider({
  children,
  freeze,
  isFrozen,
  index,
  nearScrollback,
}: ScrollbackItemProviderProps) {
  const value = useMemo(
    () => ({ freeze, isFrozen, index, nearScrollback }),
    [freeze, isFrozen, index, nearScrollback],
  );
  return <ScrollbackItemCtx.Provider value={value}>{children}</ScrollbackItemCtx.Provider>;
}
