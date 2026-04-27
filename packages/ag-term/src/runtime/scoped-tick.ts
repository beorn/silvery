/**
 * scoped-tick.ts — first consumer of the C1 / Phase 1 handle pattern.
 *
 * `createScopedTick(scope, intervalMs)` returns an opaque `TickHandle`
 * (defined via `@silvery/scope`'s `defineHandle()` brand) and is registered
 * into `scope` so it auto-disposes when the scope closes. Per-scope handle
 * accounting catches the case where the consumer holds the handle past its
 * intended lifetime — `assertScopeBalance(scope)` flags it as a leak.
 *
 * Why this exists alongside `createTick(intervalMs, signal?)`:
 *
 *   - `createTick` takes an optional `AbortSignal` and a caller can forget
 *     to wire it; the resulting tick source leaks the underlying setTimeout
 *     until process exit.
 *   - `createScopedTick` requires a `Scope` token at the type level. The
 *     brand symbol on `TickHandle` cannot be forged outside this module,
 *     so `new` constructions or hand-rolled value-shapes don't compile.
 *   - The handle is registered into `scope` via `scope.adoptHandle(...)`,
 *     so `assertScopeBalance(scope)` inventories any forgotten ticks.
 *
 * The legacy `createTick` is kept as `@deprecated` until Phase 2 migrates
 * the remaining call sites (the public API has zero internal consumers in
 * silvery today; deprecation is a soft signal for downstream apps).
 *
 * Type-level prevention proof (verified 2026-04-26): the following
 * forge attempts fail `tsc --noEmit` with TS2322 — the `unique symbol`
 * brand on `Handle<typeof Tick.brand>` cannot be produced outside this
 * module, so the only path to a `TickHandle` value is `createScopedTick`.
 *
 *   // function forgeReturn(): TickHandle {
 *   //   return {
 *   //     iterable: ...,
 *   //     emitted: () => 0,
 *   //     [Symbol.asyncDispose]: async () => {},
 *   //   } // ← TS2322: missing the unique-symbol brand
 *   // }
 *   //
 *   // const fake: TickHandle = { ... } // ← same TS2322
 *
 * Re-verify by pasting the snippets into a sibling `*-tcheck.ts` file
 * and running `npx tsc --noEmit`.
 *
 * @packageDocumentation
 */

import { defineHandle, type Handle, type Scope } from "@silvery/scope"

// =============================================================================
// Brand — module-private. Cannot be forged outside this file.
// =============================================================================

const Tick = defineHandle("Tick")

/**
 * Opaque handle for a scoped tick source. Treat as opaque outside this
 * module — callers can iterate via {@link tickIterable} and read
 * {@link tickCount}, but cannot construct a `TickHandle` value.
 *
 * Disposal is automatic on scope close; manual `await using` works too.
 */
export type TickHandle = Handle<typeof Tick.brand> & {
  /** Async-iterate emitted tick numbers (0, 1, 2, …). */
  readonly iterable: AsyncIterable<number>
  /** Snapshot the count of ticks emitted so far (for diagnostics). */
  readonly emitted: () => number
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a scope-owned tick source.
 *
 * @param scope The scope that owns the tick's lifetime. When the scope
 *              disposes (or `[Symbol.asyncDispose]()` is called manually),
 *              the underlying `setTimeout` is cancelled and any pending
 *              iterator settles with `done: true`.
 * @param intervalMs Interval between ticks in milliseconds.
 *
 * @example
 * ```ts
 * await using scope = createScope("anim")
 * const tick = createScopedTick(scope, 16) // ~60fps frame tick
 * for await (const n of tick.iterable) {
 *   if (n >= 60) break
 * }
 * ```
 */
export function createScopedTick(scope: Scope, intervalMs: number): TickHandle {
  let count = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: ((r: IteratorResult<number>) => void) | undefined
  let stopped = false

  function stop() {
    if (stopped) return
    stopped = true
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (pending) {
      pending({ done: true, value: undefined })
      pending = undefined
    }
  }

  // Dispose on scope abort (parent abort cascades naturally via Scope.signal).
  // We register *before* adopting the handle so the listener reference is
  // available; the scope's disposer stack handles cleanup ordering.
  if (scope.signal.aborted) {
    stopped = true
  } else {
    const onAbort = () => stop()
    scope.signal.addEventListener("abort", onAbort, { once: true })
    scope.defer(() => scope.signal.removeEventListener("abort", onAbort))
  }

  const iterable: AsyncIterable<number> = {
    [Symbol.asyncIterator](): AsyncIterator<number> {
      return {
        next(): Promise<IteratorResult<number>> {
          if (stopped) return Promise.resolve({ done: true, value: undefined })
          return new Promise<IteratorResult<number>>((resolve) => {
            pending = resolve
            timer = setTimeout(() => {
              if (stopped) {
                resolve({ done: true, value: undefined })
                return
              }
              const value = count++
              pending = undefined
              resolve({ done: false, value })
            }, intervalMs)
          })
        },
        return(): Promise<IteratorResult<number>> {
          stop()
          return Promise.resolve({ done: true, value: undefined })
        },
      }
    },
  }

  // Internal storage — readable through accessor closures, never the brand.
  const internal = { iterable, emitted: () => count }

  // Brand the handle. The `Tick.create()` call is the only path that can
  // produce a value of type `Handle<typeof Tick.brand>` — outside this
  // module, the brand is `unique symbol`-typed and cannot be forged.
  const handle = Tick.create(internal, () => stop()) as TickHandle
  // Augment the opaque value with the public accessor surface. These are
  // safe to expose because they're plain getters, not constructors.
  Object.assign(handle, internal)

  scope.adoptHandle(handle)
  return handle
}
