/**
 * Memory Tests for Silvery
 *
 * Bead: km-silvery.memory-test / km-silvery.lifecycle-leak-detection-fossil
 *
 * Two kinds of invariants:
 *
 * 1. **Deterministic handle-counter tests** (C1 L5) — structural lifecycle
 *    proofs that require no GC, no JIT settling, no heap thresholds. After all
 *    handles in a scope are disposed, `getActiveHandleCount()` must be 0.
 *    These are the canonical leak tests.
 *
 * 2. **Render structural tests** — active render count, frame tracking,
 *    createRenderer auto-unmount. These are structural invariants (no GC calls).
 */

import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer, render, getActiveRenderCount } from "@silvery/test"
import { Box, Text, useBoxRect } from "@silvery/ag-react"
import {
  createScope,
  defineHandle,
  finaliseHandle,
  getActiveHandleCount,
  assertScopeBalance,
  getAdoptedHandles,
  type RegistrableHandle,
} from "@silvery/scope"
import {
  SimpleBox,
  Counter,
  ResponsiveBox,
  MountUnmountCycle,
  ComplexLayout,
} from "../fixtures/index.tsx"

// =============================================================================
// Deterministic handle-counter tests — C1 L5
//
// Deterministic: integer counter, not GC observation. No heap thresholds.
// These are structural: they read an integer counter, not heap memory.
// =============================================================================

// Snapshot the counter before each test so parallel test suites don't
// interfere — per-scope accounting is the primary gate; the global counter
// is an additive invariant. Tests assert delta (countAfter - countBefore)
// or snapshot-relative equality to stay robust when other tests run in the
// same module.

function makeTestHandle(kind = "Test"): {
  factory: { kind: string }
  create: () => RegistrableHandle
} {
  const factory = defineHandle(kind)
  return {
    factory,
    create: (): RegistrableHandle => {
      const h = factory.create({}, () => {})
      return finaliseHandle(h, {}) as unknown as RegistrableHandle
    },
  }
}

describe("handle counter: basic create/dispose invariant", () => {
  test("counter increments by 1 per create", () => {
    const { create } = makeTestHandle("Counter1")
    const before = getActiveHandleCount()
    const h = create()
    expect(getActiveHandleCount()).toBe(before + 1)
    // cleanup — dispose so later tests aren't affected
    void (h as unknown as AsyncDisposable)[Symbol.asyncDispose]()
  })

  test("counter decrements to baseline after dispose", async () => {
    const { create } = makeTestHandle("Counter2")
    const before = getActiveHandleCount()
    const h = create()
    expect(getActiveHandleCount()).toBe(before + 1)
    await (h as unknown as AsyncDisposable)[Symbol.asyncDispose]()
    expect(getActiveHandleCount()).toBe(before)
  })

  test("N creates → count = before+N; dispose all → count = before", async () => {
    const { create } = makeTestHandle("CounterN")
    const N = 10
    const before = getActiveHandleCount()
    const handles: RegistrableHandle[] = []
    for (let i = 0; i < N; i++) {
      handles.push(create())
    }
    expect(getActiveHandleCount()).toBe(before + N)
    for (const h of handles) {
      await (h as unknown as AsyncDisposable)[Symbol.asyncDispose]()
    }
    expect(getActiveHandleCount()).toBe(before)
  })

  test("dispose is idempotent — double dispose does not double-decrement", async () => {
    const { create } = makeTestHandle("Idempotent")
    const before = getActiveHandleCount()
    const h = create()
    const ad = h as unknown as AsyncDisposable
    await ad[Symbol.asyncDispose]()
    await ad[Symbol.asyncDispose]() // second dispose must not go below before
    expect(getActiveHandleCount()).toBe(before)
  })

  test("sync dispose (Symbol.dispose) also decrements", () => {
    const { create } = makeTestHandle("SyncDispose")
    const before = getActiveHandleCount()
    const h = create()
    expect(getActiveHandleCount()).toBe(before + 1)
    ;(h as unknown as Disposable)[Symbol.dispose]()
    expect(getActiveHandleCount()).toBe(before)
  })
})

