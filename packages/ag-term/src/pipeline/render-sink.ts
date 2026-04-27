/**
 * RenderSink — Phase 2 Step 3 of paint-clear-invariant recast
 * (km-silvery.paint-clear-invariant). Per pro/Kimi K2.6 review
 * (2026-04-27), the renderer must mark intent at emission time so the
 * commit step knows clear from paint without a heuristic. The sink
 * interface is the seam.
 *
 * Two adapters land in this file:
 *
 *   - `BufferSink`: forwards every emit to the corresponding
 *     `TerminalBuffer` mutator (e.g. `emitClear → buffer.fill(...,{char,
 *     bg})`). Behaviour-equivalent to direct buffer mutation; used by the
 *     legacy path during the Phase 2 transition.
 *   - `PlanSink`: builds a `SectionedRenderPlan` directly. Routes ops
 *     into `transferOps / cleanupOps / paintOps / overlayOps /
 *     postStateOps` based on the method called. No heuristics.
 *
 * Migration: renderers currently call `buffer.fill(...)` /
 * `buffer.setCell(...)` directly. Phase 2 Step 3 replaces those calls
 * with sink calls. The `BufferSink` is functionally identical to direct
 * buffer mutation, so a single-call migration of one renderer (e.g.
 * `renderBox`) can land WITHOUT changing default behaviour. Once every
 * call site routes through a sink, the SILVERY_RENDER_PLAN flag swaps
 * the sink (BufferSink → PlanSink) at one entry point in `ag.ts` and
 * the production wire-through closes the Check 1 derisking gap from
 * Phase 1.
 *
 * NOT yet covered (REMAINING for follow-up sessions):
 *   - Renderer migration: every `buffer.fill` / `buffer.setCell` site in
 *     render-box.ts / render-text.ts / render-phase.ts /
 *     decoration-phase.ts must route through the sink. Estimated 50-100
 *     call sites. Each call site requires intent review (clear vs
 *     paint vs transfer).
 *   - Outline snapshots — non-cell buffer state surviving across frames.
 *     Phase 2 must move it into `RenderPostState` (or off the buffer
 *     entirely). The current `outlineSnapshots` array on TerminalBuffer
 *     is mutated directly by decoration-phase.ts; the sink doesn't yet
 *     have a method for it.
 *   - Intra-frame buffer reads (`getCellBg`, dirty rows, snapshot reads)
 *     are unaffected by the sink — the renderer still reads from the
 *     working buffer. The PlanSink papers over this by also writing to
 *     a backing buffer for reads. Phase 2 Step 4 audits and eliminates
 *     these reads.
 */

import type { Cell, CellAttrs, Color, Style } from "../buffer"
import { TerminalBuffer } from "../buffer"
import type {
  ClearOp,
  OverlayOp,
  PaintOp,
  PostStateOp,
  SectionedRenderPlan,
  TransferOp,
} from "./render-plan"

/**
 * The renderer's emission target. Each method classifies the intent of
 * the operation; the implementation decides what to do with it
 * (mutate a buffer, build a plan, both).
 *
 * Method names mirror the section the op lands in:
 *   - emitTransfer*  → transferOps
 *   - emitClear*     → cleanupOps
 *   - emitPaint*     → paintOps
 *   - emitOverlay*   → overlayOps
 *   - setPostState*  → postStateOps
 *
 * Phase 2 Step 6.1: the sink also carries the frame's `width` / `height`
 * so renderers don't need to read those off `buffer.width` /
 * `buffer.height`. This eliminates ~30 universal read sites and is the
 * prerequisite for `BackedPlanSink` (a sink that stands alone — no
 * BufferSink fallback for reads).
 */
export interface RenderSink {
  /** Frame width in cells. Replaces `buffer.width` reads in renderers. */
  readonly width: number
  /** Frame height in cells. Replaces `buffer.height` reads in renderers. */
  readonly height: number

