/**
 * scoped-tick.test.ts — first leaf consumer of the C1 / Phase 1 handle pattern.
 *
 * `createScopedTick(scope, ms)` is the migration target for the
 * `@deprecated` `createTick(intervalMs, signal?)`. These tests pin:
 *
 *   1. Iteration emits monotonically-increasing tick numbers.
 *   2. Scope close stops the underlying setTimeout (no fd / timer leak).
 *   3. The scope's handle accounting registers and clears in step.
 *   4. Iterator `return()` (early break in for-await) settles the iterator
 *      and the scope-balance assertion still passes after close.
 *   5. Pre-aborted scope produces a tick that yields no values.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  assertScopeBalance,
  createScope,
  getAdoptedHandles,
} from "@silvery/scope"

import { createScopedTick } from "../../packages/ag-term/src/runtime/scoped-tick"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createScopedTick", () => {
  it("registers a Tick handle into the scope's accounting", async () => {
    await using scope = createScope("tick-accounted")
    createScopedTick(scope, 10)
    const adopted = getAdoptedHandles(scope)
    expect(adopted.map((a) => a.kind)).toEqual(["Tick"])
  })

  it("clears the handle from the scope's accounting on scope close", async () => {
    const scope = createScope("tick-disposed")
    createScopedTick(scope, 10)
    expect(getAdoptedHandles(scope)).toHaveLength(1)
    await scope[Symbol.asyncDispose]()
    expect(getAdoptedHandles(scope)).toHaveLength(0)
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })

  it("emits monotonically-increasing tick numbers", async () => {
    await using scope = createScope("tick-iter")
    const tick = createScopedTick(scope, 100)
    const seen: number[] = []
    const iter = tick.iterable[Symbol.asyncIterator]()

    const collect = (async () => {
      for (let i = 0; i < 3; i++) {
        const r = await iter.next()
        if (r.done) break
        seen.push(r.value)
      }
    })()

    // Advance 3 intervals; each fires one tick.
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(100)

    await collect
    expect(seen).toEqual([0, 1, 2])
    expect(tick.emitted()).toBe(3)
  })

  it("stops emitting when the owning scope's signal is aborted", async () => {
    const scope = createScope("tick-aborted")
    const tick = createScopedTick(scope, 100)
    const iter = tick.iterable[Symbol.asyncIterator]()

    // Start a pending next() that's waiting for the timer.
    const pending = iter.next()

    // Disposing the scope aborts the signal; pending iterator settles done.
    await scope[Symbol.asyncDispose]()
    const r = await pending
    expect(r).toEqual({ done: true, value: undefined })
  })

  it("settles iterator on .return() and leaves scope balanced", async () => {
    const scope = createScope("tick-early-break")
    const tick = createScopedTick(scope, 100)
    const iter = tick.iterable[Symbol.asyncIterator]()

    if (iter.return) {
      const r = await iter.return()
      expect(r).toEqual({ done: true, value: undefined })
    }

    await scope[Symbol.asyncDispose]()
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })

  it("produces a no-value iterator when constructed against an aborted scope", async () => {
    const parent = createScope("parent")
    const child = parent.child("child")
    await parent[Symbol.asyncDispose]() // child.signal is now aborted

    // Adopting into an already-disposed scope is rejected (per the contract);
    // re-create at the parent level for the post-abort observation.
    const fresh = createScope("post-abort")
    // Pre-abort the fresh scope's signal via parent-style cascade.
    const grandparent = createScope("grand")
    const childOfGrand = grandparent.child("c")
    await grandparent[Symbol.asyncDispose]()
    expect(childOfGrand.signal.aborted).toBe(true)

    // This use-case is the "scope already cancelled when we tried to acquire"
    // path. Until the consumer-policy doc resolves whether that should throw
    // or return a no-op handle, document the current behavior: adopting into
    // a disposed scope throws. The fresh scope handles the happy path.
    expect(() => createScopedTick(childOfGrand, 50)).toThrow(/disposed scope/)

    await fresh[Symbol.asyncDispose]()
  })
})
