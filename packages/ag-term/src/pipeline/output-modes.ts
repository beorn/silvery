/**
 * Hybrid output emission — per-mode emitters.
 *
 * Three emission modes, picked per-row by `pickEmissionMode` in
 * `output-density.ts`. All three mutate a shared `OutputEmitState` so that
 * cursor and style state carries across rows (enabling the `\r\n` shortcut
 * and avoiding redundant SGR transitions).
 *
 * See: https://github.com/beorn/silvery-internal/blob/main/design/v05-layout/hybrid-output.md
 * Tracking: km-silvery.hybrid-output
 *
 * This file is SCAFFOLD ONLY — all functions throw. Integration is a
 * follow-up in a separate commit that wires these into output-phase.ts
 * behind the SILVERY_HYBRID_OUTPUT feature flag.
 */

import type { TerminalBuffer } from "../buffer"
import type { Style } from "../buffer"
import type { DirtyRowSummary } from "./output-density"
import type { CellChange } from "./types"
import type { OutputContext } from "./output-phase"

/**
 * Mutable state threaded through each per-row emitter so that cross-row
 * cursor and style transitions are as cheap as the current `changesToAnsi`
 * single-pass implementation.
 *
 * Zero-allocation discipline: this is reused across rows and across frames.
 * The `OutputEmitState` lives in the `createOutputPhase` closure alongside
 * `InlineCursorState`.
 */
export interface OutputEmitState {
  /** Accumulated ANSI output for the current frame. */
  output: string
  /** Current terminal cursor column, render-relative. -1 means uninitialized. */
  cursorX: number
  /** Current terminal cursor row, render-relative. -1 means uninitialized. */
  cursorY: number
  /** Previous emitted row (for cross-row shortcut detection). */
  prevY: number
  /** Last emitted cell column (wide-char continuation tracking). */
  lastEmittedX: number
  /** Last emitted cell row (wide-char continuation tracking). */
  lastEmittedY: number
  /** Currently active SGR style, or null if reset. */
  currentStyle: Style | null
  /** Currently active OSC 8 hyperlink, or undefined if none. */
  currentHyperlink: string | undefined
}

/**
 * Emit an entire row's worth of cells unconditionally, matching the
 * per-cell inner loop of `bufferToAnsi`. Used when `pickEmissionMode`
 * returns `"whole-row"`.
 *
 * Contract:
 * - Writes every cell in `[0, buffer.width)` on row `summary.y`.
 * - Starts with an absolute cursor jump to `(summary.y, 0)`.
 * - Mutates `state` to reflect the final cursor position at
 *   `(summary.y, buffer.width)` (pending-wrap state).
 * - Appends to `state.output`.
 *
 * Implementation guidance:
 * - Reuse the inner loop of `bufferToAnsi` (see output-phase.ts:1422-1602).
 *   Extract the inner loop into a helper that takes `OutputEmitState` and
 *   a `(startX, endX)` range; whole-row is the case where the range is the
 *   full row.
 * - Handle wide chars atomically: emit the main cell once, advance cursor
 *   by 2, emit the post-wide-char resync in fullscreen mode (`CUP`) or
 *   inline mode (`\r` + `CUF`). See `bufferToAnsi` comments around the
 *   `cell.wide` branch.
 * - Close OSC 8 hyperlinks on row exit so they don't span rows.
 * - Reset SGR style before the row-end transition if bg is active, to
 *   prevent right-margin bleed into the next row.
 *
 * TODO(hybrid-output phase 2): implement.
 *
 * See design doc §3 (Mode A) and §7 (testing).
 */
export function emitWholeRow(
  _summary: DirtyRowSummary,
  _buffer: TerminalBuffer,
  _ctx: OutputContext,
  _state: OutputEmitState,
): void {
  throw new Error(
    "emitWholeRow: not implemented — see https://github.com/beorn/silvery-internal/blob/main/design/v05-layout/hybrid-output.md",
  )
}

/**
 * Emit the maximal contiguous runs of dirty cells on a row. Used when
 * `pickEmissionMode` returns `"run-length"`.
 *
 * Contract:
 * - Iterates `summary.runs` in order. For each run, moves the cursor to
 *   `(summary.y, run.start)` then emits cells `[run.start, run.end]`.
 * - Relies on cursor auto-advance within a run — no per-cell CUF.
 * - Mutates `state.cursorX` / `state.cursorY` to reflect the final position
 *   of the last run on the row.
 * - Appends to `state.output`.
 *
 * Implementation guidance:
 * - Share the per-cell emission helper with `emitWholeRow` — the inner loop
 *   is the same, only the range differs.
 * - Widen runs to cover both halves of a wide char that straddles the run
 *   boundary. The widening is already done by `analyzeRowDensity` in
 *   `output-density.ts`; this emitter just trusts the run bounds.
 * - Use the existing `\r\n` cross-row shortcut when the previous run ended
 *   at `(y, width)` (or near-width) and the current run starts at
 *   `(y+1, 0)`.
 * - Between runs on the same row, use `CUF` (cursor forward) for small
 *   gaps and `CUP` (absolute) for large gaps. The gap threshold can match
 *   the existing heuristic in `changesToAnsi`.
 *
 * TODO(hybrid-output phase 2): implement.
 *
 * See design doc §3 (Mode B) and §7 (testing).
 */
export function emitRuns(
  _summary: DirtyRowSummary,
  _pool: readonly CellChange[],
  _buffer: TerminalBuffer,
  _ctx: OutputContext,
  _state: OutputEmitState,
): void {
  throw new Error(
    "emitRuns: not implemented — see https://github.com/beorn/silvery-internal/blob/main/design/v05-layout/hybrid-output.md",
  )
}

/**
 * Emit dirty cells one by one with explicit cursor jumps between them.
 * Used when `pickEmissionMode` returns `"scatter"`. This is the current
 * behavior of `changesToAnsi`, refactored to take `OutputEmitState` and a
 * per-row pool slice.
 *
 * Contract:
 * - Iterates `pool[summary.poolStart..summary.poolEnd)` in order.
 * - Emits each cell with an explicit cursor jump if the cursor is not
 *   already at the target position.
 * - Handles wide-char continuation cells by looking up the main cell from
 *   the buffer (orphan handling, see `changesToAnsi`).
 * - Mutates `state` to reflect the final cursor position after the last
 *   emitted cell.
 *
 * Implementation guidance:
 * - This is the scaffolding point where `changesToAnsi`'s per-row slice
 *   becomes a standalone function. Extract the existing per-cell loop
 *   (the body of `for (let i = 0; i < count; i++)` in `changesToAnsi`)
 *   into a helper that takes `[start, end)` pool indices.
 * - The `lastEmittedX/lastEmittedY` bookkeeping that dedupes wide-char
 *   continuations must move into `OutputEmitState` so it persists across
 *   calls to `emitScatter` on different rows of the same frame.
 * - The post-wide-char resync stays per-emitter.
 *
 * TODO(hybrid-output phase 2): implement.
 *
 * See design doc §3 (Mode C) and §7 (testing).
 */
export function emitScatter(
  _summary: DirtyRowSummary,
  _pool: readonly CellChange[],
  _buffer: TerminalBuffer,
  _ctx: OutputContext,
  _state: OutputEmitState,
): void {
  throw new Error(
    "emitScatter: not implemented — see https://github.com/beorn/silvery-internal/blob/main/design/v05-layout/hybrid-output.md",
  )
}
