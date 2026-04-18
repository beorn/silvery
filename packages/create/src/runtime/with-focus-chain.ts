/**
 * withFocusChain — apply-chain plugin for focused-element key dispatch.
 *
 * This is the production form of the v1r prototype's `withFocus` plugin:
 * it owns the "focused lane" of the input pipeline. When the app has an
 * active focus target, keys go to it FIRST. If the target handles the
 * key (stopPropagation / preventDefault / handler returned `true`), we
 * signal "handled" to the chain and downstream plugins (`useInput`) skip
 * the event.
 *
 * ## Relation to `@silvery/ag-term/plugins/with-focus`
 *
 * The existing `withFocus` in ag-term wraps the *test harness* `App`
 * (`app.press()`). It's a higher-level construct that drives the same
 * runtime bits via a proxy around `press`.
 *
 * `withFocusChain` is the lower-level substrate: it plugs into the
 * runtime's apply chain so `processEventBatch` can replace its
 * ad-hoc `handleFocusNavigation + runtimeInputListeners` loop with a
 * single `app.dispatch({type:"input:key", ...})`.
 *
 * The two layer and stack:
 *
 *   - ag-term/plugins/with-focus  (test/harness)  ──────────────┐
 *                                                               │
 *   - runtime/with-focus-chain    (apply chain)  ◀──────────────┘
 *
 * ## Options
 *
 * The production runtime already has a rich `createFocusManager`. Rather
 * than re-implement it here, withFocusChain accepts a pluggable
 * `dispatchKey` function — typically `dispatchKeyEvent(createKeyEvent(...),
 * focusManager.activeElement)` or equivalent. It MUST return a boolean:
 *
 *   - `true`  — the focused tree consumed the key (stopPropagation)
 *   - `false` — the focused tree didn't handle it; fall through
 *
 * This dependency-injection style keeps @silvery/create free of
 * terminal-specific imports while still letting create-app.tsx wire
 * in the real focus manager.
 */

import type { ApplyResult, Op } from "../types"
import type { BaseApp } from "./base-app"
import type { KeyShape } from "./with-terminal-chain"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Caller-supplied: decide whether the focused tree consumed the key.
 *
 * Must return `true` iff the focused node's `onKeyDown` handler
 * invoked `stopPropagation()` / `preventDefault()` — identical to the
 * current `handleFocusNavigation` return.
 */
export type FocusKeyDispatch = (input: string, key: KeyShape) => boolean

/**
 * Caller-supplied: is there an active focus target right now?
 *
 * Checked up-front so we skip the dispatch entirely when nothing is
 * focused (matches create-app's `if (focusManager.activeElement)`
 * short-circuit).
 */
export type HasActiveFocus = () => boolean

/** Options for {@link withFocusChain}. */
export interface WithFocusChainOptions {
  dispatchKey: FocusKeyDispatch
  hasActiveFocus: HasActiveFocus
  /**
   * Optional: when true, releasing keys and modifier-only events are
   * forwarded to `dispatchKey` too. Default: false (matches
   * create-app.tsx's pre-refactor behaviour where such events skip
   * focused dispatch).
   */
  dispatchReleaseAndModifierOnly?: boolean
}

/** Store slice installed by {@link withFocusChain}. */
export interface FocusChainStore {
  /** Most recent result from `dispatchKey` (for diagnostics / tests). */
  lastConsumed: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isModifierOnly(input: string, key: KeyShape | undefined): boolean {
  if (!key) return false
  if (input && input.length > 0) return false
  return !!(key.ctrl || key.shift || key.meta || key.super || key.alt || key.hyper)
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Install the focus-dispatch plugin.
 *
 * Place this plugin OUTERMOST in the input-handling chain so focused
 * targets see the key before the `useInput` fallback store.
 */
export function withFocusChain(
  options: WithFocusChainOptions,
): <A extends BaseApp>(app: A) => A & { focusChain: FocusChainStore } {
  return <A extends BaseApp>(app: A): A & { focusChain: FocusChainStore } => {
    const store: FocusChainStore = { lastConsumed: false }
    const prev = app.apply
    app.apply = (op: Op): ApplyResult => {
      if (op.type !== "input:key") return prev(op)
      if (!options.hasActiveFocus()) return prev(op)
      const input = (op as { input?: string }).input ?? ""
      const key = (op as { key?: KeyShape }).key
      const isRelease = key?.eventType === "release"
      const modOnly = isModifierOnly(input, key)
      if ((isRelease || modOnly) && !options.dispatchReleaseAndModifierOnly) {
        return prev(op)
      }
      let consumed = false
      try {
        consumed = !!options.dispatchKey(input, key ?? ({} as KeyShape))
      } catch (err) {
        // A bad focused handler shouldn't break the event loop.
        // eslint-disable-next-line no-console
        console.error("[withFocusChain] dispatchKey threw", err)
      }
      store.lastConsumed = consumed
      if (consumed) {
        // The focused tree consumed the key. Signal "handled" with a
        // render request so the runner repaints. Downstream plugins
        // (useInput fallback) are short-circuited.
        return [{ type: "render" }]
      }
      return prev(op)
    }
    return Object.assign(app, { focusChain: store })
  }
}
