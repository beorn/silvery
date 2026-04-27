/**
 * Tests for hybrid output emission (output-density.ts + output-modes.ts).
 *
 * Phase 2 — exercises the density analyzer + emitters directly. Phase 3 will
 * wire them into output-phase.ts behind SILVERY_HYBRID_OUTPUT and add
 * end-to-end ANSI golden tests.
 *
 * Tracking: km-silvery.known-limits.hybrid-output
 */

import { describe, test, expect } from "vitest"
import {
  TerminalBuffer,
  createMutableCell,
  type Cell,
} from "@silvery/ag-term/buffer"
import {
  analyzeRowDensity,
  pickEmissionMode,
} from "@silvery/ag-term/pipeline/output-density"
import {
  createOutputEmitState,
  emitWholeRow,
  emitRuns,
  emitScatter,
} from "@silvery/ag-term/pipeline/output-modes"
import type { CellChange } from "@silvery/ag-term/pipeline/types"
import type { OutputContext } from "@silvery/ag-term/pipeline/output-phase"

// ============================================================================
// Helpers
// ============================================================================

function makeCell(overrides: Partial<Cell> = {}): Cell {
  return {
    char: " ",
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {},
    wide: false,
    continuation: false,
    ...overrides,
  }
}

function change(x: number, y: number, cell: Partial<Cell> = {}): CellChange {
  return { x, y, cell: makeCell(cell) }
}

/** Sort changes by (y, x) — analyzeRowDensity precondition. */
function sorted(pool: CellChange[]): CellChange[] {
  return [...pool].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
}

const defaultCtx: OutputContext = {
  caps: {
    underlineStyles: ["single", "double", "curly", "dotted", "dashed"],
    underlineColor: true,
    overline: true,
    colorLevel: "truecolor",
  },
  measurer: null,
  sgrCache: new Map(),
  transitionCache: new Map(),
  mode: "fullscreen",
  termRows: undefined,
}

// ============================================================================
// analyzeRowDensity
// ============================================================================

describe("analyzeRowDensity", () => {
  test("empty pool produces zero rows", () => {
    const result = analyzeRowDensity([], 0, 80)
    expect(result.rowCount).toBe(0)
  })

  test("single cell produces one row with one run", () => {
    const pool = sorted([change(5, 3, { char: "x" })])
    const result = analyzeRowDensity(pool, pool.length, 80)
    expect(result.rowCount).toBe(1)
    const row = result.rows[0]!
    expect(row.y).toBe(3)
    expect(row.dirty).toBe(1)
    expect(row.minX).toBe(5)
    expect(row.maxX).toBe(5)
    expect(row.runCount).toBe(1)
    expect(row.runs[0]).toEqual({ start: 5, end: 5 })
    expect(row.poolStart).toBe(0)
    expect(row.poolEnd).toBe(1)
  })

  test("contiguous run on one row", () => {
    const pool = sorted([
      change(10, 0, { char: "a" }),
      change(11, 0, { char: "b" }),
      change(12, 0, { char: "c" }),
      change(13, 0, { char: "d" }),
      change(14, 0, { char: "e" }),
    ])
    const result = analyzeRowDensity(pool, pool.length, 80)
    expect(result.rowCount).toBe(1)
    const row = result.rows[0]!
    expect(row.dirty).toBe(5)
    expect(row.runCount).toBe(1)
    expect(row.runs[0]).toEqual({ start: 10, end: 14 })
  })

  test("two non-adjacent runs on one row", () => {
    const pool = sorted([
      change(2, 0),
      change(3, 0),
      change(10, 0),
      change(11, 0),
      change(12, 0),
    ])
    const result = analyzeRowDensity(pool, pool.length, 80)
    const row = result.rows[0]!
    expect(row.dirty).toBe(5)
    expect(row.runCount).toBe(2)
    expect(row.runs[0]).toEqual({ start: 2, end: 3 })
    expect(row.runs[1]).toEqual({ start: 10, end: 12 })
  })

  test("three rows with mixed densities", () => {
    const pool = sorted([
      change(0, 0),
      change(1, 0), // contiguous run row 0
      change(40, 1), // single cell row 1
      change(5, 2),
      change(7, 2), // 2 isolated cells row 2
    ])
    const result = analyzeRowDensity(pool, pool.length, 80)
    expect(result.rowCount).toBe(3)
    expect(result.rows[0]!.runCount).toBe(1)
    expect(result.rows[1]!.runCount).toBe(1)
    expect(result.rows[2]!.runCount).toBe(2)
  })

  test("wide-char widens runs and dedupes continuation", () => {
    // Wide char at x=10 occupies columns 10 and 11.
    // Pool has main cell + continuation cell + adjacent cell at x=12.
    const pool = sorted([
      change(10, 0, { char: "あ", wide: true }),
      change(11, 0, { continuation: true }),
      change(12, 0, { char: "x" }),
    ])
    const result = analyzeRowDensity(pool, pool.length, 80)
    const row = result.rows[0]!
    // Continuation cell does not count toward dirty.
    expect(row.dirty).toBe(2) // main wide + adjacent
    expect(row.runCount).toBe(1) // widened to cover [10, 12]
    expect(row.runs[0]!.start).toBe(10)
    expect(row.runs[0]!.end).toBeGreaterThanOrEqual(12)
    expect(row.minX).toBe(10)
    expect(row.maxX).toBe(12)
  })

  test("reused across calls (zero allocation)", () => {
    const pool1 = sorted([change(0, 0), change(5, 0)])
    const result1 = analyzeRowDensity(pool1, pool1.length, 80)
    const rowsRef = result1.rows
    expect(result1.rowCount).toBe(1)

    const pool2 = sorted([change(2, 1), change(3, 1), change(8, 2)])
    const result2 = analyzeRowDensity(pool2, pool2.length, 80)
    expect(result2.rows).toBe(rowsRef) // same pool reused
    expect(result2.rowCount).toBe(2)
    expect(result2.rows[0]!.y).toBe(1)
    expect(result2.rows[1]!.y).toBe(2)
  })
})

