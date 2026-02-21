/**
 * Inkx useFocusable Hook
 *
 * Makes a component focusable within the new tree-based focus system.
 * Uses useSyncExternalStore for tear-free reads from FocusManager.
 */

import { useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react"
import { FocusManagerContext, NodeContext } from "../context.js"
import type { FocusOrigin, FocusSnapshot } from "../focus-manager.js"

// ============================================================================
// Types
// ============================================================================

export interface UseFocusableResult {
  /** Whether this node is currently focused */
  focused: boolean
  /** Focus this node programmatically */
  focus: () => void
  /** Remove focus from this node */
  blur: () => void
  /** How focus was most recently acquired (keyboard, mouse, programmatic) */
  focusOrigin: FocusOrigin | null
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that makes the current component focusable in the tree-based focus system.
 *
 * Reads the FocusManager via useSyncExternalStore, compares the activeId
 * with the current node's testID to determine focused state.
 *
 * On mount, registers the node with the FocusManager. If the node has
 * autoFocus prop, calls fm.focus(node) on mount.
 *
 * @example
 * ```tsx
 * function FocusablePanel() {
 *   const { focused, focus } = useFocusable()
 *   return (
 *     <Box testID="panel" focusable borderStyle="single" borderColor={focused ? 'green' : 'gray'}>
 *       <Text>{focused ? 'Focused!' : 'Click to focus'}</Text>
 *     </Box>
 *   )
 * }
 * ```
 */
export function useFocusable(): UseFocusableResult {
  const fm = useContext(FocusManagerContext)
  const node = useContext(NodeContext)

  // Read testID from the current node's props
  const testID = node ? ((node.props as Record<string, unknown>).testID as string | undefined) ?? null : null

  // Read autoFocus from the current node's props
  const autoFocus = node ? !!((node.props as Record<string, unknown>).autoFocus) : false

  // Subscribe to FocusManager state via useSyncExternalStore
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

  // Derive focused state from snapshot
  const focused = testID !== null && snapshot !== null && snapshot.activeId === testID
  const focusOrigin = focused ? snapshot!.focusOrigin : null

  // Auto-focus on mount if autoFocus prop is set
  useEffect(() => {
    if (fm && node && autoFocus) {
      fm.focus(node, "programmatic")
    }
  }, [fm, node, autoFocus])

  // Clean up: if this node is focused when unmounting, blur it
  useEffect(() => {
    return () => {
      if (fm && fm.activeElement === node) {
        fm.blur()
      }
    }
  }, [fm, node])

  // Memoize focus/blur callbacks
  const focus = useMemo(() => {
    return () => {
      if (fm && node) {
        fm.focus(node, "programmatic")
      }
    }
  }, [fm, node])

  const blur = useMemo(() => {
    return () => {
      if (fm && focused) {
        fm.blur()
      }
    }
  }, [fm, focused])

  return {
    focused,
    focus,
    blur,
    focusOrigin,
  }
}
