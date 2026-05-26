/**
 * snapshotGuest — built-in IslandGuest for static / mutable cell-grid content.
 *
 * Phase 2 of `@km/silvery/15646-islands`. snapshotGuest is the simplest
 * guest — no input, no modes, no signals, just paint. Useful for tests,
 * static demos, GIF playback frames, and as the composition base for
 * `sandbox(snapshotGuest(...))` smoke tests of the host integration path.
 *
 * Coverage:
 *   1. Build from explicit dims (empty buffer)
 *   2. Build from pre-existing CellBuffer (reference preserved)
 *   3. Build from cells literal (per-row arrays)
 *   4. Mutating MutableCellBuffer → invalidateAll notifies subscribers
 *   5. setBuffer with matching dims → swaps + notifies
 *   6. setBuffer with mismatched dims → throws
 *   7. dispose() clears subscribers
 *   8. ready signal emitted via ctx.emit at init time
 *   9. Empty capabilities (host doesn't route input / modes / signals)
 *   10. Reject conflicting options (both buffer AND cells)
 */

import { describe, expect, test, vi } from "vitest"
import { snapshotGuest, type SnapshotGuestHandle } from "@silvery/ag/island-guests"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import type { Cell } from "@silvery/ag/types"
import type { IslandContext, IslandSignal } from "@silvery/ag/island-types"

// ────────────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────────────

function makeCell(char: string, overrides?: Partial<Cell>): Cell {
  return {
    char,
    fg: null,
    bg: null,
    attrs: {},
    wide: false,
    continuation: false,
    ...overrides,
  }
}

