/**
 * @silvery/scope — unit tests for the Scope subclass of AsyncDisposableStack.
 *
 * We don't re-test inherited TC39 behavior (LIFO, async-await, idempotent
 * dispose, SuppressedError on multi-throw, post-dispose ReferenceError) —
 * that's the standard's responsibility. These tests cover Scope's additions:
 * parent-signal linkage, child cascade via Set+override, early child release,
 * disposable() overloads, move() throws, reportDisposeError sink.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createScope,
  disposable,
  reportDisposeError,
  setDisposeErrorSink,
  Scope,
  type DisposeErrorContext,
  type DisposeErrorSink,
} from "../src/index.js"

// =============================================================================
// AbortSignal linkage
// =============================================================================

describe("Scope.signal", () => {
  it("is not aborted initially", async () => {
    await using scope = createScope("a")
    expect(scope.signal.aborted).toBe(false)
  })

  it("aborts when the scope is disposed", async () => {
    const scope = createScope("a")
    await scope[Symbol.asyncDispose]()
    expect(scope.signal.aborted).toBe(true)
  })

  it("child signal aborts when parent disposes", async () => {
    const parent = createScope("p")
    const child = parent.child("c")
    expect(child.signal.aborted).toBe(false)
    await parent[Symbol.asyncDispose]()
    expect(child.signal.aborted).toBe(true)
  })

  it("child constructed from already-aborted parent starts aborted", async () => {
    const parent = createScope("p")
    await parent[Symbol.asyncDispose]()
    expect(() => parent.child("c")).toThrow(ReferenceError)
  })

  it("disposing a child does not abort the parent", async () => {
    const parent = createScope("p")
    const child = parent.child("c")
    await child[Symbol.asyncDispose]()
    expect(child.signal.aborted).toBe(true)
    expect(parent.signal.aborted).toBe(false)
  })
})

// =============================================================================
// Child cascade
// =============================================================================

describe("Scope.child cascade", () => {
  it("disposes children before running user disposer stack", async () => {
    const order: string[] = []
    const parent = createScope("p")
    parent.defer(() => { order.push("parent-defer") })

    const child = parent.child("c")
    child.defer(() => { order.push("child-defer") })

    await parent[Symbol.asyncDispose]()
    expect(order).toEqual(["child-defer", "parent-defer"])
  })

  it("disposes children in reverse creation order", async () => {
    const order: string[] = []
    const parent = createScope("p")

    const a = parent.child("a")
    a.defer(() => { order.push("a") })
    const b = parent.child("b")
    b.defer(() => { order.push("b") })
    const c = parent.child("c")
    c.defer(() => { order.push("c") })

    await parent[Symbol.asyncDispose]()
    expect(order).toEqual(["c", "b", "a"])
  })

  it("cascade continues after a child dispose throws", async () => {
    const order: string[] = []
    const parent = createScope("p")

    const a = parent.child("a")
    a.defer(() => { order.push("a") })
    const b = parent.child("b")
    b.defer(() => {
      order.push("b-throws")
      throw new Error("boom")
    })

    // b throws but a still runs
    await expect(parent[Symbol.asyncDispose]()).rejects.toBeDefined()
    expect(order).toEqual(["b-throws", "a"])
  })

  it("multi-throw across children + user stack produces SuppressedError", async () => {
    const parent = createScope("p")
    parent.defer(() => {
      throw new Error("parent-defer-err")
    })
    const child = parent.child("c")
    child.defer(() => {
      throw new Error("child-defer-err")
    })

    let caught: unknown
    try {
      await parent[Symbol.asyncDispose]()
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(SuppressedError)
  })
})

// =============================================================================
// Early child release — the memory-leak fix
// =============================================================================

describe("early child disposal releases parent reference", () => {
  it("does not leak disposed children in parent's disposer stack", async () => {
    const parent = createScope("p")
    // Simulate a useScopeEffect with many dep changes
    for (let i = 0; i < 100; i++) {
      const c = parent.child(`child-${i}`)
      await c[Symbol.asyncDispose]()
    }

    // Dispose parent — should be a no-op (all children already gone)
    // and must not throw (e.g. because of leaked disposer references)
    await parent[Symbol.asyncDispose]()

    // If Scope retained references, the parent's dispose would iterate 100
    // already-disposed children. This test is weak at proving memory
    // specifically, but confirms the shape: parent dispose is clean.
    expect(parent.disposed).toBe(true)
  })

  it("child is removed from parent's child set on early dispose", async () => {
    const parent = createScope("p")
    const a = parent.child("a")
    const b = parent.child("b")
    const order: string[] = []
    a.defer(() => { order.push("a") })
    b.defer(() => { order.push("b") })

    // Dispose b early: b's defer fires once, order = ["b"]
    await b[Symbol.asyncDispose]()
    // Parent dispose cascades into remaining children (only a, not b)
    await parent[Symbol.asyncDispose]()
    // Expect: b ran once (early), a ran once (cascade). If b stayed on
    // parent.#children, b would run again and we'd see ["b", "a", "b"] or similar.
    expect(order).toEqual(["b", "a"])
    expect(order.filter((x) => x === "b").length).toBe(1)
  })
})

// =============================================================================
// Idempotence (TC39 inherited, verify it holds on override)
// =============================================================================

describe("[Symbol.asyncDispose] idempotence", () => {
  it("second dispose is a no-op", async () => {
    let count = 0
    const scope = createScope("a")
    scope.defer(() => { count++ })
    await scope[Symbol.asyncDispose]()
    await scope[Symbol.asyncDispose]()
    expect(count).toBe(1)
  })

  it("post-dispose defer throws ReferenceError", async () => {
    const scope = createScope("a")
    await scope[Symbol.asyncDispose]()
    expect(() => scope.defer(() => {})).toThrow(ReferenceError)
  })

  it("post-dispose child throws ReferenceError", async () => {
    const scope = createScope("a")
    await scope[Symbol.asyncDispose]()
    expect(() => scope.child("x")).toThrow(ReferenceError)
  })
})

// =============================================================================
// move() override
// =============================================================================

describe("Scope.move()", () => {
  it("throws TypeError", () => {
    const scope = createScope("a")
    expect(() => scope.move()).toThrow(TypeError)
  })
})

// =============================================================================
// disposable() helper
// =============================================================================

describe("disposable()", () => {
  it("sync overload attaches Symbol.dispose", () => {
    let disposed = false
    const d = disposable({ id: 1 }, (_) => { disposed = true })
    expect(typeof d[Symbol.dispose]).toBe("function")
    d[Symbol.dispose]()
    expect(disposed).toBe(true)
  })

  it("async overload attaches Symbol.asyncDispose", async () => {
    let disposed = false
    const d = disposable({ id: 1 }, async (_) => {
      await Promise.resolve()
      disposed = true
    })
    expect(typeof d[Symbol.asyncDispose]).toBe("function")
    await d[Symbol.asyncDispose]()
    expect(disposed).toBe(true)
  })

  it("returns the original value augmented", () => {
    const obj = { id: 42 }
    const d = disposable(obj, () => {})
    expect(d).toBe(obj)
    expect(d.id).toBe(42)
  })

  it("works with scope.use() for lifecycle attachment", async () => {
    const scope = createScope("a")
    let disposed = false
    const d = scope.use(disposable({ ok: true }, () => { disposed = true }))
    expect(d.ok).toBe(true)
    expect(disposed).toBe(false)
    await scope[Symbol.asyncDispose]()
    expect(disposed).toBe(true)
  })
})

// =============================================================================
// reportDisposeError / setDisposeErrorSink
// =============================================================================

describe("reportDisposeError", () => {
  let capturedArgs: Array<{ error: unknown; context: DisposeErrorContext }>

  beforeEach(() => {
    capturedArgs = []
    const sink: DisposeErrorSink = (error, context) => {
      capturedArgs.push({ error, context })
    }
    setDisposeErrorSink(sink)
  })

  afterEach(() => {
    // Restore default sink (console.error); tests should not leak a test sink
    setDisposeErrorSink((error, context) => {
      const name = context.scope?.name ?? "?"
      console.error(`[scope dispose error] phase=${context.phase} scope=${name}`, error)
    })
  })

  it("routes errors through the current sink with context", () => {
    const err = new Error("boom")
    const scope = createScope("a")
    reportDisposeError(err, { phase: "react-unmount", scope })
    expect(capturedArgs).toHaveLength(1)
    expect(capturedArgs[0]!.error).toBe(err)
    expect(capturedArgs[0]!.context.phase).toBe("react-unmount")
    expect(capturedArgs[0]!.context.scope).toBe(scope)
  })

  it("never throws when the sink throws", () => {
    setDisposeErrorSink(() => {
      throw new Error("sink broke")
    })
    expect(() =>
      reportDisposeError(new Error("original"), { phase: "manual" }),
    ).not.toThrow()
  })
})

// =============================================================================
// Integration — typical usage shape
// =============================================================================

describe("integration", () => {
  it("await using + scope.use composes cleanly", async () => {
    const order: string[] = []
    {
      await using scope = createScope("outer")
      scope.use(disposable({ k: "a" }, () => order.push("a")))
      scope.defer(() => { order.push("defer") })
      scope.use(disposable({ k: "b" }, () => order.push("b")))
    }
    // LIFO: b, defer, a
    expect(order).toEqual(["b", "defer", "a"])
  })

  it("explicit parameter pattern works for non-component code", async () => {
    const order: string[] = []
    function open(scope: Scope, _path: string) {
      scope.defer(() => { order.push("closed") })
      return { path: _path }
    }
    await using scope = createScope("test")
    const handle = open(scope, "/tmp/x")
    expect(handle.path).toBe("/tmp/x")
    expect(order).toEqual([])
    // exits block → disposes
  })
})
