/**
 * Silvery useFocusWithin Hook
 *
 * Returns true if the focus is within the subtree rooted at the given testID.
 * Uses useSyncExternalStore for tear-free reads from FocusManager.
 */

import { useCallback, useContext, useSyncExternalStore } from "react"
import { FocusManagerContext, NodeContext } from "../context"
import type { FocusSnapshot } from "@silvery/tea/focus-manager"

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that returns whether focus is within a subtree.
 *
 * Finds the node with the given testID and walks up from the focused node
 * to check if it passes through that subtree root.
 *
 * @param testID - The testID of the subtree root to check
 * @returns true if the currently focused node is within the subtree
 *
 * @example
 * ```tsx
 * function Sidebar() {
 *   const hasFocus = useFocusWithin('sidebar')
 *   return (
 *     <Box testID="sidebar" borderColor={hasFocus ? 'blue' : 'gray'}>
 *       <FocusableItem testID="item1" />
 *       <FocusableItem testID="item2" />
 *     </Box>
 *   )
 * }
 * ```
 */
export function useFocusWithin(testID: string): boolean {
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

  // If no active focus, can't be within
  if (!snapshot?.activeId) return false

  // Walk up from the focused node to find the root node so we can use
  // findByTestID. We need the render tree root.
  // The current node context gives us a reference into the tree.
  if (!node) return false

  // Walk up to find the root of the render tree
  let root = node
  while (root.parent) {
    root = root.parent
  }

  // Use FocusManager's hasFocusWithin which walks from activeElement up
  return fm!.hasFocusWithin(root, testID)
}
