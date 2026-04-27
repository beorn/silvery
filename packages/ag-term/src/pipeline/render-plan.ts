/**
 * Phase 1 of paint-clear-invariant recast (km-silvery.paint-clear-invariant).
 *
 * Render plan + commit substrate. The render phase produces an ordered list
 * of buffer mutations (`RenderOp[]`) and `commitPlan` replays them into a
 * fresh prevBuffer clone. Phase 1 is opt-in via SILVERY_RENDER_PLAN and is
 * proven against the existing imperative renderer by a capture-and-replay
 * parity test. Phase 2 rewrites renderers to emit ops directly; Phase 3
 * deletes clearExcessArea's hasPrevBuffer guard (silvery 168b4989) once the
 * call site that needs it is unreachable.
 *
 * REVIEW STATUS (pro/Kimi K2.6 — see km-silvery.paint-clear-invariant bead +
 * /tmp/llm-cc081a9a-review-this-phase-1-ig4f.txt). Both reviewers
 * independently flagged that:
 *
 *   1. The structural fix is a plan SHAPE (transfer / cleanup / paint /
 *      overlay / post-state), NOT a global op-kind priority. The current
 *      `COMMIT_PRIORITY` map is a transitional helper used by Phase 1 tests
 *      only — Phase 2 must replace it with a sectioned RenderPlan.
 *   2. `fill` MUST split into `clearRect` + `paintFill` (destructive vs
 *      constructive) before Phase 2 ships. Otherwise the priority bucket
 *      reintroduces the sibling-stomp at commit time.
 *   3. `scrollRegion` is a transfer of prev pixels and runs FIRST, not last.
 *      Fixed in COMMIT_PRIORITY below.
 *   4. `setSelectableMode` is hidden mutable buffer state — encode into
 *      each cell op or use scoped segments instead of a global pre-bucket.
 *   5. `outlineSnapshots` is non-cell buffer state that survives across
 *      frames; it must move to a `RenderPostState` section (or off the
 *      buffer entirely). Phase 1 captures it implicitly via the recorder's
 *      backing buffer; Phase 2 must capture it explicitly.
 *   6. Intra-frame buffer reads (`getCellBg`, dirty rows, outlineSnapshots
 *      reads) are the real Phase 2 blocker — every read site must be
 *      audited and converted to derive from node state / op stream before
 *      the renderer can emit ops without a backing buffer.
 *
 * Design doc: hub/silvery/design/render-plan-commit.md (in km workspace,
 * not bundled with vendor package). Review notes preserved in the bead.
 */

import type { Cell, CellAttrs, Color, Style } from "../buffer"
import { TerminalBuffer } from "../buffer"

export type RenderOp =
  | { kind: "setCell"; x: number; y: number; cell: Partial<Cell> }
  | {
      kind: "fill"
      x: number
      y: number
      width: number
      height: number
      cell: Partial<Cell>
    }
  | {
      kind: "fillBg"
      x: number
      y: number
      width: number
      height: number
      bg: Color
    }
  | {
      kind: "restyleRegion"
      x: number
      y: number
      width: number
      height: number
      style: Style
    }
  | {
      kind: "scrollRegion"
      x: number
      y: number
      width: number
      height: number
      delta: number
      clearCell?: Partial<Cell>
    }
  | { kind: "setSelectableMode"; selectable: boolean }
  | {
      kind: "mergeAttrsInRect"
      x: number
      y: number
      width: number
      height: number
      attrs: CellAttrs
      underlineColor?: Color
    }
  | { kind: "setRowMeta"; row: number; softWrapped?: boolean; lastContentCol?: number }

export interface RenderPlan {
  readonly width: number
  readonly height: number
  readonly ops: readonly RenderOp[]
}

