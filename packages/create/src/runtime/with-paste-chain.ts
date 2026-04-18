/**
 * withPasteChain — apply-chain plugin for bracketed-paste routing.
 *
 * Paste routing has priority:
 *
 *   1. Focused `onPaste` — if a focused element subscribes directly
 *      (via a focus event listener) it should consume the paste first.
 *      The chain expresses this via a pluggable `routeToFocused`
 *      callback — in production this dispatches a `paste` DOM event
 *      through the focus tree (see `create-app.tsx`); in tests it can
 *      be stubbed.
 *
 *   2. Global `usePaste` handlers — registered by React components via
 *      the `usePaste()` / `usePasteCallback()` / `usePasteEvents()`
 *      hooks. Invoked in registration order, same contract as
 *      `withInputChain`'s fallback store.
 *
 * A paste never produces an "exit" result; we return `[]` whenever at
 * least one handler (or the focused route) consumes the paste, so the
 * outer runner knows to render.
 */

import type { ApplyResult, Effect, Op } from "../types"
import type { BaseApp } from "./base-app"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PasteHandler = (text: string) => void

/** Paste handler with richer metadata (mirrors `usePasteEvents`). */
export interface PasteEvent {
  /** The raw text that was pasted (as delivered by the terminal). */
  readonly text: string
  /** Whether the focus route consumed this event. */
  readonly focusedConsumed: boolean
}

/** Store slice installed by {@link withPasteChain}. */
export interface PasteStore {
  readonly handlers: ReadonlyArray<PasteHandler>
  register(handler: PasteHandler): () => void
  unregister(handler: PasteHandler): void
}

/** Options for {@link withPasteChain}. */
export interface WithPasteChainOptions {
  /**
   * If provided, called with the pasted text before any fallback
   * handlers run. Return `true` if the paste was consumed by a focused
   * element (fallback handlers will be skipped).
   *
   * Production wires this to `dispatchPasteEvent` through the focus
   * tree; tests typically leave it undefined.
   */
  routeToFocused?: (text: string) => boolean
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Install the paste router plugin.
 *
 * On `term:paste` ops:
 *   - Call `routeToFocused(text)` first (if provided). If it returns
 *     true, we short-circuit: handled by focus tree, no fallback.
 *   - Otherwise invoke every registered global handler in order.
 *   - Always emit `[{type:"render"}]` when handled, so the runner
 *     knows to paint the post-paste state.
 */
export function withPasteChain(
  options: WithPasteChainOptions = {},
): <A extends BaseApp>(app: A) => A & { paste: PasteStore } {
  return <A extends BaseApp>(app: A): A & { paste: PasteStore } => {
    const handlers: PasteHandler[] = []
    const store: PasteStore = {
      handlers,
      register(handler) {
        handlers.push(handler)
        return () => {
          const i = handlers.indexOf(handler)
          if (i >= 0) handlers.splice(i, 1)
        }
      },
      unregister(handler) {
        for (let i = handlers.length - 1; i >= 0; i--) {
          if (handlers[i] === handler) handlers.splice(i, 1)
        }
      },
    }
    const prev = app.apply
    app.apply = (op: Op): ApplyResult => {
      if (op.type !== "term:paste") return prev(op)
      const text = (op as { text?: string }).text ?? ""
      let consumed = false
      if (options.routeToFocused) {
        try {
          consumed = !!options.routeToFocused(text)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[withPasteChain] routeToFocused threw", err)
        }
      }
      if (!consumed && handlers.length > 0) {
        for (const handler of handlers) {
          try {
            handler(text)
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[withPasteChain] handler threw", err)
          }
        }
        consumed = true
      }
      if (!consumed) return prev(op)
      const effects: Effect[] = [{ type: "render" }]
      return effects
    }
    return Object.assign(app, { paste: store })
  }
}
