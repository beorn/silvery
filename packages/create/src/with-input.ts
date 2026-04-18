/**
 * withInput — public entry point for the fallback useInput store plugin.
 *
 * Unlike `withFocus` / `withTerminal` which have both a test-harness
 * wrapper and a runtime apply-chain plugin, `withInput` currently
 * exposes only the apply-chain form. The React `useInput()` hook
 * (in `@silvery/ag-react/hooks/useInput`) registers directly against
 * this plugin's store.
 *
 * ## Responsibilities
 *
 * Owns the list of handlers registered by React components via
 * `useInput(handler, { isActive })`. Handlers are invoked in
 * registration order after the focused-element dispatch (via
 * `withFocusChain`) has declined to consume the event.
 *
 * ## Composition
 *
 * Pipe order:
 *
 * ```ts
 * pipe(
 *   createBaseApp(),
 *   withTerminalChain(),
 *   withPasteChain(),
 *   withInputChain,
 *   withFocusChain({ dispatchKey, hasActiveFocus }),
 * )
 * ```
 *
 * Last in pipe() = outermost wrapper = runs first. With `withFocusChain`
 * last, focused components see the key before `withInputChain` does —
 * which is the precedence the runtime requires.
 *
 * ## The React hook
 *
 * Components call `useInput(handler, { isActive })` in `@silvery/ag-react`.
 * The hook reads the active input store from context / the app instance
 * and registers against it. When the hook unmounts it unregisters.
 *
 * See also {@link withPasteChain} for the paste-event counterpart.
 */

export { withInputChain } from "./runtime/with-input-chain"
export type { InputStore, InputHandler } from "./runtime/with-input-chain"

// ---------------------------------------------------------------------------
// Legacy placeholder — a future `withInput(options)` test-harness plugin
// could live here, mirroring `withFocus` / `withTerminal`. Today there
// is no such plugin: the test-harness side uses `app.press()` directly
// via `withApp`. If/when a harness-level input plugin is added it can
// be exported from this module alongside the chain plugin.
// ---------------------------------------------------------------------------
