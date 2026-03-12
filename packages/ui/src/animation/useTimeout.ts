/**
 * useTimeout - Run a callback after a delay.
 *
 * Uses a ref for the callback to avoid stale closures (Dan Abramov pattern).
 * The timer resets when `ms` or `enabled` changes. When `enabled` becomes false,
 * the timer is cleared. Returns a `reset` function to restart the timer.
 *
 * Unlike useInterval, this fires exactly once per enable/reset cycle.
 */

import { useCallback, useEffect, useRef } from "react"

// ============================================================================
// Hook
// ============================================================================

/**
 * Run a callback after a delay.
 *
 * The callback fires once after `ms` milliseconds. The timer resets when
 * `ms` or `enabled` changes. Returns `{ reset, clear }` for manual control.
 *
 * @param callback - Function to call when the timer fires
 * @param ms - Delay in milliseconds
 * @param enabled - Whether the timer is active (default: true)
 */
export function useTimeout(callback: () => void, ms: number, enabled = true): { reset: () => void; clear: () => void } {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    clear()
    if (enabled) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        callbackRef.current()
      }, ms)
    }
  }, [ms, enabled, clear])

  useEffect(() => {
    if (!enabled) {
      clear()
      return
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      callbackRef.current()
    }, ms)

    return clear
  }, [ms, enabled, clear])

  return { reset, clear }
}
