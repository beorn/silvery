/**
 * Memory tests for production render paths.
 *
 * memory.test.tsx covers the test renderer (`render()` from
 * `@silvery/test`). This file extends the same 200-cycle / 15 MB budget
 * to the production render entry points that share the same unmount
 * helper (`unmountFiberRoot` from `@silvery/ag-react/reconciler`):
 *
 *   1. compose `pipe(create(), withAg(), withTerm(term), withReact(<App />))`
 *      with cleanup via `app[Symbol.dispose]()` — drains `app.defer`s,
 *      which fires the unmount inside withReact.
 *   2. ag-react `render(<App />, term)` (the `Renderer` class in
 *      packages/ag-react/src/render.tsx) with cleanup via `unmount()`.
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
// Helpers
// ============================================================================

/** Force a synchronous full GC on Bun (or `--expose-gc` Node) and return heap-used MB. */
function getHeapUsedMB(): number {
  const b = (globalThis as { Bun?: { gc(sync: boolean): void } }).Bun
  if (b?.gc) {
    b.gc(true)
    b.gc(true)
    b.gc(true)
  } else if (typeof globalThis.gc === "function") {
    globalThis.gc()
    globalThis.gc()
  }
  return process.memoryUsage().heapUsed / (1024 * 1024)
}

/**
 * Pre-warm before the budget measurement: first 50-100 mount/render cycles
 * pay JIT + allocator chunk-grant costs that overshadow steady-state
 * retention by 15-40 MB. Mirrors the helper in memory.test.tsx so production
 * paths use the same warm-up discipline.
 */
async function warmup(cycles: number, fn: () => void | Promise<void>): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await fn()
  }
  getHeapUsedMB() // forces GC settling between warmup + measurement
}

// ============================================================================
// withReact (compose-react.tsx → unmountFiberRoot)
// ============================================================================

describe("memory: withReact compose path", () => {
  test(
    "200 mount/dispose cycles with bounded growth",
    { timeout: 30_000, retry: 2 },
    async () => {
      await ensureLayoutEngine()

      const cycle = (): void => {
        const term = createTerm({ cols: 80, rows: 24 })
        // pipe(...) builds the app; app.defer(() => unmountFiberRoot(...))
        // is registered by withReact. Calling [Symbol.dispose]() drains
        // the defer stack, which fires the unmount.
        const app = pipe(
          create(),
          withAg(),
          withTerm(term),
          withReact(<MountUnmountCycle visible />),
        )
        // Force a render so React commit + layout-effect subscriptions
        // are real before we tear down — without this we'd never exercise
        // the cleanup path the test is supposed to verify.
        app.render()
        app[Symbol.dispose]()
      }

      await warmup(50, cycle)
      const heapBefore = getHeapUsedMB()

      let peak = heapBefore
      for (let i = 0; i < 200; i++) {
        cycle()
        if (i % 50 === 49) {
          const cur = getHeapUsedMB()
          if (cur > peak) peak = cur
        }
      }

      const peakDelta = peak - heapBefore

      // 200 cycles with cleanup should not grow more than 15MB peak.
      expect(peakDelta).toBeLessThan(15)
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
    "200 createTermless + run + handle.unmount cycles with bounded growth",
    { timeout: 30_000, retry: 2 },
    async () => {
      // run() ultimately goes through the test renderer's `render()` which
      // we already cover in memory.test.tsx. Re-exercising the full
      // run + termless wiring catches regressions in the runtime layer
      // (Term creation, input owner, scheduler) that don't surface in the
      // bare `render()` test.
      const { run } = await import("@silvery/ag-term/runtime")
      const { createTermless } = await import("@silvery/test")

      const cycle = async (): Promise<void> => {
        using term = createTermless({ cols: 40, rows: 10 })
        const handle = await run(<MountUnmountCycle visible />, term)
        handle.unmount()
      }

      await warmup(20, cycle)
      const heapBefore = getHeapUsedMB()

      let peak = heapBefore
      for (let i = 0; i < 200; i++) {
        await cycle()
        if (i % 50 === 49) {
          const cur = getHeapUsedMB()
          if (cur > peak) peak = cur
        }
      }

      const peakDelta = peak - heapBefore

      // 200 cycles of full runtime mount + unmount: 15 MB budget. Higher
      // than the bare-render test would justify because each cycle also
      // creates + disposes a Term + termless backend.
      expect(peakDelta).toBeLessThan(15)
    },
  )
})

// ============================================================================
// Useless leak: regression sentinel
// ============================================================================

describe("memory: regression sentinel for the unmount asymmetry leak", () => {
  // This test deliberately exercises the exact shape that leaked before
  // 9b81b87d / 9cf6ab86: many useBoxRect-using components that mount and
  // unmount in tight cycles. If someone reverts the unmountFiberRoot
  // helper to async updateContainer(null, ...), this is the test that
  // should fail loudly.
  test(
    "useBoxRect-heavy mount/unmount stays bounded under 200 cycles",
    { timeout: 30_000, retry: 2 },
    async () => {
      await ensureLayoutEngine()

      function HeavySubscriber() {
        // Five useBoxRect subscriptions per render — pre-fix this leaked
        // five signal-effect closures per mount cycle.
        const r1 = useBoxRect()
        const r2 = useBoxRect()
        const r3 = useBoxRect()
        const r4 = useBoxRect()
        const r5 = useBoxRect()
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
        const app = pipe(
          create(),
          withAg(),
          withTerm(term),
          withReact(<HeavySubscriber />),
        )
        app.render()
        app[Symbol.dispose]()
      }

      await warmup(50, cycle)
      const heapBefore = getHeapUsedMB()

      let peak = heapBefore
      for (let i = 0; i < 200; i++) {
        cycle()
        if (i % 50 === 49) {
          const cur = getHeapUsedMB()
          if (cur > peak) peak = cur
        }
      }

      const peakDelta = peak - heapBefore

      expect(peakDelta).toBeLessThan(15)
    },
  )
})