// Phase 2 commit-priority intent. **NOT** the right model on its own — see
// pro/Kimi review notes in the bead km-silvery.paint-clear-invariant +
// /tmp/llm-cc081a9a-review-this-phase-1-ig4f.txt. The structural fix is a
// plan SHAPE (transfer / cleanup / paint / overlay / post-state), not a
// global op-kind priority. This map exists so `commitPlanByPriority` has
// deterministic behaviour for tests and so the comment trail makes the
// intended transitions visible to the next implementer.
//
// Critical corrections from review (do NOT skip when wiring Phase 2):
//   - `fill` must SPLIT into `clearRect` (destructive, runs before bg) and
//     `paintFill` (constructive, runs with content). Single-kind `fill`
//     reintroduces the sibling-stomp at commit time.
//   - `scrollRegion` is a transfer of prev-frame pixels and MUST run before
//     any paint into the shifted region. It belongs early, not late.
//   - `fillBg` is opaque background paint (sibling z-layer); it is NOT
//     "lowest layer paint everywhere" — later siblings can legitimately
//     cover earlier siblings' overflow text. Within bucket, plan order
//     decides; do not assume all bg goes first globally.
//   - `setSelectableMode` is hidden mutable buffer state; Phase 2 must
//     encode selectability into each cell op or use scoped segments
//     instead of a global pre-bucket.
//   - `mergeAttrsInRect` (Box attr overlay: bold/underline/strikethrough)
//     is NOT yet recorded by RecordingBuffer — silent divergence risk.
//
// Phase 2 should replace this map with a `RenderPlan` SHAPE that has named
// sections (transferOps / cleanupOps / paintOps / overlayOps / postState).
// The current map is kept for the transitional `commitPlanByPriority`
// helper used by tests.
const COMMIT_PRIORITY: Record<RenderOp["kind"], number> = {
  // 0: configure buffer for subsequent writes (TODO Phase 2: encode into
  // each cell op so this isn't hidden state).
  setSelectableMode: 0,
  // 1: shift existing prev-frame pixels before any new write to the
  // shifted region (Tier 1 scroll containers).
  scrollRegion: 1,
  // 2: clears (currently bundled into `fill` — Phase 2 splits this into
  // a dedicated `clearRect` kind). Until then `commitPlanByPriority`
  // applies `fill` ops in plan order, which is NOT a structural fix.
  fill: 2,
  // 3: opaque background paint. WITHIN the bucket, plan order decides —
  // do not globally pre-paint all bg before all content.
  fillBg: 3,
  // 4: content (text, borders, individual cell writes).
  setCell: 4,
  // 5: restyle existing cells (depends on cells already being written).
  restyleRegion: 5,
  // 6: attribute overlay (Box bold/underline/strikethrough). Merges into
  // existing cells so it depends on cells being written first.
  mergeAttrsInRect: 6,
  // 7: book-keeping that travels with cells.
  setRowMeta: 7,
}

/**
 * Recording proxy around a real `TerminalBuffer`. Forwards every mutating
 * call to the underlying buffer and appends a corresponding `RenderOp` to
 * `ops`. Reads pass through unchanged so the existing render-phase code
 * (which does read its own writes through `getCellBg`, dirty rows,
 * outlineSnapshots, etc.) sees a fully-functional buffer.
 *
 * Phase 1 uses the recorder so we can run the existing renderer unchanged
 * and still capture a `RenderPlan` for the parity test. Phase 2 will
 * remove the recorder once renderers emit ops directly.
 *
 * Recording starts in the disabled state so the initial state-copy from a
 * source buffer (via `copyBufferState`) does not generate spurious ops.
 * `startRecording()` is called by `wrapPrevBufferForRecording` once the
 * buffer is ready to be handed to the renderer.
 */
export class RecordingBuffer extends TerminalBuffer {
  readonly ops: RenderOp[] = []
  private recording = false

  startRecording(): void {
    this.recording = true
  }

  stopRecording(): void {
    this.recording = false
  }

  override setCell(x: number, y: number, cell: Partial<Cell>): void {
    super.setCell(x, y, cell)
    if (this.recording) this.ops.push({ kind: "setCell", x, y, cell: cloneCellPatch(cell) })
  }