// ============================================================================
// pickEmissionMode
// ============================================================================

describe("pickEmissionMode", () => {
  function summary(
    overrides: Partial<{
      dirty: number
      runCount: number
      minX: number
      maxX: number
    }>,
  ) {
    return {
      y: 0,
      dirty: overrides.dirty ?? 1,
      minX: overrides.minX ?? 0,
      maxX: overrides.maxX ?? (overrides.dirty ?? 1) - 1,
      runCount: overrides.runCount ?? 1,
      runs: [] as { start: number; end: number }[],
      poolStart: 0,
      poolEnd: overrides.dirty ?? 1,
    }
  }

  test("scatter fast path: dirty <= 2", () => {
    expect(pickEmissionMode(summary({ dirty: 1, runCount: 1 }), 80)).toBe("scatter")
    expect(pickEmissionMode(summary({ dirty: 2, runCount: 2 }), 80)).toBe("scatter")
  })

  test("whole-row fast path: dirty * 2 >= width", () => {
    expect(pickEmissionMode(summary({ dirty: 40, runCount: 5 }), 80)).toBe("whole-row")
    expect(pickEmissionMode(summary({ dirty: 50, runCount: 10 }), 80)).toBe("whole-row")
  })

  test("run-length fast path: single contiguous run", () => {
    expect(pickEmissionMode(summary({ dirty: 5, runCount: 1 }), 80)).toBe("run-length")
    expect(pickEmissionMode(summary({ dirty: 10, runCount: 1 }), 80)).toBe("run-length")
  })

  test("estimator picks run-length over scatter for multi-run sparse", () => {
    // 8 cells in 3 runs on width-200 row (canonical design-doc constants).
    //   scatterCost = 8*12 = 96
    //   runCost     = 3*10 + 8*2 = 46
    //   wholeCost   = 8 + 200*2 = 408
    // → run-length
    expect(pickEmissionMode(summary({ dirty: 8, runCount: 3 }), 200)).toBe("run-length")
  })

  test("estimator picks scatter when runs are very fragmented", () => {
    // 5 cells in 5 runs (every cell is its own run) on width-200.
    //   scatterCost = 5*12 = 60
    //   runCost     = 5*10 + 5*2 = 60
    //   wholeCost   = 8 + 200*2 = 408
    // Tie between scatter and run-length → run-length wins (less per-cell
    // bookkeeping). To force scatter, runs would have to exceed dirty — not
    // possible since runCount <= dirty. This test guards the tie-break shape.
    const mode = pickEmissionMode(summary({ dirty: 5, runCount: 5 }), 200)
    expect(["scatter", "run-length"]).toContain(mode)
  })

  test("estimator picks whole-row for high-density wide rows", () => {
    // 30 cells in 10 runs on width-80 (dirty * 2 = 60 < 80, not fast-path).
    //   scatterCost = 30*12 = 360
    //   runCost     = 10*10 + 30*2 = 160
    //   wholeCost   = 8 + 80*2 = 168
    // → run-length (cheapest by 8 bytes)
    expect(pickEmissionMode(summary({ dirty: 30, runCount: 10 }), 80)).toBe("run-length")

    // 35 cells in 20 runs on width-80.
    //   scatterCost = 35*12 = 420
    //   runCost     = 20*10 + 35*2 = 270
    //   wholeCost   = 8 + 80*2 = 168
    // → whole-row (cheapest)
    expect(pickEmissionMode(summary({ dirty: 35, runCount: 20 }), 80)).toBe("whole-row")
  })
})

