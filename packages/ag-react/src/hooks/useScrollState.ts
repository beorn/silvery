/**
 * useScrollState — reactive subscription to a scroll container's pixel-space
 * visibility state, as computed by layout-phase's `calculateScrollState`.
 *
 * This is the consumer side of the "layout-phase is the single source of
 * truth" contract (see `ScrollStateSnapshot` in `@silvery/ag/layout-signals`).
 *
 * ## Why this hook exists
 *
 * The `column-top-disappears` bug class had two systems independently
 * answering "what's visible?":
 * - React `useVirtualizer` (count-space, estimated heights)
 * - ag-term `calculateScrollState` (pixel-space, measured heights)
 *
 * Every time their answers diverged — common with variable-height items — a
 * visible blank gap appeared at the viewport edge. Each round of fixes made
 * the two systems agree under one more condition; the next condition always
 * existed.
 *
 * The architectural fix: let layout-phase be the only source of truth, and
 * have virtualization consumers subscribe to its output via this hook. By
 * construction, there's only one place that decides visibility — consumers
 * are one-frame-lagging projections of it.
 *
 * ## Bootstrap semantics
 *
 * Before the first layout pass (or for non-scroll containers), the hook
 * returns `null`. Consumers that need to render something during bootstrap
 * must fall back to estimates — this is the ONLY place estimate-based logic
 * is allowed. Once the first layout pass completes and syncs signals, the
 * hook re-renders with the real values.
 *
 * ## Two call signatures (follows useBoxRect pattern)
 *
 * ```tsx
 * // Reactive — re-render on any scroll-state change
 * const state = useScrollState(node)
 *
 * // Callback — zero re-renders, use for hot paths
 * useScrollState(node, (state) => { ... })
 * ```
 */

import { useLayoutEffect, useReducer, useRef } from "react"
import { effect } from "@silvery/signals"
import { getLayoutSignals, type ScrollStateSnapshot } from "@silvery/ag/layout-signals"
import type { AgNode } from "@silvery/ag/types"

export type { ScrollStateSnapshot } from "@silvery/ag/layout-signals"

type ScrollStateCallback = (state: ScrollStateSnapshot | null) => void

/**
 * Reactive: re-renders the component whenever the scroll container's
 * state changes. Returns `null` before the first layout pass, for non-scroll
 * containers, or when `node` is `null`/`undefined`.
 */
export function useScrollState(node: AgNode | null | undefined): ScrollStateSnapshot | null

/**
 * Callback: invoked after layout syncs signals, never triggers a React
 * re-render. Preferred for hot paths (e.g. `useVirtualizer` uses the
 * reactive form to coordinate window math; components wanting to observe
 * scroll position for side-effects should use callback form).
 */
export function useScrollState(node: AgNode | null | undefined, callback: ScrollStateCallback): void

export function useScrollState(
  node: AgNode | null | undefined,
  callback?: ScrollStateCallback,
): ScrollStateSnapshot | null | void {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevRef = useRef<ScrollStateSnapshot | null>(null)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useLayoutEffect(() => {
    if (!node) return

    const signals = getLayoutSignals(node)

    // effect() subscribes to the signal — re-runs when the signal value
    // changes. Reading `signals.scrollState()` inside the effect creates
    // the reactive dependency. `syncRectSignals` writes per-field snapshots
    // so this fires at most once per layout pass (and only when a field
    // actually changed).
    const dispose = effect(() => {
      const next = signals.scrollState()

      if (callbackRef.current) {
        callbackRef.current(next)
      } else {
        // Snapshot reference changed → re-render. The sync-side per-field
        // equality check in layout-signals.ts ensures refs only change
        // when a value actually changes, so this doesn't fire spuriously.
        if (prevRef.current !== next) {
          prevRef.current = next
          forceUpdate()
        }
      }
    })

    return dispose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  if (callback) return
  if (!node) return null

  // Read the current snapshot synchronously for the first render (before
  // the effect runs). After that, `prevRef` holds the last seen value and
  // React has re-rendered to match — so returning `signals.scrollState()`
  // stays consistent with what the effect would have dispatched.
  const signals = getLayoutSignals(node)
  const current = signals.scrollState()
  prevRef.current = current
  return current
}
