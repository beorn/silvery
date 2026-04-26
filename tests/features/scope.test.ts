/**
 * @silvery/scope — outer-surface smoke tests.
 *
 * Verifies the published `@silvery/scope` package barrel resolves and the
 * core entry points (`createScope`, `withScope`, `Scope`, `disposable`,
 * `reportDisposeError`) work end-to-end via the package import path.
 *
 * Comprehensive coverage of cascade, idempotence, multi-throw aggregation,
 * disposable() overloads, error sink, and SIGINT/SIGTERM wiring lives in
 * `packages/scope/tests/scope.test.ts`. This file guards against barrel /
 * exports drift — if the package's `exports` map regresses, this file fails
 * before the internal suite is even reached.
 */

import { describe, expect, test } from "vitest"
import {
  createScope,
  disposable,
  reportDisposeError,
  Scope,
  setDisposeErrorSink,
  withScope,
} from "@silvery/scope"

// =============================================================================
// createScope — public surface
// =============================================================================

describe("createScope (public surface)", () => {
  test("returns a Scope with name + AbortSignal + defer", async () => {
    const scope = createScope("test")
    expect(scope).toBeInstanceOf(Scope)
    expect(scope.name).toBe("test")
    expect(scope.signal).toBeInstanceOf(AbortSignal)
    expect(scope.signal.aborted).toBe(false)
    await scope[Symbol.asyncDispose]()
  })

  test("defaults name to undefined when omitted", async () => {
    const scope = createScope()
    expect(scope.name).toBeUndefined()
    await scope[Symbol.asyncDispose]()
  })

  test("asyncDispose aborts the signal", async () => {
    const scope = createScope()
    expect(scope.signal.aborted).toBe(false)
    await scope[Symbol.asyncDispose]()
    expect(scope.signal.aborted).toBe(true)
  })

  test("asyncDispose is idempotent (runs deferred work once)", async () => {
    let count = 0
    const scope = createScope()
    scope.defer(() => {
      count++
    })
    await scope[Symbol.asyncDispose]()
    await scope[Symbol.asyncDispose]()
    expect(count).toBe(1)
  })

  test("defer runs cleanups in LIFO order", async () => {
    const order: number[] = []
    const scope = createScope()
    scope.defer(() => {
      order.push(1)
    })
    scope.defer(() => {
      order.push(2)
    })
    scope.defer(() => {
      order.push(3)
    })
    await scope[Symbol.asyncDispose]()
    expect(order).toEqual([3, 2, 1])
  })

  test("await using syntax disposes on block exit", async () => {
    let disposed = false
    {
      await using scope = createScope()
      scope.defer(() => {
        disposed = true
      })
    }
    expect(disposed).toBe(true)
  })
})

// =============================================================================
// child scopes — public surface
// =============================================================================

describe("child scopes (public surface)", () => {
  test("child signal aborts when parent disposes", async () => {
    const parent = createScope("parent")
    const child = parent.child("child")
    expect(child.signal.aborted).toBe(false)
    await parent[Symbol.asyncDispose]()
    expect(child.signal.aborted).toBe(true)
  })

  test("child stores its own name verbatim", async () => {
    const parent = createScope("app")
    const child = parent.child("child")
    expect(child.name).toBe("child")
    await parent[Symbol.asyncDispose]()
  })

  test("child disposal does not abort the parent", async () => {
    const parent = createScope("parent")
    const child = parent.child("child")
    await child[Symbol.asyncDispose]()
    expect(child.signal.aborted).toBe(true)
    expect(parent.signal.aborted).toBe(false)
    await parent[Symbol.asyncDispose]()
  })

  test("creating a child of an already-disposed parent throws ReferenceError", async () => {
    const parent = createScope()
    await parent[Symbol.asyncDispose]()
    expect(() => parent.child()).toThrow(ReferenceError)
  })
})

// =============================================================================
// disposable() helper — public surface
// =============================================================================

describe("disposable() (public surface)", () => {
  test("sync overload attaches Symbol.dispose", () => {
    let disposed = false
    using d = disposable({ id: 1 }, () => {
      disposed = true
    })
    expect(d.id).toBe(1)
    void d
    expect(disposed).toBe(false)
    // exits block → disposes
  })

  test("registers cleanly with scope.use()", async () => {
    let disposed = false
    const scope = createScope()
    scope.use(
      disposable({ ok: true }, () => {
        disposed = true
      }),
    )
    await scope[Symbol.asyncDispose]()
    expect(disposed).toBe(true)
  })
})

// =============================================================================
// reportDisposeError — public surface
// =============================================================================

describe("reportDisposeError (public surface)", () => {
  test("routes errors through the configured sink", () => {
    const captured: Array<{ error: unknown; phase: string }> = []
    setDisposeErrorSink((error, context) => {
      captured.push({ error, phase: context.phase })
    })
    try {
      const err = new Error("boom")
      const scope = createScope("a")
      reportDisposeError(err, { phase: "react-unmount", scope })
      expect(captured).toHaveLength(1)
      expect(captured[0]!.error).toBe(err)
      expect(captured[0]!.phase).toBe("react-unmount")
    } finally {
      // Restore default to avoid leaking the test sink across files.
      setDisposeErrorSink((error, context) => {
        const name = context.scope?.name ?? "?"
        console.error(`[scope dispose error] phase=${context.phase} scope=${name}`, error)
      })
    }
  })
})

// =============================================================================
// withScope plugin — public surface
// =============================================================================

type FakeApp = {
  defer(fn: () => void | Promise<void>): void
  flushDefer(): Promise<void>
}

function createFakeApp(): FakeApp {
  const deferred: Array<() => void | Promise<void>> = []
  return {
    defer(fn) {
      deferred.push(fn)
    },
    async flushDefer() {
      for (const fn of deferred.reverse()) await fn()
    },
  }
}

describe("withScope (public surface)", () => {
  test("attaches a Scope to the app", () => {
    const app = withScope("my-app")(createFakeApp())
    expect(app.scope).toBeInstanceOf(Scope)
    expect(app.scope.name).toBe("my-app")
    expect(app.scope.signal.aborted).toBe(false)
  })

  test("scope is disposed when the app's defer queue runs", async () => {
    const app = withScope()(createFakeApp())
    let disposed = false
    app.scope.defer(() => {
      disposed = true
    })
    expect(app.scope.signal.aborted).toBe(false)
    await app.flushDefer()
    // app-exit dispose is fire-and-forget — yield once for the microtask
    await new Promise((r) => setTimeout(r, 0))
    expect(disposed).toBe(true)
    expect(app.scope.signal.aborted).toBe(true)
  })

  test("preserves existing app properties on the enhanced object", () => {
    const base = createFakeApp()
    const enhanced = withScope()(Object.assign(base, { customProp: 42 }))
    expect(enhanced.customProp).toBe(42)
    expect(enhanced.scope).toBeInstanceOf(Scope)
  })
})