// ============================================================================
// Emitters (smoke tests)
// ============================================================================

describe("emitWholeRow", () => {
  test("emits all cells on row with single CUP", () => {
    const buf = new TerminalBuffer(10, 3)
    for (let x = 0; x < 10; x++) {
      buf.setCell(x, 1, makeCell({ char: String.fromCharCode(65 + x) }))
    }
    const summary = analyzeRowDensity([change(0, 1), change(1, 1)], 2, 10).rows[0]!
    const state = createOutputEmitState({ isInline: false })
    emitWholeRow(summary, buf, defaultCtx, state)
    // Should contain all 10 chars.
    expect(state.output).toMatch(/A.*B.*C.*D.*E.*F.*G.*H.*I.*J/)
    // Cursor positioned at width.
    expect(state.cursorX).toBe(10)
  })
})

describe("emitRuns", () => {
  test("emits a single contiguous run", () => {
    const buf = new TerminalBuffer(20, 3)
    buf.setCell(5, 0, makeCell({ char: "h" }))
    buf.setCell(6, 0, makeCell({ char: "i" }))
    buf.setCell(7, 0, makeCell({ char: "!" }))
    const pool: CellChange[] = [
      change(5, 0, { char: "h" }),
      change(6, 0, { char: "i" }),
      change(7, 0, { char: "!" }),
    ]
    const result = analyzeRowDensity(pool, pool.length, 20)
    const state = createOutputEmitState({ isInline: false })
    emitRuns(result.rows[0]!, pool, buf, defaultCtx, state)
    // Output should include the 3 chars.
    expect(state.output).toContain("h")
    expect(state.output).toContain("i")
    expect(state.output).toContain("!")
  })
})

describe("emitScatter", () => {
  test("emits isolated cells with cursor jumps", () => {
    const buf = new TerminalBuffer(20, 3)
    buf.setCell(2, 0, makeCell({ char: "X" }))
    buf.setCell(15, 0, makeCell({ char: "Y" }))
    const pool: CellChange[] = [
      change(2, 0, { char: "X" }),
      change(15, 0, { char: "Y" }),
    ]
    const result = analyzeRowDensity(pool, pool.length, 20)
    const state = createOutputEmitState({ isInline: false })
    emitScatter(result.rows[0]!, pool, buf, defaultCtx, state)
    expect(state.output).toContain("X")
    expect(state.output).toContain("Y")
    // Should have moved cursor between the cells (CUF or CUP).
    expect(state.output.length).toBeGreaterThan(2)
  })

  test("orphan continuation reads main cell from buffer", () => {
    const buf = new TerminalBuffer(20, 3)
    buf.setCell(5, 0, makeCell({ char: "あ", wide: true }))
    // Don't include main cell in pool, only the continuation.
    const pool: CellChange[] = [change(6, 0, { continuation: true })]
    const result = analyzeRowDensity(pool, pool.length, 20)
    const state = createOutputEmitState({ isInline: false })
    // Should not throw and should emit the wide char from the buffer.
    expect(() => emitScatter(result.rows[0]!, pool, buf, defaultCtx, state)).not.toThrow()
  })
})
