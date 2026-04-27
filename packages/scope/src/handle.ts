/**
 * @silvery/scope/handle — opaque branded handles + per-scope ownership accounting.
 *
 * The `disposable()` + `scope.use()` pattern from `@silvery/scope` ensures
 * resources have a teardown path. It does NOT prevent callers from
 * constructing the resource without ever registering it. A misplaced
 * `new MyHandle()` outside the factory leaks silently; only a memory canary
 * over a long horizon detects it.
 *
 * `Handle<Brand>` closes that gap by separating two concerns:
 *
 * 1. **Type-level prevention.** A `Handle<Brand>` cannot be constructed
 *    outside its factory module — the brand carries a `unique symbol` that
 *    only the factory can produce. Callers receive opaque values.
 *
 * 2. **Per-scope accounting.** Every `Handle<Brand>` is registered into the
 *    scope that owns it via `scope.adoptHandle(handle)`. On scope close, an
 *    assertion verifies that every adopted handle has been disposed.
 *    Unlike memory canaries, accounting is deterministic and per-scope —
 *    ambient handles in unrelated scopes can't cause flakes.
 *
 * Usage from a factory module:
 *
 * ```ts
 * // packages/foo/src/widget.ts
 * import { type Scope, defineHandle } from "@silvery/scope"
 *
 * const Widget = defineHandle("Widget")
 * export type WidgetHandle = ReturnType<typeof Widget.create>
 *
 * export function createWidget(scope: Scope): WidgetHandle {
 *   const impl = { ... }
 *   const handle = Widget.create(impl, () => impl.close())
 *   scope.adoptHandle(handle)
 *   return handle
 * }
 * ```
 *
 * Outside the factory module, `WidgetHandle` is opaque. Callers receive it,
 * pass it around, and it disposes when the scope it was adopted into closes.
 *
 * @packageDocumentation
 */

import type { Scope } from "./index.js"

// =============================================================================
// Brand primitive
// =============================================================================

/**
 * Phantom brand used to make `Handle<B>` distinct per resource kind.
 * The brand is a `unique symbol` known only to its `defineHandle()` call,
 * so other modules cannot forge a value of the same type.
 */
declare const handleBrand: unique symbol

/**
 * Opaque branded handle. The runtime shape is `Disposable | AsyncDisposable`
 * plus a brand symbol. The brand is non-enumerable and `unique symbol`-typed
 * so external modules cannot construct it.
 *
 * Treat as opaque: read no fields, only pass to functions that accept
 * `Handle<B>` and to `scope.adoptHandle(...)`.
 */
export interface Handle<B extends symbol> extends AsyncDisposable {
  readonly [handleBrand]: B
}

// =============================================================================
// Handle definition
// =============================================================================

/**
 * Brand a handle factory. Returns an object with a `create(impl, dispose)`
 * method that produces opaque `Handle<Brand>` values.
 *
 * The returned brand is module-private — only the file that called
 * `defineHandle("Foo")` can construct `Handle<typeof Foo.brand>` values.
 * Other modules can refer to the type (via `ReturnType<typeof Foo.create>`)
 * but cannot forge values.
 *
 * @param kind Human-readable label for diagnostics (leak reports, traces).
 *
 * @example
 * ```ts
 * const Tick = defineHandle("Tick")
 * export type TickHandle = ReturnType<typeof Tick.create>
 *
 * export function createScopedTick(scope: Scope, intervalMs: number): TickHandle {
 *   const id = setTimeout(...)
 *   const handle = Tick.create({ id }, () => clearTimeout(id))
 *   scope.adoptHandle(handle)
 *   return handle
 * }
 * ```
 */
export function defineHandle<K extends string>(kind: K) {
  // The unique-symbol brand. `as unique symbol` cast is the published TS
  // pattern for a runtime symbol that the type system treats as nominally
  // distinct per call site.
  const brand = Symbol(`silvery.handle:${kind}`) as unknown as { readonly _kind: K } & symbol
  type Brand = typeof brand

  return {
    /** Diagnostic label for this handle kind. */
    kind,
    /** Internal — exposed for advanced patterns; do not rely on identity. */
    brand,
    /**
     * Create an opaque handle that wraps `value` with `dispose` cleanup.
     * The returned value is `Handle<Brand>` — opaque outside this module.
     */
    create(value: object, dispose: (() => void) | (() => Promise<void>)): Handle<Brand> {
      const handle = Object.create(null) as Record<PropertyKey, unknown>
      handle["__silvery_handle_kind"] = kind
      handle["__silvery_handle_value"] = value
      Object.defineProperty(handle, brand, {
        value: brand,
        enumerable: false,
        writable: false,
        configurable: false,
      })
      handle[Symbol.asyncDispose] = async () => {
        await dispose()
      }
      // Allow sync `using` too — same dispose, fire-and-forget if async.
      handle[Symbol.dispose] = () => {
        void dispose()
      }
      return handle as unknown as Handle<Brand>
    },
  }
}

// =============================================================================
// Per-scope ownership registry
// =============================================================================

/**
 * Internal — readable shape used by `Scope.adoptHandle()` to register handles
 * without depending on `Handle<B>`'s opaque type. Anything with a kind tag
 * + the dispose symbols qualifies.
 */
