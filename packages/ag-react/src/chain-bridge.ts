/**
 * chain-bridge — utilities for installing an apply-chain on a non-root
 * runtime (render.tsx's Silvery instance and InputBoundary's isolated
 * scope).
 *
 * createApp()'s `create-app.tsx` owns the canonical chain plumbing. The
 * helpers here let callers that don't go through createApp still expose
 * a {@link ChainAppContextValue} to their children so the ag-react
 * hooks (useInput / useModifierKeys / useTerminalFocused / usePaste*)
 * can subscribe through a single unified surface.
 *
 * The child BaseApp installs the same four plugins as create-app.tsx:
 *
 *   pipe(createBaseApp(),
 *        withTerminalChain,
 *        withPasteChain,
 *        withInputChain,
 *        withFocusChain)
 *
 * withFocusChain is wired with a no-op dispatcher — the isolated scope
 * doesn't own a focus manager, so focused dispatch simply returns false
 * and keys flow straight to the input store.
 */

import type { Key } from "@silvery/ag/keys"
import {
  createBaseApp,
  withCustomEvents,
  withFocusChain,
  withInputChain,
  withPasteChain,
  withTerminalChain,
  type BaseApp,
  type CustomEventStore,
  type InputStore,
  type PasteStore,
  type TerminalStore,
} from "@silvery/create/plugins"
import type {
  ChainAppContextValue,
  ChainFocusEvents,
  ChainFocusHandler,
  ChainRawKeyHandler,
  ChainRawKeyObserver,
} from "./context"

/**
 * BaseApp enhanced with the four chain plugins plus the raw-key observer
 * and focus-event slices that complete the {@link ChainAppContextValue}
 * surface.
 */
export interface ChildApp extends BaseApp {
  readonly input: InputStore
  readonly paste: PasteStore
  readonly terminal: TerminalStore
  readonly events: CustomEventStore
  readonly rawKeys: ChainRawKeyObserver & {
    /** Fire all registered raw-key observers. */
    notify(input: string, key: Key): void
  }
  readonly focusEvents: ChainFocusEvents & {
    /** Fire all registered focus-event observers. */
    notify(focused: boolean): void
  }
}

/**
 * Build a non-root BaseApp with the canonical plugin chain.
 *
 * The returned app is self-contained: ops dispatched through it don't
 * reach the root runtime. Callers own the lifecycle — there's no exit /
 * render effect handler wired up; effects are drained and discarded.
 */
export function createChildApp(): ChildApp {
  const base = createBaseApp()
  const terminal = withTerminalChain()(base)
  const paste = withPasteChain()(terminal)
  const input = withInputChain(paste)
  const focus = withFocusChain({
    dispatchKey: () => false,
    hasActiveFocus: () => false,
  })(input)
  const events = withCustomEvents(focus)

  // Raw-key observer slice — unfiltered access to every dispatched key
  // (used by useModifierKeys which needs release + modifier-only events).
  const rawKeyListeners: Array<(input: string, key: Key) => void> = []
  const rawKeys = {
    register(handler: ChainRawKeyHandler): () => void {
      rawKeyListeners.push(handler as (input: string, key: Key) => void)
      return () => {
        const i = rawKeyListeners.indexOf(handler as (input: string, key: Key) => void)
        if (i >= 0) rawKeyListeners.splice(i, 1)
      }
    },
    notify(input: string, key: Key): void {
      for (const h of rawKeyListeners) h(input, key)
    },
  }

  // Focus-events slice — isolated scopes typically don't emit focus
  // events, but useTerminalFocused still expects a register() that
  // returns a clean unsubscribe.
  const focusListeners: Array<ChainFocusHandler> = []
  const focusEvents = {
    register(handler: ChainFocusHandler): () => void {
      focusListeners.push(handler)
      return () => {
        const i = focusListeners.indexOf(handler)
        if (i >= 0) focusListeners.splice(i, 1)
      }
    },
    notify(focused: boolean): void {
      for (const h of focusListeners) h(focused)
    },
  }

  return Object.assign(events, { rawKeys, focusEvents }) as ChildApp
}

/**
 * Project a {@link ChildApp} to the surface exposed on
 * {@link ChainAppContextValue}.
 */
export function toChainAppContextValue(app: ChildApp): ChainAppContextValue {
  return {
    input: app.input,
    paste: app.paste,
    focusEvents: app.focusEvents,
    rawKeys: app.rawKeys,
    events: app.events,
  }
}
