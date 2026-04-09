/**
 * useAnimation — Ink-compatible animation frame counter (Phase 1).
 *
 * Shared-scheduler architecture: all components using useAnimation at the same
 * interval share ONE setInterval timer. Callbacks are registered on mount and
 * unregistered on unmount. When the last callback for an interval is removed,
 * the timer is cleared.
 *
 * Matches Ink 7.0's `useAnimation(options?)` API with silvery extensions
 * (pause/resume).
 *
 * @example Spinner
 * ```tsx
 * function Spinner() {
 *   const { frame } = useAnimation({ interval: 80 })
 *   const chars = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f']
 *   return <Text>{chars[frame % chars.length]}</Text>
 * }
 * ```
 *
 * @example Conditional animation
 * ```tsx
 * function Progress({ active }: { active: boolean }) {
 *   const { frame, time } = useAnimation({ interval: 100, isActive: active })
 *   return <Text>Frame {frame}, elapsed {time}ms</Text>
 * }
 * ```
 *
 * Bead: km-silvery.animation
 */

import { useEffect, useReducer, useRef } from "react"

// ============================================================================
// Types
// ============================================================================

export interface UseAnimationOptions {
  /** Tick interval in milliseconds. Default: 100. */
  interval?: number
  /** Whether the animation is active. Default: true. */
  isActive?: boolean
}

export interface UseAnimationResult {
  /** Number of ticks since start (or last reset). */
  frame: number
  /** Milliseconds elapsed since start (or last reset). */
  time: number
  /** Milliseconds since the previous tick. */
  delta: number
  /** Reset frame counter and time to zero. */
  reset: () => void
  /** Pause the animation (component stays registered but stops receiving ticks). */
  pause: () => void
  /** Resume a paused animation. */
  resume: () => void
}

// ============================================================================
// Shared Scheduler (module-level singleton)
// ============================================================================

interface TimerEntry {
  /** The setInterval handle. */
  handle: ReturnType<typeof setInterval>
  /** All registered callbacks for this interval. */
  callbacks: Set<() => void>
}

/**
 * Module-level shared scheduler. Groups callbacks by interval so that
 * multiple components using the same interval share ONE timer.
 *
 * The `_scheduler` export is for test introspection only.
 */
function createScheduler() {
  const timers = new Map<number, TimerEntry>()

  function register(interval: number, callback: () => void): void {
    let entry = timers.get(interval)
    if (!entry) {
      const handle = setInterval(() => {
        // Snapshot callbacks to avoid mutation during iteration
        const cbs = timers.get(interval)?.callbacks
        if (cbs) {
          for (const cb of cbs) {
            cb()
          }
        }
      }, interval)
      entry = { handle, callbacks: new Set() }
      timers.set(interval, entry)
    }
    entry.callbacks.add(callback)
  }

  function unregister(interval: number, callback: () => void): void {
    const entry = timers.get(interval)
    if (!entry) return
    entry.callbacks.delete(callback)
    if (entry.callbacks.size === 0) {
      clearInterval(entry.handle)
      timers.delete(interval)
    }
  }

  return {
    register,
    unregister,
    /** Number of active setInterval timers (test introspection). */
    get activeTimerCount() {
      return timers.size
    },
    /** Total registered callbacks across all timers (test introspection). */
    get totalCallbackCount() {
      let count = 0
      for (const entry of timers.values()) {
        count += entry.callbacks.size
      }
      return count
    },
  }
}

/** Shared scheduler singleton — exported for test introspection only. */
export const _scheduler = createScheduler()

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Ink-compatible animation hook. Returns a frame counter that increments
 * at the specified interval, with elapsed time tracking.
 *
 * All components using the same interval share a single setInterval timer.
 * When the last component unmounts, the timer is cleared.
 *
 * @param options - Animation options (all optional).
 */
export function useAnimation(options: UseAnimationOptions = {}): UseAnimationResult {
  const { interval = 100, isActive = true } = options

  // Use a reducer to force re-renders on tick
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // Mutable state stored in refs to avoid stale closure issues
  const stateRef = useRef({
    frame: 0,
    time: 0,
    delta: 0,
    startTime: 0,
    lastTickTime: 0,
    paused: false,
  })

  // Initialize start time on first render
  if (stateRef.current.startTime === 0) {
    stateRef.current.startTime = Date.now()
    stateRef.current.lastTickTime = stateRef.current.startTime
  }

  // Register/unregister with shared scheduler
  useEffect(() => {
    if (!isActive) return

    const state = stateRef.current

    const tick = () => {
      if (state.paused) return
      const now = Date.now()
      state.frame++
      state.delta = now - state.lastTickTime
      state.time = now - state.startTime
      state.lastTickTime = now
      forceUpdate()
    }

    _scheduler.register(interval, tick)
    return () => {
      _scheduler.unregister(interval, tick)
    }
  }, [interval, isActive])

  const reset = () => {
    const now = Date.now()
    stateRef.current.frame = 0
    stateRef.current.time = 0
    stateRef.current.delta = 0
    stateRef.current.startTime = now
    stateRef.current.lastTickTime = now
    forceUpdate()
  }

  const pause = () => {
    stateRef.current.paused = true
  }

  const resume = () => {
    stateRef.current.paused = false
    stateRef.current.lastTickTime = Date.now()
  }

  return {
    frame: stateRef.current.frame,
    time: stateRef.current.time,
    delta: stateRef.current.delta,
    reset,
    pause,
    resume,
  }
}
