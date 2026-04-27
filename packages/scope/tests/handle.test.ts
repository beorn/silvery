/**
 * @silvery/scope/handle — opaque branded handles + per-scope ownership accounting.
 *
 * These tests pin the C1 / Phase 1 invariants of `km-silvery.scope-resource-ownership`:
 *
 *   1. `defineHandle()` produces opaque values that pass through `scope.adoptHandle()`.
 *   2. Adopted handles dispose in LIFO order with the rest of the scope.
 *   3. Scope close + `assertScopeBalance()` detects undisposed handles for
 *      *that* scope only — ambient handles in unrelated scopes don't trigger.
 *   4. Cross-scope adoption is rejected (no double-dispose).
 *   5. Adopting into a disposed scope throws.
 *   6. The leak inventory carries kind labels so diagnostics name leaked classes.
 */

import { describe, expect, it } from "vitest"

import {
  assertScopeBalance,
  createScope,
  defineHandle,
  getAdoptedHandles,
  LeakedHandlesError,
} from "../src/index.js"

// =============================================================================
// Test fixtures — module-private brands per the canonical pattern
// =============================================================================

// Two brands so tests can prove kinds are distinct in diagnostics.
const Widget = defineHandle("Widget")
const Gadget = defineHandle("Gadget")

function makeWidget(): { handle: ReturnType<typeof Widget.create>; disposed: { value: boolean } } {
  const disposed = { value: false }
  const handle = Widget.create({}, () => {
    disposed.value = true
  })
  return { handle, disposed }
}

function makeGadget(): { handle: ReturnType<typeof Gadget.create>; disposed: { value: boolean } } {
  const disposed = { value: false }
  const handle = Gadget.create({}, () => {
    disposed.value = true
  })
  return { handle, disposed }
}

// =============================================================================
// Adoption + LIFO disposal
// =============================================================================

describe("scope.adoptHandle", () => {
  it("dispatches the handle's dispose on scope close", async () => {
    const w = makeWidget()
    const scope = createScope("t1")
    scope.adoptHandle(w.handle)
    expect(w.disposed.value).toBe(false)
    await scope[Symbol.asyncDispose]()
    expect(w.disposed.value).toBe(true)
  })

  it("disposes adopted handles in LIFO order (matches inherited stack semantics)", async () => {
    const order: string[] = []
    const scope = createScope("t2")

    const a = Widget.create({}, () => void order.push("a"))
    const b = Widget.create({}, () => void order.push("b"))
    const c = Widget.create({}, () => void order.push("c"))

    scope.adoptHandle(a)
    scope.adoptHandle(b)
    scope.adoptHandle(c)

    await scope[Symbol.asyncDispose]()
    expect(order).toEqual(["c", "b", "a"])
  })

  it("is idempotent within the same scope", async () => {
    const w = makeWidget()
    const scope = createScope("t3")
    scope.adoptHandle(w.handle)
    scope.adoptHandle(w.handle) // no-op
    await scope[Symbol.asyncDispose]()
    expect(w.disposed.value).toBe(true)
  })

  it("rejects cross-scope adoption (would cause double-dispose)", () => {
    const { handle } = makeWidget()
    const scopeA = createScope("a")
    const scopeB = createScope("b")
    scopeA.adoptHandle(handle)
    expect(() => scopeB.adoptHandle(handle)).toThrow(/already owned/)
  })

  it("throws when adopting into a disposed scope", async () => {
    const scope = createScope("disposed")
    await scope[Symbol.asyncDispose]()
    const { handle } = makeWidget()
    expect(() => scope.adoptHandle(handle)).toThrow(/disposed scope/)
  })
})

// =============================================================================
// Per-scope balance assertion (the C1 leak detector)
// =============================================================================

describe("assertScopeBalance", () => {
  it("does nothing when every adopted handle was disposed by scope close", async () => {
    const w = makeWidget()
    const scope = createScope("balanced")
    scope.adoptHandle(w.handle)
    await scope[Symbol.asyncDispose]()
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })

  it("does nothing when scope had no adoptions at all", () => {
    const scope = createScope("empty")
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })

  it("throws LeakedHandlesError when a handle was adopted but never disposed", () => {
    // Manually leak by registering, then never closing the scope.
    const w = makeWidget()
    const scope = createScope("leaky")
    scope.adoptHandle(w.handle)

    expect(() => assertScopeBalance(scope)).toThrow(LeakedHandlesError)
    try {
      assertScopeBalance(scope)
    } catch (e) {
      expect(e).toBeInstanceOf(LeakedHandlesError)
      const leaks = (e as LeakedHandlesError).leaks
      expect(leaks).toHaveLength(1)
      expect(leaks[0]?.kind).toBe("Widget")
      expect((e as LeakedHandlesError).scopeName).toBe("leaky")
    }
  })

  it("ambient handles in unrelated scopes do NOT trigger leaks for THIS scope", () => {
    // The pro/Kimi warning: ownership accounting must be per-scope, never
    // global handle count, or unrelated test work causes flakes.
    const scopeA = createScope("a")
    const scopeB = createScope("b")
    scopeA.adoptHandle(makeWidget().handle) // leak in A
    // B is empty — its balance is fine even though there's a leak elsewhere.
    expect(() => assertScopeBalance(scopeB)).not.toThrow()
  })

  it("reports leaks split by kind in the diagnostic message", () => {
    const scope = createScope("multi-kind")
    scope.adoptHandle(makeWidget().handle)
    scope.adoptHandle(makeWidget().handle)
    scope.adoptHandle(makeGadget().handle)

    try {
      assertScopeBalance(scope)
      throw new Error("expected to throw")
    } catch (e) {
      expect(e).toBeInstanceOf(LeakedHandlesError)
      const err = e as LeakedHandlesError
      expect(err.leaks).toHaveLength(3)
      expect(err.message).toMatch(/Widget×2/)
      expect(err.message).toMatch(/Gadget×1/)
    }
  })
})

// =============================================================================
// Snapshot read-only access (tests assert without triggering close)
// =============================================================================

describe("getAdoptedHandles", () => {
  it("returns an empty list for an unused scope", () => {
    const scope = createScope("empty")
    expect(getAdoptedHandles(scope)).toEqual([])
  })

  it("lists every adopted handle with its kind", () => {
    const scope = createScope("snapshot")
    scope.adoptHandle(makeWidget().handle)
    scope.adoptHandle(makeGadget().handle)

    const list = getAdoptedHandles(scope)
    expect(list.map((l) => l.kind).sort()).toEqual(["Gadget", "Widget"])
  })

  it("removes handles from the list once they're disposed via scope close", async () => {
    const scope = createScope("post-close")
    scope.adoptHandle(makeWidget().handle)
    expect(getAdoptedHandles(scope)).toHaveLength(1)
    await scope[Symbol.asyncDispose]()
    expect(getAdoptedHandles(scope)).toEqual([])
  })
})
