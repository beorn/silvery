/**
 * @silvery/scope — Structured concurrency scopes for silvery apps.
 *
 * `Scope` is a subclass of TC39's `AsyncDisposableStack` that adds:
 * - an `AbortSignal` that aborts on disposal (and links to a parent's signal)
 * - a `child(name?)` method that creates child scopes with cascade disposal
 * - an overridden `[Symbol.asyncDispose]()` that disposes children before the
 *   inherited user disposer stack
 *
 * All disposer-stack semantics (LIFO, async-await, idempotent dispose,
 * `SuppressedError` on multi-throw, post-dispose `ReferenceError`) come
 * from `AsyncDisposableStack` directly.
 *
 * @example
 * ```ts
 * using scope = createScope("app")
 * const proc = scope.use(disposable(
 *   child_process.spawn("claude"),
 *   p => p.kill("SIGTERM"),
 * ))
 * ```
 *
 * @packageDocumentation
 */

import { _trackCreate, _trackDispose } from "./trace.js"
import {
  adoptHandle as _adoptHandle,
  type RegistrableHandle,
} from "./handle.js"

// =============================================================================
// Scope
// =============================================================================

export class Scope extends AsyncDisposableStack {
  readonly signal: AbortSignal
  readonly name?: string
  readonly #children = new Set<Scope>()
  readonly #parent?: Scope

  constructor(parent?: Scope, name?: string) {
    super()
    this.name = name
    this.#parent = parent
    _trackCreate(this, "scope", name)

    const controller = new AbortController()
    this.signal = controller.signal
    this.defer(() => controller.abort())

    if (parent) {
      if (parent.disposed) {
        throw new ReferenceError("Cannot create child of disposed scope")
      }
      if (parent.signal.aborted) {
        controller.abort()
      } else {
        const onAbort = () => controller.abort()
        parent.signal.addEventListener("abort", onAbort, { once: true })
        this.defer(() => parent.signal.removeEventListener("abort", onAbort))
      }
      parent.#children.add(this)
    }
  }

  /** Create a child scope. Child's signal aborts when this scope's signal does. */
  child(name?: string): Scope {
    return new Scope(this, name)
  }

  /**
   * Adopt an opaque {@link Handle} (from `defineHandle()`) into this scope's
   * ownership registry. The handle is added to the inherited disposer stack
   * (LIFO disposal) and tracked separately so {@link assertScopeBalance}
   * can detect leaked handles per-scope without depending on global GC.
   *
   * See `./handle.ts` for the brand-+-registry pattern.
   */
  adoptHandle(handle: RegistrableHandle): void {
    _adoptHandle(this, handle)
  }

  /**
   * Dispose children first, then the inherited user disposer stack.
   * Collects errors across the tree and surfaces them as `SuppressedError`.
   */
  override async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return
    const errors: unknown[] = []

    // 1. Dispose children first, most-recent first
    const children = [...this.#children].reverse()
    this.#children.clear()
    for (const c of children) {
      try {
        await c[Symbol.asyncDispose]()
      } catch (e) {
        errors.push(e)
      }
    }

    // 2. Inherited user disposer stack (LIFO over defer + use + adopt)
    try {
      await super[Symbol.asyncDispose]()
    } catch (e) {
      errors.push(e)
    }

    // 3. Remove self from parent so early disposal releases the reference
    if (this.#parent) this.#parent.#children.delete(this)

    _trackDispose(this)

    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) {
      throw errors.reduce(
        (suppressed, e) => new SuppressedError(e, suppressed, "multiple dispose errors"),
      )
    }
  }

  /**
   * `AsyncDisposableStack.move()` returns a plain stack that loses Scope's
   * `signal`, `name`, and child registry. Throw rather than silently
   * corrupting invariants. Create a new scope and re-register resources
   * explicitly if you need to relocate ownership.
   */
  override move(): never {
    throw new TypeError(
      "Scope.move() is not supported — create a new scope and re-register resources explicitly",
    )
  }
}

// =============================================================================
// Factories
// =============================================================================

/** Create a root scope. Use `scope.child(name?)` for descendants. */
export function createScope(name?: string): Scope {
  return new Scope(undefined, name)
}

/**
 * Wrap a value with a `Symbol.dispose` / `Symbol.asyncDispose` so it can be
 * passed to `scope.use(...)`. Both sync and async disposers supported.
 *
 * @example
 * ```ts
 * const proc = scope.use(disposable(child_process.spawn("claude"), p => p.kill()))
 * ```
 */