export interface RegistrableHandle {
  readonly [Symbol.asyncDispose]: () => Promise<void>
}

/** Read the kind label off a handle. Returns `"unknown"` if not branded. */
export function getHandleKind(handle: object): string {
  const kind = (handle as Record<string, unknown>)["__silvery_handle_kind"]
  return typeof kind === "string" ? kind : "unknown"
}

/**
 * Diagnostic info about a leaked handle. Surfaced via `LeakedHandlesError`
 * when scope close detects unbalanced accounting.
 */
export interface LeakedHandle {
  readonly kind: string
  readonly createdAt?: string
}

/**
 * Thrown by `scope[Symbol.asyncDispose]()` when handles adopted into the
 * scope were not disposed before close. Carries the leak inventory so
 * callers / tests can assert on which kinds leaked and how many.
 */
export class LeakedHandlesError extends Error {
  readonly leaks: readonly LeakedHandle[]
  readonly scopeName?: string

  constructor(leaks: readonly LeakedHandle[], scopeName?: string) {
    const counts = new Map<string, number>()
    for (const leak of leaks) {
      counts.set(leak.kind, (counts.get(leak.kind) ?? 0) + 1)
    }
    const summary = [...counts.entries()].map(([k, n]) => `${k}×${n}`).join(", ")
    super(
      `Scope${scopeName ? `(${scopeName})` : ""} closed with ${leaks.length} undisposed handle(s): ${summary}`,
    )
    this.name = "LeakedHandlesError"
    this.leaks = leaks
    this.scopeName = scopeName
  }
}

// =============================================================================
// Scope augmentation
// =============================================================================

/**
 * Per-scope handle accounting. Stored in a `WeakMap` keyed by `Scope`
 * instance so we don't have to modify the Scope class signature for the
 * minimum-invasive Phase 1 prototype. Phase 2 will move this into Scope
 * proper once the pattern proves out.
 */
const ownedHandles = new WeakMap<Scope, Set<RegistrableHandle>>()
const handleOrigins = new WeakMap<RegistrableHandle, string>()

/**
 * Adopt a `Handle` into the given scope's ownership registry. The handle
 * is registered with `scope.use(...)` for LIFO disposal, and tracked
 * separately so `assertScopeBalance(scope)` can detect leaks.
 *
 * Idempotent: adopting the same handle twice into the same scope is a
 * no-op. Adopting into two different scopes is rejected (would cause
 * double-dispose).
 */
export function adoptHandle(scope: Scope, handle: RegistrableHandle): void {
  if (scope.disposed) {
    throw new ReferenceError("Cannot adopt handle into a disposed scope")
  }

  let owned = ownedHandles.get(scope)
  if (!owned) {
    owned = new Set()
    ownedHandles.set(scope, owned)
  }

  // Prevent cross-scope adoption — two owners would double-dispose.
  if (handleOrigins.has(handle) && !owned.has(handle)) {
    throw new TypeError(
      `Handle already owned by another scope; create a new handle for this scope instead`,
    )
  }

  if (owned.has(handle)) return // idempotent

  owned.add(handle)
  // Record an approximate creation site for leak diagnostics. Keep cheap —
  // only the top frames matter, and tests typically have one suspect call.
  handleOrigins.set(handle, captureCreationStack())

  // Use the Scope's inherited disposer stack for actual teardown; on dispose
  // we remove from the registry so accounting balances.
  scope.use({
    [Symbol.asyncDispose]: async () => {
      try {
        await handle[Symbol.asyncDispose]()
      } finally {
        owned.delete(handle)
      }
    },
  })
}

/**
 * Snapshot the current set of handles still adopted into this scope.
 * Empty when the scope was never used or all handles are disposed.
 *
 * Useful for in-test assertions that don't want to trigger scope close.
 */
export function getAdoptedHandles(scope: Scope): readonly LeakedHandle[] {
  const owned = ownedHandles.get(scope)
  if (!owned || owned.size === 0) return []
  const result: LeakedHandle[] = []
  for (const h of owned) {
    result.push({
      kind: getHandleKind(h as object),
      createdAt: handleOrigins.get(h),
    })
  }
  return result
}

/**
 * Throw `LeakedHandlesError` if any handles adopted into `scope` remain
 * undisposed. Called by `assertScopeBalance(scope)` after the scope's
 * own dispose path runs.
 *
 * Splitting the assertion from `Scope[Symbol.asyncDispose]` keeps Phase 1
 * non-invasive — Phase 2 wires this into the override directly.
 */
export function assertScopeBalance(scope: Scope): void {
  const leaks = getAdoptedHandles(scope)
  if (leaks.length === 0) return
  throw new LeakedHandlesError(leaks, scope.name)
}

// =============================================================================
// Helpers
// =============================================================================

function captureCreationStack(): string {
  const stack = new Error("(handle adoption)").stack ?? ""
  // Strip the first two frames (this function + adoptHandle) for readability.
  // Splitting on \n keeps the original formatting intact.
  const lines = stack.split("\n")
  return lines.slice(3).join("\n")
}
