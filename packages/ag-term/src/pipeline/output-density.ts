/**
 * Hybrid output emission — density analysis.
 *
 * Given a sorted dirty-cell pool, compute per-row density summaries and pick
 * the cheapest emission mode (whole-row / run-length / scatter).
 *
 * Tracking: km-silvery.known-limits.hybrid-output
 *
 * Phase 2 implementation. Phase 1 (scaffold) shipped earlier; Phase 3 will
 * wire these into output-phase.ts behind the SILVERY_HYBRID_OUTPUT feature
 * flag. Until then, this module is reachable only via direct unit tests.
 */

import type { CellChange } from "./types"

/** Discriminator for the three emission modes defined in the design doc. */
export type EmissionMode = "whole-row" | "run-length" | "scatter"

/**
 * A maximal contiguous run of dirty columns on a single row.
 *
 * `start` and `end` are inclusive column indices in the destination buffer.
 * A single-cell run has `start === end`.
 *
 * Wide characters whose main cell falls inside `[start, end]` are emitted as
 * a single unit by the run-length emitter; the continuation cell is widened
 * into the run automatically by the analyzer.
 */
export interface DirtyRunSpan {
  start: number
  end: number
}

/**
 * Per-row dirty summary produced by `analyzeRowDensity`. One instance per
 * row that has any dirty cells. Values are valid only until the next call
 * to `analyzeRowDensity` (the summary pool is reused across frames).
 */
export interface DirtyRowSummary {
  /** Row index in the destination buffer. */
  y: number
  /** Number of dirty cells on the row (wide-char continuations deduped). */
  dirty: number
  /** Leftmost dirty column on the row. */
  minX: number
  /** Rightmost dirty column on the row (inclusive). */
  maxX: number
  /** Number of maximal contiguous runs. */
  runCount: number
  /** Maximal contiguous dirty runs, ordered by `start`. */
  runs: DirtyRunSpan[]
  /** Inclusive pool index of the first cell change on this row. */
  poolStart: number
  /** Exclusive pool index of the last cell change on this row. */
  poolEnd: number
}

/**
 * Result of density analysis: a flat array of per-row summaries ordered by
 * ascending `y`. The array is module-scoped and reused across frames — do
 * not retain references beyond the current emission pass.
 */
export interface DensityAnalysis {
  /** One summary per dirty row. Reused across frames. */
  rows: readonly DirtyRowSummary[]
  /** Number of valid entries in `rows`. */
  rowCount: number
}

// ============================================================================
// Module-scoped pools (zero per-frame allocation in steady state)
// ============================================================================

/** Per-row summaries — grow lazily. */
const summaryPool: DirtyRowSummary[] = []

/**
 * Per-row run arrays. Each row owns its own `runs` array (sliced into via
 * length manipulation). The arrays themselves grow lazily; we never shrink
 * them so the JIT can keep monomorphic shapes.
 */
function getOrCreateSummary(index: number): DirtyRowSummary {
  let summary = summaryPool[index]
  if (!summary) {
    summary = {
      y: -1,
      dirty: 0,
      minX: -1,
      maxX: -1,
      runCount: 0,
      runs: [],
      poolStart: -1,
      poolEnd: -1,
    }
    summaryPool[index] = summary
  }
  return summary
}

/** Cached result object — returned from every call. */
const cachedAnalysis: { rows: DirtyRowSummary[]; rowCount: number } = {
  rows: summaryPool,
  rowCount: 0,
}

// ============================================================================
// Cost estimator constants — see design doc §4 of
// hub/silvery/design/v05-layout/hybrid-output.md.
//
// These are byte-cost estimates for the emission paths:
//
//   scatter:  dirty * PER_CELL_SCATTER
//   runs:     runCount * RUN_PREAMBLE + dirty * PER_CELL_IN_RUN
//   whole:    ROW_PREAMBLE + width * PER_CELL_IN_ROW
//
// The scatter per-cell cost includes a cursor jump (CUP ≈ 6-8 bytes) plus a
// short SGR transition plus the char itself, amortized to 12 bytes/cell.
//
// Run preamble = 1 CUP (~6 bytes) + 1 SGR transition (~4 bytes) per run
// boundary, totaling ~10 bytes/run. Within a run the cursor auto-advances,
// so the per-cell cost drops to ~2 bytes (char only, occasional SGR amortized).
//
// Whole-row preamble = 1 CUP to (y, 0) ≈ 8 bytes (slightly more than a same-
// row CUF because it also resets the column). Per-cell-in-row mirrors the
// run path since the cursor auto-advances and SGRs amortize across the row.
// ============================================================================

/** Per-cell amortized cost in scatter mode (CUP + SGR + char). */
const PER_CELL_SCATTER = 12
/** Cost of one cursor jump + SGR transition per run preamble. */
const RUN_PREAMBLE = 10
/** Per-cell cost inside a run (relies on auto-advance). */
const PER_CELL_IN_RUN = 2
/** Cost of one absolute CUP to (y, 0) per whole-row preamble. */
const ROW_PREAMBLE = 8
/** Per-cell cost inside a whole-row emission. */
const PER_CELL_IN_ROW = 2

