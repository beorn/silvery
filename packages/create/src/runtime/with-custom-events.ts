/**
 * withCustomEvents — apply-chain plugin for app-defined custom events.
 *
 * Replaces the legacy `RuntimeContextValue.emit("foo", …)` /
 * `RuntimeContextValue.on("foo", …)` pair for anything that isn't one of
 * the built-in input / paste / focus events. Provides a typed bus where
 * components emit named events and handlers subscribe by channel name.
 *
 * ## Contract
 *
 * - Channel names are arbitrary strings chosen by the app. Payloads are
 *   untyped `unknown[]` at the plugin boundary — callers usually narrow
 *   via a branded wrapper (see `km-tui`'s `useLinkOpen`).
 *
 * - Handlers are invoked in registration order; a thrown handler is
 *   surfaced to the console but does not short-circuit the bus.
 *
 * - The plugin never intercepts ops — it exposes its store via
 *   `app.events` and returns `false` for every op so downstream plugins
 *   still see them.
 *
 * ## Why a chain plugin?
 *
 * Before this existed, custom events rode on `RuntimeContextValue.on /
 * emit`. That surface is being trimmed to just `{exit: () => void}` as
 * part of the TEA Phase 2 wiring. Routing custom events through a
 * dedicated plugin keeps the chain the single authority for view ↔
 * runtime messaging, matching how input / paste / focus already work.
 *
 * @example
 * ```tsx
 * // Install
 * const app = pipe(
 *   createBaseApp(),
 *   withTerminalChain(),
 *   withPasteChain(),
 *   withInputChain,
 *   withFocusChain(...),
 *   withCustomEvents,
 * )
 *
 * // Emit from a component
 * app.events.emit("link:open", "https://example.com")
 *
 * // Subscribe from a hook
 * useEffect(() => chain.events.on("link:open", (href) => openExternal(href as string)), [chain])
 * ```
 */

import type { ApplyResult, Op } from "../types"
import type { BaseApp } from "./base-app"

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

/** Generic payload handler — custom events carry `unknown[]` payloads. */
export type CustomEventHandler = (...args: unknown[]) => void

/** Store slice installed by {@link withCustomEvents}. */
export interface CustomEventStore {
  /** Subscribe to `channel`. Returns an unsubscribe function. */
  on(channel: string, handler: CustomEventHandler): () => void
  /** Emit `channel` with payload — invokes every registered handler in order. */
  emit(channel: string, ...args: unknown[]): void
  /**
   * Remove a specific handler. Prefer the cleanup function returned by
   * `on()`; this is primarily for tests and rare teardown paths.
   */
  off(channel: string, handler: CustomEventHandler): void
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Install the custom-events plugin.
 *
 * Exposes the event bus at `app.events`. The plugin is observer-only —
 * it does not touch the op stream; every op passes straight through to
 * downstream plugins.
 */
export function withCustomEvents<A extends BaseApp>(app: A): A & { events: CustomEventStore } {
  const channels = new Map<string, CustomEventHandler[]>()
  const store: CustomEventStore = {
    on(channel, handler) {
      let handlers = channels.get(channel)
      if (!handlers) {
        handlers = []
        channels.set(channel, handlers)
      }
      handlers.push(handler)
      return () => {
        const list = channels.get(channel)
        if (!list) return
        const i = list.indexOf(handler)
        if (i >= 0) list.splice(i, 1)
      }
    },
    emit(channel, ...args) {
      const handlers = channels.get(channel)
      if (!handlers || handlers.length === 0) return
      // Snapshot — allow handlers to unsubscribe without mutating the
      // iteration set.
      for (const handler of handlers.slice()) {
        try {
          handler(...args)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[withCustomEvents] handler for "${channel}" threw`, err)
        }
      }
    },
    off(channel, handler) {
      const handlers = channels.get(channel)
      if (!handlers) return
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i] === handler) handlers.splice(i, 1)
      }
    },
  }
  const prev = app.apply
  app.apply = (op: Op): ApplyResult => prev(op)
  return Object.assign(app, { events: store })
}
