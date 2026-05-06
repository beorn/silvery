/**
 * term.size (devices/size.ts) — unit tests.
 *
 * Verifies the alien-signals-backed Size owner:
 *  - Initializes from stdout.columns / stdout.rows (with fallbacks).
 *  - Exposes reactive cols / rows / snapshot as callable ReadSignals.
 *  - Coalesces burst resize events via a trailing-edge debounce.
 *  - `effect(() => size.cols())` fires once per coalesced change.
 *  - First read installs the resize listener lazily.
 *  - Dispose stops listening and clears any pending coalesce timer.
 *
 * Bead: km-silvery.term-sub-owners
 */

import EventEmitter from "node:events"
import { describe, test, expect } from "vitest"
import { effect } from "@silvery/signals"
import { createSize, createFixedSize } from "../../packages/ag-term/src/runtime/devices/size"

// ============================================================================
// Helpers
// ============================================================================

// Mock stdout — mutable columns/rows that emits `resize` events synchronously
// (matches Node's real WriteStream behavior on SIGWINCH).
function createMockStdout(cols = 80, rows = 24): NodeJS.WriteStream {
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream
  ;(stdout as unknown as { columns: number }).columns = cols
  ;(stdout as unknown as { rows: number }).rows = rows
  ;(stdout as unknown as { isTTY: boolean }).isTTY = false
  ;(stdout as unknown as { write: (s: string) => boolean }).write = () => true
  return stdout
}

