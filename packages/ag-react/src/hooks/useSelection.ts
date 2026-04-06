/**
 * useSelection — React hook for accessing the selection feature from the capability registry.
 *
 * Reads SELECTION_CAPABILITY from the app's CapabilityRegistry via context.
 * Returns `undefined` when the selection feature is not installed (e.g., simple
 * run() apps without pipe() composition, or when withDomEvents is not used).
 *
 * When installed, returns the current TerminalSelectionState and re-renders
 * reactively on selection changes via useSyncExternalStore.
 *
 * This is the recommended hook for reading selection state. It replaces the
 * older useTerminalSelection/TerminalSelectionProvider pattern with a simpler
 * capability-based lookup.
 */

import { useContext, useSyncExternalStore } from "react"
import { CapabilityRegistryContext } from "../context"
import type { TerminalSelectionState } from "@silvery/headless/selection"

// ============================================================================
// Capability symbol — must match the one in @silvery/create/internal/capabilities.
// Duplicated here to avoid a dependency from ag-react → @silvery/create internals.
// ============================================================================

const SELECTION_CAPABILITY = Symbol.for("silvery.selection")

// ============================================================================
// SelectionFeature shape — minimal interface for the hook.
// ============================================================================

interface SelectionFeatureReadonly {
  readonly state: TerminalSelectionState
  subscribe(listener: () => void): () => void
}

// ============================================================================
// Fallbacks for useSyncExternalStore
// ============================================================================

const noopSubscribe = (_listener: () => void) => () => {}
const getUndefined = () => undefined as TerminalSelectionState | undefined

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the current selection state from the capability registry.
 *
 * Returns `undefined` when:
 * - No CapabilityRegistryContext is provided (simple run() apps)
 * - SELECTION_CAPABILITY is not registered (withDomEvents not used or selection disabled)
 *
 * Returns `TerminalSelectionState` when selection is installed:
 * - `state.range` — current SelectionRange or null (idle)
 * - `state.selecting` — true while mouse button is held
 * - `state.source` — "mouse" | "keyboard" | null
 */
export function useSelection(): TerminalSelectionState | undefined {
  const registry = useContext(CapabilityRegistryContext)
  const feature = registry?.get<SelectionFeatureReadonly>(SELECTION_CAPABILITY)

  return useSyncExternalStore(
    feature ? (listener) => feature.subscribe(listener) : noopSubscribe,
    feature ? () => feature.state : getUndefined,
  )
}
