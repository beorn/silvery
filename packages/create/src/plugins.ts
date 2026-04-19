/**
 * silvery/plugins — the canonical plugin barrel.
 *
 * Two families of plugins compose via `pipe()`:
 *
 * ## Test-harness plugins (wrap `App.press()`)
 *
 * Imported from `@silvery/ag-term/plugins` — these wrap the `App`
 * handle from `createApp({...})` / `withApp()`:
 *
 * ```tsx
 * import { pipe, withCommands, withKeybindings, withFocus } from '@silvery/create/plugins'
 *
 * const app = pipe(
 *   baseApp,
 *   withFocus(),
 *   withCommands(cmdOpts),
 *   withKeybindings(kbOpts),
 * )
 * await app.press('j')
 * ```
 *
 * ## Runtime apply-chain plugins (wrap `BaseApp.apply()`)
 *
 * From `@silvery/create/runtime/*` — used inside the runtime event
 * loop (`processEventBatch`) to dispatch `Op`s through a structured
 * apply chain:
 *
 * ```tsx
 * import { pipe } from '@silvery/create/pipe'
 * import {
 *   createBaseApp,
 *   withTerminalChain,
 *   withPasteChain,
 *   withInputChain,
 *   withFocusChain,
 * } from '@silvery/create/plugins'
 *
 * const app = pipe(
 *   createBaseApp(),
 *   withTerminalChain(),
 *   withPasteChain(),
 *   withInputChain,
 *   withFocusChain({ dispatchKey, hasActiveFocus }),
 * )
 * app.dispatch({ type: "input:key", input: "j", key: { eventType: "press" } })
 * ```
 *
 * @packageDocumentation
 */

// --- Test-harness plugins ----------------------------------------------------
export * from "@silvery/ag-term/plugins"

// --- Runtime apply-chain plugins ---------------------------------------------
export { withTerminalChain } from "./runtime/with-terminal-chain"
export type {
  WithTerminalChainOptions,
  TerminalStore,
  ModifierState,
  KeyShape,
} from "./runtime/with-terminal-chain"

export { withPasteChain } from "./runtime/with-paste-chain"
export type { WithPasteChainOptions, PasteStore, PasteHandler } from "./runtime/with-paste-chain"

export { withInputChain } from "./runtime/with-input-chain"
export type { InputStore, InputHandler } from "./runtime/with-input-chain"

export { withFocusChain } from "./runtime/with-focus-chain"
export type {
  WithFocusChainOptions,
  FocusChainStore,
  FocusKeyDispatch,
  HasActiveFocus,
} from "./runtime/with-focus-chain"

export { withCustomEvents } from "./runtime/with-custom-events"
export type { CustomEventHandler, CustomEventStore } from "./runtime/with-custom-events"

// --- Apply-chain substrate ---------------------------------------------------
export { createBaseApp } from "./runtime/base-app"
export type { BaseApp, Apply } from "./runtime/base-app"

export { runEventBatch, eventToOp } from "./runtime/event-loop"
export type { BatchedEvent, EventLoopHooks, RunEventBatchOptions } from "./runtime/event-loop"

export {
  exitEffect,
  suspendEffect,
  renderEffect,
  renderBarrierEffect,
  interceptLifecycleKey,
  isCtrlC,
  isCtrlZ,
} from "./runtime/lifecycle-effects"
export type {
  ExitEffect,
  SuspendEffect,
  RenderBarrierEffect,
  LifecycleOptions,
} from "./runtime/lifecycle-effects"
