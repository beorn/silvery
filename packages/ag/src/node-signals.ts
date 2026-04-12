/**
 * Node Signals — reactive signals for per-node state tracking.
 *
 * G8 of the reactive-pipeline refactoring. Provides pull-based
 * reactive access to textContent and focused state via signals.
 *
 * Pattern follows rect-signals.ts:
 *   - WeakMap-backed per-node state (no AgNode type changes)
 *   - Writable signals synced from mutations in reconciler/focus-manager
 *   - Lazy creation on first access, automatic GC when node is collected
 *
 * The reconciler writes node.textContent in commitTextUpdate, then
 * `syncTextContentSignal()` propagates into the signal. FocusManager
 * calls `syncFocusedSignal()` when focus changes.
 *
 * @packageDocumentation
 */

import { signal } from "@silvery/signals"
import type { AgNode } from "./types"

// ============================================================================
// Types
// ============================================================================

/**
 * Writable signal — call with no args to read, call with value to write.
 * Same shape as alien-signals `signal()` return type.
 */
type WritableSignal<T> = {
  (): T
  (value: T): void
}

/**
 * Per-node reactive state signals.
 *
 * Writable signals are synced from node mutations.
 * React hooks or effects subscribe to these for pull-based reactive updates.
 */
export interface NodeSignals {
  readonly textContent: WritableSignal<string | undefined>
  readonly focused: WritableSignal<boolean>
}

// ============================================================================
// Node State Cache
// ============================================================================

/**
 * WeakMap from AgNode to its node signals.
 *
 * Lazily created on first access. Automatically garbage-collected when the
 * node is removed from the tree (WeakMap semantics).
 */
const nodeSignalMap = new WeakMap<AgNode, NodeSignals>()

/**
 * Get or create the node signals for a node.
 *
 * Initializes signals with the node's current values so the first
 * read returns the correct state even before sync runs.
 */
export function getNodeSignals(node: AgNode): NodeSignals {
  let s = nodeSignalMap.get(node)
  if (!s) {
    s = {
      textContent: signal<string | undefined>(node.textContent),
      focused: signal<boolean>(node.interactiveState?.focused ?? false),
    }
    nodeSignalMap.set(node, s)
  }
  return s
}

/**
 * Check whether a node has node signals allocated.
 *
 * Used by tests to verify lazy allocation — signals are only created when
 * a consumer first accesses them via getNodeSignals().
 */
export function hasNodeSignals(node: AgNode): boolean {
  return nodeSignalMap.has(node)
}

// ============================================================================
// Sync: Node state -> Signals
// ============================================================================

/**
 * Sync a node's textContent value into its signal (if signals exist).
 *
 * Called from commitTextUpdate in the reconciler after text content changes.
 * Only writes when the value actually changed — alien-signals equality check
 * prevents unnecessary downstream recomputation.
 *
 * Only syncs nodes that have signals allocated (i.e., nodes where a consumer
 * called getNodeSignals). Nodes without consumers skip the WeakMap lookup.
 */
export function syncTextContentSignal(node: AgNode): void {
  const s = nodeSignalMap.get(node)
  if (!s) return

  const current = s.textContent()
  if (node.textContent !== current) s.textContent(node.textContent)
}

/**
 * Sync a node's focused state into its signal (if signals exist).
 *
 * Called from FocusManager when focus changes (on both the old and new nodes).
 * Only writes when the value actually changed.
 */
export function syncFocusedSignal(node: AgNode, focused: boolean): void {
  const s = nodeSignalMap.get(node)
  if (!s) return

  const current = s.focused()
  if (focused !== current) s.focused(focused)
}
