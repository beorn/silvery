/**
 * hightea/tea — Zustand middleware for TEA (The Elm Architecture) effects.
 *
 * A ~30-line middleware that extends Zustand reducers to optionally return
 * [state, effects]. Gradual adoption: return plain state (Level 3) or
 * [state, effects] (Level 4) on a per-case basis.
 *
 * @example
 * ```ts
 * import { createStore } from "zustand"
 * import { tea, collect } from "@hightea/term/tea"
 *
 * // Define effects as plain data
 * const log = (msg: string) => ({ type: "log" as const, msg })
 * const httpPost = (url: string, body: unknown) => ({ type: "http" as const, url, body })
 *
 * type MyEffect = ReturnType<typeof log> | ReturnType<typeof httpPost>
 *
 * interface State {
 *   count: number
 * }
 *
 * type Op = { type: "increment" } | { type: "save" }
 *
 * // Reducer: return state (no effects) or [state, effects]
 * function reducer(state: State, op: Op): TeaResult<State, MyEffect> {
 *   switch (op.type) {
 *     case "increment":
 *       return { ...state, count: state.count + 1 }              // Level 3: plain state
 *     case "save":
 *       return [{ ...state }, [httpPost("/api", state), log("saved")]]  // Level 4: [state, effects]
 *   }
 * }
 *
 * // Effect runners (swappable: production, test, replay)
 * const runners: EffectRunners<MyEffect, Op> = {
 *   log: (e) => console.log(e.msg),
 *   http: async (e, dispatch) => {
 *     const res = await fetch(e.url, { method: "POST", body: JSON.stringify(e.body) })
 *     dispatch({ type: "loaded", data: await res.json() })
 *   },
 * }
 *
 * // Wire up
 * const store = createStore(tea({ count: 0 }, reducer, { runners }))
 * store.getState().dispatch({ type: "increment" })
 *
 * // Test: collect() normalizes output for assertions
 * const [state, effects] = collect(reducer(initial, { type: "save" }))
 * expect(effects).toContainEqual(httpPost("/api", initial))
 * ```
 *
 * @packageDocumentation
 */

import type { StateCreator } from "zustand"

// =============================================================================
// Types
// =============================================================================

/** An effect is a plain object with a `type` discriminant. */
export type EffectLike = { type: string }

/** Reducer result: plain state (no effects) or [state, effects]. */
export type TeaResult<S, E extends EffectLike = EffectLike> = S | readonly [S, E[]]

/** A reducer that takes state + operation and returns TeaResult. */
export type TeaReducer<S, Op, E extends EffectLike = EffectLike> = (state: S, op: Op) => TeaResult<S, E>

/**
 * Effect runners keyed by effect `type`.
 *
 * Each runner receives the effect and a dispatch function for round-trip
 * communication (Elm's Cmd Msg pattern).
 */
export type EffectRunners<E extends EffectLike, Op = unknown> = {
  [K in E["type"]]?: (effect: Extract<E, { type: K }>, dispatch: (op: Op) => void) => void | Promise<void>
}

/** Options for the tea() middleware. */
export interface TeaOptions<E extends EffectLike, Op> {
  /** Effect runners. Keyed by effect type. Unmatched effects are silently dropped. */
  runners?: EffectRunners<E, Op>
}

/**
 * The store shape produced by the tea() middleware.
 *
 * `dispatch(op)` runs the reducer, updates state, and executes effects.
 * All domain state fields from S are spread at the top level alongside dispatch.
 */
export type TeaSlice<S, Op> = S & {
  /** Dispatch an operation through the reducer. */
  dispatch: (op: Op) => void
}

// =============================================================================
// Core: tea() middleware
// =============================================================================

/**
 * Zustand state creator that adds TEA-style dispatch + effects.
 *
 * The reducer can return plain state (Level 3) or `[state, effects]` (Level 4).
 * Array.isArray detects which — safe because Zustand state is always an object.
 *
 * Effects are executed after state update. Each effect is routed to a runner
 * by its `type` field. Runners receive a `dispatch` callback for round-trip
 * communication (Elm's Cmd Msg pattern).
 */
export function tea<S extends object, Op, E extends EffectLike = EffectLike>(
  initialState: S,
  reducer: TeaReducer<S, Op, E>,
  options?: TeaOptions<E, Op>,
): StateCreator<TeaSlice<S, Op>> {
  return (set, get) => {
    const dispatch = (op: Op): void => {
      // Extract domain state (everything except dispatch)
      const { dispatch: _, ...currentState } = get()
      const result = reducer(currentState as unknown as S, op)

      // Detect: plain state vs [state, effects]
      const [newState, effects] = Array.isArray(result) ? (result as [S, E[]]) : [result as S, [] as E[]]

      // Update Zustand store (spread domain state, keep dispatch)
      set(newState as Partial<TeaSlice<S, Op>>)

      // Execute effects
      if (effects.length > 0 && options?.runners) {
        for (const effect of effects) {
          const runner = options.runners[effect.type as E["type"]]
          if (runner) {
            ;(runner as (e: E, d: (op: Op) => void) => void)(effect, dispatch)
          }
        }
      }
    }

    return {
      ...initialState,
      dispatch,
    } as TeaSlice<S, Op>
  }
}

// =============================================================================
// Test helper: collect()
// =============================================================================

/**
 * Normalize a reducer result to `[state, effects]` tuple.
 *
 * Use in tests to uniformly assert on both state and effects regardless of
 * whether the reducer returned plain state or a tuple.
 *
 * @example
 * ```ts
 * const [state, effects] = collect(reducer(initial, { type: "save" }))
 * expect(state.saving).toBe(true)
 * expect(effects).toContainEqual(httpPost("/api", initial))
 *
 * // Also works for Level 3 (no effects):
 * const [state2, effects2] = collect(reducer(initial, { type: "increment" }))
 * expect(state2.count).toBe(1)
 * expect(effects2).toEqual([])
 * ```
 */
export function collect<S, E extends EffectLike = EffectLike>(result: TeaResult<S, E>): [S, E[]] {
  if (Array.isArray(result)) {
    return result as [S, E[]]
  }
  return [result as S, []]
}