  override fill(
    x: number,
    y: number,
    width: number,
    height: number,
    cell: Partial<Cell>,
  ): void {
    super.fill(x, y, width, height, cell)
    if (this.recording)
      this.ops.push({ kind: "fill", x, y, width, height, cell: cloneCellPatch(cell) })
  }

  override fillBg(x: number, y: number, width: number, height: number, bg: Color): void {
    super.fillBg(x, y, width, height, bg)
    if (this.recording) this.ops.push({ kind: "fillBg", x, y, width, height, bg })
  }

  override restyleRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    style: Style,
  ): void {
    super.restyleRegion(x, y, width, height, style)
    if (this.recording)
      this.ops.push({ kind: "restyleRegion", x, y, width, height, style: { ...style } })
  }

  override scrollRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    delta: number,
    clearCell: Partial<Cell> = {},
  ): void {
    super.scrollRegion(x, y, width, height, delta, clearCell)
    if (this.recording)
      this.ops.push({
        kind: "scrollRegion",
        x,
        y,
        width,
        height,
        delta,
        clearCell: cloneCellPatch(clearCell),
      })
  }

  override setSelectableMode(selectable: boolean): void {
    super.setSelectableMode(selectable)
    if (this.recording) this.ops.push({ kind: "setSelectableMode", selectable })
  }

  override mergeAttrsInRect(
    x: number,
    y: number,
    width: number,
    height: number,
    attrs: CellAttrs,
    underlineColor?: Color,
  ): void {
    super.mergeAttrsInRect(x, y, width, height, attrs, underlineColor)
    if (this.recording)
      this.ops.push({
        kind: "mergeAttrsInRect",
        x,
        y,
        width,
        height,
        attrs: { ...attrs },
        underlineColor,
      })
  }

  override setRowMeta(
    row: number,
    meta: { softWrapped?: boolean; lastContentCol?: number },
  ): void {
    super.setRowMeta(row, meta)
    if (this.recording) this.ops.push({ kind: "setRowMeta", row, ...meta })
  }

  /**
   * Snapshot the recorded ops as an immutable `RenderPlan`. Subsequent
   * mutations on the recorder do not affect the returned plan.
   */
  toPlan(): RenderPlan {
    return {
      width: this.width,
      height: this.height,
      ops: this.ops.slice(),
    }
  }
}

function cloneCellPatch(cell: Partial<Cell>): Partial<Cell> {
  const out: Partial<Cell> = { ...cell }
  if (cell.attrs) out.attrs = { ...cell.attrs }
  return out
}

/**
 * Wrap an existing buffer so that calling `.clone()` on it returns a
 * `RecordingBuffer`. The prevBuffer fed into `renderPhase` ends up cloned
 * as the working buffer — wrapping it lets the recorder capture every
 * mutation the existing renderer makes without modifying the renderer.
 *
 * The wrapper is a thin subclass that shares the underlying packed-cell
 * arrays via the regular constructor + clone pathway. Callers should
 * treat the wrapper as opaque — any mutations they make to it before
 * `clone()` propagate normally.
 */
export function wrapPrevBufferForRecording(prev: TerminalBuffer): TerminalBuffer {
  return new RecordingPrevBuffer(prev)
}

/**
 * Subclass of `TerminalBuffer` whose `clone()` returns a
 * `RecordingBuffer`. Used by `wrapPrevBufferForRecording` to seed the
 * Phase 1 capture-and-replay path.
 */
class RecordingPrevBuffer extends TerminalBuffer {
  constructor(source: TerminalBuffer) {
    super(source.width, source.height)
    // Copy state from source via clone(). The base TerminalBuffer's clone
    // returns a plain TerminalBuffer, so we copy field-by-field through
    // its public surface. We use a clone from the source then copy its
    // private state in via the subclassed accessor below.
    const copy = source.clone()
    copyBufferState(this, copy)
  }

  override clone(): TerminalBuffer {
    const dst = new RecordingBuffer(this.width, this.height)
    copyBufferState(dst, super.clone())
    dst.startRecording()
    return dst
  }

