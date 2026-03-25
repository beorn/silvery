/**
 * @silvery/scope — Structured concurrency scopes.
 *
 * A scope unifies cancellation (AbortSignal), cleanup (defer), hierarchy (child),
 * and timed operations (sleep, timeout) into one composable primitive.
 *
 * @example
 * ```ts
 * using scope = createScope("app")
 * const child = scope.child("fetch")
 * child.defer(() => cleanup())
 * await child.sleep(100)
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export interface Scope extends Disposable {
  /** Scope name (for debugging/tracing) */
  readonly name: string
  /** AbortSignal — cancelled when scope is disposed */
  readonly signal: AbortSignal
  /** Whether this scope has been cancelled/disposed */
  readonly cancelled: boolean
  /** Register cleanup (called in reverse order on dispose) */
  defer(fn: () => void): void
  /** Create a child scope (disposed when parent disposes) */
  child(name?: string): Scope
  /** Sleep for ms, respecting cancellation */
  sleep(ms: number): Promise<void>
  /** Run fn after ms, respecting cancellation. Returns cancel function. */
  timeout(ms: number, fn: () => void): () => void
}

// =============================================================================
// Factory
// =============================================================================

export function createScope(name?: string, parent?: Scope): Scope {
  let cancelled = false
  const disposables: (() => void)[] = []
  const ac = new AbortController()

  // Link to parent signal if provided
  if (parent?.signal) {
    if (parent.signal.aborted) {
      ac.abort()
      cancelled = true
    } else {
      const onAbort = () => scope[Symbol.dispose]()
      parent.signal.addEventListener("abort", onAbort, { once: true })
      disposables.push(() => parent.signal.removeEventListener("abort", onAbort))
    }
  }

  const scope: Scope = {
    name: name ?? "scope",

    get signal() {
      return ac.signal
    },

    get cancelled() {
      return cancelled
    },

    defer(fn: () => void) {
      if (cancelled) return // Already disposed — don't accumulate
      disposables.push(fn)
    },

    child(childName?: string) {
      const child = createScope(childName ?? `${scope.name}:child`, scope)
      // Auto-dispose child when parent disposes
      disposables.push(() => child[Symbol.dispose]())
      return child
    },

    sleep(ms: number): Promise<void> {
      return new Promise((resolve, reject) => {
        if (cancelled) {
          reject(new DOMException("Scope cancelled", "AbortError"))
          return
        }
        const timer = setTimeout(resolve, ms)
        const onAbort = () => {
          clearTimeout(timer)
          reject(new DOMException("Scope cancelled", "AbortError"))
        }
        ac.signal.addEventListener("abort", onAbort, { once: true })
      })
    },

    timeout(ms: number, fn: () => void): () => void {
      if (cancelled) return () => {}
      const timer = setTimeout(() => {
        if (!cancelled) fn()
      }, ms)
      const cancel = () => clearTimeout(timer)
      disposables.push(cancel)
      return cancel
    },

    [Symbol.dispose]() {
      if (cancelled) return
      cancelled = true
      ac.abort()
      // Run cleanups in reverse order
      for (let i = disposables.length - 1; i >= 0; i--) {
        try {
          disposables[i]!()
        } catch {
          // Swallow cleanup errors — scope is being torn down
        }
      }
      disposables.length = 0
    },
  }

  return scope
}

// =============================================================================
// withScope plugin
// =============================================================================

/**
 * Plugin that adds a root scope to the app.
 * The scope is disposed when the app is disposed.
 */
export function withScope(name?: string) {
  return <A extends { defer(fn: () => void): void; [Symbol.dispose](): void }>(app: A) => {
    const scope = createScope(name ?? "app")
    app.defer(() => scope[Symbol.dispose]())
    return { ...app, scope } as A & { readonly scope: Scope }
  }
}
