/**
 * withFocus — the public entry point for focus-related plugins.
 *
 * Silvery ships two plugins with "focus" in the name. They operate at
 * different layers and are used together in the full production stack:
 *
 * ## 1. `withFocus(options)` — test-harness plugin (ag-term)
 *
 * Wraps the {@link App} returned by `createApp(...)` with focus
 * navigation (Tab / Shift+Tab / Escape) and optional features such as
 * keyboard copy-mode (`Esc+v`) and Ctrl+F find. Attaches
 * `app.focusManager`, `app.copyModeFeature`, `app.find`.
 *
 * This is what you compose in test / harness code:
 *
 * ```tsx
 * const app = pipe(baseApp, withFocus({ copyMode: true, find: true }))
 * await app.press("Tab")
 * ```
 *
 * ## 2. `withFocusChain(options)` — runtime apply-chain plugin (@silvery/create/runtime)
 *
 * Plugs into the runtime's apply chain so that `input:key` ops dispatch
 * to the focused element FIRST (before the `useInput` fallback store).
 * This is the structured replacement for the ad-hoc
 * `handleFocusNavigation + runtimeInputListeners` branch inside
 * `create-app.tsx`'s `processEventBatch`.
 *
 * Both plugins can be composed into the same app — they operate on
 * different capabilities (`press()` vs `dispatch(op)`).
 *
 * ## When to use which
 *
 *   - Writing a test that drives the harness `App.press()`? Use
 *     {@link withFocus}.
 *   - Wiring the runtime event loop / `processEventBatch`? Use
 *     {@link withFocusChain}.
 *   - Consuming focus state in a React component? Neither — use the
 *     `useFocus` hook from `@silvery/ag-react`.
 */

export { withFocus } from "@silvery/ag-term/plugins/with-focus"
export type { WithFocusOptions, AppWithFocus } from "@silvery/ag-term/plugins/with-focus"

export { withFocusChain } from "./runtime/with-focus-chain"
export type {
  WithFocusChainOptions,
  FocusChainStore,
  FocusKeyDispatch,
  HasActiveFocus,
} from "./runtime/with-focus-chain"
