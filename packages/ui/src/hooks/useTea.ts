/**
 * useTea — React hook for TEA (The Elm Architecture) state machines.
 *
 * Like useReducer, but the reducer can return [state, effects].
 * Effects are plain data objects executed by runners. Built-in timer
 * runners handle delay/interval/cancel. All timers auto-cleanup on unmount.
 *
 * @example
 * ```tsx
 * import { useTea } from "silvery"
 * import { fx } from "@silvery/tea/effects"
 *
 * type State = { count: number; running: boolean }
 * type Msg = { type: "start" } | { type: "tick" } | { type: "stop" }
 *
 * function update(state: State, msg: Msg) {
 *   switch (msg.type) {
 *     case "start":
 *       return [{ ...state, running: true }, [fx.interval(100, { type: "tick" }, "counter")]]
 *     case "tick":
 *       return { ...state, count: state.count + 1 }
 *     case "stop":
 *       return [{ ...state, running: false }, [fx.cancel("counter")]]
 *   }
 * }
 *
 * function Counter() {
 *   const [state, send] = useTea({ count: 0, running: false }, update)
 *   return <Text>Count: {state.count}</Text>
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useReducer } from "react"
import type { EffectLike, EffectRunners, TeaResult } from "@silvery/tea/tea"
import { collect } from "@silvery/tea/tea"
import { createTimerRunners, type TimerEffect } from "@silvery/tea/effects"

// =============================================================================
// Hook
// =============================================================================

/**
 * TEA state machine hook with automatic timer management.
 *
 * The update function can return plain state (no effects) or `[state, effects]`.
 * Timer effects (delay, interval, cancel) are handled automatically.
 * Additional effect runners can be provided for custom effects.
 *
 * All timers are cleaned up automatically on unmount.
 *
 * @param initialState - Initial state value
 * @param update - Pure update function: `(state, msg) => state | [state, effects]`
 * @param customRunners - Optional additional effect runners for non-timer effects
 * @returns `[state, send]` tuple — send dispatches a message through the update function
 */
export function useTea<S, Msg, E extends EffectLike = TimerEffect<Msg>>(
  initialState: S | (() => S),
  update: (state: S, msg: Msg) => TeaResult<S, E>,
  customRunners?: EffectRunners<E, Msg>,
): [S, (msg: Msg) => void] {
  // Create timer runners once (stable across renders)
  const timerRef = useRef<ReturnType<typeof createTimerRunners<Msg>> | null>(null)
  if (timerRef.current === null) {
    timerRef.current = createTimerRunners<Msg>()
  }
  const { runners: timerRunners, cleanup } = timerRef.current

  // Keep custom runners ref-stable
  const customRunnersRef = useRef(customRunners)
  customRunnersRef.current = customRunners

  // Pending effects queue — effects from the reducer can't be executed
  // during render, so we queue them and execute in a useEffect.
  const pendingEffectsRef = useRef<E[]>([])

  // Use React's useReducer for state — it integrates with React's scheduler
  const [state, reactDispatch] = useReducer(
    (prevState: S, msg: Msg): S => {
      const result = update(prevState, msg)
      const [newState, effects] = collect(result)
      if (effects.length > 0) {
        pendingEffectsRef.current.push(...effects)
      }
      return newState
    },
    undefined,
    () => (typeof initialState === "function" ? (initialState as () => S)() : initialState),
  )

  // Execute effects outside of render (React rules)
  const sendRef = useRef<(msg: Msg) => void>(() => {})

  const executeEffects = useCallback(() => {
    if (pendingEffectsRef.current.length === 0) return
    const effects = pendingEffectsRef.current.splice(0)
    for (const effect of effects) {
      // Try timer runners first
      const timerRunner = timerRunners[effect.type as keyof typeof timerRunners]
      if (timerRunner) {
        ;(timerRunner as (e: any, d: (msg: Msg) => void) => void)(effect, sendRef.current)
        continue
      }
      // Try custom runners
      const customRunner = customRunnersRef.current?.[effect.type as E["type"]]
      if (customRunner) {
        ;(customRunner as (e: any, d: (msg: Msg) => void) => void)(effect, sendRef.current)
      }
    }
  }, [timerRunners])

  // The send function: dispatch to React, then execute effects
  const send = useCallback(
    (msg: Msg) => {
      reactDispatch(msg)
      // Effects are queued by the reducer — execute them after React processes the update.
      // We use queueMicrotask to ensure effects run after the reducer but before the next paint.
      queueMicrotask(executeEffects)
    },
    [reactDispatch, executeEffects],
  )
  sendRef.current = send

  // Execute any effects from the initial render
  useEffect(() => {
    executeEffects()
  }, [executeEffects])

  // Cleanup all timers on unmount
  useEffect(() => cleanup, [cleanup])

  return [state, send]
}
