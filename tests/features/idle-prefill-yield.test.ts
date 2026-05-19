/**
 * Tests for IdlePrefillScheduler (Wave-3 W6).
 *
 * Run: bun vitest run --project vendor vendor/silvery/tests/features/idle-prefill-yield.test.ts
 *
 * Covers the acceptance contract from
 * `hub/silvercode/design/scroll-wave3-plan.md` § W6 and
 * `@km/silvery/15338-W6-idle-prefill-scheduler`.
 */

import { describe, expect, test, vi } from "vitest"
import {
  createIdlePrefill,
  defaultIdleScheduler,
  type IdleScheduler,
  type WatermarkSource,
} from "../../packages/ag-react/src/hooks/use-idle-prefill"

// ============================================================================
// Harness — fake cache + manually-pumped scheduler
// ============================================================================

interface FakeCache extends WatermarkSource {
  watermark: number
  readonly rowCount: number
  measure(index: number): void
  measurements: number[]
}

function makeFakeCache(rowCount: number): FakeCache {
  const measurements: number[] = []
  let watermark = -1
  return {
    get watermark() {
      return watermark
    },
    set watermark(value: number) {
      watermark = value
    },
    rowCount,
    measure(index: number) {
      measurements.push(index)
      // Advance watermark only when measurement is contiguous (matches the
      // W5 cache invariant — out-of-order measurements wait).
      if (index === watermark + 1) {
        watermark = index
      }
    },
    measurements,
  }
}

interface FakeScheduler extends IdleScheduler {
  flush(): boolean
  drain(maxSteps?: number): number
  pending: number
}

function makeFakeScheduler(): FakeScheduler {
  const queue: Array<() => void> = []
  return {
    schedule(fn: () => void) {
      queue.push(fn)
      return fn
    },
    cancel(handle: unknown) {
      const idx = queue.indexOf(handle as () => void)
      if (idx >= 0) queue.splice(idx, 1)
    },
    /** Run one scheduled callback. Returns false if queue was empty. */
    flush() {
      const fn = queue.shift()
      if (fn === undefined) return false
      fn()
      return true
    },
    /** Drain everything until quiescent. Returns total slices run. */
    drain(maxSteps = 100_000): number {
      let steps = 0
      while (this.flush()) {
        steps++
        if (steps > maxSteps) {
          throw new Error(`FakeScheduler.drain exceeded ${maxSteps} steps — runaway loop?`)
        }
      }
      return steps
    },
    get pending() {
      return queue.length
    },
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("createIdlePrefill — basic walk", () => {
  test("walks watermark from -1 to rowCount-1 in chunkSize-sized slices", () => {
    const cache = makeFakeCache(64)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    })

    expect(cache.watermark).toBe(-1)
    prefill.start()
    expect(prefill.running).toBe(true)

    // Drain to completion. 64 rows / 16 per chunk = 4 slices.
    const slices = sched.drain()
    expect(slices).toBe(4)
    expect(cache.watermark).toBe(63)
    expect(prefill.complete).toBe(true)
    expect(prefill.running).toBe(false)
    expect(cache.measurements).toHaveLength(64)
  })

  test("each chunk measures exactly chunkSize rows (until rowCount cap)", () => {
    const cache = makeFakeCache(50)
    const sched = makeFakeScheduler()
    createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    }).start()

    sched.flush() // slice 1
    expect(cache.measurements).toHaveLength(16)
    expect(cache.watermark).toBe(15)

    sched.flush() // slice 2
    expect(cache.measurements).toHaveLength(32)

    sched.flush() // slice 3
    expect(cache.measurements).toHaveLength(48)

    sched.flush() // slice 4 — only 2 rows left
    expect(cache.measurements).toHaveLength(50)
    expect(cache.watermark).toBe(49)
  })

  test("10,000-row mount completes deterministically", () => {
    const cache = makeFakeCache(10_000)
    const sched = makeFakeScheduler()
    createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    }).start()
    const slices = sched.drain()
    expect(slices).toBe(Math.ceil(10_000 / 16))
    expect(cache.watermark).toBe(9_999)
    expect(cache.measurements).toHaveLength(10_000)
  })

  test("initial paint runs before any prefill work (start does not measure synchronously)", () => {
    const cache = makeFakeCache(1_000)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    })

    prefill.start()
    // Critical: start() must NOT run the first chunk synchronously — the
    // host paint loop runs first; only then does the scheduler dispatch.
    expect(cache.measurements).toHaveLength(0)
    expect(cache.watermark).toBe(-1)
    expect(prefill.running).toBe(true)

    // Now simulate "first paint complete" → idle slice fires.
    sched.flush()
    expect(cache.measurements).toHaveLength(16)
  })
})

