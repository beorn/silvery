/**
 * useInterval - Run a callback on a fixed interval.
 *
 * Uses Dan Abramov's ref pattern to avoid stale closures.
 * The callback is NOT called on mount — only on subsequent ticks.
 */

import { useEffect, useRef } from "react"

// ============================================================================
// Hook
// ============================================================================

/**
 * Run a callback on a fixed interval.
 *
 * The callback is NOT called on mount — only on ticks after the interval
 * elapses. Uses a ref for the callback to avoid stale closures.
 *
 * @param callback - Function to call on each tick
 * @param ms - Interval in milliseconds
 * @param enabled - Whether the interval is active (default: true)
 */
export function useInterval(callback: () => void, ms: number, enabled = true): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const id = setInterval(() => {
      callbackRef.current()
    }, ms)

    return () => {
      clearInterval(id)
    }
  }, [ms, enabled])
}