// Async overload listed first: TS overload resolution picks the first matching
// signature, and async functions (returning Promise<void>) match this one but
// not the sync `() => void` below.
export function disposable<T extends object>(
  value: T,
  dispose: (v: T) => Promise<void>,
): T & AsyncDisposable
export function disposable<T extends object>(value: T, dispose: (v: T) => void): T & Disposable
export function disposable(value: object, dispose: (v: object) => void | Promise<void>): object {
  _trackCreate(value, "disposable")
  // Attach both symbol methods so either `using` or `await using` works.
  // The caller's overload selects the static type; runtime accepts both.
  return Object.assign(value, {
    [Symbol.dispose]() {
      _trackDispose(value)
      void dispose(value)
    },
    [Symbol.asyncDispose]() {
      _trackDispose(value)
      return Promise.resolve(dispose(value))
    },
  })
}

// =============================================================================
// Error reporting
// =============================================================================

/** Context passed to `reportDisposeError`. */
export interface DisposeErrorContext {
  /** Where the fire-and-forget disposal originated. */
  readonly phase: "react-unmount" | "signal" | "app-exit" | "manual"
  /** The scope that was being disposed, if known. */
  readonly scope?: Scope
}

export type DisposeErrorSink = (error: unknown, context: DisposeErrorContext) => void

let currentSink: DisposeErrorSink = (error, context) => {
  const name = context.scope?.name ?? "?"
  console.error(`[scope dispose error] phase=${context.phase} scope=${name}`, error)
}

/**
 * Report a disposal failure from a fire-and-forget context (React unmount,
 * signal handler, app-exit hook). Best-effort; never throws.
 */
export function reportDisposeError(error: unknown, context: DisposeErrorContext): void {
  try {
    currentSink(error, context)
  } catch {
    // sink must never throw — swallow to keep the teardown path alive
  }
}

/** Override the global disposal-error sink (e.g. fail-fast in tests). */
export function setDisposeErrorSink(sink: DisposeErrorSink): void {
  currentSink = sink
}

// =============================================================================
// withScope plugin (host-level wiring)
// =============================================================================

/**
 * Minimal duck-typed shape `withScope` looks for to auto-wire host
 * cancellation. Matches `term.signals.on(signal, fn)`, whose return value
 * is both `Disposable` and `AsyncDisposable` so it can be registered
 * directly with `Scope.use(...)`. Kept as a structural type so
 * `@silvery/scope` doesn't have to depend on `@silvery/ag-term`.
 */
interface CancelSignalSource {
  on(signal: "SIGINT" | "SIGTERM", fn: () => void): Disposable & AsyncDisposable
}

interface WithScopeAppShape {
  defer(fn: () => void): void
  /** Optional — when present (e.g. composed after `withTerminal`),
   *  withScope auto-wires SIGINT/SIGTERM to root-scope dispose. */
  term?: { signals?: CancelSignalSource }
}

/**
 * Plugin that adds a root scope to the app. The scope is disposed when the
 * app exits. If the app already has a `term.signals` source (i.e. composed
 * after `withTerminal`), SIGINT and SIGTERM also start root disposal —
 * disposal failures flow through `reportDisposeError({ phase: "signal" })`.
 *
 * Web-host cancellation (`pagehide` / `beforeunload`) lives in the web
 * runtime, not here.
 */
export function withScope(name?: string) {
  return <A extends WithScopeAppShape>(app: A) => {
    const scope = createScope(name ?? "app")

    const sigSrc = app.term?.signals
    if (sigSrc) {
      const onSignal = () => {
        scope[Symbol.asyncDispose]().catch((error) =>
          reportDisposeError(error, { phase: "signal", scope }),
        )
      }
      scope.use(sigSrc.on("SIGINT", onSignal))
      scope.use(sigSrc.on("SIGTERM", onSignal))
    }

    app.defer(() => {
      scope[Symbol.asyncDispose]().catch((error) =>
        reportDisposeError(error, { phase: "app-exit", scope }),
      )
    })
    return { ...app, scope } as A & { readonly scope: Scope }
  }
}

// =============================================================================
// Handle re-exports — opaque branded handles + per-scope ownership registry
// =============================================================================

export {
  defineHandle,
  type Handle,
  type RegistrableHandle,
  type LeakedHandle,
  LeakedHandlesError,
  getAdoptedHandles,
  getHandleKind,
  assertScopeBalance,
} from "./handle.js"
