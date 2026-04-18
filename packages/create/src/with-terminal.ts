/**
 * withTerminal — the public entry point for terminal-related plugins.
 *
 * Silvery ships two plugins with "terminal" in the name, operating at
 * different layers:
 *
 * ## 1. `withTerminal(process, options)` — test-harness plugin (ag-term)
 *
 * Wraps the {@link App} returned by `createApp(...)` with terminal
 * setup: raw mode, alternate screen, bracketed paste, mouse/kitty
 * protocols, and cleanup on exit. Attaches `app.term` with
 * `app.term.provider`.
 *
 * ```tsx
 * const app = pipe(baseApp, withTerminal(process, { mouse: true }))
 * await app.run(<Main />)
 * ```
 *
 * ## 2. `withTerminalChain(options)` — runtime apply-chain plugin (@silvery/create/runtime)
 *
 * Plugs into the runtime's apply chain as the "observer lane" —
 * always updates modifier state on `input:key`, handles
 * `term:resize` (schedules a render) and `term:focus` (clears sticky
 * modifiers on blur). Exposes `app.terminal` with `cols/rows/focused/
 * modifiers`.
 *
 * Both plugins are composed together in the production runtime.
 *
 * ## When to use which
 *
 *   - Setting up raw mode / alt-screen for a test or app? Use
 *     {@link withTerminal}.
 *   - Building the runtime event-loop substrate? Use
 *     {@link withTerminalChain}.
 */

export { withTerminal } from "@silvery/ag-term/plugins/with-terminal"
export type { WithTerminalOptions, AppWithTerminal, ProcessLike } from "@silvery/ag-term/plugins/with-terminal"

export { withTerminalChain } from "./runtime/with-terminal-chain"
export type {
  WithTerminalChainOptions,
  TerminalStore,
  ModifierState,
  KeyShape,
} from "./runtime/with-terminal-chain"