/**
 * Analyze a sorted dirty-cell pool and produce per-row summaries.
 *
 * Preconditions:
 * - `pool` is sorted by `(y, x)` ascending. The caller
 *   (`sortPoolByPosition` in output-phase.ts) guarantees this.
 * - `count` is the number of valid entries in `pool`. Entries beyond
 *   `count` may contain stale data and must be ignored.
 * - `width` is the destination buffer width in columns.
 *
 * Postconditions:
 * - Returns a `DensityAnalysis` with one summary per distinct `y`.
 * - Wide-char continuation cells are deduped from `dirty` but their columns
 *   are still represented inside runs so the emitter can widen spans to
 *   cover both halves of a wide char that straddles a run boundary.
 * - Zero per-frame allocation: summaries and runs come from module-scoped
 *   pools that grow lazily.
 */
export function analyzeRowDensity(
  pool: readonly CellChange[],
  count: number,
  _width: number,
): DensityAnalysis {
  cachedAnalysis.rowCount = 0

  if (count === 0) {
    return cachedAnalysis as DensityAnalysis
  }

  let rowIdx = 0
  let i = 0

  while (i < count) {
    const rowY = pool[i]!.y
    const summary = getOrCreateSummary(rowIdx)
    summary.y = rowY
    summary.dirty = 0
    summary.minX = pool[i]!.x
    summary.maxX = pool[i]!.x
    summary.runCount = 0
    summary.poolStart = i

    // Walk this row's contiguous slice in the sorted pool, building runs.
    let runStart = -1
    let runEnd = -1

    while (i < count && pool[i]!.y === rowY) {
      const change = pool[i]!
      const x = change.x
      const isContinuation = change.cell.continuation === true
      const isWide = change.cell.wide === true

      if (!isContinuation) {
        summary.dirty++
      }
      if (x < summary.minX) summary.minX = x
      // Track maxX as the rightmost column actually touched (continuations
      // count too, since the emitter must cover them).
      const rightCol = isWide ? x + 1 : x
      if (rightCol > summary.maxX) summary.maxX = rightCol

      // Run building. A new cell extends the current run when it is
      // adjacent to (or overlapping with) the previous run's end.
      // Wide-char continuations don't appear separately if their main cell
      // is in the pool (they share the same x+1 column the wide flag
      // already widened); for orphan continuations we still want a span
      // covering [x-1, x] so the emitter can re-emit the main cell.
      const cellStart = isContinuation ? Math.max(0, x - 1) : x
      const cellEnd = isContinuation ? x : isWide ? x + 1 : x

      if (runStart === -1) {
        runStart = cellStart
        runEnd = cellEnd
      } else if (cellStart <= runEnd + 1) {
        // Extend current run (adjacent or overlapping).
        if (cellEnd > runEnd) runEnd = cellEnd
      } else {
        // Close current run, open new one.
        appendRun(summary, runStart, runEnd)
        runStart = cellStart
        runEnd = cellEnd
      }

      i++
    }

    if (runStart !== -1) {
      appendRun(summary, runStart, runEnd)
    }

    summary.poolEnd = i
    rowIdx++
  }

  cachedAnalysis.rowCount = rowIdx
  return cachedAnalysis as DensityAnalysis
}

/** Append a run to a summary's run pool, growing the array lazily. */
function appendRun(summary: DirtyRowSummary, start: number, end: number): void {
  const idx = summary.runCount
  const existing = summary.runs[idx]
  if (existing) {
    existing.start = start
    existing.end = end
  } else {
    summary.runs[idx] = { start, end }
  }
  summary.runCount++
}

/**
 * Pick the cheapest emission mode for a single row, given its density
 * summary and the destination buffer width.
 *
 * Uses the estimator in §4 of the design doc:
 *
 *   scatterCost = dirty * PER_CELL_SCATTER
 *   runCost     = runCount * RUN_PREAMBLE + dirty * PER_CELL_IN_RUN
 *   wholeCost   = ROW_PREAMBLE + width * PER_CELL_IN_ROW
 *
 * Fast paths (no estimator):
 * - `dirty <= 2` → scatter
 * - `dirty * 2 >= width` → whole-row
 * - `runCount === 1` → run-length
 */
export function pickEmissionMode(row: DirtyRowSummary, width: number): EmissionMode {
  const { dirty, runCount } = row

  // Fast paths
  if (dirty <= 2) return "scatter"
  if (dirty * 2 >= width) return "whole-row"
  if (runCount === 1) return "run-length"

  // Estimator
  const scatterCost = dirty * PER_CELL_SCATTER
  const runCost = runCount * RUN_PREAMBLE + dirty * PER_CELL_IN_RUN
  const wholeCost = ROW_PREAMBLE + width * PER_CELL_IN_ROW

  // Pick the minimum. Ties favor run-length (least over-emission risk),
  // then whole-row (most predictable cursor state), then scatter.
  if (runCost <= scatterCost && runCost <= wholeCost) return "run-length"
  if (wholeCost <= scatterCost) return "whole-row"
  return "scatter"
}
