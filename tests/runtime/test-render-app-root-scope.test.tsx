/**
 * Test-render app-root scope — `createRenderer`/`render` provides a per-render
 * `<ScopeProvider scope={s} appScope={s}>`, faithful to production.
 *
 * Bead: @km/silvery/test-render-app-root-scope.
 *
 * The sibling `lifecycle-scope.test.tsx` covers the `run()`/`createApp` path.
 * This file covers the LOWER-LEVEL test renderer (`createRenderer` / `render`,
 * re-exported by `@silvery/test`). Components migrated to `useScopeEffect`
 * call `useScope()`, which throws without a `<ScopeProvider>` ancestor OR an
 * app-root scope. Production `run()`/`createApp` provide the app-root scope;
 * before this fix the test renderer did NOT, so any isolated-component test of
 * a `useScope`/`useScopeEffect` consumer threw
 * "useScope() called without a <ScopeProvider> ancestor or app-root scope".
 *
 * Coverage:
 *   1. A component using `useScopeEffect` renders WITHOUT throwing via
 *      `createRenderer`.
 *   2. The scope passed to `useScopeEffect`'s setup is a real, live `Scope`
 *      (its `scope.timeout(...)` registers a cancel), and the resolved
 *      `useScope()` / `useAppScope()` are the same per-render app-root scope.
 *   3. Unmount disposes the per-render scope, cancelling the pending timeout
 *      (no leak — the callback never fires after unmount).
 *   4. `createRenderer` instance-replacement disposes the PRIOR render's
 *      scope at the unmount boundary.
 *   5. A test that nests its OWN `<ScopeProvider>` still resolves the NEAREST
 *      scope (inner wins) — the app-root scope is only the fallback.
 *
 * Run at SILVERY_STRICT=2 (the silvery convention for new-prop / new-path
 * tests). The render path itself is unaffected by strictness here — these
 * assertions are about scope provision + disposal, which hold at every tier.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { BorderedRectClipError } from "@silvery/ag-term/strict-bordered-rect"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import {
  type Scope,
  createScope,
  setDisposeErrorSink,
  type DisposeErrorContext,
} from "@silvery/scope"
import { useScope, useAppScope, useScopeEffect } from "@silvery/ag-react/hooks"
import { ScopeProvider } from "@silvery/ag-react/ScopeProvider"

/**
 * Drain queued microtasks until `predicate` holds, or give up after `limit`
 * turns and let the caller's assertion report the failure.
 *
 * `unmount()` is sync and fire-and-forgets `renderScope[Symbol.asyncDispose]()`,
 * so the root scope's `disposed` flag flips some microtasks later. HOW MANY is
 * an implementation detail of `Scope`'s teardown — awaiting a fixed number of
 * turns made this test brittle, and 5ea15c6c4 ("join app lifecycle teardown")
 * broke it by memoizing the dispose promise, which lengthened the chain from
 * two turns to five. Wait for the CONDITION instead of counting hops.
 *
 * This does not weaken the assertion: the test never disposes the scope
 * itself, so a root scope that reaches `disposed` here was disposed by
 * `unmount()` and nothing else. A genuinely leaking scope exhausts `limit`
 * and still fails.
 */
async function drainMicrotasksUntil(predicate: () => boolean, limit = 100): Promise<void> {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return
    // eslint-disable-next-line no-await-in-loop -- draining turns is serial by nature
    await Promise.resolve()
  }
}

