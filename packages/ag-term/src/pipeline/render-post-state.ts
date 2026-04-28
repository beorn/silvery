/**
 * Phase 2 Step 5 of paint-clear-invariant L5 (km-silvery.paint-clear-l5-bufferssink-retire).
 *
 * `RenderPostState` is the home for per-Ag, cross-frame state that survives
 * outside the `TerminalBuffer`. Historically `outlineSnapshots` lived on
 * `TerminalBuffer` and travelled forward via `buffer.clone()`. That coupling
 * forced the decoration phase to read intra-frame buffer state (an explicit
 * goal of the L5 plan to retire — see render-plan.ts:31). Hoisting snapshots
 * onto a dedicated post-state object decouples the decoration phase from any
 * particular buffer instance: it can run against the BufferSink-mutated buffer
 * OR the PlanSink-committed buffer interchangeably, with cleanup state owned
 * by the orchestrator (`createAg`) rather than the buffer.
 *
 * Steps 6 and 7 follow in subsequent sessions:
 *   - Step 6: eliminate intra-frame buffer reads (`getCellBg`, dirty rows,
 *     applyBgSegmentsToLine readCellInto in render-text.ts).
 *   - Step 7: switch authoritative output to the PlanSink-committed buffer in
 *     ag.ts and retire the BufferSink path entirely.
 *
 * The shape is intentionally minimal: one mutable field today
 * (`outlineSnapshots`). Future cross-frame state (scroll-shift book-keeping,
 * sticky decoration cache, etc.) can land here without re-plumbing the
 * decoration / render-phase / sink seam.
 */

import type { Cell } from "../buffer"

/**
 * Snapshot of a single cell, used to restore it when the overlaying outline
 * is removed on the next frame. Mirrors `OutlineCellSnapshot` from
 * decoration-phase.ts; declared here to break the circular dependency between
 * decoration-phase and render-plan / sink modules.
 */
export interface OutlineCellSnapshot {
  x: number
  y: number
  cell: Cell
}

/**
 * Cross-frame state that travels with the orchestrator (`createAg`), not with
 * the buffer. The decoration phase reads/writes this object directly; the
 * sink layer captures parallel post-state ops only for plan-shape parity
 * verification (the parity replay is throwaway, so plan-side application of
 * `setOutlineSnapshots` is a no-op — see commitSectionedPlan).
 */
export interface RenderPostState {
  /**
   * Cells underlying outlines drawn on the previous frame. Read by
   * `clearPreviousOutlines` at the start of each render to restore
   * pre-outline pixels; rewritten by `renderDecorationPass` after content
   * rendering. Empty array on the first frame.
   */
  outlineSnapshots: OutlineCellSnapshot[]
}

/**
 * Construct an empty `RenderPostState`. Called once per `createAg` lifetime
 * (and on `resetBuffer` to mirror prevBuffer reset semantics).
 */
export function createRenderPostState(): RenderPostState {
  return {
    outlineSnapshots: [],
  }
}
