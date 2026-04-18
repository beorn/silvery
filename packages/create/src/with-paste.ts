/**
 * withPaste — public entry point for the paste-routing plugin.
 *
 * Like `withInput`, currently exposes only the apply-chain form. The
 * React hooks `usePaste()`, `usePasteCallback()`, and `usePasteEvents()`
 * (in `@silvery/ag-react/hooks/usePaste*`) register against this
 * plugin's store.
 *
 * ## Responsibilities
 *
 * Routes `term:paste` events:
 *   1. Focused route first — if a focused element subscribed via
 *      `onPaste={...}` (driven by `routeToFocused` in the plugin
 *      options), it consumes the paste.
 *   2. Global fallback — otherwise, every registered handler fires
 *      in registration order.
 *
 * On a handled paste the plugin emits `[{type:"render"}]` so the
 * runner repaints.
 *
 * ## Composition
 *
 * ```ts
 * pipe(
 *   createBaseApp(),
 *   withTerminalChain(),
 *   withPasteChain({ routeToFocused: dispatchPasteToFocus }),
 *   withInputChain,
 *   withFocusChain({ dispatchKey, hasActiveFocus }),
 * )
 * ```
 *
 * ## Runtime wiring
 *
 * In production, `create-app.tsx` provides `routeToFocused` that
 * builds a `paste` DOM event and dispatches it through the focus
 * tree — matching the existing `handleFocusNavigation`-style
 * behaviour for keyboard events. In tests you typically pass a
 * simple predicate or leave it undefined.
 */

export { withPasteChain } from "./runtime/with-paste-chain"
export type { WithPasteChainOptions, PasteStore, PasteHandler } from "./runtime/with-paste-chain"