  /**
   * Resolve to a `RecordingBuffer` after the renderer has run. The
   * renderer obtains its working buffer by calling `prevBuffer.clone()`,
   * so the recorder is what actually receives the writes — callers can
   * keep a handle to the cloned buffer they fed to the renderer.
   */
}

/**
 * Replace `dst`'s internal state with a snapshot of `src`. Used when we
 * need to up-cast a freshly-cloned buffer into a subclass instance
 * (RecordingBuffer / RecordingPrevBuffer). Mirrors the field set in
 * `TerminalBuffer.clone()` so any future field added there must be added
 * here too.
 */
function copyBufferState(dst: TerminalBuffer, src: TerminalBuffer): void {
  // We rely on TerminalBuffer being internally consistent: the only way
  // to populate dst with src's state without exposing private fields is
  // to walk the public read API and reapply via setCell/fill. That is
  // O(width*height) and runs once per recorded frame — acceptable for
  // Phase 1 (opt-in flag) and replaced by Phase 2's emit-only renderer.
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      dst.setCell(x, y, src.getCell(x, y))
    }
  }
  for (let y = 0; y < src.height; y++) {
    const meta = src.getRowMeta(y)
    dst.setRowMeta(y, { softWrapped: meta.softWrapped, lastContentCol: meta.lastContentCol })
  }
  // Outline snapshots travel with the buffer; reuse the array directly
  // since snapshot entries are immutable once captured (matches the
  // shallow copy in TerminalBuffer.clone).
  dst.outlineSnapshots = [...src.outlineSnapshots]
}

/**
 * Apply a render plan to a target buffer. Ops are partitioned by kind into
 * priority buckets and applied in `COMMIT_PRIORITY` order; within a bucket
 * ops apply in plan order. This makes paint-then-clear unrepresentable
 * once renderers emit ops directly (Phase 2): the commit step decides the
 * order from data, not from walk order.
 *
 * In Phase 1 the recorder captures ops in the same order as the existing
 * imperative renderer, so to prove parity we apply ops in plan order
 * (priority within kind is preserved by stable sort). Phase 2 will switch
 * to true priority-bucketed application once the renderer no longer
 * mutates a buffer directly and ordering is the only ordering signal.
 */
export function commitPlan(target: TerminalBuffer, plan: RenderPlan): void {
  if (target.width !== plan.width || target.height !== plan.height) {
    throw new Error(
      `commitPlan: buffer dimensions ${target.width}x${target.height} ` +
        `do not match plan ${plan.width}x${plan.height}`,
    )
  }
  // Phase 1: apply ops in emission order to preserve byte-for-byte parity
  // with the imperative renderer. Phase 2 will switch to bucket-by-kind
  // application after renderers emit ops directly. We expose
  // commitPlanByPriority below so the priority order can be exercised by
  // tests independently.
  for (const op of plan.ops) applyOp(target, op)
}

/**
 * Apply ops grouped by `COMMIT_PRIORITY`. Within a priority bucket ops
 * apply in plan order. This is the long-run target ordering — used by
 * Phase 2 once renderers emit ops directly. Exposed in Phase 1 so tests
 * can pin the bucket ordering and so that downstream developers can
 * inspect the substrate.
 */
export function commitPlanByPriority(target: TerminalBuffer, plan: RenderPlan): void {
  if (target.width !== plan.width || target.height !== plan.height) {
    throw new Error(
      `commitPlanByPriority: buffer dimensions ${target.width}x${target.height} ` +
        `do not match plan ${plan.width}x${plan.height}`,
    )
  }
  const buckets: RenderOp[][] = Array.from(
    { length: Object.keys(COMMIT_PRIORITY).length },
    () => [],
  )
  for (const op of plan.ops) buckets[COMMIT_PRIORITY[op.kind]]!.push(op)
  for (const bucket of buckets) for (const op of bucket) applyOp(target, op)
}

