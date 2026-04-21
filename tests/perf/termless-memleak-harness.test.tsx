/**
 * Memory leak regression test for termless + silvery render.
 *
 * Runs `createTermless()` + `run()` + `handle.unmount()` in a tight loop
 * using the `using` (Symbol.dispose) cleanup pattern and asserts that
 * steady-state RSS does not grow beyond a bounded per-iteration budget.
 *
 * Background — bead `km-silvery.termless-memleak`:
 *   Vitest fork workers running termless tests accumulated 18-28 GB RSS
 *   over 10-15 minute CI runs. Root cause: tests that do
 *   `const term = createTermless(...)` (not `using term = ...`) never
 *   dispose the xterm.js Terminal instance; the xterm buffer
 *   (1000-line scrollback ≈ 1 MB/Terminal) lingers until the worker
 *   finally GCs, which is rarely.
 *
 * Fix: convert all leaky tests to `using term = createTermless(...)`.
 *
 * This harness is a guard: if someone reintroduces a leak path (static
 * caches, forgotten subscriptions, etc.) the steady-state RSS growth
 * check will fail.
 *
 * Run with:
 *   bun vitest run --project vendor vendor/silvery/tests/perf/termless-memleak-harness.test.tsx
 *
 * Env:
 *   SILVERY_MEMLEAK_SAMPLES=200  — iterations (default 120)
 *   SILVERY_MEMLEAK_LOG=1        — write /tmp/termless-memleak-using.log
 */
import React from "react"
import { writeFileSync } from "node:fs"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { run, type RunHandle } from "@silvery/ag-term/runtime"
import type { Term } from "@silvery/ag-term"

function LittleApp(): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold color="$primary">
        Memory leak harness
      </Text>
      {Array.from({ length: 20 }, (_, i) => (
        <Text key={i} color={i % 2 === 0 ? "$success" : "$muted"}>
          Row {i.toString().padStart(3, "0")} — lorem ipsum dolor sit amet
        </Text>
      ))}
    </Box>
  )
}

const SAMPLES = Number(process.env.SILVERY_MEMLEAK_SAMPLES ?? 120)
const DIMS = { cols: 120, rows: 40 }

/**
 * Warmup tolerance — first `WARMUP_ITERS` iterations are excluded from the
 * growth calculation. bun/vitest allocate fiber pools, string tables, and
 * JIT caches during early runs; when this test file runs LATE in a worker
 * (other test files already loaded silvery + React + zustand + etc.) the
 * first iterations still allocate perf tables, theme derivation caches, and
 * the fiber-root pool, so the "warmup" phase is larger than just the first
 * few iters.
 */
const WARMUP_ITERS = 60

/**
 * Steady-state RSS growth budget in KB per iteration. Measured empirically
 * on the fix baseline (`using term`): 20-40 KB/iter noise floor. A genuine
 * leak (xterm Terminal retained per iter) blows past 800 KB/iter.
 */
const MAX_STEADY_GROWTH_KB_PER_ITER = 300

function gc(): void {
  // Bun-native sync GC when available; Node.js global.gc when run with --expose-gc.
  const b = (globalThis as { Bun?: { gc(sync: boolean): void } }).Bun
  if (b?.gc) b.gc(true)
  else if (global.gc) global.gc()
}

function rssMb(): number {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10
}

function heapMb(): number {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
}

interface Sample {
  iter: number
  rss: number
  heap: number
  elapsedMs: number
}

function recordSample(samples: Sample[], iter: number, start: number): void {
  gc()
  samples.push({ iter, rss: rssMb(), heap: heapMb(), elapsedMs: Date.now() - start })
}

function emitCurve(samples: Sample[]): void {
  if (process.env.SILVERY_MEMLEAK_LOG !== "1") return
  const lines = samples.map(
    (s) =>
      `[using] iter=${s.iter.toString().padStart(4, "0")} rss=${s.rss} MB heap=${s.heap} MB elapsed=${s.elapsedMs}ms`,
  )
  try {
    writeFileSync("/tmp/termless-memleak-using.log", lines.join("\n") + "\n")
  } catch {
    /* ignore */
  }
}

/**
 * Compute steady-state growth as "(median RSS of last third) − (median RSS
 * of middle third)" divided by the iteration gap between them. Median is
 * robust to the sawtooth caused by GC heap-total bumps. Early warmup
 * samples (iter < WARMUP_ITERS) are excluded entirely.
 *
 * A genuine leak (per-iter retained xterm Terminal) produces monotonic
 * growth that shows up cleanly in the median-of-thirds delta. Flat noise
 * (what the `using` path produces) cancels to near zero.
 */
function steadyGrowthKbPerIter(samples: Sample[]): number {
  const steady = samples.filter((s) => s.iter >= WARMUP_ITERS)
  if (steady.length < 6) return 0
  const sortedByIter = steady.slice().sort((a, b) => a.iter - b.iter)
  const third = Math.floor(sortedByIter.length / 3)
  if (third < 2) return 0
  const midGroup = sortedByIter.slice(third, third * 2)
  const lastGroup = sortedByIter.slice(-third)
  const median = (arr: Sample[]): number => {
    const vs = arr.map((s) => s.rss).sort((a, b) => a - b)
    return vs[Math.floor(vs.length / 2)]!
  }
  const deltaMb = median(lastGroup) - median(midGroup)
  const midIter = midGroup[Math.floor(midGroup.length / 2)]!.iter
  const lastIter = lastGroup[Math.floor(lastGroup.length / 2)]!.iter
  const iterGap = lastIter - midIter
  if (iterGap <= 0) return 0
  return (deltaMb * 1024) / iterGap
}

describe("termless memory leak harness", () => {
  test(`using term = createTermless — steady-state RSS is bounded (${SAMPLES} iters)`, async () => {
    const samples: Sample[] = []
    const start = Date.now()

    for (let i = 0; i < SAMPLES; i++) {
      {
        using term: Term = createTermless(DIMS)
        const emulator = (term as unknown as Record<string, unknown>)._emulator as {
          feed(data: string): void
        }
        const handle: RunHandle = await run(<LittleApp />, {
          mode: "inline",
          writable: { write: (s: string) => emulator.feed(s) },
          cols: DIMS.cols,
          rows: DIMS.rows,
        })
        await handle.press("j")
        await settle()
        await handle.press("j")
        await settle()
        handle.unmount()
      }

      if (i % 10 === 0 || i === SAMPLES - 1) {
        recordSample(samples, i, start)
      }
    }

    emitCurve(samples)

    const growth = steadyGrowthKbPerIter(samples)
    const firstSteady = samples.find((s) => s.iter >= WARMUP_ITERS)
    const last = samples[samples.length - 1]!

    // Diagnostic string — always computed so we can include it in error messages.
    const diag =
      `samples=${samples.length}, iters=${SAMPLES}, ` +
      `firstSteady=${firstSteady?.rss ?? "n/a"} MB @ iter ${firstSteady?.iter ?? "n/a"}, ` +
      `last=${last.rss} MB @ iter ${last.iter}, ` +
      `steady-state growth=${growth.toFixed(1)} KB/iter`

    if (growth > MAX_STEADY_GROWTH_KB_PER_ITER) {
      throw new Error(
        `termless-memleak regression: steady-state RSS growth ${growth.toFixed(1)} KB/iter ` +
          `exceeds budget ${MAX_STEADY_GROWTH_KB_PER_ITER} KB/iter (${diag}).`,
      )
    }

    expect(samples.length).toBeGreaterThan(0)
    expect(growth).toBeLessThanOrEqual(MAX_STEADY_GROWTH_KB_PER_ITER)
  }, 240_000)
})