const setDims = (stdout: NodeJS.WriteStream, cols: number, rows: number) => {
  ;(stdout as unknown as { columns: number }).columns = cols
  ;(stdout as unknown as { rows: number }).rows = rows
  stdout.emit("resize")
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Test-friendly factory: shortens the trailing-edge debounce so the existing
 * coalescing tests can complete in tens of milliseconds rather than waiting
 * for the production default (200 ms). The trailing-edge contract is the
 * same at any window size — only the latency changes.
 */
const mkSize = (stdout: NodeJS.WriteStream, opts?: { cols?: number; rows?: number }) =>
  createSize(stdout, { coalesceMs: 16, ...(opts ?? {}) })

/**
 * Subscribe to a size's coalesced resizes via `effect()`, skipping the seed
 * fire so the returned array contains only *changes* (matching the old
 * `size.subscribe(handler)` semantic).
 */
function observeChanges(size: ReturnType<typeof createSize>): {
  changes: Array<{ cols: number; rows: number }>
  stop: () => void
} {
  const changes: Array<{ cols: number; rows: number }> = []
  let seeded = false
  const stop = effect(() => {
    const s = size.snapshot()
    if (!seeded) {
      seeded = true
      return
    }
    changes.push(s)
  })
  return { changes, stop }
}

// ============================================================================
// Tests — createSize
// ============================================================================

describe("createSize: initialization", () => {
  test("reads cols/rows from stdout at construction", () => {
    const stdout = createMockStdout(132, 40)
    using size = mkSize(stdout)
    expect(size.cols()).toBe(132)
    expect(size.rows()).toBe(40)
    expect(size.snapshot()).toEqual({ cols: 132, rows: 40 })
  })

  test("falls back to 80x24 when stdout dims are zero", () => {
    const stdout = createMockStdout(0, 0)
    using size = mkSize(stdout)
    expect(size.cols()).toBe(80)
    expect(size.rows()).toBe(24)
  })

  test("falls back to 80x24 when stdout dims are missing", () => {
    const stdout = createMockStdout(0, 0)
    ;(stdout as unknown as { columns: number }).columns = undefined as unknown as number
    ;(stdout as unknown as { rows: number }).rows = undefined as unknown as number
    using size = mkSize(stdout)
    expect(size.cols()).toBe(80)
    expect(size.rows()).toBe(24)
  })

  test("explicit options override stdout dims", () => {
    const stdout = createMockStdout(100, 30)
    using size = createSize(stdout, { cols: 200, rows: 60 })
    expect(size.cols()).toBe(200)
    expect(size.rows()).toBe(60)
  })
})

describe("createSize: resize coalescing", () => {
  test("single resize fires effect with final dims", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(50)

    expect(changes).toEqual([{ cols: 100, rows: 30 }])
    expect(size.cols()).toBe(100)
    expect(size.rows()).toBe(30)

    stop()
  })

  test("burst of 3 resizes within 16ms coalesces to ONE notification", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(2)
    setDims(stdout, 110, 32)
    await sleep(2)
    setDims(stdout, 120, 35)

    await sleep(50)

    expect(changes.length).toBe(1)
    expect(changes[0]).toEqual({ cols: 120, rows: 35 })
    expect(size.cols()).toBe(120)
    expect(size.rows()).toBe(35)

    stop()
  })

  test("zero-dimension resize events keep the last valid dimensions", async () => {
    const stdout = createMockStdout(120, 40)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 0, 0)
    await sleep(50)

    expect(changes).toEqual([])
    expect(size.snapshot()).toEqual({ cols: 120, rows: 40 })

    setDims(stdout, 100, 30)
    await sleep(50)

    expect(changes).toEqual([{ cols: 100, rows: 30 }])
    expect(size.snapshot()).toEqual({ cols: 100, rows: 30 })

    stop()
  })

  test("two resizes separated by > coalesce window produce two notifications", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(50)
    setDims(stdout, 120, 35)
    await sleep(50)

    expect(changes.length).toBe(2)
    expect(changes[0]).toEqual({ cols: 100, rows: 30 })
    expect(changes[1]).toEqual({ cols: 120, rows: 35 })

    stop()
  })

  test("coalesceMs: 0 disables coalescing — each resize fires immediately", async () => {
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout, { coalesceMs: 0 })

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    setDims(stdout, 120, 35)

    // No wait needed — synchronous.
    expect(changes.length).toBe(2)

    stop()
  })

  test("trailing-edge debounce: late event during coalesce window resets the timer", async () => {
    // Trailing-edge contract: every event resets the pending timer, so the
    // flush only fires after `coalesceMs` of silence. Two events 30 ms apart
    // with a 50 ms window would have produced TWO publishes under a leading-
    // edge design (each event >16 ms apart, each starts its own timer); under
    // trailing-edge they collapse to ONE publish carrying the second event's
    // value.
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout, { coalesceMs: 50 })

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(30) // < window — event below resets the timer
    setDims(stdout, 110, 32)
    await sleep(100) // wait past the new window

    expect(changes.length).toBe(1)
    expect(changes[0]).toEqual({ cols: 110, rows: 32 })

    stop()
  })

  test("cmux-style burst (4 events at 80 ms intervals over ~300 ms) collapses to ONE publish", async () => {
    // Real-world repro: a cmux workspace switch fires 4–6 SIGWINCHs at
    // ~80 ms intervals carrying intermediate widths (e.g. 81→113→126→94).
    // The 200 ms production default debounce window must absorb the entire
    // burst into a single publish carrying the final geometry.
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout) // production default coalesceMs

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 81, 24)
    await sleep(80)
    setDims(stdout, 113, 24)
    await sleep(80)
    setDims(stdout, 126, 24)
    await sleep(80)
    setDims(stdout, 94, 24)
    await sleep(300) // wait past the trailing-edge window

    expect(changes.length).toBe(1)
    expect(changes[0]).toEqual({ cols: 94, rows: 24 })

    stop()
  }, 2000)

  test("multiple effects all receive the coalesced resize", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const a = observeChanges(size)
    const b = observeChanges(size)

    setDims(stdout, 100, 30)
    setDims(stdout, 120, 35)
    await sleep(50)

    expect(a.changes).toEqual([{ cols: 120, rows: 35 }])
    expect(b.changes).toEqual([{ cols: 120, rows: 35 }])

    a.stop()
    b.stop()
  })

  test("stopping the effect halts future notifications", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    await sleep(50)
    expect(changes.length).toBe(1)

    stop()
    setDims(stdout, 120, 35)
    await sleep(50)
    expect(changes.length).toBe(1)
  })
})

describe("createSize: reactive effect subscription", () => {
  test("effect(() => size.cols()) fires on coalesced resize", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const observed: number[] = []
    const stop = effect(() => {
      observed.push(size.cols())
    })

    // Seed read captures the construction-time value.
    expect(observed).toEqual([80])

    setDims(stdout, 120, 35)
    await sleep(50)

    expect(observed).toEqual([80, 120])

    stop()
  })

  test("effect reads of size.rows and size.snapshot stay in sync", async () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)

    const rowsLog: number[] = []
    const snapLog: Array<{ cols: number; rows: number }> = []

    const stopRows = effect(() => rowsLog.push(size.rows()))
    const stopSnap = effect(() => snapLog.push(size.snapshot()))

    setDims(stdout, 100, 50)
    await sleep(50)

    expect(rowsLog).toEqual([24, 50])
    expect(snapLog).toEqual([
      { cols: 80, rows: 24 },
      { cols: 100, rows: 50 },
    ])

    stopRows()
    stopSnap()
  })
})