function applyOp(buffer: TerminalBuffer, op: RenderOp): void {
  switch (op.kind) {
    case "setCell":
      buffer.setCell(op.x, op.y, op.cell)
      return
    case "fill":
      buffer.fill(op.x, op.y, op.width, op.height, op.cell)
      return
    case "fillBg":
      buffer.fillBg(op.x, op.y, op.width, op.height, op.bg)
      return
    case "restyleRegion":
      buffer.restyleRegion(op.x, op.y, op.width, op.height, op.style)
      return
    case "scrollRegion":
      buffer.scrollRegion(op.x, op.y, op.width, op.height, op.delta, op.clearCell ?? {})
      return
    case "setSelectableMode":
      buffer.setSelectableMode(op.selectable)
      return
    case "mergeAttrsInRect":
      buffer.mergeAttrsInRect(op.x, op.y, op.width, op.height, op.attrs, op.underlineColor)
      return
    case "setRowMeta": {
      const meta: { softWrapped?: boolean; lastContentCol?: number } = {}
      if (op.softWrapped !== undefined) meta.softWrapped = op.softWrapped
      if (op.lastContentCol !== undefined) meta.lastContentCol = op.lastContentCol
      buffer.setRowMeta(op.row, meta)
      return
    }
  }
}

/**
 * Read the SILVERY_RENDER_PLAN env var. Returns true (default) UNLESS
 * the user explicitly opts out with `SILVERY_RENDER_PLAN=0` /
 * `SILVERY_RENDER_PLAN=false`.
 *
 * Phase 1: opt-in only (default off).
 * Phase 2: opt-in via flag for testing.
 * Phase 3 (current): default ON, opt-out for one release. The plan
 * capture + sectioned commit is now load-bearing — it runs every
 * frame, the captured plan is committed onto a fresh clone for parity
 * (verified by tests/features/render-plan-fuzz.test.tsx +
 * tests/features/render-plan-production.test.tsx). The opt-out exists
 * solely to roll back if a regression slips through; the next release
 * removes the env var entirely.
 */
export function isRenderPlanEnabled(): boolean {
  const env: Record<string, string | undefined> | undefined =
    typeof process !== "undefined" ? process.env : undefined
  const v = env?.SILVERY_RENDER_PLAN
  // Default ON. Only "0" / "false" / "" / "off" / "no" disable it.
  if (v === undefined) return true
  const lower = v.toLowerCase()
  return lower !== "0" && lower !== "false" && lower !== "" && lower !== "off" && lower !== "no"
}

// ---------------------------------------------------------------------------
// Phase 2 Step 1: sectioned RenderPlan
// ---------------------------------------------------------------------------
//
// Per pro/Kimi review (2026-04-27), the structural fix is a plan SHAPE that
// separates stale-prev cleanup from final-frame paint. Wrong-order paint
// becomes unrepresentable when the commit step routes ops by SECTION, not
// by op kind:
//
//   transfer → cleanup → paint → overlay → postState
//
// The bucketed types below encode this at the type level: `ClearOp[]` and
// `PaintOp[]` are distinct types, so a renderer cannot put a clear into the
// paint bucket or vice versa — the type system rejects it. This is the L4
// quality target for km-silvery.paint-clear-invariant.
//
// Phase 2 Step 1 (this commit) lands the types + a classifier from flat
// `RenderOp[]` → `SectionedRenderPlan` + a `commitSectionedPlan` that
// applies in the structural order. The classifier uses heuristics that hold
// for the CURRENT renderer (every `buffer.fill` in the pipeline writes
// space chars and is therefore a clear). Phase 2 Step 2 introduces a
// `RenderSink` interface so renderers emit explicitly-classified ops
// instead of going through the heuristic — closes the residual ceremony in
// the classifier.

/**
 * A clear (destructive cleanup) op. Lives in `cleanupOps`. Removes stale
 * pixels from the prev-frame clone before any final-frame paint covers
 * them. The structural property is "all clears commit before any paints"
 * — the commit step enforces this by section ordering, regardless of the
 * order in which the renderer emitted them.
 */