  // -- transfer ops ---------------------------------------------------------

  /**
   * Shift existing prev-frame pixels by `delta` rows (negative = up,
   * positive = down). Used by scroll Tier 1 buffer-shift. Runs FIRST so
   * subsequent paints into the shifted region land on the right cells.
   */
  emitScrollRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    delta: number,
    clearCell?: Partial<Cell>,
  ): void

  // -- cleanup ops ----------------------------------------------------------

  /**
   * Remove stale prev-frame pixels in `rect`, writing space chars with
   * the inherited bg `bg`. Destructive; lives in `cleanupOps`. Used by
   * `clearNodeRegion`, `clearExcessArea`, `clearDescendantOverflowRegions`,
   * scroll viewport clears.
   */
  emitClearRect(
    x: number,
    y: number,
    width: number,
    height: number,
    bg: Color,
  ): void

  /**
   * Generalized clear with an explicit cell shape. Kept as an escape
   * hatch for clear sites that need attrs/fg too (rare; most clears use
   * `emitClearRect`). Lives in `cleanupOps`.
   */
  emitClearCells(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void

  // -- paint ops ------------------------------------------------------------

  /**
   * Paint a single cell. Lives in `paintOps`. Used by text rendering and
   * border drawing.
   */
  emitSetCell(x: number, y: number, cell: Partial<Cell>): void

  /**
   * Paint an opaque bg fill. The cell payload typically has `bg` set and
   * `char` defaults to space; this is renderBox's effective-bg paint.
   * Lives in `paintOps`. Distinct from `emitClearCells` (same buffer
   * mutation, different intent).
   */
  emitPaintFill(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void

  /**
   * Paint just the bg without disturbing existing chars (cell-style
   * paint). Used by the bg-only fast path where children's content from
   * the prev clone must be preserved. Lives in `paintOps`.
   */
  emitFillBg(x: number, y: number, width: number, height: number, bg: Color): void

  /**
   * Restyle existing cells in `rect` (fg / attrs only — bg via fillBg).
   * Used by the text style-only fast path. Lives in `paintOps`.
   */
  emitRestyleRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    style: Style,
  ): void

  // -- overlay ops ----------------------------------------------------------

  /**
   * Merge attrs (bold / underline / strikethrough / etc.) into existing
   * cells in `rect`. Lives in `overlayOps` — applied AFTER paint so the
   * cells exist to be merged into.
   */
  emitMergeAttrs(
    x: number,
    y: number,
    width: number,
    height: number,
    attrs: CellAttrs,
    underlineColor?: Color,
  ): void

  // -- post state -----------------------------------------------------------

  /**
   * Configure selectable mode for subsequent cell writes. Hidden mutable
   * buffer state per pro review — Phase 2 should eventually encode
   * selectability into each cell op, but the sink interface accepts
   * scoped setters in the meantime so the migration can be incremental.
   */
  setSelectableMode(selectable: boolean): void

  /**
   * Row metadata (soft-wrap, last content col). Lives in `postStateOps`.
   */
  setRowMeta(
    row: number,
    meta: { softWrapped?: boolean; lastContentCol?: number },
  ): void

  /**
   * Outline snapshots — non-cell buffer state captured during the
   * decoration pass so the next frame can restore the under-cells before
   * drawing the new outlines. Lives in `postStateOps`. Phase 2 Step 5
   * hoists this off `buffer.outlineSnapshots` direct mutation onto the
   * sink so the plan-shape captures all surviving-across-frames state.
   */
  setOutlineSnapshots(
    snapshots: ReadonlyArray<{ x: number; y: number; cell: Cell }>,
  ): void
}

/**
 * `RenderSink` implementation that mutates a `TerminalBuffer` directly.
 * Behavior-equivalent to the legacy direct-mutation path. Used during
 * the Phase 2 transition: renderers route through the sink, but with
 * `BufferSink` the actual buffer mutation is unchanged.
 *
 * Once every renderer call site routes through a sink, swapping
 * `BufferSink` for `PlanSink` at one entry point flips the renderer
 * onto the plan/commit substrate.
 */
