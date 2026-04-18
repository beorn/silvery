/**
 * BaseApp — the apply-chain substrate for silvery's runtime.
 *
 * This is the contract from the v1r prototype, shipped as production code.
 * Plugins wrap `apply()`; `dispatch()` drives the chain and drains the
 * resulting effect queue.
 *
 * ## Semantics
 *
 * `apply(op)` is synchronous and returns an {@link ApplyResult}:
 *   - `false`    — "I did not handle this op; pass to the next plugin (or ignore)"
 *   - `Effect[]` — "I handled this op; here are the follow-up effects to run"
 *
 * `dispatch(op)` runs `apply(op)` inside a reentry guard, pushes any
 * emitted effects onto a shared queue, then drains the queue. The only
 * built-in effect understood by the base is `{type: "dispatch", op: Op}` —
 * which re-dispatches the nested op through the apply chain. All other
 * effects (`render`, `exit`, `suspend`, `render-barrier`) are interpreted
 * by the runner that owns this app (typically `create-app.tsx`'s
 * processEventBatch).
 *
 * ## Why a queue + drain loop?
 *
 * Plugins should be free to emit multiple effects and to chain them —
 * `dispatch` effects from one plugin can produce more effects from
 * another. The queue + drain guarantees:
 *   1. No reentrant `dispatch()` — a plugin that dispatches from inside
 *      its own apply() throws. Follow-up dispatches must be Effects.
 *   2. Bounded iteration — each drain step consumes the whole batch
 *      before accepting new effects, so we can detect runaways.
 *
 * ## Why a named sentinel effect queue?
 *
 * When the runner reads the queue (via {@link BaseApp.drainEffects}), it
 * gets an immutable snapshot so it can choose how to interpret the
 * effects. The base never implements `render` or `exit` — those belong
 * to whichever runner is driving.
 *
 * @see {@link Op}, {@link Effect}, {@link ApplyResult}
 */

import type { ApplyResult, Effect, Op } from "../types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * An app's `apply` function: takes an op, returns either `false` (not
 * handled) or an array of effects.
 */
export type Apply = (op: Op) => ApplyResult

/**
 * The minimal contract every silvery runtime exposes.
 *
 * Plugins extend this by capturing `app.apply` and replacing it with a
 * new function that delegates to the captured one for ops it doesn't
 * handle. Stores/state slices ride as extra properties on the concrete
 * plugin-enhanced type.
 */
export interface BaseApp {
  /**
   * Entry point for an op. Runs the apply chain, captures emitted
   * effects, then drains. Throws on reentrant dispatch.
   */
  dispatch(op: Op): void

  /**
   * The apply chain. The base returns `false` (nothing handles
   * anything). Plugins wrap this — last plugin applied = outermost
   * wrapper = runs first.
   */
  apply: Apply

  /**
   * Pull (and clear) effects the runner should interpret. Returns any
   * effects that were left *after* built-in `dispatch` drain completed
   * and that the runner is expected to act on (render/exit/etc).
   *
   * Most runners call this after `dispatch()` returns to flush the
   * render/exit queue.
   */
  drainEffects(): Effect[]
}

// ---------------------------------------------------------------------------
// create() — base of the chain
// ---------------------------------------------------------------------------

/**
 * Create a fresh {@link BaseApp}. The base handles nothing — all
 * behavior comes from plugins.
 *
 * Call order inside `dispatch(op)`:
 *   1. `apply(op)` (runs the plugin chain, inside reentry guard)
 *   2. Queue the returned effects (if handled)
 *   3. Drain loop — dispatch-type effects re-enter, others bubble up to
 *      the runner via {@link BaseApp.drainEffects}
 */
export function createBaseApp(): BaseApp {
  let dispatching = false
  let draining = false
  /** Effects currently queued from the active dispatch() + its drain. */
  const effectQueue: Effect[] = []
  /** Effects the runner should interpret (everything not consumed by
   *  the internal dispatch-drain, e.g. render/exit). */
  const pendingRunnerEffects: Effect[] = []

  const app: BaseApp = {
    dispatch(op) {
      if (dispatching) {
        throw new Error(`Reentrant dispatch: ${op.type}`)
      }
      dispatching = true
      try {
        const result = app.apply(op)
        if (result !== false) effectQueue.push(...result)
      } finally {
        dispatching = false
      }
      if (draining) return
      draining = true
      try {
        while (effectQueue.length > 0) {
          const batch = effectQueue.splice(0)
          for (const eff of batch) {
            if (eff.type === "dispatch") {
              // Re-dispatch is the only effect the base knows. The
              // nested op travels under `op` to avoid spread collisions
              // with the `type: "dispatch"` discriminator.
              const nested = (eff as { op?: Op }).op
              if (!nested || typeof nested.type !== "string") continue
              dispatching = true
              try {
                const nestedResult = app.apply(nested)
                if (nestedResult !== false) effectQueue.push(...nestedResult)
              } finally {
                dispatching = false
              }
            } else {
              pendingRunnerEffects.push(eff)
            }
          }
        }
      } finally {
        draining = false
      }
    },
    apply() {
      return false
    },
    drainEffects() {
      if (pendingRunnerEffects.length === 0) return []
      return pendingRunnerEffects.splice(0)
    },
  }
  return app
}

// ---------------------------------------------------------------------------
// Plugin pattern (no helper — just the idiom)
// ---------------------------------------------------------------------------

/**
 * Every `with*` plugin follows the same three-line idiom:
 *
 * ```ts
 * export function withEcho<A extends BaseApp>(app: A): A {
 *   const prev = app.apply
 *   app.apply = (op) => {
 *     if (op.type === "echo") {
 *       // handle
 *       return []
 *     }
 *     return prev(op)   // delegate to downstream chain
 *   }
 *   return app
 * }
 * ```
 *
 * The last plugin installed is the OUTERMOST wrapper and runs first.
 * Always delegate via `prev(op)` for ops you don't handle.
 */