export type ClearOp =
  | { kind: "clearRect"; x: number; y: number; width: number; height: number; bg: Color }
  | {
      kind: "clearCells"
      x: number
      y: number
      width: number
      height: number
      cell: Partial<Cell>
    }

/**
 * A paint (constructive content) op. Lives in `paintOps`. WITHIN this
 * section, plan-emission order preserves CSS paint order so later
 * siblings can legitimately cover earlier siblings' overflow text.
 */
export type PaintOp =
  | { kind: "setCell"; x: number; y: number; cell: Partial<Cell> }
  | { kind: "fillBg"; x: number; y: number; width: number; height: number; bg: Color }
  | {
      kind: "paintFill"
      x: number
      y: number
      width: number
      height: number
      cell: Partial<Cell>
    }
  | {
      kind: "restyleRegion"
      x: number
      y: number
      width: number
      height: number
      style: Style
    }

/**
 * A transfer op. Lives in `transferOps`. Shifts existing prev-frame
 * pixels (e.g. scroll Tier 1 buffer-shift). Runs FIRST so subsequent
 * paints into the shifted region land on the right cells.
 */
export type TransferOp = {
  kind: "scrollRegion"
  x: number
  y: number
  width: number
  height: number
  delta: number
  clearCell?: Partial<Cell>
}

/**
 * An overlay op. Lives in `overlayOps`. Applied AFTER paint — Box attr
 * overlays (bold/underline/strikethrough) merge into existing cells, so
 * those cells must already be written.
 */
export type OverlayOp = {
  kind: "mergeAttrsInRect"
  x: number
  y: number
  width: number
  height: number
  attrs: CellAttrs
  underlineColor?: Color
}

/**
 * Buffer book-keeping that survives across frames or that must be in
 * place before any cell write within a row. `setSelectableMode` is a
 * mode toggle; per pro review it's hidden mutable state that should
 * eventually be encoded into each cell op (Phase 2 Step 2). For Phase 2
 * Step 1 we capture it as post-state because in the current renderer
 * the toggle pattern is `setSelectableMode(true) at root, then false
 * during traversal of overlays` — predictable and applied last in the
 * commit by inspection.
 */
export type PostStateOp =
  | { kind: "setRowMeta"; row: number; softWrapped?: boolean; lastContentCol?: number }
  | { kind: "setSelectableMode"; selectable: boolean }
  | {
      // Outline snapshots — non-cell buffer state captured during the
      // decoration pass so the next frame can restore the under-cells
      // before drawing the new outlines (see decoration-phase.ts).
      // Phase 2 Step 5: hoisted out of `buffer.outlineSnapshots` direct
      // mutation onto the sink so the plan-shape captures all the
      // surviving-across-frames state without buffer-side reach-around.
      kind: "setOutlineSnapshots"
      snapshots: ReadonlyArray<{ x: number; y: number; cell: Cell }>
    }

/**
 * Sectioned RenderPlan — the L4 target for km-silvery.paint-clear-invariant.
 *
 * Each section is a typed list, so the type system rejects mixing kinds.
 * Commit applies sections in fixed order:
 *
 *   1. transferOps      — shift prev pixels (scroll Tier 1)
 *   2. cleanupOps       — destructive clears (excess, overflow, viewport)
 *   3. paintOps         — final-frame content (bg fills, text, borders)
 *   4. overlayOps       — attr overlays (merge into existing cells)
 *   5. postStateOps     — row metadata, selectable mode
 *
 * Wrong-order sibling-stomp becomes unrepresentable: a `ClearOp` cannot
 * end up in `paintOps`. The plan-shape itself is the invariant.
 */
export interface SectionedRenderPlan {
  readonly width: number
  readonly height: number
  readonly transferOps: readonly TransferOp[]
  readonly cleanupOps: readonly ClearOp[]
  readonly paintOps: readonly PaintOp[]
  readonly overlayOps: readonly OverlayOp[]
  readonly postStateOps: readonly PostStateOp[]
}

