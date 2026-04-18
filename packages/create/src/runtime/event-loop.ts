/**
 * Event loop — the `processEventBatch` decomposition as a reusable
 * function over `BaseApp` + app hooks.
 *
 * The real `processEventBatch` in `create-app.tsx` has three
 * inseparable concerns that, once extracted, make it testable:
 *
 *   1. Lifecycle interception (Ctrl+C / Ctrl+Z) — see `lifecycle-effects.ts`.
 *   2. Per-event chain dispatch (`input:key`, `term:paste`, `term:focus`,
 *      `term:resize`, …) via `app.dispatch(op)`.
 *   3. Effect interpretation — draining `app.drainEffects()` and calling
 *      the runner-provided `onRender` / `onExit` / `onSuspend` / `onBarrier`.
 *
 * This module packages (1), (2), and (3) into {@link runEventBatch}.
 * create-app.tsx's post-refactor processEventBatch becomes a thin
 * adapter: translate namespaced events → Ops, call runEventBatch,
 * flush React + doRender on render effects.
 *
 * The function is PURE with respect to the apps/effects it's given —
 * no terminal I/O, no React, no signals. Everything real is injected.
 */

import type { Effect, Op } from "../types"
import type { BaseApp } from "./base-app"
import {
  exitEffect,
  interceptLifecycleKey,
  type LifecycleOptions,
} from "./lifecycle-effects"
import type { KeyShape } from "./with-terminal-chain"

// ---------------------------------------------------------------------------
// Input event shape — terminal-agnostic envelope
// ---------------------------------------------------------------------------

/** A batched event the event loop knows how to shuttle into ops. */
export type BatchedEvent =
  | { type: "term:key"; input: string; key: KeyShape }
  | { type: "term:paste"; text: string }
  | { type: "term:focus"; focused: boolean }
  | { type: "term:resize"; cols: number; rows: number }

// ---------------------------------------------------------------------------
// Runner callbacks
// ---------------------------------------------------------------------------

export interface EventLoopHooks {
  /** Called once per "render" effect encountered during the batch. */
  onRender?: () => void | Promise<void>
  /**
   * Called once per "render-barrier" effect. The runner should flush
   * pending renders + microtasks so subsequent events see the post-
   * mount DOM.
   */
  onBarrier?: () => void | Promise<void>
  /** Called with the exit effect. Should set the shouldExit flag. */
  onExit?: (effect: Effect) => void | Promise<void>
  /** Called with the suspend effect. Should actually SIGTSTP. */
  onSuspend?: (effect: Effect) => void | Promise<void>
  /**
   * Optional hook invoked for every non-lifecycle effect the runner
   * doesn't already understand. Useful for plugin-specific effects
   * like `persist` or `telemetry`.
   */
  onOtherEffect?: (effect: Effect) => void | Promise<void>
  /**
   * Called AFTER each dispatch/drain cycle and BEFORE checking
   * shouldExit. Allows the runner to interleave its own "app handler"
   * step (e.g. invoke `createApp`'s handler map).
   *
   * Return `false` to abort the batch (maps to `exit` in legacy flow).
   * Return `"flush"` to request an immediate render barrier.
   */
  afterDispatch?: (event: BatchedEvent) => Promise<false | "flush" | void> | false | "flush" | void
}

// ---------------------------------------------------------------------------
// Dispatch helper
// ---------------------------------------------------------------------------

/**
 * Translate a {@link BatchedEvent} into the matching apply-chain Op.
 *
 * Returns `null` for unknown event types (the runner should log).
 */
export function eventToOp(event: BatchedEvent): Op | null {
  switch (event.type) {
    case "term:key":
      return { type: "input:key", input: event.input, key: event.key }
    case "term:paste":
      return { type: "term:paste", text: event.text }
    case "term:focus":
      return { type: "term:focus", focused: event.focused }
    case "term:resize":
      return { type: "term:resize", cols: event.cols, rows: event.rows }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface RunEventBatchOptions {
  lifecycle?: LifecycleOptions
}

/**
 * Run a batch of terminal-level events through the apply chain, then
 * interpret the resulting effects through the supplied hooks.
 *
 * ## Order of operations (matches pre-refactor processEventBatch)
 *
 *   1. Scan the batch for Ctrl+C / Ctrl+Z. Strip handled ones.
 *      Collected lifecycle effects go FIRST so a user's Ctrl+C
 *      interrupts any pending render from the rest of the batch.
 *   2. For each remaining event in original order:
 *        a. Translate to Op and app.dispatch(op)
 *        b. Drain effects; route render/exit/suspend/barrier
 *        c. Invoke afterDispatch (runner's app-handler equivalent)
 *        d. If afterDispatch returned "flush", emit an extra barrier
 *   3. Return shouldExit so the caller can stop the outer loop.
 *
 * @returns true when the batch wants the outer loop to exit.
 */
export async function runEventBatch(
  app: BaseApp,
  events: BatchedEvent[],
  hooks: EventLoopHooks,
  options: RunEventBatchOptions = {},
): Promise<boolean> {
  if (events.length === 0) return false
  let shouldExit = false

  // --- Phase 1: lifecycle interception ---
  const lifecycleEffects: Effect[] = []
  const remaining: BatchedEvent[] = []
  for (const ev of events) {
    if (ev.type !== "term:key") {
      remaining.push(ev)
      continue
    }
    const eff = interceptLifecycleKey(ev.input, ev.key, options.lifecycle ?? {})
    if (eff) {
      lifecycleEffects.push(eff)
    } else {
      remaining.push(ev)
    }
  }
  // Lifecycle first — a Ctrl+C at the end of a batch should still
  // exit before any subsequent handler runs, matching create-app's
  // pre-refactor "for i = length-1; >= 0" pass.
  for (const eff of lifecycleEffects) {
    if (eff.type === "exit") {
      await hooks.onExit?.(eff)
      shouldExit = true
    } else if (eff.type === "suspend") {
      await hooks.onSuspend?.(eff)
    }
  }
  if (shouldExit) return true

  // --- Phase 2: per-event dispatch loop ---
  for (const ev of remaining) {
    const op = eventToOp(ev)
    if (!op) continue

    try {
      app.dispatch(op)
    } catch (err) {
      // Reentrancy or handler failure — surface but don't hang.
      // eslint-disable-next-line no-console
      console.error("[event-loop] dispatch threw", err)
    }

    // Drain + route effects emitted by the chain.
    const effects = app.drainEffects()
    for (const eff of effects) {
      if (eff.type === "render") {
        await hooks.onRender?.()
      } else if (eff.type === "render-barrier") {
        await hooks.onBarrier?.()
      } else if (eff.type === "exit") {
        await hooks.onExit?.(eff)
        shouldExit = true
      } else if (eff.type === "suspend") {
        await hooks.onSuspend?.(eff)
      } else {
        await hooks.onOtherEffect?.(eff)
      }
    }
    if (shouldExit) return true

    // Give the runner its turn (app handler / commands layer).
    const afterResult = hooks.afterDispatch ? await hooks.afterDispatch(ev) : undefined
    if (afterResult === false) {
      await hooks.onExit?.(exitEffect("app-handler"))
      return true
    }
    if (afterResult === "flush") {
      await hooks.onBarrier?.()
    }
  }

  return shouldExit
}
