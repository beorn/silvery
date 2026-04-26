/**
 * definePlugin — one-file plugin factory for the TEA apply-chain pattern.
 *
 * Collapses the three-file (plugin + hook + bridge) shape into a single
 * declaration:
 *
 * ```ts
 * const helpOverlay = definePlugin({
 *   name: "helpOverlay",
 *   state: { visible: false, scrollOffset: 0 },
 *   ops: {
 *     show:       (s) => ({ visible: true, scrollOffset: 0 }),
 *     hide:       (s) => ({ visible: false, scrollOffset: 0 }),
 *     scrollUp:   (s) => ({ ...s, scrollOffset: Math.max(0, s.scrollOffset - 1) }),
 *     scrollDown: (s) => ({ ...s, scrollOffset: s.scrollOffset + 1 }),
 *   },
 *   keys: { "?": "show", Escape: "hide", k: "scrollUp", j: "scrollDown" },
 * })
 * ```
 *
 * What the factory subsumes (from the elegance review 2026-04-21):
 *
 *  - The 40-LOC hand-rolled `createStore({ getState, dispatch, subscribe,
 *    reset })` block that every current plugin duplicates verbatim.
 *  - The per-plugin singleton accessor + `resetXxxStore()` export wired
 *    into tests.
 *  - The separate `useXxx.ts` `useSyncExternalStore` bridge file.
 *  - Manual op-type string namespacing (`"help.show"`, `"help.hide"` …)
 *    — the `${name}.${opKey}` is derived from the `name` + `ops` keys.
 *
 * What is deliberately deferred (spike scope):
 *
 *  - Full Effect-namespace routing (`effects:` hook exists but the
 *    plugin pipeline does not yet drain returned effects by namespace).
 *  - `keys:` modifier parsing — the shorthand is recorded on the plugin
 *    and the consumer (or a future `withKeys()` convention plugin) is
 *    expected to honour it. Tested at the declarative level here.
 *  - Role-lanes / precedence enforcement — see `role-lanes-decide` bead.
 *  - AppPlugin integration — the `Plugin` return value carries the hooks
 *    a future `withPlugin(plugin)` adapter will need, but today consumers
 *    call `plugin.dispatch()` / `useStore(plugin)` directly (Zustand
 *    parity first, pipe integration later).
 */

// =============================================================================
// Public types
// =============================================================================

/**
 * Reducer shape. Returns either a next state or a `[state, effects]`
 * tuple. The tuple form is an escape hatch for the rare op that needs
 * to emit effects; common-case ops just return state.
 */
export type PluginReducer<State, Payload = void> = (
  state: State,
  payload: Payload,
) => State | readonly [State, readonly PluginEffect[]]

/** Effects are plain serializable data — drained by the plugin pipeline. */
export type PluginEffect = { readonly type: string; readonly [key: string]: unknown }

/** The `ops:` record: a dictionary of reducer functions. */
export type PluginOps<State> = Record<string, PluginReducer<State, any>>

/**
 * Payload type inference. `(s) => state` means "no payload"; `(s, p: P)
 * => state` means payload is P. We check `Parameters` length: a
 * 1-parameter reducer has no payload, a 2-parameter reducer's second
 * element is the payload type.
 */
type PayloadOf<R> = R extends (...args: infer Args) => any
  ? Args extends [any, infer P]
    ? P
    : void
  : void

/**
 * The op union derived from an `ops:` record + the plugin `name`. Each
 * op is `{ type: "${name}.${opKey}"; payload?: P }`. No hand-typed
 * literals needed anywhere in user code.
 */
export type OpOf<Name extends string, Ops extends PluginOps<any>> = {
  [K in keyof Ops & string]: PayloadOf<Ops[K]> extends void
    ? { readonly type: `${Name}.${K}` }
    : { readonly type: `${Name}.${K}`; readonly payload: PayloadOf<Ops[K]> }
}[keyof Ops & string]

/**
 * Strongly-typed keybindings record — keys are arbitrary key-name
 * strings; values must be op names defined in `ops`.
 */
export type PluginKeys<Ops extends PluginOps<any>> = Partial<Record<string, keyof Ops & string>>

/** Input passed to `definePlugin({...})`. */
export interface DefinePluginInput<Name extends string, State, Ops extends PluginOps<State>> {
  readonly name: Name
  readonly state: State
  readonly ops: Ops
  readonly keys?: PluginKeys<Ops>
}

/**
 * The plugin handle returned by `definePlugin`. A Zustand-shape store
 * enriched with metadata (`name`, `keys`) and typed op helpers.
 */
export interface DefinedPlugin<Name extends string, State, Ops extends PluginOps<State>> {
  readonly name: Name
  readonly initialState: State
  readonly keys: PluginKeys<Ops>
  readonly opNames: readonly (keyof Ops & string)[]
  getState(): State
  /** Dispatch a typed op. `type` is `${name}.${opKey}`. */
  dispatch(op: OpOf<Name, Ops>): void
  /** Dispatch by short op name. Convenience for keybindings / tests. */
  dispatchOp<K extends keyof Ops & string>(
    op: K,
    ...args: PayloadOf<Ops[K]> extends void ? [] : [payload: PayloadOf<Ops[K]>]
  ): void
  subscribe(listener: () => void): () => void
  reset(): void
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Build a plugin from a declarative `{ name, state, ops, keys? }` spec.
 *
 * The factory:
 *
 *  1. Wraps the `ops:` record into a pure `apply(op, state)` reducer
 *     (switch on `op.type`, look up `ops[opKey]`, run it).
 *  2. Creates a minimal zustand-shape store around that reducer.
 *  3. Preserves reference identity on no-op dispatches so
 *     `useSyncExternalStore` doesn't force a spurious commit.
 */
export function definePlugin<const Name extends string, State, const Ops extends PluginOps<State>>(
  spec: DefinePluginInput<Name, State, Ops>,
): DefinedPlugin<Name, State, Ops> {
  const { name, state: initial, ops, keys = {} } = spec
  const opNames = Object.keys(ops) as (keyof Ops & string)[]

  let state = initial
  const listeners = new Set<() => void>()

  const apply = (op: OpOf<Name, Ops>, s: State): State => {
    // op.type === `${name}.${opKey}` — split once.
    const dot = op.type.indexOf(".")
    const ns = op.type.slice(0, dot)
    const key = op.type.slice(dot + 1)
    if (ns !== name) return s
    const reducer = ops[key] as PluginReducer<State, unknown> | undefined
    if (!reducer) return s
    const payload = (op as { payload?: unknown }).payload
    const result = reducer(s, payload as never)
    // Tuple form [state, effects] — spike drops effects (see deferred).
    if (Array.isArray(result)) return result[0] as State
    return result as State
  }

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  return {
    name,
    initialState: initial,
    keys,
    opNames,
    getState: () => state,
    dispatch(op) {
      const next = apply(op, state)
      if (next === state) return
      state = next
      notify()
    },
    dispatchOp(opName, ...rest) {
      const type = `${name}.${opName}` as const
      const op =
        rest.length > 0
          ? ({ type, payload: rest[0] } as unknown as OpOf<Name, Ops>)
          : ({ type } as unknown as OpOf<Name, Ops>)
      this.dispatch(op)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reset() {
      state = initial
      notify()
    },
  }
}
