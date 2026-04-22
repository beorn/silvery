/**
 * term.size (devices/size.ts) — unit tests.
 *
 * Verifies the alien-signals-backed Size owner:
 *  - Initializes from stdout.columns / stdout.rows (with fallbacks).
 *  - Exposes reactive cols / rows / snapshot.
 *  - Coalesces burst resize events within the 16ms window.
 *  - Subscribers receive the final geometry once per burst.
 *  - Dispose stops listening and clears any pending coalesce timer.
 *
 * Mirrors the shape of term-provider-resize-coalesce.test.ts — the
 * coalescing logic was moved here from term-provider in Phase 5.
 *
 * Bead: km-silvery.term-sub-owners
 */

import EventEmitter from "node:events"
import { describe, test, expect } from "vitest"
import {
  createSize,
  createFixedSize,
} from "../../packages/ag-term/src/runtime/devices/size"

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

// ============================================================================
// Tests — createSize
// ============================================================================

describe("createSize: initialization", () => {
  test("reads cols/rows from stdout at construction", () => {
    const stdout = createMockStdout(132, 40)
    using size = createSize(stdout)
    expect(size.cols).toBe(132)
    expect(size.rows).toBe(40)
    expect(size.snapshot).toEqual({ cols: 132, rows: 40 })
  })

  test("falls back to 80x24 when stdout dims are zero/missing", () => {
    const stdout = createMockStdout(0, 0)
    ;(stdout as unknown as { columns: number }).columns = undefined as unknown as number
    ;(stdout as unknown as { rows: number }).rows = undefined as unknown as number
    using size = createSize(stdout)
    expect(size.cols).toBe(80)
    expect(size.rows).toBe(24)
  })

  test("explicit options override stdout dims", () => {
    const stdout = createMockStdout(100, 30)
    using size = createSize(stdout, { cols: 200, rows: 60 })
    expect(size.cols).toBe(200)
    expect(size.rows).toBe(60)
  })
})

describe("createSize: resize coalescing", () => {
  test("single resize fires subscribe with final dims", async () => {
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout)

    const events: Array<{ cols: number; rows: number }> = []
    size.subscribe((s) => events.push(s))

    setDims(stdout, 100, 30)
    await sleep(50)

    expect(events).toEqual([{ cols: 100, rows: 30 }])
    expect(size.cols).toBe(100)
    expect(size.rows).toBe(30)
  })

  test("burst of 3 resizes within 16ms coalesces to ONE notification", async () => {
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout)

    const events: Array<{ cols: number; rows: number }> = []
    size.subscribe((s) => events.push(s))

    setDims(stdout, 100, 30)
    await sleep(2)
    setDims(stdout, 110, 32)
    await sleep(2)
    setDims(stdout, 120, 35)

    await sleep(50)

    expect(events.length).toBe(1)
    expect(events[0]).toEqual({ cols: 120, rows: 35 })
    expect(size.cols).toBe(120)
    expect(size.rows).toBe(35)
  })

  test("two resizes separated by > coalesce window produce two notifications", async () => {
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout)

    const events: Array<{ cols: number; rows: number }> = []
    size.subscribe((s) => events.push(s))

    setDims(stdout, 100, 30)
    await sleep(50)
    setDims(stdout, 120, 35)
    await sleep(50)

    expect(events.length).toBe(2)
    expect(events[0]).toEqual({ cols: 100, rows: 30 })
    expect(events[1]).toEqual({ cols: 120, rows: 35 })
  })

  test("coalesceMs: 0 disables coalescing — each resize fires immediately", async () => {
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout, { coalesceMs: 0 })

    const events: Array<{ cols: number; rows: number }> = []
    size.subscribe((s) => events.push(s))

    setDims(stdout, 100, 30)
    setDims(stdout, 120, 35)

    // No wait needed — synchronous.
    expect(events.length).toBe(2)
  })

  test("multiple subscribers all receive the coalesced resize", async () => {
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout)

    const a: Array<{ cols: number; rows: number }> = []
    const b: Array<{ cols: number; rows: number }> = []
    size.subscribe((s) => a.push(s))
    size.subscribe((s) => b.push(s))

    setDims(stdout, 100, 30)
    setDims(stdout, 120, 35)
    await sleep(50)

    expect(a).toEqual([{ cols: 120, rows: 35 }])
    expect(b).toEqual([{ cols: 120, rows: 35 }])
  })

  test("unsubscribe stops future notifications", async () => {
    const stdout = createMockStdout(80, 24)
    using size = createSize(stdout)

    const events: Array<{ cols: number; rows: number }> = []
    const off = size.subscribe((s) => events.push(s))

    setDims(stdout, 100, 30)
    await sleep(50)
    expect(events.length).toBe(1)

    off()
    setDims(stdout, 120, 35)
    await sleep(50)
    expect(events.length).toBe(1)
  })
})

describe("createSize: dispose", () => {
  test("dispose removes the resize listener", () => {
    const stdout = createMockStdout(80, 24)
    const size = createSize(stdout)
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(1)
    size[Symbol.dispose]()
    expect((stdout as EventEmitter).listenerCount("resize")).toBe(0)
  })

  test("dispose is idempotent", () => {
    const stdout = createMockStdout(80, 24)
    const size = createSize(stdout)
    size[Symbol.dispose]()
    expect(() => size[Symbol.dispose]()).not.toThrow()
  })

  test("dispose clears pending coalesce timer", async () => {
    const stdout = createMockStdout(80, 24)
    const size = createSize(stdout)

    const events: Array<{ cols: number; rows: number }> = []
    size.subscribe((s) => events.push(s))

    setDims(stdout, 100, 30)
    // Dispose BEFORE the coalesce window flushes.
    size[Symbol.dispose]()

    await sleep(50)
    // No notification fired — the timer was cleared.
    expect(events.length).toBe(0)
  })
})

// ============================================================================
// Tests — createFixedSize
// ============================================================================

describe("createFixedSize", () => {
  test("initial dims are set from the snapshot", () => {
    using size = createFixedSize({ cols: 100, rows: 30 })
    expect(size.cols).toBe(100)
    expect(size.rows).toBe(30)
    expect(size.snapshot).toEqual({ cols: 100, rows: 30 })
  })

  test("update() fires subscribers with new dims", () => {
    using size = createFixedSize({ cols: 80, rows: 24 })
    const events: Array<{ cols: number; rows: number }> = []
    size.subscribe((s) => events.push(s))

    size.update(120, 40)

    expect(size.cols).toBe(120)
    expect(size.rows).toBe(40)
    expect(events).toEqual([{ cols: 120, rows: 40 }])
  })

  test("update after dispose is a no-op", () => {
    const size = createFixedSize({ cols: 80, rows: 24 })
    const events: Array<{ cols: number; rows: number }> = []
    size.subscribe((s) => events.push(s))

    size[Symbol.dispose]()
    size.update(120, 40)

    expect(events.length).toBe(0)
  })
})