describe("createIdlePrefill — chunk pacing", () => {
  test("each idle slice does bounded work (≤ chunkSize measurements)", () => {
    const cache = makeFakeCache(1_000)
    const sched = makeFakeScheduler()
    const measurements: number[] = []
    createIdlePrefill({
      source: cache,
      measureRow: (i) => {
        measurements.push(i)
        cache.measure(i)
      },
      scheduler: sched,
      chunkSize: 16,
    }).start()

    const before = measurements.length
    sched.flush()
    const delta = measurements.length - before
    expect(delta).toBeLessThanOrEqual(16)
    expect(delta).toBe(16)
  })

  test("wall-time per chunk stays under 5ms for trivial measureRow", () => {
    // The "≤ ~5ms work per slice" acceptance bullet is about the wall-time
    // budget of a single idle chunk under a representative measureRow. We
    // assert it with a no-op measureRow as a lower bound — production
    // measureRow is bounded by row count, not by the scheduler.
    const cache = makeFakeCache(10_000)
    const sched = makeFakeScheduler()
    createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    }).start()

    const t0 = performance.now()
    sched.flush()
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(5)
  })

  test("chunkSize mutation takes effect on the next slice, not the current one", () => {
    const cache = makeFakeCache(100)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 8,
    })
    prefill.start()
    sched.flush()
    expect(cache.measurements).toHaveLength(8)

    prefill.chunkSize = 32
    sched.flush()
    expect(cache.measurements).toHaveLength(8 + 32)
  })

  test("chunkSize clamps to 1 if a non-positive value is supplied", () => {
    const cache = makeFakeCache(4)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 0,
    })
    expect(prefill.chunkSize).toBe(1)
    prefill.chunkSize = -5
    expect(prefill.chunkSize).toBe(1)
    prefill.start()
    sched.flush()
    expect(cache.measurements).toHaveLength(1)
  })
})

