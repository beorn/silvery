/**
 * useCopyModeState — observe the CopyModeFeature via CapabilityRegistry.
 *
 * Reads COPY_MODE_CAPABILITY from CapabilityRegistryContext and subscribes
 * to state changes via useSyncExternalStore. Returns the current
 * CopyModeState, or undefined when the feature is not installed.
 *
 * @example
 * ```tsx
 * function CopyModeIndicator() {
 *   const copyMode = useCopyModeState()
 *   if (!copyMode?.active) return null
 *   return <Text>COPY {copyMode.visual ? "VISUAL" : ""}</Text>
 * }
 * ```
 */

import { useContext, useSyncExternalStore, useCallback } from "react"
import { CapabilityRegistryContext } from "../context"

// Well-known symbol — matches COPY_MODE_CAPABILITY in @silvery/create internals.
const COPY_MODE_CAPABILITY = Symbol.for("silvery.copy-mode")

/** Minimal interface matching CopyModeFeature's observable contract. */
interface CopyModeObservable {
  readonly state: unknown
  subscribe(listener: () => void): () => void
}

// Stable no-op for when the feature is absent
const noop = () => () => {}

/**
 * Observe the CopyModeFeature's state reactively.
 *
 * @returns The current CopyModeState, or undefined if the
 *          CopyModeFeature is not installed in the app composition.
 */
export function useCopyModeState() {
  const registry = useContext(CapabilityRegistryContext)
  const feature = registry?.get<CopyModeObservable>(COPY_MODE_CAPABILITY)

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

  return useSyncExternalStore(subscribe, getSnapshot) as import("@silvery/headless/copy-mode").CopyModeState | undefined
}
