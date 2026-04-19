/**
 * Lifecycle effects — Ctrl+C / Ctrl+Z / exit / suspend as pure data.
 *
 * The event loop (`event-loop.ts`) calls into this module when it sees
 * lifecycle-marked key ops. Keeping these as data-shaped Effects keeps
 * them testable and serializable; the runner (create-app.tsx) decides
 * how to enact each effect (actually call `process.kill(SIGTSTP)` etc.).
 *
 * This module is the functional decomposition of the Ctrl+Z / Ctrl+C
 * block inside `processEventBatch` (create-app.tsx lines 2283-2328).
 */

import type { Effect } from "../types"
import type { KeyShape } from "./with-terminal-chain"

// ---------------------------------------------------------------------------
// Lifecycle effect shapes
// ---------------------------------------------------------------------------

/** The app should exit gracefully (Ctrl+C pressed, `exit()` called, …). */
export interface ExitEffect extends Effect {
  readonly type: "exit"
  /** Optional exit code for non-zero exits. Default: 0. */
  readonly code?: number
  /** Optional reason string for logs / diagnostics. */
  readonly reason?: "ctrl-c" | "app-handler" | "use-input" | "signal" | string
}

/** The app should suspend (Ctrl+Z / SIGTSTP). */
export interface SuspendEffect extends Effect {
  readonly type: "suspend"
  /** How the suspend was triggered. */
  readonly reason?: "ctrl-z" | "signal" | string
}

/**
 * The runner should flush renders + microtasks before delivering the
 * next op. Used to guarantee newly-mounted components have their refs
 * wired up before a follow-up key is processed.
 */
export interface RenderBarrierEffect extends Effect {
  readonly type: "render-barrier"
}

// ---------------------------------------------------------------------------
// Detection — pure functions on (input, key) pairs
// ---------------------------------------------------------------------------

/**
 * True if this is the Ctrl+C keypress. Matches `parseKey`'s canonical
 * shape: `input: "c"` with `key.ctrl: true`.
 */
export function isCtrlC(input: string, key: KeyShape): boolean {
  return input === "c" && !!key.ctrl && !key.shift && !key.meta && !key.super
}

/**
 * True if this is the Ctrl+Z keypress (suspend signal).
 * Matches `parseKey`: `input: "z"` with `key.ctrl: true`.
 */
export function isCtrlZ(input: string, key: KeyShape): boolean {
  return input === "z" && !!key.ctrl && !key.shift && !key.meta && !key.super
}

// ---------------------------------------------------------------------------
// Effect constructors — prefer these over object literals so shapes stay
// consistent across callers.
// ---------------------------------------------------------------------------

export function exitEffect(
  reason: ExitEffect["reason"] = "app-handler",
  code?: number,
): ExitEffect {
  return code === undefined ? { type: "exit", reason } : { type: "exit", reason, code }
}

export function suspendEffect(reason: SuspendEffect["reason"] = "ctrl-z"): SuspendEffect {
  return { type: "suspend", reason }
}

export function renderBarrierEffect(): RenderBarrierEffect {
  return { type: "render-barrier" }
}

export function renderEffect(): Effect {
  return { type: "render" }
}

// ---------------------------------------------------------------------------
// Interception helper — used by the event loop to strip Ctrl+C/Z from
// a batch before the chain sees them.
// ---------------------------------------------------------------------------

/** Options controlling which lifecycle keys are intercepted. */
export interface LifecycleOptions {
  /** Respect Ctrl+C → exit. Default: true. */
  exitOnCtrlC?: boolean
  /** Respect Ctrl+Z → suspend. Default: true (when on a tty). */
  suspendOnCtrlZ?: boolean
  /** Prevent-hook for Ctrl+C — return false to prevent exit. */
  onInterrupt?: () => boolean | void
  /** Prevent-hook for Ctrl+Z — return false to prevent suspend. */
  onSuspend?: () => boolean | void
}

/**
 * Inspect a single key op for Ctrl+C / Ctrl+Z intent. Returns the
 * resulting {@link Effect} if this key should be intercepted (and
 * stripped from the batch), otherwise `null`.
 *
 * This isolates the decision logic so the event loop stays linear.
 */
export function interceptLifecycleKey(
  input: string,
  key: KeyShape,
  opts: LifecycleOptions,
): Effect | null {
  const exitOn = opts.exitOnCtrlC !== false
  const suspOn = opts.suspendOnCtrlZ !== false
  if (exitOn && isCtrlC(input, key)) {
    // onInterrupt returning false means "do not exit".
    const prevented = opts.onInterrupt?.() === false
    if (prevented) return null
    return exitEffect("ctrl-c")
  }
  if (suspOn && isCtrlZ(input, key)) {
    const prevented = opts.onSuspend?.() === false
    if (prevented) return null
    return suspendEffect("ctrl-z")
  }
  return null
}
