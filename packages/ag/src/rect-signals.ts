/**
 * Rect Signals — alien-signals wrappers for layout rect tracking.
 *
 * Phase 4 of the reactive-pipeline refactoring. Provides pull-based
 * reactive access to boxRect, scrollRect, and screenRect via signals.
 *
 * Pattern follows reactive-node.ts:
 *   - WeakMap-backed per-node state (no AgNode type changes)
 *   - Writable signals synced from node rects after layout completes
 *   - Lazy creation on first access, automatic GC when node is collected
 *
 * The pipeline writes node.boxRect/scrollRect/screenRect during layout,
 * then `syncRectSignals()` propagates those values into signals.
 * React hooks (useBoxRect, useScrollRect, useScreenRect) subscribe to
 * signals via `effect()` for zero-polling reactive updates.
 */

import { signal } from "@silvery/signals"
import type { AgNode, Rect } from "@silvery/ag/types"

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
 * Per-node reactive rect state.
 *
 * Writable signals are synced from node rects after layout phases complete.
 * React hooks subscribe to these for pull-based reactive layout reads.
 */
export interface RectSignals {
  readonly boxRect: WritableSignal<Rect | null>
  readonly scrollRect: WritableSignal<Rect | null>
  readonly screenRect: WritableSignal<Rect | null>
}

// ============================================================================
// Node State Cache
// ============================================================================

/**
 * WeakMap from AgNode to its rect signals.
 *
 * Lazily created on first access. Automatically garbage-collected when the
 * node is removed from the tree (WeakMap semantics).
 */
const rectSignalMap = new WeakMap<AgNode, RectSignals>()

/**
 * Check whether a node has rect signals allocated (without creating them).
 *
 * Used by tests to verify lazy allocation — signals are only created when
 * a hook (useAgNode, useBoxRect, etc.) first accesses them.
 */
export function hasRectSignals(node: AgNode): boolean {
  return rectSignalMap.has(node)
}

/**
 * Get or create the rect signals for a node.
 *
 * Initializes signals with the node's current rect values so the first
 * read returns the correct layout even before syncRectSignals runs.
 */
export function getRectSignals(node: AgNode): RectSignals {
  let s = rectSignalMap.get(node)
  if (!s) {
    s = {
      boxRect: signal<Rect | null>(node.boxRect),
      scrollRect: signal<Rect | null>(node.scrollRect),
      screenRect: signal<Rect | null>(node.screenRect),
    }
    rectSignalMap.set(node, s)
  }
  return s
}

// ============================================================================
// Sync: Node rects → Signals
// ============================================================================

/**
 * Sync a node's rect values into its signals (if signals exist).
 *
 * Called from notifyLayoutSubscribers after layout completes. Only writes
 * when the rect reference changed — alien-signals equality check prevents
 * unnecessary downstream recomputation when the value is identical.
 *
 * Only syncs nodes that have signals allocated (i.e., nodes where a React
 * hook called getRectSignals). Nodes without hooks skip the WeakMap lookup.
 */
export function syncRectSignals(node: AgNode): void {
  const s = rectSignalMap.get(node)
  if (!s) return

  // Write new values — alien-signals will skip downstream notifications
  // if the value is reference-equal to the current one.
  const currentBox = s.boxRect()
  if (node.boxRect !== currentBox) s.boxRect(node.boxRect)

  const currentScroll = s.scrollRect()
  if (node.scrollRect !== currentScroll) s.scrollRect(node.scrollRect)

  const currentScreen = s.screenRect()
  if (node.screenRect !== currentScreen) s.screenRect(node.screenRect)
}
