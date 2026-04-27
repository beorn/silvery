/**
 * Heap-snapshot canary — proof that the unmount asymmetry leak isn't
 * sublinearly hiding under the byte budget.
 *
 * Why this exists in addition to memory.test.tsx + production-paths.test.tsx:
 *
 * - Heap-budget tests (the others) prove the leak is bounded under 15 MB
 *   per 200 cycles. They catch unbounded growth but allow per-cycle
 *   retention of (say) 50 KB that hides under the budget.
 * - This test uses V8/Bun heap snapshots to count `FiberRootNode`
 *   instances after the cycle loop. If a regression re-introduces the
 *   pre-fix async-unmount pattern, FiberRootNode count grows linearly
 *   with cycle count — which we detect by running the cycle at TWO
 *   scales (small + large) and asserting growth is sublinear.
 *
 * Why differential, not absolute:
 *
 * Bun's V8 heap snapshot includes nodes pending finalization. Back-to-
 * back snapshots after `Bun.gc(true)` show small drift (1-2 retained per
 * snapshot just from the snapshot machinery). That drift makes an
 * absolute "delta ≤ 0" assertion flaky. The differential version is
 * robust — pre-fix the leak is ~1 FiberRoot per cycle, so 200 cycles -
 * 50 cycles ≈ 150 extra retained. Post-fix, the delta-of-deltas is small
 * regardless of Bun's snapshot drift.
 *
 * `.slow.` because each snapshot is 50-200 ms and writes a JSON blob.
 *
 * Bead-class: km-silvery.unmount-asymmetry-sweep
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { writeHeapSnapshot } from "node:v8"
import { readFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { create, pipe, withAg, withTerm, withReact, createTerm } from "@silvery/ag-term"
import { ensureLayoutEngine } from "@silvery/ag-term/runtime"
import { Box, Text, useBoxRect } from "@silvery/ag-react"

// ============================================================================
// Heap snapshot helpers
// ============================================================================

function forceGc(): void {
  const b = (globalThis as { Bun?: { gc(sync: boolean): void } }).Bun
  if (b?.gc) {
    b.gc(true)
    b.gc(true)
    b.gc(true)
  } else if (typeof globalThis.gc === "function") {
    globalThis.gc()
    globalThis.gc()
  }
}

/** Count nodes whose name (lower-cased) contains the given substring. */
function fiberRootCount(): number {
  forceGc()

  const path = join(tmpdir(), `silvery-heap-${Date.now()}-${Math.random().toString(36).slice(2)}.heapsnapshot`)
  writeHeapSnapshot(path)
  const raw = readFileSync(path, "utf8")
  try {
    unlinkSync(path)
  } catch {
    // best-effort
  }

  const data = JSON.parse(raw) as {
    snapshot: { meta: { node_fields: string[] } }
    nodes: number[]
    strings: string[]
  }

  const nameIdx = data.snapshot.meta.node_fields.indexOf("name")
  const fieldsLen = data.snapshot.meta.node_fields.length
  if (nameIdx < 0 || fieldsLen <= 0) {
    throw new Error("heap-snapshot: malformed snapshot.meta.node_fields")
  }

  let count = 0
  for (let i = 0; i < data.nodes.length; i += fieldsLen) {
    const ni = data.nodes[i + nameIdx]
    if (ni === undefined) continue
    const name = (data.strings[ni] ?? "").toLowerCase()
    if (name.includes("fiberrootnode")) count++
  }
  return count
}

// ============================================================================
// Tests
// ============================================================================

describe("memory: heap-snapshot canary", () => {
  test(
    "withReact mount/unmount FiberRootNode growth is sublinear in cycle count",
    { timeout: 90_000 },
    async () => {
      await ensureLayoutEngine()

      function Probe() {
        // Heavy useBoxRect subscription set: pre-fix this leaked five
        // signal-effect closures per cycle. Post-fix the cleanup runs
        // synchronously inside dispose.
        const r1 = useBoxRect()
        const r2 = useBoxRect()
        const r3 = useBoxRect()
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

      // Two scales: 50 cycles and 200 cycles.
      //
      // Pre-fix: count(200) - count(50) ≈ 150 (linear growth at ~1/cycle).
      // Post-fix: count(200) - count(50) is small regardless of Bun's
      //           snapshot drift — the helper releases the FiberRoot at
      //           unmount, so neither 50 nor 200 cycles retain anything
      //           proportional to the cycle count.
      //
      // Run the smaller scale first to warm allocator + JIT.

      // Settle helper: Bun's V8 heap snapshot includes pending-finalization
      // nodes. Even after Bun.gc(true), some nodes need a tick before they
      // disappear from snapshot output. Two back-to-back gc + snapshot
      // calls separated by a setImmediate yield give finalizers a chance
      // to run before we sample.
      const settleAndCount = async (): Promise<number> => {
        forceGc()
        await new Promise<void>((resolve) => setImmediate(() => resolve()))
        forceGc()
        await new Promise<void>((resolve) => setImmediate(() => resolve()))
        return fiberRootCount()
      }

      for (let i = 0; i < 50; i++) cycle()
      const after50 = await settleAndCount()

      for (let i = 0; i < 200 - 50; i++) cycle()
      const after200 = await settleAndCount()

      const growthFor150ExtraCycles = after200 - after50

      // Pre-fix this would be ~150 (one FiberRoot per cycle).
      // Post-fix this is in single digits across runs (Bun snapshot drift).
      // Slack is set to 50 — half the per-cycle leak rate, so a regression
      // that re-introduces unbounded growth fails loudly without flaking
      // on snapshot drift.
      expect(growthFor150ExtraCycles).toBeLessThan(50)
    },
  )
})
