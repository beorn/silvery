/**
 * useAnimation — Ink-compatible frame counter hook.
 *
 * Phase 1 of the animation system: matches Ink 7.0's shared-scheduler
 * `useAnimation` API. All components using useAnimation share ONE timer
 * (module-level scheduler), preventing multiple setIntervals from fighting
 * over tick intervals.
 *
 * Additions over Ink: `pause()`, `resume()`, `reset()`.
 *
 * Phases 2-5 (springs, timing, presence, imperative) are deferred.
 *
 * @example Spinner
 * ```tsx
 * import { Text, useAnimation } from "silvery"
 *
 * const chars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
 *
 * function Spinner() {
 *   const { frame } = useAnimation({ interval: 80 })
 *   return <Text>{chars[frame % chars.length]}</Text>
 * }
 * ```
 *
 * @example Elapsed time display
 * ```tsx
 * function Timer() {
 *   const { time, pause, resume, reset } = useAnimation({ interval: 1000 })
 *   return <Text>{Math.floor(time / 1000)}s elapsed</Text>
 * }
 * ```
 */

import { useCallback, useEffect, useReducer, useRef } from "react"

// ============================================================================
// Types
// ============================================================================

/**
 * Options for useAnimation. Matches Ink 7.0's signature.
 */
export interface UseAnimationOptions {
  /** Tick interval in milliseconds. Default: 100. */
  interval?: number
  /** Whether the animation is active. Default: true. */
  isActive?: boolean
}

/**
 * Return type for useAnimation. Extends Ink 7.0's shape with pause/resume.
 */
export interface UseAnimationResult {
  /** Tick counter (increments by 1 each interval). */
  frame: number
  /** Milliseconds since the animation started. */
  time: number
  /** Milliseconds since the last tick. */
  delta: number
  /** Reset frame counter and time to zero. */
  reset: () => void
  /** Pause the animation (stops incrementing). */
  pause: () => void
  /** Resume the animation after pause. */
  resume: () => void
}

// ============================================================================
// Shared Scheduler
// ============================================================================

type SchedulerCallback = () => void

/**
 * Module-level shared scheduler. All useAnimation instances register their
 * tick callbacks here. When the first component mounts, the timer starts.
 * When the last unmounts, the timer stops. Only ONE setInterval runs at
 * any time, regardless of how many components use useAnimation.
 */
const scheduler = {
  /** Registered callbacks, keyed by interval (ms). */
  buckets: new Map<number, Set<SchedulerCallback>>(),
  /** Active timers, keyed by interval. */
  timers: new Map<number, ReturnType<typeof setInterval>>(),

  register(interval: number, callback: SchedulerCallback): void {
    let bucket = this.buckets.get(interval)
    if (!bucket) {
      bucket = new Set()
      this.buckets.set(interval, bucket)
    }
    bucket.add(callback)

    // Start timer for this interval if not already running
    if (!this.timers.has(interval)) {
      const timer = setInterval(() => {
        const callbacks = this.buckets.get(interval)
        if (callbacks) {
          for (const cb of callbacks) {
            cb()
          }
        }
      }, interval)
      this.timers.set(interval, timer)
    }
  },

  unregister(interval: number, callback: SchedulerCallback): void {
    const bucket = this.buckets.get(interval)
    if (!bucket) return
    bucket.delete(callback)

    // Clean up timer when no more callbacks at this interval
    if (bucket.size === 0) {
      this.buckets.delete(interval)
      const timer = this.timers.get(interval)
      if (timer) {
        clearInterval(timer)
        this.timers.delete(interval)
      }
    }
  },

  /** Number of active timers (for testing). */
  get activeTimerCount(): number {
    return this.timers.size
  },

  /** Total registered callbacks across all intervals (for testing). */
  get totalCallbackCount(): number {
    let count = 0
    for (const bucket of this.buckets.values()) {
      count += bucket.size
    }
    return count
  },
}

// Export for testing
export { scheduler as _scheduler }

// ============================================================================
// Hook
// ============================================================================

interface AnimationState {
  frame: number
  time: number
  delta: number
  startTime: number
  lastTickTime: number
  paused: boolean
}

const INITIAL_STATE: AnimationState = {
  frame: 0,
  time: 0,
  delta: 0,
  startTime: 0,
  lastTickTime: 0,
  paused: false,
}

type AnimationAction =
  | { type: "tick"; now: number }
  | { type: "reset"; now: number }
  | { type: "pause" }
  | { type: "resume"; now: number }

function animationReducer(state: AnimationState, action: AnimationAction): AnimationState {
  switch (action.type) {
    case "tick": {
      if (state.paused) return state
      const time = action.now - state.startTime
      const delta = state.lastTickTime > 0 ? action.now - state.lastTickTime : 0
      return {
        ...state,
        frame: state.frame + 1,
        time,
        delta,
        lastTickTime: action.now,
      }
    }
    case "reset":
      return {
        ...INITIAL_STATE,
        startTime: action.now,
        lastTickTime: action.now,
      }
    case "pause":
      return { ...state, paused: true }
    case "resume":
      return {
        ...state,
        paused: false,
        // Adjust startTime so elapsed time doesn't include pause duration
        startTime: action.now - state.time,
        lastTickTime: action.now,
      }
  }
}

/**
 * Returns animation frame state that increments at a regular interval.
 *
 * All components sharing the same interval use a single shared timer.
 * The scheduler starts when the first consumer mounts and stops when
 * the last unmounts.
 */
export function useAnimation(options: UseAnimationOptions = {}): UseAnimationResult {
  const { interval = 100, isActive = true } = options

  const [state, dispatch] = useReducer(animationReducer, INITIAL_STATE, (init) => ({
    ...init,
    startTime: Date.now(),
    lastTickTime: Date.now(),
  }))

  // Ref to hold the tick callback (avoids re-registering on every render)
  const tickRef = useRef<SchedulerCallback>(() => {})
  tickRef.current = () => {
    if (isActive && !state.paused) {
      dispatch({ type: "tick", now: Date.now() })
    }
  }

  // Register/unregister with the shared scheduler
  useEffect(() => {
    if (!isActive) return

    const callback: SchedulerCallback = () => tickRef.current()
    scheduler.register(interval, callback)
    return () => scheduler.unregister(interval, callback)
  }, [interval, isActive])

  const reset = useCallback(() => {
    dispatch({ type: "reset", now: Date.now() })
  }, [])

  const pause = useCallback(() => {
    dispatch({ type: "pause" })
  }, [])

  const resume = useCallback(() => {
    dispatch({ type: "resume", now: Date.now() })
  }, [])

  return {
    frame: state.frame,
    time: state.time,
    delta: state.delta,
    reset,
    pause,
    resume,
  }
}