export class BufferSink implements RenderSink {
  constructor(private readonly buffer: TerminalBuffer) {}

  get width(): number {
    return this.buffer.width
  }
  get height(): number {
    return this.buffer.height
  }

  emitScrollRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    delta: number,
    clearCell: Partial<Cell> = {},
  ): void {
    this.buffer.scrollRegion(x, y, width, height, delta, clearCell)
  }

  emitClearRect(
    x: number,
    y: number,
    width: number,
    height: number,
    bg: Color,
  ): void {
    this.buffer.fill(x, y, width, height, { char: " ", bg })
  }

  emitClearCells(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void {
    this.buffer.fill(x, y, width, height, cell)
  }

  emitSetCell(x: number, y: number, cell: Partial<Cell>): void {
    this.buffer.setCell(x, y, cell)
  }

  emitPaintFill(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void {
    this.buffer.fill(x, y, width, height, cell)
  }

  emitFillBg(x: number, y: number, width: number, height: number, bg: Color): void {
    this.buffer.fillBg(x, y, width, height, bg)
  }

  emitRestyleRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    style: Style,
  ): void {
    this.buffer.restyleRegion(x, y, width, height, style)
  }

  emitMergeAttrs(
    x: number,
    y: number,
    width: number,
    height: number,
    attrs: CellAttrs,
    underlineColor?: Color,
  ): void {
    this.buffer.mergeAttrsInRect(x, y, width, height, attrs, underlineColor)
  }

  setSelectableMode(selectable: boolean): void {
    this.buffer.setSelectableMode(selectable)
  }

  setRowMeta(
    row: number,
    meta: { softWrapped?: boolean; lastContentCol?: number },
  ): void {
    this.buffer.setRowMeta(row, meta)
  }

  setOutlineSnapshots(
    snapshots: ReadonlyArray<{ x: number; y: number; cell: Cell }>,
  ): void {
    this.buffer.outlineSnapshots = snapshots.slice()
  }
}

/**
 * `RenderSink` that fans every emission out to a PRIMARY sink and a
 * SECONDARY sink. Used by the SILVERY_RENDER_PLAN production wiring:
 *
 *   - primary = `BufferSink(buffer)`: keeps direct buffer mutation so
 *     intra-frame buffer reads (`getCellBg`, dirty rows, snapshot reads)
 *     return correct values during the render walk. Read-elimination is
 *     the Phase 2 Step 6 follow-up.
 *   - secondary = `PlanSink`: captures the same emissions into a
 *     `SectionedRenderPlan` for parity verification or for committing
 *     onto a fresh clone in plan-mode.
 *
 * The Tee fans every method to both sinks unconditionally. Since both
 * are in lock-step, the plan captures exactly the ops that were applied
 * to the buffer.
 */
export class TeeSink implements RenderSink {
  constructor(
    private readonly primary: RenderSink,
    private readonly secondary: RenderSink,
  ) {}

  get width(): number {
    return this.primary.width
  }
  get height(): number {
    return this.primary.height
  }

  emitScrollRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    delta: number,
    clearCell?: Partial<Cell>,
  ): void {
    this.primary.emitScrollRegion(x, y, width, height, delta, clearCell)
    this.secondary.emitScrollRegion(x, y, width, height, delta, clearCell)
  }

  emitClearRect(
    x: number,
    y: number,
    width: number,
    height: number,
    bg: Color,
  ): void {
    this.primary.emitClearRect(x, y, width, height, bg)
    this.secondary.emitClearRect(x, y, width, height, bg)
  }

  emitClearCells(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void {
    this.primary.emitClearCells(x, y, width, height, cell)
    this.secondary.emitClearCells(x, y, width, height, cell)
  }

  emitSetCell(x: number, y: number, cell: Partial<Cell>): void {
    this.primary.emitSetCell(x, y, cell)
    this.secondary.emitSetCell(x, y, cell)
  }

  emitPaintFill(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void {
    this.primary.emitPaintFill(x, y, width, height, cell)
    this.secondary.emitPaintFill(x, y, width, height, cell)
  }

  emitFillBg(x: number, y: number, width: number, height: number, bg: Color): void {
    this.primary.emitFillBg(x, y, width, height, bg)
    this.secondary.emitFillBg(x, y, width, height, bg)
  }

  emitRestyleRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    style: Style,
  ): void {
    this.primary.emitRestyleRegion(x, y, width, height, style)
    this.secondary.emitRestyleRegion(x, y, width, height, style)
  }

  emitMergeAttrs(
    x: number,
    y: number,
    width: number,
    height: number,
    attrs: CellAttrs,
    underlineColor?: Color,
  ): void {
    this.primary.emitMergeAttrs(x, y, width, height, attrs, underlineColor)
    this.secondary.emitMergeAttrs(x, y, width, height, attrs, underlineColor)
  }

  setSelectableMode(selectable: boolean): void {
    this.primary.setSelectableMode(selectable)
    this.secondary.setSelectableMode(selectable)
  }

  setRowMeta(
    row: number,
    meta: { softWrapped?: boolean; lastContentCol?: number },
  ): void {
    this.primary.setRowMeta(row, meta)
    this.secondary.setRowMeta(row, meta)
  }

  setOutlineSnapshots(
    snapshots: ReadonlyArray<{ x: number; y: number; cell: Cell }>,
  ): void {
    this.primary.setOutlineSnapshots(snapshots)
    this.secondary.setOutlineSnapshots(snapshots)
  }
}

// ---------------------------------------------------------------------------
// Frame-shared sink factory
// ---------------------------------------------------------------------------

/**
 * The PlanSink that the current frame's BufferSink instances should also
 * record to (when SILVERY_RENDER_PLAN is enabled). Set by `withPlanCapture`
 * around a render-phase call; null at all other times.
 *
 * Module-level state because every renderer in render-phase / render-box /
 * render-text / decoration-phase constructs its own local sink. The
 * factory below reads this so all of them emit to the same plan.
 */
let _frameCapturePlanSink: PlanSink | null = null

/**
 * Run `fn` with frame-level plan capture enabled. Returns the plan
 * captured during `fn` along with whatever `fn` returned.
 *
 * Production wire path for SILVERY_RENDER_PLAN: ag.ts wraps the
 * `renderPhase()` call in `withPlanCapture(...)` and gets back both the
 * rendered buffer (already mutated by BufferSink-on-real-buffer) and the
 * matching `SectionedRenderPlan`. The plan can then be replayed onto a
 * fresh clone for parity verification, or used directly when buffer-read
 * elimination (Step 6) lets PlanSink stand alone.
 */
export function withPlanCapture<T>(
  width: number,
  height: number,
  fn: () => T,
): { result: T; plan: SectionedRenderPlan } {
  const captured = new PlanSink(width, height)
  const prev = _frameCapturePlanSink
  _frameCapturePlanSink = captured
  try {
    const result = fn()
    return { result, plan: captured.toPlan() }
  } finally {
    _frameCapturePlanSink = prev
  }
}

/**
 * Construct the right sink for a renderer call site. By default
 * (`SILVERY_RENDER_PLAN` not set), returns a plain `BufferSink(buffer)`.
 *
 * When inside a `withPlanCapture` scope, returns a `TeeSink` that fans
 * every emission to BOTH the BufferSink AND the frame-shared PlanSink.
 * This is how every local sink construction in render-phase /
 * render-box / render-text / decoration-phase contributes to a single
 * SectionedRenderPlan for the frame.
 */
export function createFrameSink(buffer: TerminalBuffer): RenderSink {
  const direct = new BufferSink(buffer)
  if (_frameCapturePlanSink === null) return direct
  return new TeeSink(direct, _frameCapturePlanSink)
}

