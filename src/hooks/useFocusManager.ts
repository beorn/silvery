/**
 * Inkx useFocusManager Hook
 *
 * Provides methods to control focus management for all components.
 * Uses the tree-based FocusManager via FocusManagerContext.
 */

import { useCallback, useContext, useSyncExternalStore } from "react"
import { FocusManagerContext, NodeContext } from "../context.js"
import type { FocusSnapshot } from "../focus-manager.js"
import type { InkxNode } from "../types.js"

// ============================================================================
// Types
// ============================================================================

export interface UseFocusManagerResult {
  /** Currently focused node (null if nothing focused) */
  activeElement: InkxNode | null
  /** testID of the currently focused node */
  activeId: string | null
  /** Focus a specific node or node by testID */
  focus: (nodeOrId: InkxNode | string) => void
  /** Focus the next focusable element in tab order */
  focusNext: () => void
  /** Focus the previous focusable element in tab order */
  focusPrev: () => void
  /** Clear focus */
  blur: () => void
  /** Enable focus management (no-op, kept for Ink API compatibility) */
  enableFocus: () => void
  /** Disable focus management (no-op, kept for Ink API compatibility) */
  disableFocus: () => void
  /** Focus previous (alias for focusPrev, kept for Ink API compatibility) */
  focusPrevious: () => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing focus across all focusable components.
 *
 * Uses the tree-based FocusManager via FocusManagerContext.
 *
 * @example
 * ```tsx
 * function Navigation() {
 *   const { focusNext, focusPrev } = useFocusManager()
 *
 *   useInput((input, key) => {
 *     if (key.tab) {
 *       if (key.shift) {
 *         focusPrev()
 *       } else {
 *         focusNext()
 *       }
 *     }
 *   })
 *
 *   return <Text>Tab to navigate</Text>
 * }
 * ```
 */
export function useFocusManager(): UseFocusManagerResult {
  const fm = useContext(FocusManagerContext)
  const node = useContext(NodeContext)

  // Subscribe to FocusManager state
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!fm) return () => {}
      return fm.subscribe(listener)
    },
    [fm],
  )

  const getSnapshot = useCallback(() => {
    if (!fm) return null
    return fm.getSnapshot()
  }, [fm])

  const snapshot: FocusSnapshot | null = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Helper: get the render tree root from the current node
  const getRoot = useCallback((): InkxNode | null => {
    if (!node) return null
    let root = node
    while (root.parent) {
      root = root.parent
    }
    return root
  }, [node])

  const focus = useCallback(
    (nodeOrId: InkxNode | string) => {
      if (!fm) return
      if (typeof nodeOrId === "string") {
        const root = getRoot()
        if (root) {
          fm.focusById(nodeOrId, root, "programmatic")
        }
      } else {
        fm.focus(nodeOrId, "programmatic")
      }
    },
    [fm, getRoot],
  )

  const focusNext = useCallback(() => {
    if (!fm) return
    const root = getRoot()
    if (root) fm.focusNext(root)
  }, [fm, getRoot])

  const focusPrev = useCallback(() => {
    if (!fm) return
    const root = getRoot()
    if (root) fm.focusPrev(root)
  }, [fm, getRoot])

  const blur = useCallback(() => {
    if (!fm) return
    fm.blur()
  }, [fm])

  const noOp = useCallback(() => {}, [])

  if (fm) {
    return {
      activeElement: fm.activeElement,
      activeId: snapshot?.activeId ?? null,
      focus,
      focusNext,
      focusPrev,
      blur,
      enableFocus: noOp,
      disableFocus: noOp,
      focusPrevious: focusPrev,
    }
  }

  // No FocusManagerContext available — return inert result (safe for standalone component tests)
  return {
    activeElement: null,
    activeId: null,
    focus: noOp as (nodeOrId: InkxNode | string) => void,
    focusNext: noOp,
    focusPrev: noOp,
    blur: noOp,
    enableFocus: noOp,
    disableFocus: noOp,
    focusPrevious: noOp,
  }
}
