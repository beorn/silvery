/**
 * @silvery/signals — Reactive signals for silvery.
 *
 * Thin wrapper around alien-signals providing:
 * - signal(value) — create a reactive value (call to read, call with arg to write)
 * - computed(fn) — derived reactive value that recomputes on dependency changes
 * - effect(fn) — side effect that re-runs when dependencies change
 * - effectScope(fn) — group effects for collective disposal
 * - batch(fn) — batch multiple signal updates into one notification
 * - watch(read, onChange) — change-only subscription (skips the seed fire)
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

import { effect, startBatch, endBatch } from "alien-signals"

/**
 * A reactive value — callable getter/setter.
 *
 * - `sig()` reads the current value (and subscribes the active effect/computed).
 * - `sig(next)` writes a new value; subscribers re-run only if `next !== current`.
 *
 * Matches the return shape of `signal<T>(initial)` from alien-signals, so any
 * `signal()` result is assignable to `Signal<T>`.
 */
export type Signal<T> = {
  (): T
  (value: T): void
}

/**
 * A read-only reactive value — callable getter that subscribes the active
 * effect/computed but cannot be written to. Matches the return shape of
 * `computed<T>(fn)` from alien-signals.
 */
export type ReadSignal<T> = () => T

/** Batch multiple signal updates, notifying subscribers once at the end. */
export function batch(fn: () => void): void {
  startBatch()
  try {
    fn()
  } finally {
    endBatch()
  }
}

/**
 * Options for {@link watch}.
 */
export interface WatchOptions<T> {
  /** If true, fire `onChange` on the seed read with `(next, next)`. Default false (change-only). */
  immediate?: boolean
  /** Equality predicate — handler fires only when `equals(next, prev)` is false. Default `Object.is`. */
  equals?: (a: T, b: T) => boolean
}

/**
 * Subscribe to signal changes via an imperative callback.
 *
 * alien-signals' `effect()` runs once eagerly to establish dependencies,
 * which means a plain `effect(() => handler(sig()))` fires with the seed
 * value. `watch()` swallows that first fire and only calls `onChange` when
 * the value actually changes — matching the old `.subscribe(handler)`
 * semantic consumers often want.
 *
 * ```ts
 * const stop = watch(
 *   () => size.snapshot(),
 *   (next, prev) => { emit({ cols: next.cols, rows: next.rows }) },
 * )
 * // stop() to unsubscribe
 * ```
 *
 * Returns the effect's stop function.
 */
export function watch<T>(
  read: () => T,
  onChange: (next: T, prev: T) => void,
  opts: WatchOptions<T> = {},
): () => void {
  const equals = opts.equals ?? Object.is
  let seeded = false
  let prev!: T
  return effect(() => {
    const next = read()
    if (!seeded) {
      seeded = true
      prev = next
      if (opts.immediate) onChange(next, next)
      return
    }
    if (equals(next, prev)) return
    const old = prev
    prev = next
    onChange(next, old)
  })
}