describe("createRenderer/render provides a per-render app-root scope", () => {
  /**
   * @failure Failed construction leaves subscriptions and scope alive; one
   *          throwing release strands later owners or hides the first error.
   * @level l3
   * @consumer @silvery/test createRenderer / km-tui storybook smoke
   * @testonly none
   * Existing rows dispose successfully returned handles. Construction failures
   * return no handle, and synchronous multi-release errors need their own row.
   */
  test.each([
    "first paint",
    "onFrame",
    "onFrame with cleanup failure",
    "dispose with cleanup failures",
  ] as const)(
    "lifetime failure at %s releases effects and scope before a healthy retry",
    async (failurePoint) => {
      const subscriptions = new Set<() => void>()
      const baseline = subscriptions.size
      let scope: Scope | undefined
      let cleanups = 0
      const frameError = new Error("initial-frame-failed")
      const cleanupError = new Error("react-cleanup-failed")
      const stdinError = new Error("stdin-detach-failed")
      const disposeFailure = failurePoint === "dispose with cleanup failures"
      const stdinBaseline = process.stdin.listenerCount("readable")
      const onRemove = (event: string | symbol) => {
        if (shouldFail && event === "readable") throw stdinError
      }
      const reported: unknown[] = []
      let shouldFail = true
      setDisposeErrorSink((error) => reported.push(error))

      function Owner({ overflow = false }: { overflow?: boolean }): React.ReactElement {
        scope = useAppScope()
        React.useEffect(() => {
          const listener = () => {}
          subscriptions.add(listener)
          return () => {
            subscriptions.delete(listener)
            cleanups++
            if (shouldFail && (failurePoint === "onFrame with cleanup failure" || disposeFailure))
              throw cleanupError
          }
        }, [])
        return overflow ? (
          <Box width={20} height={3} borderStyle="round">
            <Text>{"a ".repeat(20)}</Text>
          </Box>
        ) : (
          <Text>healthy owner</Text>
        )
      }

      vi.stubEnv("SILVERY_STRICT", "2")
      resetStrictCache()
      if (disposeFailure) process.stdin.on("removeListener", onRemove)
      try {
        const render = createRenderer({
          cols: 80,
          rows: 12,
          stdin: disposeFailure ? process.stdin : undefined,
          onFrame: () => {
            if (shouldFail && failurePoint.startsWith("onFrame")) throw frameError
          },
        })
        let thrown: unknown
        let frames: string[] | undefined
        try {
          const app = render(<Owner overflow={failurePoint === "first paint"} />)
          if (disposeFailure) {
            frames = app.frames
            app.unmount()
          }
        } catch (error) {
          thrown = error
        }
        if (failurePoint === "first paint") {
          expect(thrown).toBeInstanceOf(BorderedRectClipError)
        } else {
          expect(thrown).toBe(disposeFailure ? cleanupError : frameError)
        }
        expect(subscriptions.size, "failed construction must synchronously unsubscribe").toBe(
          baseline,
        )
        expect(cleanups).toBe(1)
        const failedScope = scope!
        await drainMicrotasksUntil(() => failedScope.disposed)
        expect(failedScope.disposed).toBe(true)
        expect(reported).toEqual(
          disposeFailure
            ? [stdinError]
            : failurePoint === "onFrame with cleanup failure"
              ? [cleanupError]
              : [],
        )
        if (disposeFailure) {
          expect(frames).toEqual([])
          expect(process.stdin.listenerCount("readable")).toBe(stdinBaseline)
        }

        shouldFail = false
        {
          using app = render(<Owner />)
          expect(app.text).toContain("healthy owner")
          expect(subscriptions.size).toBe(baseline + 1)
        }
        expect(subscriptions.size).toBe(baseline)
        expect(cleanups, "successful ownership transfer must dispose exactly once").toBe(2)
      } finally {
        process.stdin.removeListener("removeListener", onRemove)
        setDisposeErrorSink(() => {})
        vi.unstubAllEnvs()
        resetStrictCache()
      }
    },
  )

  // --------------------------------------------------------------------------
  // Test 1 + 2 — useScopeEffect renders without throwing; scope is real
  // --------------------------------------------------------------------------

  test("a useScopeEffect consumer renders without throwing", () => {
    let setupScope: Scope | undefined
    let observedCurrent: Scope | undefined
    let observedRoot: Scope | undefined

    function Owner(): React.ReactElement {
      observedCurrent = useScope()
      observedRoot = useAppScope()
      useScopeEffect((scope) => {
        setupScope = scope
        // Schedule a scope-owned timeout. The whole point of the fix is that
        // `useScope()` (called inside useScopeEffect) resolves to the
        // per-render app-root scope instead of throwing.
        scope.timeout(() => {}, 1000)
      }, [])
      return <Text>owner</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    // Before the fix this throws synchronously during the effect flush.
    expect(() => render(<Owner />)).not.toThrow()

    // The render resolved a real app-root scope for useScope()/useAppScope().
    expect(observedCurrent).toBeDefined()
    expect(observedRoot).toBeDefined()
    expect(observedCurrent).toBe(observedRoot) // one app-root scope value

    // useScopeEffect built a live CHILD of that scope (not the root itself).
    expect(setupScope).toBeDefined()
    expect(setupScope!.disposed).toBe(false)
    expect(setupScope).not.toBe(observedRoot)
  })

  // --------------------------------------------------------------------------
  // Test 3 — unmount disposes the per-render scope, cancelling the timeout
  // --------------------------------------------------------------------------

  test("unmount disposes the scope and cancels the pending timeout (no leak)", async () => {
    const fired = vi.fn()
    let setupScope: Scope | undefined
    let rootScope: Scope | undefined

    function Owner(): React.ReactElement {
      rootScope = useAppScope()
      useScopeEffect((scope) => {
        setupScope = scope
        // 1000ms timeout — far longer than the test. If the scope is NOT
        // disposed on unmount, this fires (after the test) and `fired` is
        // called; if it IS disposed, `scope.timeout`'s deferred cancel runs
        // and the callback never fires.
        scope.timeout(fired, 1000)
      }, [])
      return <Text>owner</Text>
    }

    vi.useFakeTimers()
    try {
      const render = createRenderer({ cols: 20, rows: 2 })
      const app = render(<Owner />)

      expect(setupScope).toBeDefined()
      expect(rootScope).toBeDefined()
      expect(setupScope!.disposed).toBe(false)
      expect(rootScope!.disposed).toBe(false)

      // Unmount → React tears down the fiber (disposing the useScopeEffect
      // child scope synchronously), then the renderer fires
      // `renderScope[Symbol.asyncDispose]()` fire-and-forget (sync unmount,
      // mirroring create-app). The root scope's dispose AWAITS its (already
      // detached) child, so `.disposed` flips a few microtasks later, not
      // synchronously — see `drainMicrotasksUntil` above for why the exact
      // number is not something this test may assume. The child scope,
      // disposed directly by fiber teardown, is already `disposed === true`
      // here.
      app.unmount()
      expect(setupScope!.disposed).toBe(true)

      // Drain the fire-and-forget app-root dispose microtasks.
      await drainMicrotasksUntil(() => rootScope!.disposed)
      expect(rootScope!.disposed).toBe(true)

      // The timeout was cancelled by scope disposal — advancing well past
      // 1000ms must NOT fire the callback. This is the leak assertion.
      vi.advanceTimersByTime(5000)
      expect(fired).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // --------------------------------------------------------------------------
  // Test 4 — createRenderer replacement disposes the prior render's scope
  // --------------------------------------------------------------------------
  //
  // createRenderer auto-unmounts the previous render when a fresh mount is
  // forced (e.g. incremental-toggling overrides). The prior render's scope
  // must dispose at that boundary, mirroring create-app's on-exit dispose.

  test("instance replacement disposes the prior render's scope", () => {
    const scopes: Scope[] = []

    function Owner(): React.ReactElement {
      const root = useAppScope()
      // Record each distinct app-root scope this component sees.
      if (!scopes.includes(root)) scopes.push(root)
      return <Text>owner</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    // First render — fresh mount, scope A.
    render(<Owner />)
    expect(scopes.length).toBe(1)
    const scopeA = scopes[0]!
    expect(scopeA.disposed).toBe(false)

    // Force a fresh mount (not a rerender) by flipping `incremental`. This
    // routes through createRenderer's unmount+remount path, which calls
    // `current.unmount()` on the prior instance — disposing scope A — before
    // creating scope B.
    render(<Owner />, { incremental: false })

    expect(scopes.length).toBe(2)
    const scopeB = scopes[1]!
    expect(scopeB).not.toBe(scopeA)
    // Prior render's scope disposed at the replacement boundary.
    expect(scopeA.disposed).toBe(true)
    // Current render's scope still live.
    expect(scopeB.disposed).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Test 5 — nesting a ScopeProvider still resolves the NEAREST scope
  // --------------------------------------------------------------------------
  //
  // The fix is additive: the per-render scope is only the FALLBACK. A test
  // (or app) that nests its own <ScopeProvider> must still win for useScope().

  test("nested ScopeProvider wins for useScope(); app-root is only the fallback", () => {
    const inner = createScope("inner")
    let observedCurrent: Scope | undefined
    let observedRoot: Scope | undefined

    function Probe(): React.ReactElement {
      observedCurrent = useScope()
      observedRoot = useAppScope()
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ScopeProvider scope={inner}>
        <Probe />
      </ScopeProvider>,
    )

    // useScope() resolves to the NEAREST provider (the nested one).
    expect(observedCurrent).toBe(inner)
    // useAppScope() still resolves to the renderer's per-render app-root scope
    // (NOT `inner`, since the nested provider only set `scope`, not `appScope`).
    expect(observedRoot).toBeDefined()
    expect(observedRoot).not.toBe(inner)
  })

  // --------------------------------------------------------------------------
  // Test 6 — disposal errors route through reportDisposeError, never throw
  // --------------------------------------------------------------------------
  //
  // unmountFn is sync; the scope dispose is fire-and-forget. A rejecting
  // disposer must surface via the dispose-error sink (phase "app-exit"), not
  // throw into unmount().

  test("a rejecting scope disposer reports via the sink, does not throw unmount", async () => {
    const captured: { error: unknown; ctx: DisposeErrorContext }[] = []
    setDisposeErrorSink((error, ctx) => captured.push({ error, ctx }))
    try {
      function Owner(): React.ReactElement {
        const root = useAppScope()
        // Register an async disposer on the ROOT (app-root) scope that
        // rejects. Use a one-shot guard so it registers exactly once.
        const [] = React.useState(() => {
          root.defer(async () => {
            throw new Error("boom-on-dispose")
          })
          return true
        })
        return <Text>owner</Text>
      }

      const render = createRenderer({ cols: 20, rows: 2 })
      const app = render(<Owner />)

      expect(() => app.unmount()).not.toThrow()

      // The rejection propagates across several await points (the scope's
      // `super[Symbol.asyncDispose]()` → the async disposer's promise → the
      // fire-and-forget `.catch` → reportDisposeError). Drain a macrotask so
      // every microtask hop settles — the same `settle()` shape the
      // run()/createApp lifecycle-scope test uses for its dispose assertions.
      await new Promise((r) => setTimeout(r, 0))

      expect(captured.length).toBeGreaterThanOrEqual(1)
      const boom = captured.find(
        (c) => c.error instanceof Error && c.error.message === "boom-on-dispose",
      )
      expect(boom, "the rejecting disposer should be reported").toBeDefined()
      expect(boom!.ctx.phase).toBe("app-exit")
    } finally {
      setDisposeErrorSink(() => {})
    }
  })
})