describe("createIdlePrefill — pause / resume / dispose", () => {
  test("pause cancels the pending slice synchronously", () => {
    const cache = makeFakeCache(100)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    })
    prefill.start()
    expect(sched.pending).toBe(1)
    prefill.pause()
    expect(sched.pending).toBe(0)
    expect(prefill.running).toBe(false)
    // Even if the scheduler were poked, no work runs.
    sched.drain()
    expect(cache.measurements).toHaveLength(0)
  })

  test("start after pause resumes from the same row", () => {
    const cache = makeFakeCache(100)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    })
    prefill.start()
    sched.flush()
    expect(cache.watermark).toBe(15)
    prefill.pause()
    prefill.start()
    sched.flush()
    expect(cache.watermark).toBe(31)
    // No duplicates — pause/resume doesn't re-measure already-measured rows.
    const unique = new Set(cache.measurements).size
    expect(unique).toBe(cache.measurements.length)
  })

  test("start while running is a no-op (no double-scheduling)", () => {
    const cache = makeFakeCache(100)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    })
    prefill.start()
    prefill.start()
    prefill.start()
    expect(sched.pending).toBe(1)
  })

  test("start after complete is a no-op", () => {
    const cache = makeFakeCache(4)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
    })
    prefill.start()
    sched.flush()
    expect(prefill.complete).toBe(true)
    prefill.start()
    expect(sched.pending).toBe(0)
  })

  test("empty rowCount is immediately complete; start is a no-op", () => {
    const cache = makeFakeCache(0)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
    })
    expect(prefill.complete).toBe(true)
    prefill.start()
    expect(sched.pending).toBe(0)
  })

  test("dispose cancels pending work and unsubscribes from activity", () => {
    const cache = makeFakeCache(100)
    const sched = makeFakeScheduler()
    const unsubscribe = vi.fn()
    const subscribe = vi.fn(() => unsubscribe)
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      subscribeUserActivity: subscribe,
    })
    prefill.start()
    prefill.dispose()
    expect(sched.pending).toBe(0)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    // Further operations are no-ops.
    prefill.start()
    expect(sched.pending).toBe(0)
  })

  test("dispose is idempotent", () => {
    const cache = makeFakeCache(10)
    const sched = makeFakeScheduler()
    const unsubscribe = vi.fn()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      subscribeUserActivity: () => unsubscribe,
    })
    prefill.dispose()
    prefill.dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe("createIdlePrefill — user activity cancellation", () => {
  test("user activity pauses in-flight prefill", () => {
    const cache = makeFakeCache(1_000)
    const sched = makeFakeScheduler()
    let fire: () => void = () => {}
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
      subscribeUserActivity: (cb) => {
        fire = cb
        return () => {}
      },
    })
    prefill.start()
    sched.flush() // first chunk
    expect(cache.watermark).toBe(15)
    expect(prefill.running).toBe(true)

    fire() // simulate keypress

    expect(prefill.running).toBe(false)
    expect(sched.pending).toBe(0)
    // No further measurements arrive even if the scheduler is drained.
    sched.drain()
    expect(cache.measurements).toHaveLength(16)
  })

  test("after user activity, explicit start resumes from the next row", () => {
    const cache = makeFakeCache(64)
    const sched = makeFakeScheduler()
    let fire: () => void = () => {}
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 16,
      subscribeUserActivity: (cb) => {
        fire = cb
        return () => {}
      },
    })
    prefill.start()
    sched.flush()
    fire()
    prefill.start()
    sched.drain()
    expect(cache.watermark).toBe(63)
    expect(cache.measurements).toHaveLength(64)
  })

  test("activity fired before start does not crash and does not start the scheduler", () => {
    const cache = makeFakeCache(64)
    const sched = makeFakeScheduler()
    let fire: () => void = () => {}
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      subscribeUserActivity: (cb) => {
        fire = cb
        return () => {}
      },
    })
    fire()
    expect(sched.pending).toBe(0)
    expect(prefill.running).toBe(false)
    prefill.start()
    expect(sched.pending).toBe(1)
  })

  test("subscribe callback that throws on unsubscribe does not crash dispose", () => {
    const cache = makeFakeCache(4)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      subscribeUserActivity: () => () => {
        throw new Error("boom")
      },
    })
    expect(() => prefill.dispose()).not.toThrow()
  })
})

describe("createIdlePrefill — robustness", () => {
  test("out-of-order measurement (watermark stalls) does not loop forever", () => {
    // Caller's measureRow ignores requested index and measures something
    // else — the cache's watermark cannot advance contiguously.
    const cache = makeFakeCache(10)
    const sched = makeFakeScheduler()
    let calls = 0
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (_i: number) => {
        // Always measures row 5 — watermark never advances past -1.
        calls++
        cache.measure(5)
      },
      scheduler: sched,
      chunkSize: 4,
    })
    prefill.start()
    sched.flush()
    // Scheduler asked for 4 measurements (chunkSize), even though the
    // watermark didn't advance. It then re-scheduled itself (watermark
    // still < rowCount-1).
    expect(calls).toBe(4)
    expect(sched.pending).toBe(1)
    // We let it run a couple more slices and assert the scheduler did
    // bounded work — it did not synchronously hot-loop.
    sched.flush()
    expect(calls).toBe(8)
    prefill.pause()
  })

  test("works without a user-activity subscription", () => {
    const cache = makeFakeCache(20)
    const sched = makeFakeScheduler()
    const prefill = createIdlePrefill({
      source: cache,
      measureRow: (i) => cache.measure(i),
      scheduler: sched,
      chunkSize: 4,
    })
    prefill.start()
    sched.drain()
    expect(prefill.complete).toBe(true)
    expect(cache.measurements).toHaveLength(20)
  })

  test("defaultIdleScheduler uses setTimeout(0)", () => {
    vi.useFakeTimers()
    try {
      const fired: number[] = []
      const handle = defaultIdleScheduler.schedule(() => fired.push(1))
      expect(fired).toEqual([])
      vi.advanceTimersByTime(0)
      expect(fired).toEqual([1])
      // cancel is safe on already-fired handles.
      expect(() => defaultIdleScheduler.cancel(handle)).not.toThrow()
      // cancel before fire actually cancels.
      const h2 = defaultIdleScheduler.schedule(() => fired.push(2))
      defaultIdleScheduler.cancel(h2)
      vi.advanceTimersByTime(0)
      expect(fired).toEqual([1])
    } finally {
      vi.useRealTimers()
    }
  })
})
