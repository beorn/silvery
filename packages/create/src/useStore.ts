/**
 * useStore — React hook that reads live plugin state.
 *
 * Replaces the hand-rolled `useXxx.ts` bridge files (one per plugin)
 * that every current silvery plugin ships. All consumers do:
 *
 * ```tsx
 * import { useStore } from "@silvery/create/useStore"
 * const { state, dispatch } = useStore(helpOverlay)
 * ```
 *
 * Uses `useSyncExternalStore` with stable snapshot identity — the
 * plugin reducer preserves `===` on no-op dispatches, so React skips
 * the commit automatically.
 */
import { useCallback, useSyncExternalStore } from "react"
import type { DefinedPlugin, OpOf, PluginOps } from "./definePlugin.ts"

export interface PluginHandle<Name extends string, State, Ops extends PluginOps<State>> {
  readonly state: State
  readonly dispatch: (op: OpOf<Name, Ops>) => void
}

/**
 * Subscribe a React component to a plugin's state. Returns `{ state,
 * dispatch }` — enough to render + dispatch from the same hook. No
 * per-plugin bridge file required.
 */
export function useStore<Name extends string, State, Ops extends PluginOps<State>>(
  plugin: DefinedPlugin<Name, State, Ops>,
): PluginHandle<Name, State, Ops> {
  const subscribe = useCallback((listener: () => void) => plugin.subscribe(listener), [plugin])
  const state = useSyncExternalStore(subscribe, plugin.getState, plugin.getState)
  return { state, dispatch: plugin.dispatch.bind(plugin) }
}
