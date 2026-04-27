/**
 * Integration tests for hybrid output emission (Phase 3 wiring).
 *
 * Phase 3 wires `analyzeRowDensity` + `pickEmissionMode` + the three mode
 * emitters in `output-modes.ts` into `output-phase.ts` behind the
 * `SILVERY_HYBRID_OUTPUT=1` feature flag. These tests run the full
 * `outputPhase()` entry point with the flag enabled and verify that:
 *
 * 1. Mixed-density frames (a row with one cell, a contiguous run, a dense
 *    row, all in the same diff) replay to a cell grid that exactly matches
 *    the fresh full-render output.
 * 2. Wide-character handling survives — a CJK glyph spanning two columns
 *    inside the diff replays identically.
 * 3. Mode dispatch hits the three branches under predictable workloads —
 *    a scatter-only frame fires only the scatter emitter, etc.
 * 4. Telemetry hooks fire — `__silvery_bench_output_detail.modeCounts`
 *    accumulates per-mode dispatch counts so the estimator can be tuned
 *    from real workloads (design doc §11 open question 5).
 *
 * Imports use relative paths into the silvery source tree. The `@silvery/`
 * scope is resolved via the host monorepo's `node_modules` symlink, which
 * may point to a sibling silvery checkout that doesn't yet have this
 * commit's wiring (e.g., when run from a worktree alongside an unrelated
 * silvery worktree). Relative imports always hit the silvery checkout this
 * test file lives in.
 *
 * Tracking: km-silvery.hybrid-output-phase3
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { TerminalBuffer } from "../packages/ag-term/src/buffer.ts"
import {
  outputPhase,
  replayAnsiWithStyles,
} from "../packages/ag-term/src/pipeline/output-phase.ts"

const ORIGINAL_HYBRID = process.env.SILVERY_HYBRID_OUTPUT

beforeEach(() => {
  process.env.SILVERY_HYBRID_OUTPUT = "1"
  ;(globalThis as any).__silvery_bench_output_detail = {
    diffMs: 0,
    ansiMs: 0,
    calls: 0,
    totalChanges: 0,
    dirtyRows: 0,
    outputBytes: 0,
  }
})

afterEach(() => {
  if (ORIGINAL_HYBRID === undefined) delete process.env.SILVERY_HYBRID_OUTPUT
  else process.env.SILVERY_HYBRID_OUTPUT = ORIGINAL_HYBRID
  ;(globalThis as any).__silvery_bench_output_detail = undefined
})

// ============================================================================
// Helpers
// ============================================================================

function writeStr(buf: TerminalBuffer, x: number, y: number, text: string, fg?: number): void {
  for (let i = 0; i < text.length && x + i < buf.width; i++) {
    buf.setCell(x + i, y, { char: text[i]!, fg: fg ?? null })
  }
}

function fillRow(buf: TerminalBuffer, y: number, char: string, fg?: number): void {
  for (let x = 0; x < buf.width; x++) {
    buf.setCell(x, y, { char, fg: fg ?? null })
  }
}

/**
 * Verify that the prev→next incremental ANSI replays to a cell grid that
 * exactly matches a fresh full-render of `next`. Core hybrid-output
 * invariant from design doc §6: terminal-state equivalence (not byte
 * equivalence).
 */
