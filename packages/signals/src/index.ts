/**
 * @silvery/signals — Reactive signals for silvery.
 *
 * Thin wrapper around alien-signals providing:
 * - signal(value) — create a reactive value (call to read, call with arg to write)
 * - computed(fn) — derived reactive value that recomputes on dependency changes
 * - effect(fn) — side effect that re-runs when dependencies change
 * - effectScope(fn) — group effects for collective disposal
 * - batch(fn) — batch multiple signal updates into one notification
 *
 * @packageDocumentation
 */

export {
  signal,
  computed,
  effect,
  effectScope,
  startBatch,
  endBatch,
  trigger,
  isSignal,
  isComputed,
  isEffect,
  isEffectScope,
  getActiveSub,
  setActiveSub,
  getBatchDepth,
} from "alien-signals"

import { startBatch, endBatch } from "alien-signals"

/** Batch multiple signal updates, notifying subscribers once at the end. */
export function batch(fn: () => void): void {
  startBatch()
  try {
    fn()
  } finally {
    endBatch()
  }
}