describe("createSize: lazy install", () => {
  // The resize listener is installed on first read of any public ReadSignal.
  // Style-only createTerm() callers (chalk-compat paths in km-tui/text/*)
  // that never touch size pay zero listeners. Prevents the
  // MaxListenersExceededWarning (11+ resize listeners) observed when every
  // createTerm() eagerly wired one.
  test("no listener is installed at construction", () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(0)
    // First read installs.
    size.cols()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
  })

  test("subsequent reads do not stack listeners", () => {
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)
    size.cols()
    size.rows()
    size.snapshot()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
  })

  test("first read resyncs from live stdout — catches resize between construction and first read", () => {
    // Pre-fix behaviour: first read returned the construction-time seed and
    // stayed stale until the NEXT real resize event. Fixed by install-time
    // resync — on first read, re-poll stdout and publish if it differs.
    // See 2026-04-22 Pro review finding P0-2.
    const stdout = createMockStdout(80, 24)
    using size = mkSize(stdout)
    ;(stdout as unknown as { columns: number }).columns = 132
    ;(stdout as unknown as { rows: number }).rows = 40
    // No resize event emitted — but first read installs the listener AND
    // re-polls the live stdout, so we see the missed resize.
    expect(size.cols()).toBe(132)
    expect(size.rows()).toBe(40)
  })

  test("explicit options override disables install-time resync", () => {
    // When the caller passes cols/rows options, those are authoritative and
    // the first read must NOT overwrite them with live stdout values (tests
    // and emulator setup depend on this).
    const stdout = createMockStdout(100, 30)
    using size = createSize(stdout, { cols: 200, rows: 60 })
    ;(stdout as unknown as { columns: number }).columns = 132
    ;(stdout as unknown as { rows: number }).rows = 40
    expect(size.cols()).toBe(200)
    expect(size.rows()).toBe(60)
  })
})

describe("createSize: dispose", () => {
  test("dispose removes the resize listener when installed", () => {
    const stdout = createMockStdout(80, 24)
    const size = mkSize(stdout)
    size.cols() // installs the listener
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
    size[Symbol.dispose]()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(0)
  })

  test("dispose is idempotent", () => {
    const stdout = createMockStdout(80, 24)
    const size = mkSize(stdout)
    size[Symbol.dispose]()
    expect(() => size[Symbol.dispose]()).not.toThrow()
  })

  test("dispose clears pending coalesce timer", async () => {
    const stdout = createMockStdout(80, 24)
    const size = mkSize(stdout)

    const { changes, stop } = observeChanges(size)

    setDims(stdout, 100, 30)
    // Dispose BEFORE the coalesce window flushes.
    size[Symbol.dispose]()

    await sleep(50)
    // No notification fired — the timer was cleared.
    expect(changes.length).toBe(0)

    stop()
  })
})

// ============================================================================
// Tests — createFixedSize
// ============================================================================

describe("createFixedSize", () => {
  test("initial dims are set from the snapshot", () => {
    using size = createFixedSize({ cols: 100, rows: 30 })
    expect(size.cols()).toBe(100)
    expect(size.rows()).toBe(30)
    expect(size.snapshot()).toEqual({ cols: 100, rows: 30 })
  })

  test("update() fires effects with new dims", () => {
    using size = createFixedSize({ cols: 80, rows: 24 })
    const observed: Array<{ cols: number; rows: number }> = []
    const stop = effect(() => observed.push(size.snapshot()))

    size.update(120, 40)

    expect(size.cols()).toBe(120)
    expect(size.rows()).toBe(40)
    expect(observed).toEqual([
      { cols: 80, rows: 24 },
      { cols: 120, rows: 40 },
    ])

    stop()
  })

  test("update after dispose is a no-op", () => {
    const size = createFixedSize({ cols: 80, rows: 24 })
    const observed: Array<{ cols: number; rows: number }> = []
    const stop = effect(() => observed.push(size.snapshot()))

    size[Symbol.dispose]()
    size.update(120, 40)

    // Only the seed fire — update() after dispose writes nothing.
    expect(observed).toEqual([{ cols: 80, rows: 24 }])

    stop()
  })
})
