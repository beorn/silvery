/**
 * Structural lifecycle canary — proof that the unmount asymmetry leak doesn't
 * hide under the cleanup accounting.
 *
 * Bead: km-silvery.c1-fossil-sweep-broader
 *
 * Why this exists in addition to memory.test.tsx + production-paths.test.tsx:
 *
 * - production-paths.test.tsx runs 200 cycles and asserts cleanup fires 200
 *   times. Those tests catch unbounded growth but are fast-suite targets.
 * - This file runs at LARGER scales (500 cycles) and uses a PRNG-seeded fuzz
 *   variant to catch any shape of interleaved create/dispose that could hide a
 *   leak. It's marked `.slow.` to keep the fast suite green.
 *
 * **Invariant style (C1 L5 — no GC required):**
 *
 * Tests count synchronous effect cleanup invocations. N cycles must produce
 * exactly N cleanups — deterministic, no heap thresholds, no JIT settling,
 * no GC calls.
 *
 * Pre-fix (async unmount): cleanup callbacks did NOT fire synchronously;
 * cleanupCount after N cycles would be 0 (or race-dependent).
 * Post-fix (sync unmountFiberRoot): cleanupCount === N after N cycles.
 *
 * `.slow.` because 500 cycles * full pipe assembly costs ~2-5 seconds.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { create, pipe, withAg, withTerm, withReact, createTerm } from "@silvery/ag-term"
import { ensureLayoutEngine } from "@silvery/ag-term/runtime"
import { Box, Text, useBoxRect } from "@silvery/ag-react"

// ============================================================================
// PRNG — deterministic seeded random (mulberry32)
// ============================================================================

/**
 * Seeded PRNG so fuzz tests are reproducible without external dependencies.
 * Same algorithm as memory.test.tsx fuzz suite.
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

// ============================================================================
// Tests
// ============================================================================

describe("memory: structural canary (large-scale cycles)", () => {
  test(
    "500 withReact mount/dispose cycles — cleanup fires exactly 500 times",
    { timeout: 90_000 },
    async () => {
      await ensureLayoutEngine()

      let cleanupCount = 0
      const N = 500

      function Probe() {
        // Three useBoxRect subscriptions per render — the pre-fix shape that
        // accumulated signal-effect closures across cycles. Post-fix the
        // cleanup runs synchronously inside dispose.
        const r1 = useBoxRect()
        const r2 = useBoxRect()
        const r3 = useBoxRect()
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
          </Box>
        )
      }

      const cycle = (): void => {
        const term = createTerm({ cols: 80, rows: 24 })
        const app = pipe(create(), withAg(), withTerm(term), withReact(<Probe />))
        app.render()
        app[Symbol.dispose]()
      }

      for (let i = 0; i < N; i++) {
        cycle()
      }

      // Post-fix invariant: exactly N cleanups fired synchronously.
      // Pre-fix (async unmount): this would be 0 because the async path
      // didn't commit layout-effect cleanups before returning from unmount.
      expect(cleanupCount).toBe(N)
    },
  )

  test(
    "cleanup count is linear in N — 50 cycles produces 50 cleanups, 200 produces 200",
    { timeout: 60_000 },
    async () => {
      await ensureLayoutEngine()

      // This test mirrors the "sublinear growth" shape of the former heap-
      // snapshot canary but with a deterministic integer counter instead of
      // a V8 snapshot. Pre-fix the cleanup count would NOT scale linearly
      // (async unmount skips cleanups); post-fix it's exactly linear.

      function Counter({ onCleanup }: { onCleanup: () => void }) {
        useBoxRect()
        useBoxRect()
        useBoxRect()
        React.useEffect(() => {
          return () => {
            onCleanup()
          }
        }, [])
        return <Text>probe</Text>
      }

      const runCycles = (n: number): number => {
        let count = 0
        for (let i = 0; i < n; i++) {
          const term = createTerm({ cols: 80, rows: 24 })
          const app = pipe(
            create(),
            withAg(),
            withTerm(term),
            withReact(<Counter onCleanup={() => { count++ }} />),
          )
          app.render()
          app[Symbol.dispose]()
        }
        return count
      }

      const count50 = runCycles(50)
      const count200 = runCycles(200)

      // Exact linearity: each cycle produces exactly 1 cleanup.
      expect(count50).toBe(50)
      expect(count200).toBe(200)

      // Growth for the extra 150 cycles must be exactly 150.
      // Pre-fix: would be 0 (no cleanups from async unmount).
      // Snapshot drift is gone — counter is deterministic.
      expect(count200 - count50).toBe(150)
    },
  )
})

describe("memory: fuzz — random withReact create/dispose orderings", () => {
  test(
    "50 rounds with random N cycles — each cleanup fires exactly N times",
    { timeout: 90_000 },
    async () => {
      await ensureLayoutEngine()

      const rng = mulberry32(0xdeadbeef)

      for (let round = 0; round < 50; round++) {
        const N = 1 + Math.floor(rng() * 20) // 1..20 cycles per round

        let cleanupCount = 0

        function TrackedProbe() {
          useBoxRect()
          useBoxRect()
          React.useEffect(() => {
            return () => {
              cleanupCount++
            }
          }, [])
          return <Text>round={round}</Text>
        }

        for (let i = 0; i < N; i++) {
          const term = createTerm({ cols: 80, rows: 24 })
          const app = pipe(
            create(),
            withAg(),
            withTerm(term),
            withReact(<TrackedProbe />),
          )
          app.render()
          app[Symbol.dispose]()
        }

        // Each dispose must fire cleanup exactly once.
        expect(cleanupCount).toBe(N)
      }
    },
  )

  test(
    "interleaved render + dispose with varying component trees — zero missed cleanups",
    { timeout: 90_000 },
    async () => {
      await ensureLayoutEngine()

      const rng = mulberry32(0xcafebabe)
      let expectedCleanups = 0
      let actualCleanups = 0

      function makeProbe(boxRectCount: number) {
        return function Probe() {
          for (let i = 0; i < boxRectCount; i++) {
            // eslint-disable-next-line react-hooks/rules-of-hooks
            useBoxRect()
          }
          React.useEffect(() => {
            return () => {
              actualCleanups++
            }
          }, [])
          return <Text>{boxRectCount}</Text>
        }
      }

      // 30 rounds: random box count (1..5), random cycles (1..10)
      for (let round = 0; round < 30; round++) {
        const boxCount = 1 + Math.floor(rng() * 5)
        const N = 1 + Math.floor(rng() * 10)
        const Probe = makeProbe(boxCount)

        for (let i = 0; i < N; i++) {
          const term = createTerm({ cols: 80, rows: 24 })
          const app = pipe(
            create(),
            withAg(),
            withTerm(term),
            withReact(<Probe />),
          )
          app.render()
          app[Symbol.dispose]()
          expectedCleanups++
        }
      }

      // All 900 (≤) cleanups must have fired.
      expect(actualCleanups).toBe(expectedCleanups)
    },
  )
})
