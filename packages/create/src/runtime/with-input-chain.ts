/**
 * withInputChain — apply-chain plugin for the fallback `useInput` store.
 *
 * Fallback = this plugin runs AFTER the focused dispatch plugin
 * (`withFocusChain`) in the apply chain. When focus consumes an event,
 * useInput never sees it — focused components have priority.
 *
 * ## Contract
 *
 *   - Plugin owns a list of handlers registered by React components via
 *     the `useInput()` hook. Handlers are invoked in registration order
 *     (stable; matches the pre-refactor RuntimeContext behaviour).
 *
 *   - On `input:key` ops:
 *       - release / modifier-only events are observed (some useInput
 *         callers still want to know about Ctrl up/down) but do not
 *         mark the event as consumed.
 *       - press / repeat events invoke every active handler. If any
 *         handler returns "exit", we short-circuit with
 *         `[{type:"exit"}]`. Otherwise we signal "handled" by returning
 *         `[]` when at least one active handler exists.
 *
 *   - If no active handlers exist, the plugin returns `false` (pass
 *     through) so downstream plugins or the app handler can see the
 *     event unchanged.
 *
 * ## Why "active" handlers?
 *
 * Components can `useInput(fn, { isActive: false })` to temporarily
 * suppress their handler without unmounting. This is used e.g. by
 * picker dialogs where the parent's global keys should be disabled
 * while the picker is open but the component remains mounted.
 */

import type { ApplyResult, Effect, Op } from "../types"
import type { BaseApp } from "./base-app"
import type { KeyShape } from "./with-terminal-chain"

// ---------------------------------------------------------------------------
// Handler + store types
// ---------------------------------------------------------------------------

/** Signature matches the classic `useInput(handler)` form. */
export type InputHandler = (input: string, key: KeyShape) => void | "exit"

interface InputEntry {
  handler: InputHandler
  active: boolean
}

/** Store slice installed by {@link withInputChain}. */
export interface InputStore {
  /** Internal array of registered entries (exposed for diagnostics). */
  readonly handlers: ReadonlyArray<InputEntry>
  /**
   * Register a new input handler. Returns an unregister function.
   * @param handler the callback
   * @param active  whether the handler is currently active (default: true)
   */
  register(handler: InputHandler, active?: boolean): () => void
  /** Update the active flag for a previously-registered handler. */
  setActive(handler: InputHandler, active: boolean): void
  /** Remove a handler (primarily for tests; `register` returns an unregister fn). */
  unregister(handler: InputHandler): void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isModifierOnly(input: string, key: KeyShape | undefined): boolean {
  if (!key) return false
  // A pure modifier event has no "payload" input character and one of
  // the modifier flags set.
  if (input && input.length > 0) return false
  return !!(key.ctrl || key.shift || key.meta || key.super || key.alt || key.hyper)
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Install the fallback useInput store plugin.
 *
 * Pipe order note: place this plugin so it runs AFTER withFocusChain.
 * Because the last plugin in `pipe()` wraps the outermost layer, the
 * chain reads left-to-right with the base on the left:
 *
 *   pipe(create(), withTerminalChain(), withInputChain(), withFocusChain())
 *
 * => apply order: focusChain -> inputChain -> terminalChain -> base
 *
 * => focused components consume before useInput, which is what we want.
 */
export function withInputChain<A extends BaseApp>(app: A): A & { input: InputStore } {
  const entries: InputEntry[] = []
  const store: InputStore = {
    handlers: entries,
    register(handler, active = true) {
      const entry: InputEntry = { handler, active }
      entries.push(entry)
      return () => {
        const i = entries.indexOf(entry)
        if (i >= 0) entries.splice(i, 1)
      }
    },
    setActive(handler, active) {
      for (const entry of entries) {
        if (entry.handler === handler) entry.active = active
      }
    },
    unregister(handler) {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i]!.handler === handler) entries.splice(i, 1)
      }
    },
  }
  const prev = app.apply
  app.apply = (op: Op): ApplyResult => {
    if (op.type !== "input:key") return prev(op)
    const input = (op as { input?: string }).input ?? ""
    const key = (op as { key?: KeyShape }).key
    const isRelease = key?.eventType === "release"
    const modOnly = isModifierOnly(input, key)
    // Always let release / modifier-only events bubble down the chain —
    // e.g. `useModifierKeys` (a future plugin) wants to hear them — but
    // do NOT invoke useInput handlers and do NOT mark the event handled
    // at this layer.
    if (isRelease || modOnly) return prev(op)

    let hasActive = false
    const effects: Effect[] = []
    for (const entry of entries) {
      if (!entry.active) continue
      hasActive = true
      try {
        const result = entry.handler(input, key ?? ({} as KeyShape))
        if (result === "exit") {
          effects.push({ type: "exit" })
          return effects
        }
      } catch (err) {
        // Surface, but don't kill the event loop for a single bad handler.
        // eslint-disable-next-line no-console
        console.error("[withInputChain] handler threw", err)
      }
    }
    if (hasActive) return effects
    return prev(op)
  }
  return Object.assign(app, { input: store })
}