function verifyEquivalence(prev: TerminalBuffer, next: TerminalBuffer, description: string): void {
  const w = next.width
  const h = next.height

  const freshAnsi = outputPhase(null, next, "fullscreen")
  const freshGrid = replayAnsiWithStyles(w, h, freshAnsi)

  const prevAnsi = outputPhase(null, prev, "fullscreen")
  const incrAnsi = outputPhase(prev, next, "fullscreen")
  const incrGrid = replayAnsiWithStyles(w, h, prevAnsi + incrAnsi)

  const mismatches: string[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = freshGrid[y]![x]!
      const i = incrGrid[y]![x]!
      if (f.char !== i.char) {
        mismatches.push(`(${x},${y}): fresh='${f.char}' incr='${i.char}'`)
      }
    }
  }

  if (mismatches.length > 0) {
    expect.fail(
      `${description}: ${mismatches.length} cell mismatches\n` +
        mismatches.slice(0, 8).join("\n"),
    )
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("hybrid output integration (SILVERY_HYBRID_OUTPUT=1)", () => {
  test("mixed-density frame: scatter + contiguous run + dense row replays identically", () => {
    const w = 60
    const h = 8
    const prev = new TerminalBuffer(w, h)
    const next = new TerminalBuffer(w, h)

    for (let y = 0; y < h; y++) {
      fillRow(prev, y, "·")
      fillRow(next, y, "·")
    }

    // Row 1: single-cell change (scatter mode by fast-path: dirty <= 2).
    next.setCell(20, 1, { char: "X", fg: null })

    // Row 3: contiguous run of 6 cells (run-length mode by fast-path:
    // runCount === 1, dirty < width/2).
    writeStr(next, 10, 3, "RunRun")

    // Row 5: dense row — every cell different (whole-row mode by fast-path:
    // dirty * 2 >= width).
    fillRow(next, 5, "#")

    verifyEquivalence(prev, next, "mixed-density: scatter + run + dense")

    const acc = (globalThis as any).__silvery_bench_output_detail
    expect(acc.hybridFrames).toBeGreaterThanOrEqual(1)
    expect(acc.modeCounts.scatter).toBeGreaterThanOrEqual(1)
    expect(acc.modeCounts.runLength).toBeGreaterThanOrEqual(1)
    expect(acc.modeCounts.wholeRow).toBeGreaterThanOrEqual(1)
  })

  test("wide-character glyph in run-length row replays identically", () => {
    const w = 40
    const h = 4
    const prev = new TerminalBuffer(w, h)
    const next = new TerminalBuffer(w, h)

    for (let y = 0; y < h; y++) {
      fillRow(prev, y, "·")
      fillRow(next, y, "·")
    }

    // Row 1: text → wide char → text. The wide CJK glyph "あ" spans cols
    // 8 and 9, sandwiched between latin chars on either side. The hybrid
    // analyzer must widen the dirty run to cover both halves of the wide
    // cell so the emitter doesn't truncate it.
    writeStr(next, 5, 1, "Hi ")
    next.setCell(8, 1, { char: "あ", wide: true })
    next.setCell(9, 1, { char: "", continuation: true } as any)
    writeStr(next, 10, 1, " bye")

    verifyEquivalence(prev, next, "wide-char in run-length row")
  })

  test("frame with only a single-cell change uses scatter and replays correctly", () => {
    const w = 80
    const h = 5
    const prev = new TerminalBuffer(w, h)
    const next = new TerminalBuffer(w, h)
    for (let y = 0; y < h; y++) {
      fillRow(prev, y, "·")
      fillRow(next, y, "·")
    }
    next.setCell(40, 2, { char: "Z" })

    verifyEquivalence(prev, next, "single-cell scatter")

    const acc = (globalThis as any).__silvery_bench_output_detail
    expect(acc.modeCounts.scatter).toBeGreaterThanOrEqual(1)
    expect(acc.modeCounts.wholeRow).toBe(0)
    expect(acc.modeCounts.runLength).toBe(0)
  })

  test("frame with only a fully-dense row uses whole-row and replays correctly", () => {
    const w = 80
    const h = 5
    const prev = new TerminalBuffer(w, h)
    const next = new TerminalBuffer(w, h)
    for (let y = 0; y < h; y++) {
      fillRow(prev, y, "·")
      fillRow(next, y, "·")
    }
    fillRow(next, 2, "#") // every cell on row 2 changes

    verifyEquivalence(prev, next, "fully-dense whole-row")

    const acc = (globalThis as any).__silvery_bench_output_detail
    expect(acc.modeCounts.wholeRow).toBeGreaterThanOrEqual(1)
  })

  test("flag off: legacy path runs (no hybrid telemetry recorded)", () => {
    delete process.env.SILVERY_HYBRID_OUTPUT

    const w = 60
    const h = 4
    const prev = new TerminalBuffer(w, h)
    const next = new TerminalBuffer(w, h)
    for (let y = 0; y < h; y++) {
      fillRow(prev, y, "·")
      fillRow(next, y, "·")
    }
    writeStr(next, 5, 1, "OneRun")

    outputPhase(prev, next, "fullscreen")

    const acc = (globalThis as any).__silvery_bench_output_detail
    expect(acc.hybridFrames).toBeUndefined()
    expect(acc.modeCounts).toBeUndefined()
  })
})
