/**
 * useFocus — Ink-compatible focus hook.
 *
 * Matches Ink 7.0's `useFocus(options?)` signature exactly:
 * - Options: `{ isActive?: boolean, autoFocus?: boolean, id?: string }`
 * - Returns: `{ isFocused: boolean, focus: (id: string) => void }`
 *
 * Reuses silvery's tree-based FocusManager — does NOT duplicate focus
 * infrastructure. For silvery's richer API (focus origin, blur, scope-aware),
 * use `useFocusable()` instead.
 *
 * @example
 * ```tsx
 * function Panel() {
 *   const { isFocused, focus } = useFocus({ id: "panel", autoFocus: true })
 *   return (
 *     <Box focusable testID="panel">
 *       <Text>{isFocused ? "Focused!" : "Not focused"}</Text>
 *     </Box>
 *   )
 * }
 * ```
 *
 * Bead: km-silvery.focus-parity
 */

import { useCallback, useContext, useEffect, useRef, useSyncExternalStore } from "react"
import { FocusManagerContext, NodeContext } from "../context"
import type { FocusSnapshot } from "@silvery/ag/focus-manager"
import type { AgNode } from "@silvery/ag/types"

// Counter for auto-generated focus IDs when none provided
let autoIdCounter = 0

// ============================================================================
// Types
// ============================================================================

export interface UseFocusOptions {
  /** Whether this component participates in focus. Default: true. */
  isActive?: boolean
  /** Whether to auto-focus on mount. Default: false. */
  autoFocus?: boolean
  /** Focus ID. When provided, overrides the node's testID for focus matching. */
  id?: string
}

export interface UseFocusResult {
  /** Whether this component is currently focused. */
  isFocused: boolean
  /** Focus a specific component by ID. */
  focus: (id: string) => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Ink-compatible focus hook. Reads focus state from the tree-based FocusManager
 * and returns `{ isFocused, focus }`.
 *
 * The `id` option overrides testID for focus identity matching. When `isActive`
 * is false, `isFocused` is always false regardless of actual focus state.
 *
 * @param options - Focus options (all optional).
 */
export function useFocus(options: UseFocusOptions = {}): UseFocusResult {
  const { isActive = true, autoFocus = false, id } = options
  const fm = useContext(FocusManagerContext)
  const node = useContext(NodeContext)

  // Stable auto-generated ID when no explicit id is provided.
  // Uses a ref so the ID persists across re-renders.
  const autoIdRef = useRef<string | null>(null)
  if (!autoIdRef.current && !id) {
    autoIdRef.current = `__useFocus_${++autoIdCounter}`
  }

  // Determine the focus ID: explicit id > auto-generated id
  // (node's testID is NOT used — useFocus manages its own identity)
  const focusId = id ?? autoIdRef.current

  // Register as a hook focusable with the FocusManager.
  // This adds the component to the Tab cycle alongside tree-based focusables.
  // If a tree-based focusable with the same testID exists, FocusManager's
  // buildTabEntries deduplicates — the tree entry takes priority.
  useEffect(() => {
    if (!fm || !focusId) return
    return fm.registerHookFocusable(focusId, { isActive, autoFocus })
  }, [fm, focusId]) // eslint-disable-line react-hooks/exhaustive-deps -- autoFocus only matters on mount

  // Update isActive when it changes (without re-registering)
  useEffect(() => {
    if (!fm || !focusId) return
    fm.setHookFocusableActive(focusId, isActive)
  }, [fm, focusId, isActive])

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

  // isFocused: true only when isActive AND this component's focusId matches activeId
  const isFocused =
    isActive && focusId !== null && snapshot !== null && snapshot.activeId === focusId

  // Helper: get the render tree root from the current node
  const getRoot = useCallback((): AgNode | null => {
    if (!node) return null
    let root = node
    while (root.parent) {
      root = root.parent
    }
    return root
  }, [node])

  // focus(id) — programmatically focus a component by ID (Ink signature)
  const focus = useCallback(
    (targetId: string) => {
      if (!fm) return
      const root = getRoot()
      if (root) {
        fm.focusById(targetId, root, "programmatic")
      }
    },
    [fm, getRoot],
  )

  return { isFocused, focus }
}