/**
 * Classify a flat `RenderPlan` (Phase 1 substrate) into a sectioned plan.
 *
 * **CLASSIFIER IS NOT PRODUCTION-CORRECT.** Wiring this through `ag.ts`
 * was attempted (see commit on feat/render-plan-commit-phase1 branch) and
 * produced wrong output for: `absolute-shrink-bg-preserve` (the very bug
 * we're trying to fix structurally), `backdrop-fade`, and
 * `outline-incremental`. The classifier IS sound enough for substrate
 * tests (it produces the same buffer the legacy renderer does on the
 * current parity-test scenes) but a heuristic cannot reliably tell a
 * "clear" `buffer.fill` from a "paint" `buffer.fill` — both use the same
 * shape (space char + bg). The split is intent, not data.
 *
 * Per pro/Kimi review: Phase 2 Step 3 must introduce an explicit
 * `RenderSink` interface so the renderer marks intent at emission time
 * (`sink.emitClear(...)` vs `sink.emitPaint(...)`). The classifier is
 * retired once Step 3 lands; until then it's a transitional helper for
 * tests of the sectioned commit machinery.
 *
 * Current heuristic (NOT a structural invariant — limitations above):
 *
 *   - `fill` with `char === " "` (or undefined) → `clearCells`.
 *     This is wrong for `render-box.ts`'s opaque bg paints
 *     (`buffer.fill(rect, {bg})`), which use space char but ARE paints.
 *     The audit test `Phase 2: classifier audit — every fill in current
 *     renderer uses space char` pins the char-shape; it does NOT pin
 *     intent. Phase 2 Step 3 closes this.
 *   - `fillBg` → `fillBg` paint.
 *   - `setCell`, `restyleRegion` → paint.
 *   - `scrollRegion` → transfer.
 *   - `mergeAttrsInRect` → overlay.
 *   - `setSelectableMode`, `setRowMeta` → postState.
 */
export function classifyPlan(flat: RenderPlan): SectionedRenderPlan {
  const transferOps: TransferOp[] = []
  const cleanupOps: ClearOp[] = []
  const paintOps: PaintOp[] = []
  const overlayOps: OverlayOp[] = []
  const postStateOps: PostStateOp[] = []

  for (const op of flat.ops) {
    switch (op.kind) {
      case "scrollRegion":
        transferOps.push(op)
        break
      case "fill": {
        // Heuristic: space char => clear; otherwise paint. See classifier
        // doc comment + tests/features/render-plan-parity.test.tsx for
        // the audit that justifies this.
        const ch = op.cell.char
        if (ch === undefined || ch === " ") {
          cleanupOps.push({
            kind: "clearCells",
            x: op.x,
            y: op.y,
            width: op.width,
            height: op.height,
            cell: op.cell,
          })
        } else {
          paintOps.push({
            kind: "paintFill",
            x: op.x,
            y: op.y,
            width: op.width,
            height: op.height,
            cell: op.cell,
          })
        }
        break
      }
      case "fillBg":
      case "setCell":
      case "restyleRegion":
        paintOps.push(op)
        break
      case "mergeAttrsInRect":
        overlayOps.push(op)
        break
      case "setRowMeta":
      case "setSelectableMode":
        postStateOps.push(op)
        break
    }
  }

  return {
    width: flat.width,
    height: flat.height,
    transferOps,
    cleanupOps,
    paintOps,
    overlayOps,
    postStateOps,
  }
}

/**
 * Apply a sectioned plan to a target buffer in structural order:
 * transfer → cleanup → paint → overlay → postState. Within each section,
 * ops apply in plan-emission order (which preserves CSS paint order for
 * paintOps: later sibling bg can legitimately cover earlier sibling
 * overflow text).
 *
 * This is the L4 commit path: wrong-order sibling-stomp is unrepresentable
 * by construction because a `ClearOp` cannot end up in `paintOps` — the
 * type system rejects it.
 */
