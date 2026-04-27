/**
 * Phase 1 of paint-clear-invariant recast (km-silvery.paint-clear-invariant).
 *
 * Render plan + commit substrate. The render phase produces an ordered list
 * of buffer mutations (`RenderOp[]`) and `commitPlan` applies them against a
 * fresh prevBuffer clone in a deterministic priority order: bg fills → clears
 * → cell paints → decoration. Phase 1 is flag-gated under SILVERY_RENDER_PLAN
 * and proves the substrate against the existing imperative renderer through a
 * capture-and-replay parity test. Phase 2 will rewrite renderers to emit ops
 * directly; Phase 3 will delete clearExcessArea's hasPrevBuffer guard
 * (silvery 168b4989) because the call site that needs it can no longer be
 * reached.
 *
 * Design doc: hub/silvery/design/render-plan-commit.md (in km workspace).
 */

import type { Cell, Color, Style } from "../buffer"
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
  | { kind: "setRowMeta"; row: number; softWrapped?: boolean; lastContentCol?: number }

export interface RenderPlan {
  readonly width: number
  readonly height: number
  readonly ops: readonly RenderOp[]
}

const COMMIT_PRIORITY: Record<RenderOp["kind"], number> = {
  // Mode toggles must precede all writes inside their region (they
  // configure the trailing fill/setCell calls). Apply in plan order.
  setSelectableMode: 0,
  // Background-only fills are the lowest visual layer (covers stale clone
  // pixels) — apply before content writes that overlay them.
  fillBg: 1,
  // Region clears and bg fills happen via `fill()` with space chars; they
  // share the same z as content paints in the imperative path. We keep
  // them in plan-emission order to preserve fidelity in Phase 1 and let
  // Phase 2 split clear vs paint with separate kinds.
  fill: 2,
  setCell: 3,
  restyleRegion: 4,
  scrollRegion: 5,
  // Row metadata is book-keeping that travels with the cells it
  // describes; apply after writes.
  setRowMeta: 6,
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
 * Read the SILVERY_RENDER_PLAN env var. Returns true when the plan/commit
 * path is opted in. Phase 1: opt-in only (default off). Phase 2: opt-out
 * (default on, with `=0` to disable). Phase 3: env var removed.
 */
export function isRenderPlanEnabled(): boolean {
  const env: Record<string, string | undefined> | undefined =
    typeof process !== "undefined" ? process.env : undefined
  const v = env?.SILVERY_RENDER_PLAN
  return v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false"
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
