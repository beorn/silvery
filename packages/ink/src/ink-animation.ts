/**
 * Ink-compatible animation scheduler.
 *
 * Uses a single shared setTimeout chain (like Ink 7.0) so multiple
 * useAnimation hooks consolidate into one timer. This is observable:
 * Ink's tests assert exactly 1 setInterval/setTimeout is active.
 *
 * Architecture:
 * - InkAnimationContext provides `subscribe(callback, interval)` and
 *   `renderThrottleMs` to useAnimation hooks.
 * - InkAnimationProvider wraps the Ink render tree and manages the
 *   shared timer via refs (survives across renders without re-starting).
 *
 * @internal
 */

import React, { createContext, useCallback, useMemo, useRef } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subscriber entry in the shared timer pool. */
interface AnimationSubscriber {
  callback: (currentTime: number) => void
  interval: number
  startTime: number
  nextDueTime: number
}

/** Value provided by InkAnimationContext. */
export interface AnimationContextValue {
  renderThrottleMs: number
  subscribe: (
    callback: (currentTime: number) => void,
    interval: number,
  ) => { startTime: number; unsubscribe: () => void }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const InkAnimationContext = createContext<AnimationContextValue>({
  renderThrottleMs: 0,
  subscribe() {
    return { startTime: 0, unsubscribe() {} }
  },
})
InkAnimationContext.displayName = "InkAnimationContext"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL = 100
const MAXIMUM_TIMER_INTERVAL = 2_147_483_647

/**
 * Normalize an interval value: NaN/Infinity fall back to default,
 * negative/zero are clamped to 1, large values are clamped to the
 * maximum setTimeout/setInterval delay.
 */
export function normalizeAnimationInterval(interval: number): number {
  if (!Number.isFinite(interval)) return DEFAULT_INTERVAL
  return Math.min(MAXIMUM_TIMER_INTERVAL, Math.max(1, interval))
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Provides the shared animation timer to useAnimation hooks.
 * Manages a single setTimeout chain that wakes at the earliest subscriber
 * deadline. Slower animations skip ticks they haven't reached yet.
 */
export function InkAnimationProvider({
  renderThrottleMs = 0,
  children,
}: {
  renderThrottleMs?: number
  children?: React.ReactNode
}) {
  const subscribersRef = useRef<Map<(t: number) => void, AnimationSubscriber>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  const scheduleTick = useCallback(() => {
    clearTimer()
    if (subscribersRef.current.size === 0) return

    let nextDueTime = Number.POSITIVE_INFINITY
    for (const sub of subscribersRef.current.values()) {
      nextDueTime = Math.min(nextDueTime, sub.nextDueTime)
    }

    const delay = Math.max(0, nextDueTime - performance.now())
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined
      const currentTime = performance.now()
      for (const sub of subscribersRef.current.values()) {
        if (currentTime < sub.nextDueTime) continue
        sub.callback(currentTime)
        const elapsed = currentTime - sub.startTime
        const elapsedFrames = Math.floor(elapsed / sub.interval) + 1
        sub.nextDueTime = sub.startTime + elapsedFrames * sub.interval
      }
      scheduleTick()
    }, delay)
  }, [clearTimer])

  const subscribe = useCallback(
    (callback: (currentTime: number) => void, interval: number) => {
      const startTime = performance.now()
      subscribersRef.current.set(callback, {
        callback,
        interval,
        startTime,
        nextDueTime: startTime + interval,
      })
      scheduleTick()
      return {
        startTime,
        unsubscribe() {
          subscribersRef.current.delete(callback)
          if (subscribersRef.current.size === 0) {
            clearTimer()
          } else {
            scheduleTick()
          }
        },
      }
    },
    [scheduleTick, clearTimer],
  )

  const value = useMemo(() => ({ renderThrottleMs, subscribe }), [renderThrottleMs, subscribe])

  return React.createElement(InkAnimationContext.Provider, { value }, children)
}
