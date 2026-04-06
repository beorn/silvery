/**
 * useFindState — observe the FindFeature via CapabilityRegistry.
 *
 * Reads FIND_CAPABILITY from CapabilityRegistryContext and subscribes
 * to state changes via useSyncExternalStore. Returns the current
 * FindState, or undefined when the feature is not installed.
 *
 * @example
 * ```tsx
 * function FindIndicator() {
 *   const find = useFindState()
 *   if (!find?.active) return null
 *   return <Text>Match {find.currentIndex + 1}/{find.matches.length}</Text>
 * }
 * ```
 */

import { useContext, useSyncExternalStore, useCallback } from "react"
import { CapabilityRegistryContext } from "../context"

// Well-known symbol — matches FIND_CAPABILITY in @silvery/create internals.
const FIND_CAPABILITY = Symbol.for("silvery.find")

/** Minimal interface matching FindFeature's observable contract. */
interface FindObservable {
  readonly state: unknown
  subscribe(listener: () => void): () => void
}

// Stable no-op for when the feature is absent
const noop = () => () => {}

/**
 * Observe the FindFeature's state reactively.
 *
 * @returns The current FindState, or undefined if the
 *          FindFeature is not installed in the app composition.
 */
export function useFindState() {
  const registry = useContext(CapabilityRegistryContext)
  const feature = registry?.get<FindObservable>(FIND_CAPABILITY)

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

  return useSyncExternalStore(subscribe, getSnapshot) as import("@silvery/headless/find").FindState | undefined
}