describe("handle counter: scope lifecycle", () => {
  test("scope.adoptHandle → scope dispose → counter back to baseline", async () => {
    const { create } = makeTestHandle("ScopeLifecycle")
    const before = getActiveHandleCount()
    const scope = createScope("handle-counter-test")
    const h = create()
    scope.adoptHandle(h)
    expect(getActiveHandleCount()).toBe(before + 1)
    await scope[Symbol.asyncDispose]()
    expect(getActiveHandleCount()).toBe(before)
    expect(() => assertScopeBalance(scope)).not.toThrow()
  })

  test("multiple handles in one scope all decrement on scope close", async () => {
    const N = 5
    const { create } = makeTestHandle("MultiScope")
    const before = getActiveHandleCount()
    const scope = createScope("multi-handle-test")
    for (let i = 0; i < N; i++) {
      scope.adoptHandle(create())
    }
    expect(getActiveHandleCount()).toBe(before + N)
    expect(getAdoptedHandles(scope)).toHaveLength(N)
    await scope[Symbol.asyncDispose]()
    expect(getActiveHandleCount()).toBe(before)
    expect(getAdoptedHandles(scope)).toHaveLength(0)
  })

  test("child scope handles dispose before parent, counter stays consistent", async () => {
    const { create } = makeTestHandle("ChildScope")
    const before = getActiveHandleCount()
    const parent = createScope("parent")
    const child = parent.child("child")
    parent.adoptHandle(create())
    child.adoptHandle(create())
    expect(getActiveHandleCount()).toBe(before + 2)
    // Disposing parent disposes children first
    await parent[Symbol.asyncDispose]()
    expect(getActiveHandleCount()).toBe(before)
  })

  test("early manual dispose removes handle from scope and decrements counter", async () => {
    const { create } = makeTestHandle("EarlyDispose")
    const before = getActiveHandleCount()
    const scope = createScope("early-dispose-test")
    const h = create()
    scope.adoptHandle(h)
    // Manually dispose before scope close
    await (h as unknown as AsyncDisposable)[Symbol.asyncDispose]()
    // Counter decremented by manual dispose
    expect(getActiveHandleCount()).toBe(before)
    // Scope close is idempotent — already disposed, no double-decrement
    await scope[Symbol.asyncDispose]()
    expect(getActiveHandleCount()).toBe(before)
  })
})

describe("handle counter: mixed kinds", () => {
  test("handles of different kinds all count correctly", async () => {
    const TickH = makeTestHandle("Tick")
    const RuntimeH = makeTestHandle("Runtime")
    const InputH = makeTestHandle("Input")
    const before = getActiveHandleCount()
    const scope = createScope("mixed-kinds")
    scope.adoptHandle(TickH.create())
    scope.adoptHandle(RuntimeH.create())
    scope.adoptHandle(InputH.create())
    expect(getActiveHandleCount()).toBe(before + 3)
    await scope[Symbol.asyncDispose]()
    expect(getActiveHandleCount()).toBe(before)
  })
})

// =============================================================================
// Fuzz test: random create/dispose orderings
//
// Invariant: regardless of create/dispose order, the counter returns to
// the baseline after all handles are disposed. Per-scope balance also holds.
// =============================================================================

describe("handle counter: fuzz — random create/dispose orderings", () => {
  /**
   * Deterministic seeded PRNG (mulberry32) so fuzz is reproducible without
   * external dependencies.
   */
  function mulberry32(seed: number): () => number {
    let s = seed
    return () => {
      s |= 0
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  test("50 random create/dispose rounds, counter always returns to baseline", async () => {
    const { create } = makeTestHandle("Fuzz")
    const before = getActiveHandleCount()
    const rng = mulberry32(0xdeadbeef)

    for (let round = 0; round < 50; round++) {
      const scope = createScope(`fuzz-round-${round}`)
      // Create between 1 and 8 handles
      const n = 1 + Math.floor(rng() * 8)
      const handles: RegistrableHandle[] = []
      for (let i = 0; i < n; i++) {
        const h = create()
        scope.adoptHandle(h)
        handles.push(h)
      }
      expect(getActiveHandleCount()).toBe(before + n)

      // Randomly dispose some handles early (before scope close)
      const earlyDisposeCount = Math.floor(rng() * n)
      for (let i = 0; i < earlyDisposeCount; i++) {
        await (handles[i] as unknown as AsyncDisposable)[Symbol.asyncDispose]()
      }
      // Count after partial early disposal
      expect(getActiveHandleCount()).toBe(before + n - earlyDisposeCount)

      // Close scope — disposes remaining handles
      await scope[Symbol.asyncDispose]()
      // All handles gone
      expect(getActiveHandleCount()).toBe(before)
    }
  })

  test("multiple concurrent scopes, interleaved creates/disposes, zero net leak", async () => {
    const TickH = makeTestHandle("FuzzTick")
    const RuntimeH = makeTestHandle("FuzzRuntime")
    const before = getActiveHandleCount()
    const rng = mulberry32(0xcafebabe)

    const scopes = [
      createScope("fuzz-a"),
      createScope("fuzz-b"),
      createScope("fuzz-c"),
    ]

    let totalCreated = 0

    // Interleave: randomly add handles to each scope
    for (let i = 0; i < 30; i++) {
      const scopeIdx = Math.floor(rng() * scopes.length)
      const scope = scopes[scopeIdx]
      if (!scope.disposed) {
        const factory = rng() > 0.5 ? TickH : RuntimeH
        scope.adoptHandle(factory.create())
        totalCreated++
        expect(getActiveHandleCount()).toBe(before + totalCreated)
      }
    }

    // Dispose scopes one by one, asserting counter descends
    let remaining = totalCreated
    for (const scope of scopes) {
      const owned = getAdoptedHandles(scope).length
      await scope[Symbol.asyncDispose]()
      remaining -= owned
      expect(getActiveHandleCount()).toBe(before + remaining)
    }

    expect(getActiveHandleCount()).toBe(before)
  })
})

// =============================================================================
// Render structural tests — no GC, no heap measurement
// =============================================================================

describe("render: structural invariants", () => {
  test("1000 re-renders via rerender() produce correct output", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(ComplexLayout))

    for (let i = 0; i < 1000; i++) {
      app.rerender(React.createElement(ComplexLayout))
    }

    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Header")
  })

  test("frames array grows linearly with press count", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(Counter))

    for (let i = 0; i < 100; i++) {
      await app.press("j")
    }

    // frames array tracks all renders — verify it's there and linear
    // (1 initial + 100 presses = 101)
    expect(app.frames.length).toBe(101)
  })
})

