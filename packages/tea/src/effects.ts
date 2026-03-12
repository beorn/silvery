/**
 * Built-in TEA effects for timers and dispatch.
 *
 * Effect constructors create plain data objects. Effect runners execute them.
 * The update function returns effects as data — the runtime executes them.
 *
 * @example
 * ```ts
 * function update(state, msg) {
 *   switch (msg.type) {
 *     case "start":
 *       return [{ ...state, phase: "thinking" }, [fx.delay(1200, { type: "done" })]]
 *     case "tick":
 *       return { ...state, count: state.count + 1 }  // no effects
 *     case "done":
 *       return [{ ...state, phase: "idle" }, [fx.cancel("ticker")]]
 *   }
 * }
 * ```
 */

import type { EffectLike, EffectRunners } from "./tea"

// =============================================================================
// Effect Types
// =============================================================================

/** Fire a message after a delay. */
export interface DelayEffect<Msg = unknown> extends EffectLike {
  type: "delay"
  ms: number
  msg: Msg
  id?: string
}

/** Fire a message repeatedly on an interval. */
export interface IntervalEffect<Msg = unknown> extends EffectLike {
  type: "interval"
  ms: number
  msg: Msg
  id: string
}

/** Cancel a named timer (delay or interval). */
export interface CancelEffect extends EffectLike {
  type: "cancel"
  id: string
}

/** All built-in effect types. */
export type TimerEffect<Msg = unknown> = DelayEffect<Msg> | IntervalEffect<Msg> | CancelEffect

// =============================================================================
// Effect Constructors (the fx namespace)
// =============================================================================

/** Fire `msg` after `ms` milliseconds. Optionally named for cancellation. */
function delay<Msg>(ms: number, msg: Msg, id?: string): DelayEffect<Msg> {
  return { type: "delay", ms, msg, id }
}

/** Fire `msg` every `ms` milliseconds. Must be named (for cancellation). */
function interval<Msg>(ms: number, msg: Msg, id: string): IntervalEffect<Msg> {
  return { type: "interval", ms, msg, id }
}

/** Cancel a named delay or interval. */
function cancel(id: string): CancelEffect {
  return { type: "cancel", id }
}

/**
 * Built-in effect constructors.
 *
 * ```ts
 * return [newState, [fx.delay(1000, { type: "tick" }), fx.cancel("old")]]
 * ```
 */
export const fx = { delay, interval, cancel } as const

// =============================================================================
// Effect Runners
// =============================================================================

/**
 * Create timer effect runners that manage named timers.
 *
 * Returns runners + a cleanup function. Call cleanup on unmount to
 * cancel all active timers.
 *
 * @example
 * ```ts
 * const { runners, cleanup } = createTimerRunners<MyMsg>()
 * const [state, send] = useTea(init, update, runners)
 * useEffect(() => cleanup, [])
 * ```
 */
export function createTimerRunners<Msg>(): {
  runners: EffectRunners<TimerEffect<Msg>, Msg>
  cleanup: () => void
} {
  const timers = new Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>()
  let nextAnon = 0

  function clearTimer(id: string): void {
    const existing = timers.get(id)
    if (existing !== undefined) {
      clearTimeout(existing as ReturnType<typeof setTimeout>)
      clearInterval(existing as ReturnType<typeof setInterval>)
      timers.delete(id)
    }
  }

  const runners: EffectRunners<TimerEffect<Msg>, Msg> = {
    delay(effect, dispatch) {
      const id = effect.id ?? `__anon_${nextAnon++}`
      clearTimer(id)
      const timer = setTimeout(() => {
        timers.delete(id)
        dispatch(effect.msg as Msg)
      }, effect.ms)
      timers.set(id, timer)
    },

    interval(effect, dispatch) {
      clearTimer(effect.id)
      const timer = setInterval(() => {
        dispatch(effect.msg as Msg)
      }, effect.ms)
      timers.set(effect.id, timer)
    },

    cancel(effect) {
      clearTimer(effect.id)
    },
  }

  function cleanup(): void {
    for (const [id] of timers) {
      clearTimer(id)
    }
  }

  return { runners, cleanup }
}
