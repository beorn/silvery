/**
 * Memory tests for production render paths.
 *
 * Bead: km-silvery.c1-fossil-sweep-broader
 *
 * memory.test.tsx covers the test renderer (`render()` from
 * `@silvery/test`). This file verifies the same structural guarantees
 * for production render entry points that share the same unmount
 * helper (`unmountFiberRoot` from `@silvery/ag-react/reconciler`):
 *
 *   1. compose `pipe(create(), withAg(), withTerm(term), withReact(<App />))`
 *      with cleanup via `app[Symbol.dispose]()` — drains `app.defer`s,
 *      which fires the unmount inside withReact.
 *   2. ag-react `run(<App />, term)` (the `Renderer` class in
 *      packages/ag-react/src/render.tsx) with cleanup via `handle.unmount()`.
 *      Exercises the production main-API unmount path used by km-tui /
 *      silvercode in long-lived hosts.
 *
 * Why this matters: the test renderer and production renderers share the
 * same primitive (`unmountFiberRoot`), but each call site has its own
 * surrounding host state (defers, schedulers, term wiring, focus / cursor
 * stores). A regression that re-introduces async unmount in any one of
 * them would silently leak in production without showing up in
 * memory.test.tsx. These cycles are the integration check.
 *
 * **Invariant style (C1 L5 — no GC required):**
 *
 * Tests count cleanup invocations via a synchronous counter. N cycles
 * must produce exactly N cleanup calls — deterministic, no heap thresholds,
 * no GC calls, no JIT settling. The counter pattern from
 * "dispose runs unmount cleanup synchronously" (test 2) extends to all
 * cycle tests.
 *
 * Browser/canvas paths (renderToCanvas, renderToDOM) are skipped — they
 * require browser globals (HTMLCanvasElement, document, window) and can't
 * run cleanly in node. Their unmount path uses the same shared helper,
 * so structural correctness is established by the helper's own tests +
 * the two paths covered here. If we ever add jsdom to the test setup,
 * extend this file.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { create, pipe, withAg, withTerm, withReact, createTerm } from "@silvery/ag-term"
import { ensureLayoutEngine } from "@silvery/ag-term/runtime"
import { Box, Text, useBoxRect } from "@silvery/ag-react"
import { MountUnmountCycle } from "../fixtures/index.tsx"

// ============================================================================
// withReact (compose-react.tsx → unmountFiberRoot)
// ============================================================================

describe("memory: withReact compose path", () => {
  test(
    "200 mount/dispose cycles — each dispose fires cleanup exactly once",
    { timeout: 30_000 },
    async () => {
      await ensureLayoutEngine()

      let cleanupCount = 0
      const N = 200

      const cycle = (): void => {
        function Tracked() {
          React.useEffect(() => {
            return () => {
              cleanupCount++
            }
          }, [])
          return <MountUnmountCycle visible />
        }

        const term = createTerm({ cols: 80, rows: 24 })
        // pipe(...) builds the app; app.defer(() => unmountFiberRoot(...))
        // is registered by withReact. Calling [Symbol.dispose]() drains
        // the defer stack, which fires the unmount.
        const app = pipe(create(), withAg(), withTerm(term), withReact(<Tracked />))
        // Force a render so React commit + layout-effect subscriptions
        // are real before we tear down — without this we'd never exercise
        // the cleanup path the test is supposed to verify.
        app.render()
        app[Symbol.dispose]()
      }

      for (let i = 0; i < N; i++) {
        cycle()
      }

      // Each cycle mounts one Tracked component and disposes it.
      // Sync unmount: all N cleanups must have run by now.
      expect(cleanupCount).toBe(N)
    },
  )

  test("dispose runs unmount cleanup synchronously", async () => {
    await ensureLayoutEngine()

    let cleanupCalls = 0
    function Probe() {
      // useBoxRect subscribes to a layout signal via useLayoutEffect.
      // The cleanup increments a counter — we read it back after
      // [Symbol.dispose]() to verify the cleanup ran inside the dispose
      // call, not asynchronously after.
      const rect = useBoxRect()
      React.useEffect(() => {
        return () => {
          cleanupCalls++
        }
      }, [])
      return <Text>w={rect.width}</Text>
    }

    const term = createTerm({ cols: 40, rows: 10 })
    const app = pipe(create(), withAg(), withTerm(term), withReact(<Probe />))
    app.render()

    expect(cleanupCalls).toBe(0)
    app[Symbol.dispose]()
    // Sync unmount: cleanup MUST have run before dispose returned.
    expect(cleanupCalls).toBe(1)
  })
})

// ============================================================================
// run() / createApp (ag-term/runtime → unmountFiberRoot via the test renderer)
// ============================================================================

describe("memory: ag-term run() runtime path", () => {
  test(
    "50 createTermless + run + handle.unmount cycles — each unmount fires cleanup exactly once",
    { timeout: 30_000 },
    async () => {
      // run() ultimately goes through the test renderer's `render()` which
      // we already cover in memory.test.tsx. Re-exercising the full
      // run + termless wiring catches regressions in the runtime layer
      // (Term creation, input owner, scheduler) that don't surface in the
      // bare `render()` test.
      //
      // N=50: stays below the live-termless-instance warning threshold (128)
      // so the test doesn't emit console output. The structural invariant
      // (each unmount fires cleanup once) holds for any N; 50 is sufficient
      // to exercise the full runtime path without triggering the leak guard.
      const { run } = await import("@silvery/ag-term/runtime")
      const { createTermless } = await import("@silvery/test")

      let cleanupCount = 0
      const N = 50

      const cycle = async (): Promise<void> => {
        function Tracked() {
          React.useEffect(() => {
            return () => {
              cleanupCount++
            }
          }, [])
          return <MountUnmountCycle visible />
        }

        using term = createTermless({ cols: 40, rows: 10 })
        const handle = await run(<Tracked />, term)
        handle.unmount()
      }

      for (let i = 0; i < N; i++) {
        await cycle()
      }

      // N cycles, N unmounts — each must have fired the cleanup synchronously.
      expect(cleanupCount).toBe(N)
    },
  )
})

// ============================================================================
// Regression sentinel: unmount asymmetry leak
// ============================================================================

describe("memory: regression sentinel for the unmount asymmetry leak", () => {
  // This test deliberately exercises the exact shape that leaked before
  // 9b81b87d / 9cf6ab86: many useBoxRect-using components that mount and
  // unmount in tight cycles. If someone reverts the unmountFiberRoot
  // helper to async updateContainer(null, ...), this is the test that
  // should fail loudly.
  //
  // Pre-fix: async unmount left signal-effect disposers pending; cleanup
  // callbacks did NOT fire synchronously. cleanupCount < N would occur.
  // Post-fix: sync unmount, cleanupCount === N exactly.
  test(
    "useBoxRect-heavy mount/unmount — 200 cycles, each cleanup fires exactly once",
    { timeout: 30_000 },
    async () => {
      await ensureLayoutEngine()

      let cleanupCount = 0
      const N = 200

      function HeavySubscriber() {
        // Five useBoxRect subscriptions per render — pre-fix this leaked
        // five signal-effect closures per mount cycle.
        const r1 = useBoxRect()
        const r2 = useBoxRect()
        const r3 = useBoxRect()
        const r4 = useBoxRect()
        const r5 = useBoxRect()
        React.useEffect(() => {
          return () => {
            cleanupCount++
          }
        }, [])
        return (
          <Box flexDirection="column">
            <Text>{r1.width}</Text>
            <Text>{r2.width}</Text>
            <Text>{r3.width}</Text>
            <Text>{r4.width}</Text>
            <Text>{r5.width}</Text>
          </Box>
        )
      }

      const cycle = (): void => {
        const term = createTerm({ cols: 80, rows: 24 })
        const app = pipe(create(), withAg(), withTerm(term), withReact(<HeavySubscriber />))
        app.render()
        app[Symbol.dispose]()
      }

      for (let i = 0; i < N; i++) {
        cycle()
      }

      // Sync unmount: all N cleanups must have run by now.
      // Pre-fix (async unmount): cleanupCount would be 0 or incomplete.
      expect(cleanupCount).toBe(N)
    },
  )
})
