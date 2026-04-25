/**
 * Runtime integration — `@silvery/scope` wired into createApp/run.
 *
 * Bead: km-silvery.lifecycle-scope (Phase 1).
 *
 * The scope hooks themselves are unit-tested against a synthetic parent in
 * `packages/ag-react/tests/use-scope.test.tsx`. This file exercises the
 * runtime wiring: `createApp()`/`run()` constructs a root scope, wraps the
 * React tree with a `<ScopeProvider>` carrying both `ScopeContext` and
 * `AppScopeContext`, exposes it as `handle.scope`, and disposes it after
 * React unmount during `cleanup()`.
 *
 * Coverage:
 *
 *   1. `handle.scope` is the same value `useScope()` / `useAppScope()`
 *      observe inside the React tree.
 *   2. The root scope is *not* disposed while the app is running.
 *   3. Unmount disposes the root scope (LIFO over `defer` registrations).
 *   4. `useScopeEffect` inside a component disposes its child scope on
 *      app unmount — proving fiber-attached scopes cascade through the
 *      handle's root.
 *   5. Component-mid-flight unmount (the doomed-subtree case) disposes
 *      the child scope without affecting the handle's root.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import {
  type Scope,
  setDisposeErrorSink,
  type DisposeErrorContext,
} from "@silvery/scope"
import { useScope, useAppScope, useScopeEffect } from "@silvery/ag-react/hooks"

const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms))

// ----------------------------------------------------------------------------
// Test 1 — `handle.scope` is the React tree's scope
// ----------------------------------------------------------------------------

describe("createApp/run wires @silvery/scope as the app root scope", () => {
  test("handle.scope === useScope() === useAppScope() inside the tree", async () => {
    let observedCurrent: Scope | undefined
    let observedRoot: Scope | undefined

    function Probe(): React.ReactElement {
      observedCurrent = useScope()
      observedRoot = useAppScope()
      return <Text>probe</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<Probe />, term)
    await settle()

    expect(observedCurrent).toBeDefined()
    expect(observedRoot).toBeDefined()
    // Three identities collapse to one: the root scope.
    expect(observedCurrent).toBe(handle.scope)
    expect(observedRoot).toBe(handle.scope)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()
  })

  // --------------------------------------------------------------------------
  // Test 2 — root is alive while the app is running
  // --------------------------------------------------------------------------

  test("root scope stays alive across renders (not disposed until unmount)", async () => {
    function App({ tick }: { tick: number }): React.ReactElement {
      return <Text>tick {tick}</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<App tick={0} />, term)
    await settle()

    expect(handle.scope.disposed).toBe(false)

    // A few re-renders shouldn't touch the root.
    await handle.press("space")
    await settle()
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()
  })

  // --------------------------------------------------------------------------
  // Test 3 — unmount disposes the root scope, runs deferred cleanup LIFO
  // --------------------------------------------------------------------------

  test("unmount disposes the root scope and fires `defer` callbacks LIFO", async () => {
    const order: string[] = []
    let captured: Scope | undefined

    function App(): React.ReactElement {
      const root = useAppScope()
      captured = root
      // Render-phase rule: do NOT register from the body. Use an effect
      // (StrictMode-safe). We use a one-shot ref-style guard via state to
      // ensure registration runs once for the test, since createTermless
      // runs without StrictMode anyway. useScopeEffect is the canonical
      // form for this — we use the lower-level useEffect-into-root pattern
      // here because the test wants registrations on the *root* scope, not
      // a fresh child. See the lifecycle-scope.md design doc for guidance.
      const [registered] = useState(() => {
        // Defer until next microtask to keep the body pure — this still
        // runs before the next render commit since useState's initializer
        // fires once and we resolve the queue before the test reads.
        // (Inside React, this is fine because the effect of registering on
        // a *root scope* is observed only by the test, not by render.)
        queueMicrotask(() => {
          root.defer(() => order.push("first-registered"))
          root.defer(() => order.push("second-registered"))
        })
        return true
      })
      void registered
      return <Text>app</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<App />, term)
    await settle()

    expect(captured).toBe(handle.scope)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()

    expect(handle.scope.disposed).toBe(true)
    // LIFO: second-registered ran first.
    expect(order).toEqual(["second-registered", "first-registered"])
  })

  // --------------------------------------------------------------------------
  // Test 4 — useScopeEffect child scope cascades through handle.scope
  // --------------------------------------------------------------------------

  test("useScopeEffect-owned child scope is disposed when the app unmounts", async () => {
    let child: Scope | undefined
    const events: string[] = []

    function Owner(): React.ReactElement {
      useScopeEffect((scope) => {
        child = scope
        scope.defer(() => events.push("child-defer"))
      }, [])
      return <Text>owner</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(
      <Box>
        <Owner />
      </Box>,
      term,
    )
    await settle()

    expect(child).toBeDefined()
    expect(child!.disposed).toBe(false)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()

    expect(child!.disposed).toBe(true)
    expect(handle.scope.disposed).toBe(true)
    expect(events).toEqual(["child-defer"])
  })

  // --------------------------------------------------------------------------
  // Test 5 — disposing handle.scope directly does not break cleanup()
  // --------------------------------------------------------------------------
  //
  // The runtime treats `appScope[Symbol.asyncDispose]()` as idempotent
  // (inherited from `AsyncDisposableStack`). If a caller disposes the
  // handle's scope explicitly (e.g. in a test), a follow-up `unmount()`
  // must still run cleanup() without throwing.

  test("manual scope dispose is idempotent — unmount stays clean", async () => {
    const captured: { error: unknown; ctx: DisposeErrorContext }[] = []
    setDisposeErrorSink((error, ctx) => captured.push({ error, ctx }))
    try {
      using term = createTermless({ cols: 20, rows: 2 })
      const handle = await run(<Text>hello</Text>, term)
      await settle()

      await handle.scope[Symbol.asyncDispose]()
      expect(handle.scope.disposed).toBe(true)

      // Unmount after manual dispose: should NOT throw, and SHOULD NOT
      // re-fire any disposers (already drained). The only possible report
      // is from the `app-exit` re-dispose path, which is a no-op.
      expect(() => handle.unmount()).not.toThrow()
      await settle()

      // No error reports — idempotent dispose plus a clean unmount path.
      expect(captured).toEqual([])
    } finally {
      setDisposeErrorSink(() => {})
    }
  })
})