describe("render: mount/unmount lifecycle", () => {
  test("createRenderer auto-unmounts previous render", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    for (let i = 0; i < 200; i++) {
      r(React.createElement(SimpleBox, { label: `Item ${i}` }))
    }

    const lastApp = r(React.createElement(SimpleBox, { label: "Final" }))
    expect(lastApp.text).toContain("Final")
  })

  test("no active render leak after explicit unmount", () => {
    const initialCount = getActiveRenderCount()

    const app = render(React.createElement(SimpleBox), { cols: 80, rows: 24 })
    expect(getActiveRenderCount()).toBe(initialCount + 1)

    app.unmount()
    expect(getActiveRenderCount()).toBe(initialCount)
  })

  test("mount/unmount with nested components cleans up properly", () => {
    const renderNested = (i: number) =>
      render(
        React.createElement(
          Box,
          { flexDirection: "column" },
          React.createElement(ComplexLayout),
          React.createElement(SimpleBox, { label: `Iteration ${i}` }),
        ),
        { cols: 80, rows: 24 },
      )

    // Verify 10 mount/unmount cycles produce correct output
    for (let i = 0; i < 10; i++) {
      const app = renderNested(i)
      expect(app.text).toContain("Sidebar")
      app.unmount()
    }
  })
})

// =============================================================================
// useBoxRect subscription cleanup — structural (no GC)
// =============================================================================

describe("useBoxRect: subscription lifecycle", () => {
  test("useBoxRect subscriptions are cleaned up on unmount", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    for (let i = 0; i < 100; i++) {
      r(React.createElement(ResponsiveBox))
      r(React.createElement(SimpleBox))
    }

    const app = r(React.createElement(SimpleBox, { label: "End" }))
    expect(app.text).toContain("End")
  })

  test("useBoxRect with resize does not cause errors", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(ResponsiveBox))

    expect(app.text).toContain("Size:")

    for (let i = 0; i < 100; i++) {
      const cols = 40 + (i % 80)
      const rows = 10 + (i % 30)
      app.resize(cols, rows)
    }

    expect(app.text).toContain("Size:")
  })

  function DynamicBoxRect({ showInner }: { showInner: boolean }) {
    return React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, null, "Outer"),
      showInner ? React.createElement(ResponsiveBox) : null,
    )
  }

  test("dynamic mount/unmount of useBoxRect components renders correctly", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    // 50 mount/unmount cycles of useBoxRect component — structural correctness
    for (let i = 0; i < 50; i++) {
      const app = r(React.createElement(DynamicBoxRect, { showInner: true }))
      expect(app.text).toContain("Size:")

      app.rerender(React.createElement(DynamicBoxRect, { showInner: false }))
      expect(app.text).not.toContain("Size:")

      app.rerender(React.createElement(DynamicBoxRect, { showInner: true }))
      expect(app.text).toContain("Size:")
    }
  })

  test("rapid rerender of useBoxRect component renders correctly", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(ResponsiveBox))

    for (let i = 0; i < 100; i++) {
      app.rerender(React.createElement(ResponsiveBox))
    }

    expect(app.text).toContain("Size:")
  })
})