export function commitSectionedPlan(target: TerminalBuffer, plan: SectionedRenderPlan): void {
  if (target.width !== plan.width || target.height !== plan.height) {
    throw new Error(
      `commitSectionedPlan: buffer dimensions ${target.width}x${target.height} ` +
        `do not match plan ${plan.width}x${plan.height}`,
    )
  }
  for (const op of plan.transferOps) applyTransfer(target, op)
  for (const op of plan.cleanupOps) applyClear(target, op)
  for (const op of plan.paintOps) applyPaint(target, op)
  for (const op of plan.overlayOps) applyOverlay(target, op)
  for (const op of plan.postStateOps) applyPostState(target, op)
}

function applyTransfer(buffer: TerminalBuffer, op: TransferOp): void {
  buffer.scrollRegion(op.x, op.y, op.width, op.height, op.delta, op.clearCell ?? {})
}

function applyClear(buffer: TerminalBuffer, op: ClearOp): void {
  if (op.kind === "clearRect") {
    buffer.fill(op.x, op.y, op.width, op.height, { char: " ", bg: op.bg })
  } else {
    buffer.fill(op.x, op.y, op.width, op.height, op.cell)
  }
}

function applyPaint(buffer: TerminalBuffer, op: PaintOp): void {
  switch (op.kind) {
    case "setCell":
      buffer.setCell(op.x, op.y, op.cell)
      return
    case "fillBg":
      buffer.fillBg(op.x, op.y, op.width, op.height, op.bg)
      return
    case "paintFill":
      buffer.fill(op.x, op.y, op.width, op.height, op.cell)
      return
    case "restyleRegion":
      buffer.restyleRegion(op.x, op.y, op.width, op.height, op.style)
      return
  }
}

function applyOverlay(buffer: TerminalBuffer, op: OverlayOp): void {
  buffer.mergeAttrsInRect(op.x, op.y, op.width, op.height, op.attrs, op.underlineColor)
}

function applyPostState(buffer: TerminalBuffer, op: PostStateOp): void {
  switch (op.kind) {
    case "setSelectableMode":
      buffer.setSelectableMode(op.selectable)
      return
    case "setRowMeta": {
      const meta: { softWrapped?: boolean; lastContentCol?: number } = {}
      if (op.softWrapped !== undefined) meta.softWrapped = op.softWrapped
      if (op.lastContentCol !== undefined) meta.lastContentCol = op.lastContentCol
      buffer.setRowMeta(op.row, meta)
      return
    }
    case "setOutlineSnapshots":
      buffer.outlineSnapshots = op.snapshots.slice()
      return
  }
}

/**
 * Run the existing render phase against a recording prevBuffer, returning
 * the rendered buffer along with the captured `RenderPlan`. The plan can
 * then be replayed by `commitPlan` (or `commitPlanByPriority`) into a
 * fresh clone of `prevBuffer` to verify the substrate produces an
 * identical result.
 *
 * Phase 1 entry point. Wired by `renderPhaseWithOptionalPlan` in
 * `render-phase-adapter.ts` when `SILVERY_RENDER_PLAN` is set, and by the
 * parity test directly. Falls back to the standard path when `prevBuffer`
 * is null (fresh render) — the recorder needs an existing prevBuffer to
 * clone into a `RecordingBuffer`. Phase 2 will lift that restriction by
 * making renderers emit ops directly instead of via the recorder.
 */
export function captureRenderPlan(
  runRenderer: (prev: TerminalBuffer) => TerminalBuffer,
  prevBuffer: TerminalBuffer,
): { buffer: TerminalBuffer; plan: RenderPlan } {
  const wrapped = wrapPrevBufferForRecording(prevBuffer)
  const buffer = runRenderer(wrapped)
  if (!(buffer instanceof RecordingBuffer)) {
    throw new Error(
      "captureRenderPlan: renderer did not call prev.clone() — " +
        "RecordingBuffer was not produced. This breaks the Phase 1 capture " +
        "contract; use the legacy path or extend the recorder.",
    )
  }
  return { buffer, plan: buffer.toPlan() }
}
