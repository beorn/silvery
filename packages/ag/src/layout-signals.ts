/**
 * withLayoutSignals — reactive signal layer for AgNode layout outputs.
 *
 * Composable plugin that wraps an AgNode with reactive signals for layout
 * rects, text content, and focus state. Engine-agnostic — works with
 * Flexily, Yoga, or any future layout engine.
 *
 * Signals are WeakMap-backed and lazily created. Nodes without subscribers
 * pay zero cost. After layout completes, the pipeline calls `syncSignals()`
 * to propagate imperative state into signals.
 *
 * ## Usage
 *
 * ```ts
 * import { getLayoutSignals, syncSignals } from "@silvery/ag/layout-signals"
 *
 * // Get (or create) signals for a node
 * const signals = getLayoutSignals(node)
 * signals.boxRect()       // read current rect
 * signals.textContent()   // read current text
 *
 * // After layout/reconciler mutations, sync imperative → reactive
 * syncSignals(node)
 * ```
 *
 * ## Three-layer stack
 *
 * Layer 0: alien-signals (signal, computed, effect)
 * Layer 1: getLayoutSignals() — this module (@silvery/ag, framework-agnostic)
 * Layer 2: useSignal(signal) — @silvery/ag-react (React bridge)
 * Layer 3: useBoxRect(), useAgNode() — semantic convenience hooks
 */

import { signal } from "@silvery/signals"
import type { AgNode, Rect } from "./types"

// ============================================================================
// Types
// ============================================================================

/**
 * Writable signal — call with no args to read, call with value to write.
 */
type WritableSignal<T> = {
  (): T
  (value: T): void
}

/**
 * All reactive signals for an AgNode.
 *
 * Combined rect signals (layout outputs) + node signals (content/state).
 * One interface, one WeakMap, one sync function.
 */
export interface LayoutSignals {
  // Layout rects (synced after layout + scroll + sticky phases)
  readonly boxRect: WritableSignal<Rect | null>
  readonly scrollRect: WritableSignal<Rect | null>
  readonly screenRect: WritableSignal<Rect | null>

  // Node state (synced from reconciler + focus manager)
  readonly textContent: WritableSignal<string | undefined>
  readonly focused: WritableSignal<boolean>
}

// ============================================================================
// Cache
// ============================================================================

const signalMap = new WeakMap<AgNode, LayoutSignals>()

/**
 * Get or create layout signals for a node.
 *
 * Lazily created on first access. Automatically garbage-collected
 * when the node is removed from the tree (WeakMap semantics).
 */
export function getLayoutSignals(node: AgNode): LayoutSignals {
  let s = signalMap.get(node)
  if (!s) {
    s = {
      boxRect: signal<Rect | null>(node.boxRect),
      scrollRect: signal<Rect | null>(node.scrollRect),
      screenRect: signal<Rect | null>(node.screenRect),
      textContent: signal<string | undefined>(node.textContent),
      focused: signal<boolean>(node.interactiveState?.focused ?? false),
    }
    signalMap.set(node, s)
  }
  return s
}

/** Check whether a node has signals allocated (for testing). */
export function hasLayoutSignals(node: AgNode): boolean {
  return signalMap.has(node)
}

// ============================================================================
// Sync: imperative state → signals
// ============================================================================

/**
 * Sync all rect signals from the node's current values.
 *
 * Called from notifyLayoutSubscribers after layout + scroll + sticky
 * phases complete. Only syncs nodes that have signals allocated.
 * Reference-equality check prevents unnecessary downstream updates.
 */
export function syncRectSignals(node: AgNode): void {
  const s = signalMap.get(node)
  if (!s) return

  if (node.boxRect !== s.boxRect()) s.boxRect(node.boxRect)
  if (node.scrollRect !== s.scrollRect()) s.scrollRect(node.scrollRect)
  if (node.screenRect !== s.screenRect()) s.screenRect(node.screenRect)
}

/**
 * Sync textContent signal from the node's current value.
 *
 * Called from commitTextUpdate in the reconciler.
 */
export function syncTextContentSignal(node: AgNode): void {
  const s = signalMap.get(node)
  if (!s) return

  if (node.textContent !== s.textContent()) s.textContent(node.textContent)
}

/**
 * Sync focused signal for a node.
 *
 * Called from FocusManager when focus changes.
 */
export function syncFocusedSignal(node: AgNode, focused: boolean): void {
  const s = signalMap.get(node)
  if (!s) return

  if (focused !== s.focused()) s.focused(focused)
}
