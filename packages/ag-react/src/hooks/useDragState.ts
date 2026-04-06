/**
 * useDragState — observe the DragFeature via CapabilityRegistry.
 *
 * Reads DRAG_CAPABILITY from CapabilityRegistryContext and subscribes
 * to state changes via useSyncExternalStore. Returns the current
 * DragState (or null when no drag is active), or undefined when the
 * feature is not installed.
 *
 * @example
 * ```tsx
 * function DragIndicator() {
 *   const drag = useDragState()
 *   if (drag === undefined) return null  // feature not installed
 *   if (drag === null) return null       // no active drag
 *   return <Text>Dragging from ({drag.startPos.x},{drag.startPos.y})</Text>
 * }
 * ```
 */

import { useContext, useSyncExternalStore, useCallback } from "react"
import { CapabilityRegistryContext } from "../context"

// Well-known symbol — matches DRAG_CAPABILITY in @silvery/create internals.
const DRAG_CAPABILITY = Symbol.for("silvery.drag")

/** Minimal interface matching DragFeature's observable contract. */
interface DragObservable {
  readonly state: unknown
  subscribe(listener: () => void): () => void
}

// Stable no-op for when the feature is absent
const noop = () => () => {}

/**
 * Observe the DragFeature's state reactively.
 *
 * Note: DragFeature.state is `DragState | null` — null means no active drag.
 * This hook returns `undefined` when the DragFeature is not installed at all.
 *
 * @returns The current DragState | null, or undefined if the
 *          DragFeature is not installed in the app composition.
 */
export function useDragState() {
  const registry = useContext(CapabilityRegistryContext)
  const feature = registry?.get<DragObservable>(DRAG_CAPABILITY)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!feature) return noop()
      return feature.subscribe(onStoreChange)
    },
    [feature],
  )

  const getSnapshot = useCallback(() => {
    if (!feature) return undefined
    return feature.state
  }, [feature])

  return useSyncExternalStore(subscribe, getSnapshot) as
    | import("@silvery/ag-term/drag-events").DragState
    | null
    | undefined
}
