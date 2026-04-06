/**
 * useSelection — observe the SelectionFeature via CapabilityRegistry.
 *
 * Reads SELECTION_CAPABILITY from CapabilityRegistryContext and subscribes
 * to state changes via useSyncExternalStore. Returns the current
 * TerminalSelectionState, or undefined when the feature is not installed.
 *
 * This hook is the canonical way for components to read selection state
 * without coupling to the composition layer (withDomEvents, withTerminal).
 *
 * @example
 * ```tsx
 * function SelectionIndicator() {
 *   const selection = useSelection()
 *   if (!selection?.range) return null
 *   return <Text>Selected: {selection.range.startCol},{selection.range.startRow}</Text>
 * }
 * ```
 */

import { useContext, useSyncExternalStore, useCallback } from "react"
import { CapabilityRegistryContext } from "../context"

// Well-known symbol — matches SELECTION_CAPABILITY in @silvery/create internals.
// Using Symbol.for() so we don't need a cross-package import.
const SELECTION_CAPABILITY = Symbol.for("silvery.selection")

/** Minimal interface matching SelectionFeature's observable contract. */
interface SelectionObservable {
  readonly state: unknown
  subscribe(listener: () => void): () => void
}

// Stable no-op for when the feature is absent
const noop = () => () => {}

/**
 * Observe the SelectionFeature's state reactively.
 *
 * @returns The current TerminalSelectionState, or undefined if the
 *          SelectionFeature is not installed in the app composition.
 */
export function useSelection() {
  const registry = useContext(CapabilityRegistryContext)
  const feature = registry?.get<SelectionObservable>(SELECTION_CAPABILITY)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!feature) return noop()
      return feature.subscribe(onStoreChange)
    },
    [feature],
  )

  const getSnapshot = useCallback(() => {
    return feature?.state
  }, [feature])

  return useSyncExternalStore(subscribe, getSnapshot) as
    | import("@silvery/headless/selection").TerminalSelectionState
    | undefined
}