/**
 * `RenderSink` implementation that builds a `SectionedRenderPlan` directly
 * — no heuristics, no backing buffer for reads (yet — see file header
 * REMAINING). Each emit method routes the op into the corresponding
 * section.
 *
 * This is the L4 substrate: ops land in their section by API call, not
 * by classification of post-hoc mutations. Wrong-order paint becomes
 * unrepresentable because a clear API call cannot land in `paintOps` —
 * it goes through `emitClearRect` which writes to `cleanupOps`.
 *
 * Limitation: the sink has no buffer to back reads. Renderers that
 * currently read from the buffer mid-frame (`getCellBg`, dirty row
 * checks, outline snapshot reads) will not work with `PlanSink`
 * directly. Phase 2 Step 4 audits and eliminates those reads. Until
 * then, `PlanSink` is for synthetic plans + tests; production routing
 * waits on Step 4.
 */
export class PlanSink implements RenderSink {
  readonly transferOps: TransferOp[] = []
  readonly cleanupOps: ClearOp[] = []
  readonly paintOps: PaintOp[] = []
  readonly overlayOps: OverlayOp[] = []
  readonly postStateOps: PostStateOp[] = []

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  emitScrollRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    delta: number,
    clearCell?: Partial<Cell>,
  ): void {
    this.transferOps.push({
      kind: "scrollRegion",
      x,
      y,
      width,
      height,
      delta,
      clearCell,
    })
  }

  emitClearRect(
    x: number,
    y: number,
    width: number,
    height: number,
    bg: Color,
  ): void {
    this.cleanupOps.push({ kind: "clearRect", x, y, width, height, bg })
  }

  emitClearCells(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void {
    this.cleanupOps.push({ kind: "clearCells", x, y, width, height, cell })
  }

  emitSetCell(x: number, y: number, cell: Partial<Cell>): void {
    this.paintOps.push({ kind: "setCell", x, y, cell })
  }

  emitPaintFill(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void {
    this.paintOps.push({ kind: "paintFill", x, y, width, height, cell })
  }

  emitFillBg(x: number, y: number, width: number, height: number, bg: Color): void {
    this.paintOps.push({ kind: "fillBg", x, y, width, height, bg })
  }

  emitRestyleRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    style: Style,
  ): void {
    this.paintOps.push({ kind: "restyleRegion", x, y, width, height, style })
  }

  emitMergeAttrs(
    x: number,
    y: number,
    width: number,
    height: number,
    attrs: CellAttrs,
    underlineColor?: Color,
  ): void {
    this.overlayOps.push({
      kind: "mergeAttrsInRect",
      x,
      y,
      width,
      height,
      attrs,
      underlineColor,
    })
  }

  setSelectableMode(selectable: boolean): void {
    this.postStateOps.push({ kind: "setSelectableMode", selectable })
  }

  setRowMeta(
    row: number,
    meta: { softWrapped?: boolean; lastContentCol?: number },
  ): void {
    this.postStateOps.push({ kind: "setRowMeta", row, ...meta })
  }

  setOutlineSnapshots(
    snapshots: ReadonlyArray<{ x: number; y: number; cell: Cell }>,
  ): void {
    this.postStateOps.push({ kind: "setOutlineSnapshots", snapshots: snapshots.slice() })
  }

  /**
   * Snapshot the accumulated emissions as an immutable
   * `SectionedRenderPlan`. After calling this, further emissions on the
   * sink do not affect the returned plan.
   */
  toPlan(): SectionedRenderPlan {
    return {
      width: this.width,
      height: this.height,
      transferOps: this.transferOps.slice(),
      cleanupOps: this.cleanupOps.slice(),
      paintOps: this.paintOps.slice(),
      overlayOps: this.overlayOps.slice(),
      postStateOps: this.postStateOps.slice(),
    }
  }
}
