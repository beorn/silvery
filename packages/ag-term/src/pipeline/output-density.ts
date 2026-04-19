/**
 * Hybrid output emission — density analysis.
 *
 * Given a sorted dirty-cell pool, compute per-row density summaries and pick
 * the cheapest emission mode (whole-row / run-length / scatter).
 *
 * See: https://github.com/beorn/silvery-internal/blob/main/design/v05-layout/hybrid-output.md
 * Tracking: km-silvery.hybrid-output
 *
 * This file is SCAFFOLD ONLY — all functions throw. Integration is a
 * follow-up in a separate commit that wires these into output-phase.ts
 * behind the SILVERY_HYBRID_OUTPUT feature flag.
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
 * into the run automatically by the analyzer (see §6 of the design doc).
 */
export interface DirtyRunSpan {
  readonly start: number
  readonly end: number
}

/**
 * Per-row dirty summary produced by `analyzeRowDensity`. One instance per
 * row that has any dirty cells. Values are valid only until the next call
 * to `analyzeRowDensity` (the summary pool is reused across frames).
 */
export interface DirtyRowSummary {
  /** Row index in the destination buffer. */
  readonly y: number
  /** Number of dirty cells on the row (wide-char continuations deduped). */
  readonly dirty: number
  /** Leftmost dirty column on the row. */
  readonly minX: number
  /** Rightmost dirty column on the row (inclusive). */
  readonly maxX: number
  /** Number of maximal contiguous runs. */
  readonly runCount: number
  /** Maximal contiguous dirty runs, ordered by `start`. */
  readonly runs: readonly DirtyRunSpan[]
  /** Inclusive pool index of the first cell change on this row. */
  readonly poolStart: number
  /** Exclusive pool index of the last cell change on this row. */
  readonly poolEnd: number
}

/**
 * Result of density analysis: a flat array of per-row summaries ordered by
 * ascending `y`. The array is module-scoped and reused across frames — do
 * not retain references beyond the current emission pass.
 */
export interface DensityAnalysis {
  /** One summary per dirty row. Reused across frames. */
  readonly rows: readonly DirtyRowSummary[]
  /** Number of valid entries in `rows`. */
  readonly rowCount: number
}

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
 *
 * TODO(hybrid-output phase 2): implement.
 *
 * See design doc §2 (density analysis) and §5 (data structures).
 */
export function analyzeRowDensity(
  _pool: readonly CellChange[],
  _count: number,
  _width: number,
): DensityAnalysis {
  throw new Error(
    "analyzeRowDensity: not implemented — see https://github.com/beorn/silvery-internal/blob/main/design/v05-layout/hybrid-output.md",
  )
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
 * The constants are tuned against the new bench scenarios in
 * `benchmarks/silvery-vs-ink.bench.ts`
 * (`Dense row update`, `Contiguous run update`, `Scatter update`).
 *
 * Fast paths (no estimator):
 * - `dirty <= 2` → scatter
 * - `dirty * 2 >= width` → whole-row
 * - `runCount === 1` → run-length
 *
 * TODO(hybrid-output phase 2): implement.
 */
export function pickEmissionMode(_row: DirtyRowSummary, _width: number): EmissionMode {
  throw new Error(
    "pickEmissionMode: not implemented — see https://github.com/beorn/silvery-internal/blob/main/design/v05-layout/hybrid-output.md",
  )
}