function fakeContext(cols: number, rows: number): IslandContext & { signals: IslandSignal[] } {
  const signals: IslandSignal[] = []
  const ctx = {
    cols,
    rows,
    emit(signal: IslandSignal) {
      signals.push(signal)
    },
    requestResize() {},
    async execOSC() {
      return undefined
    },
    abortSignal: new AbortController().signal,
    now() {
      return performance.now()
    },
    signals,
  }
  return ctx
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("snapshotGuest — construction modes", () => {
  test("from dims (cols + rows) creates empty buffer", async () => {
    const guest = snapshotGuest({ cols: 10, rows: 3 })
    const ctx = fakeContext(10, 3)
    const handle = (await guest.init(ctx)) as SnapshotGuestHandle
    expect(handle.output.buffer.cols).toBe(10)
    expect(handle.output.buffer.rows).toBe(3)
    // Empty buffer — cells default to whatever createCellBuffer initializes
    // (typically a space cell). Just verify it doesn't throw.
    expect(() => handle.output.buffer.getCell(0, 0)).not.toThrow()
  })

  test("from explicit buffer preserves reference", async () => {
    const buffer = createCellBuffer(5, 5)
    buffer.setCell(2, 2, makeCell("X"))
    const guest = snapshotGuest({ buffer })
    const handle = (await guest.init(fakeContext(5, 5))) as SnapshotGuestHandle
    expect(handle.output.buffer).toBe(buffer) // identity preserved
    expect(handle.output.buffer.getCell(2, 2).char).toBe("X")
  })

  test("from cells literal populates buffer", async () => {
    const guest = snapshotGuest({
      cells: [
        ["A", "B", "C"],
        ["D", "E", "F"],
      ],
    })
    const handle = (await guest.init(fakeContext(3, 2))) as SnapshotGuestHandle
    expect(handle.output.buffer.cols).toBe(3)
    expect(handle.output.buffer.rows).toBe(2)
    expect(handle.output.buffer.getCell(0, 0).char).toBe("A")
    expect(handle.output.buffer.getCell(2, 0).char).toBe("C")
    expect(handle.output.buffer.getCell(1, 1).char).toBe("E")
  })

  test("from cells literal with Cell objects (not just strings)", async () => {
    const guest = snapshotGuest({
      cells: [[makeCell("X", { fg: "#ff0000" }), "Y"]],
    })
    const handle = (await guest.init(fakeContext(2, 1))) as SnapshotGuestHandle
    expect(handle.output.buffer.getCell(0, 0).fg).toBe("#ff0000")
    expect(handle.output.buffer.getCell(1, 0).char).toBe("Y")
  })

  test("rejects when neither buffer nor cells nor dims provided", () => {
    expect(() => snapshotGuest({})).toThrow(/requires one of/)
  })

  test("rejects when both buffer and cells provided", () => {
    const buffer = createCellBuffer(3, 3)
    expect(() => snapshotGuest({ buffer, cells: [["A"]] })).toThrow(/at most one/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Subscription / mutation
// ────────────────────────────────────────────────────────────────────────────

describe("snapshotGuest — output subscription + mutation", () => {
  test("invalidateAll notifies subscribers", async () => {
    const guest = snapshotGuest({ cols: 4, rows: 2 })
    const handle = (await guest.init(fakeContext(4, 2))) as SnapshotGuestHandle
    const listener = vi.fn()
    handle.output.subscribe(listener)
    handle.output.invalidateAll()
    expect(listener).toHaveBeenCalledTimes(1)
    handle.output.invalidateAll()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  test("unsubscribe stops further notifications", async () => {
    const guest = snapshotGuest({ cols: 4, rows: 2 })
    const handle = (await guest.init(fakeContext(4, 2))) as SnapshotGuestHandle
    const listener = vi.fn()
    const unsub = handle.output.subscribe(listener)
    handle.output.invalidateAll()
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    handle.output.invalidateAll()
    expect(listener).toHaveBeenCalledTimes(1) // unchanged
  })

  test("writeCells is a no-op (snapshot mutates via underlying buffer instead)", async () => {
    const buffer = createCellBuffer(3, 1)
    const guest = snapshotGuest({ buffer })
    const handle = (await guest.init(fakeContext(3, 1))) as SnapshotGuestHandle
    const listener = vi.fn()
    handle.output.subscribe(listener)
    // writeCells exists on the contract but snapshot's impl is a no-op.
    handle.output.writeCells([{ row: 0, col: 0, width: 3, height: 1 }], createCellBuffer(3, 1))
    expect(listener).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// setBuffer escape hatch
// ────────────────────────────────────────────────────────────────────────────

describe("snapshotGuest — setBuffer", () => {
  test("setBuffer with matching dims swaps and notifies", async () => {
    const original = createCellBuffer(3, 2)
    original.setCell(0, 0, makeCell("A"))
    const replacement = createCellBuffer(3, 2)
    replacement.setCell(0, 0, makeCell("B"))

    const guest = snapshotGuest({ buffer: original })
    const handle = (await guest.init(fakeContext(3, 2))) as SnapshotGuestHandle
    expect(handle.output.buffer.getCell(0, 0).char).toBe("A")

    const listener = vi.fn()
    handle.output.subscribe(listener)
    handle.setBuffer(replacement)

    expect(handle.output.buffer.getCell(0, 0).char).toBe("B")
    expect(handle.output.buffer).toBe(replacement)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test("setBuffer with mismatched dims throws", async () => {
    const guest = snapshotGuest({ cols: 3, rows: 2 })
    const handle = (await guest.init(fakeContext(3, 2))) as SnapshotGuestHandle
    expect(() => handle.setBuffer(createCellBuffer(4, 2))).toThrow(/dims mismatch/)
    expect(() => handle.setBuffer(createCellBuffer(3, 3))).toThrow(/dims mismatch/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ────────────────────────────────────────────────────────────────────────────

describe("snapshotGuest — lifecycle", () => {
  test("ready signal emitted at init", async () => {
    const guest = snapshotGuest({ cols: 3, rows: 1 })
    const ctx = fakeContext(3, 1)
    await guest.init(ctx)
    expect(ctx.signals).toEqual([{ type: "ready" }])
  })

  test("dispose clears subscribers (no further notifications after)", async () => {
    const guest = snapshotGuest({ cols: 3, rows: 1 })
    const handle = (await guest.init(fakeContext(3, 1))) as SnapshotGuestHandle
    const listener = vi.fn()
    handle.output.subscribe(listener)
    handle.dispose()
    handle.output.invalidateAll()
    expect(listener).not.toHaveBeenCalled()
  })

  test("empty capabilities — host doesn't try to route input / modes / signals", () => {
    const guest = snapshotGuest({ cols: 3, rows: 1 })
    expect(guest.capabilities).toBeUndefined()
  })

  test("size owner reports the buffer's dimensions", async () => {
    const guest = snapshotGuest({ cols: 80, rows: 24 })
    const handle = (await guest.init(fakeContext(80, 24))) as SnapshotGuestHandle
    expect(handle.size.cols).toBe(80)
    expect(handle.size.rows).toBe(24)
  })

  test("size owner ignores requestResize (snapshot dims are immutable)", async () => {
    const guest = snapshotGuest({ cols: 10, rows: 5 })
    const handle = (await guest.init(fakeContext(10, 5))) as SnapshotGuestHandle
    handle.size.requestResize(20, 10)
    expect(handle.size.cols).toBe(10) // unchanged
    expect(handle.size.rows).toBe(5)
  })
})
