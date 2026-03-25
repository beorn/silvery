/**
 * Tests for @silvery/scope — structured concurrency.
 */
import { describe, test, expect } from "vitest"
import { createScope, withScope, type Scope } from "@silvery/scope"

describe("createScope", () => {
  test("creates scope with name and signal", () => {
    const scope = createScope("test")
    expect(scope.name).toBe("test")
    expect(scope.signal).toBeInstanceOf(AbortSignal)
    expect(scope.cancelled).toBe(false)
    scope[Symbol.dispose]()
  })

  test("default name is 'scope'", () => {
    const scope = createScope()
    expect(scope.name).toBe("scope")
    scope[Symbol.dispose]()
  })

  test("dispose cancels signal", () => {
    const scope = createScope()
    expect(scope.signal.aborted).toBe(false)
    scope[Symbol.dispose]()
    expect(scope.signal.aborted).toBe(true)
    expect(scope.cancelled).toBe(true)
  })

  test("dispose is idempotent", () => {
    let count = 0
    const scope = createScope()
    scope.defer(() => count++)
    scope[Symbol.dispose]()
    scope[Symbol.dispose]()
    expect(count).toBe(1)
  })

  test("defer runs cleanups in reverse order", () => {
    const order: number[] = []
    const scope = createScope()
    scope.defer(() => order.push(1))
    scope.defer(() => order.push(2))
    scope.defer(() => order.push(3))
    scope[Symbol.dispose]()
    expect(order).toEqual([3, 2, 1])
  })

  test("using syntax works", () => {
    let disposed = false
    {
      using scope = createScope()
      scope.defer(() => { disposed = true })
    }
    expect(disposed).toBe(true)
  })
})

describe("child scopes", () => {
  test("child inherits parent cancellation", () => {
    const parent = createScope("parent")
    const child = parent.child("child")
    expect(child.cancelled).toBe(false)
    parent[Symbol.dispose]()
    expect(child.cancelled).toBe(true)
  })

  test("child has default name", () => {
    const parent = createScope("app")
    const child = parent.child()
    expect(child.name).toBe("app:child")
    parent[Symbol.dispose]()
  })

  test("child disposal does not affect parent", () => {
    const parent = createScope("parent")
    const child = parent.child("child")
    child[Symbol.dispose]()
    expect(child.cancelled).toBe(true)
    expect(parent.cancelled).toBe(false)
    parent[Symbol.dispose]()
  })

  test("already-cancelled parent creates cancelled child", () => {
    const parent = createScope()
    parent[Symbol.dispose]()
    const child = parent.child()
    expect(child.cancelled).toBe(true)
  })
})

describe("sleep", () => {
  test("resolves after timeout", async () => {
    const scope = createScope()
    const start = Date.now()
    await scope.sleep(50)
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
    scope[Symbol.dispose]()
  })

  test("rejects on cancellation", async () => {
    const scope = createScope()
    const promise = scope.sleep(10000)
    scope[Symbol.dispose]()
    await expect(promise).rejects.toThrow("Scope cancelled")
  })

  test("rejects immediately if already cancelled", async () => {
    const scope = createScope()
    scope[Symbol.dispose]()
    await expect(scope.sleep(100)).rejects.toThrow("Scope cancelled")
  })
})

describe("timeout", () => {
  test("runs function after delay", async () => {
    const scope = createScope()
    let called = false
    scope.timeout(50, () => { called = true })
    await new Promise(r => setTimeout(r, 100))
    expect(called).toBe(true)
    scope[Symbol.dispose]()
  })

  test("cancel prevents execution", async () => {
    const scope = createScope()
    let called = false
    const cancel = scope.timeout(100, () => { called = true })
    cancel()
    await new Promise(r => setTimeout(r, 150))
    expect(called).toBe(false)
    scope[Symbol.dispose]()
  })

  test("scope disposal cancels pending timeouts", async () => {
    const scope = createScope()
    let called = false
    scope.timeout(100, () => { called = true })
    scope[Symbol.dispose]()
    await new Promise(r => setTimeout(r, 150))
    expect(called).toBe(false)
  })
})

describe("withScope plugin", () => {
  test("adds scope to app", () => {
    const app = {
      defer(_fn: () => void) {},
      [Symbol.dispose]() {},
    }
    const enhanced = withScope("my-app")(app)
    expect(enhanced.scope).toBeDefined()
    expect(enhanced.scope.name).toBe("my-app")
    expect(enhanced.scope.cancelled).toBe(false)
  })

  test("scope disposed when app disposes", () => {
    const deferred: (() => void)[] = []
    const app = {
      defer(fn: () => void) { deferred.push(fn) },
      [Symbol.dispose]() {
        for (const fn of deferred) fn()
      },
    }
    const enhanced = withScope()(app)
    expect(enhanced.scope.cancelled).toBe(false)
    enhanced[Symbol.dispose]()
    expect(enhanced.scope.cancelled).toBe(true)
  })

  test("preserves existing app properties", () => {
    const app = {
      customProp: 42,
      defer(_fn: () => void) {},
      [Symbol.dispose]() {},
    }
    const enhanced = withScope()(app)
    expect(enhanced.customProp).toBe(42)
    expect(enhanced.scope).toBeDefined()
  })
})
