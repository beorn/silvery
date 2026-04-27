/**
 * Phase 2 Step 3 — RenderSink tests
 * (km-silvery.paint-clear-invariant). Covers:
 *
 *   - BufferSink behavior-equivalent to direct buffer mutation
 *     (every emit method produces the same buffer state as the
 *     equivalent buffer.* call).
 *   - PlanSink constructs sectioned plans with ops in the right
 *     section and the right order within section.
 *   - PlanSink + commitSectionedPlan replay produces the same buffer
 *     as BufferSink direct mutation (round-trip parity).
 *   - Type-level safety: ClearOp can't end up in paintOps even via
 *     PlanSink (the methods themselves enforce sectioning).
 */
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { commitSectionedPlan } from "@silvery/ag-term/pipeline/render-plan"
import { BufferSink, PlanSink } from "@silvery/ag-term/pipeline/render-sink"
import { compareBuffers, formatMismatch } from "@silvery/test"

describe("RenderSink", () => {
  test("BufferSink: every emit method is behavior-equivalent to direct buffer mutation", () => {
    const cols = 10
    const rows = 5
    const direct = new TerminalBuffer(cols, rows)
    const viaSink = new TerminalBuffer(cols, rows)
    const sink = new BufferSink(viaSink)

    // emitClearRect ↔ buffer.fill({char:" ", bg})
    direct.fill(0, 0, 5, 1, { char: " ", bg: 1 })
    sink.emitClearRect(0, 0, 5, 1, 1)

    // emitClearCells ↔ buffer.fill(cell)
    direct.fill(0, 1, 5, 1, { char: ".", bg: 2, fg: 3 })
    sink.emitClearCells(0, 1, 5, 1, { char: ".", bg: 2, fg: 3 })

    // emitPaintFill ↔ buffer.fill(cell)
    direct.fill(5, 0, 5, 1, { bg: 4 })
    sink.emitPaintFill(5, 0, 5, 1, { bg: 4 })

    // emitFillBg ↔ buffer.fillBg
    direct.fillBg(5, 1, 5, 1, 5)
    sink.emitFillBg(5, 1, 5, 1, 5)

    // emitSetCell ↔ buffer.setCell
    direct.setCell(0, 2, { char: "A", bg: 6, fg: 7 })
    sink.emitSetCell(0, 2, { char: "A", bg: 6, fg: 7 })

    // emitMergeAttrs ↔ buffer.mergeAttrsInRect (post-paint)
    direct.setCell(1, 2, { char: "B", bg: null, fg: null })
    sink.emitSetCell(1, 2, { char: "B", bg: null, fg: null })
    direct.mergeAttrsInRect(1, 2, 1, 1, { bold: true })
    sink.emitMergeAttrs(1, 2, 1, 1, { bold: true })

    // setRowMeta
    direct.setRowMeta(3, { softWrapped: true })
    sink.setRowMeta(3, { softWrapped: true })

    // setSelectableMode
    direct.setSelectableMode(true)
    sink.setSelectableMode(true)
    direct.setCell(0, 4, { char: "C" })
    sink.emitSetCell(0, 4, { char: "C" })

    const mismatch = compareBuffers(direct, viaSink)
    if (mismatch) throw new Error(`BufferSink diverges from direct mutation:\n${formatMismatch(mismatch)}`)
  })

  test("PlanSink: routes ops into the correct section by API method", () => {
    const sink = new PlanSink(10, 5)

    sink.emitScrollRegion(0, 0, 5, 3, -1)
    sink.emitClearRect(0, 0, 5, 1, null)
    sink.emitClearCells(5, 0, 5, 1, { char: " ", bg: null })
    sink.emitSetCell(0, 1, { char: "A" })
    sink.emitPaintFill(5, 1, 5, 1, { bg: 2 })
    sink.emitFillBg(0, 2, 10, 1, 3)
    sink.emitRestyleRegion(0, 3, 10, 1, { fg: 4 })
    sink.emitMergeAttrs(0, 3, 10, 1, { bold: true })
    sink.setSelectableMode(true)
    sink.setRowMeta(4, { softWrapped: true })

    const plan = sink.toPlan()

    expect(plan.transferOps).toHaveLength(1)
    expect(plan.transferOps[0]?.kind).toBe("scrollRegion")

    expect(plan.cleanupOps).toHaveLength(2)
    expect(plan.cleanupOps[0]?.kind).toBe("clearRect")
    expect(plan.cleanupOps[1]?.kind).toBe("clearCells")

    expect(plan.paintOps).toHaveLength(4)
    expect(plan.paintOps[0]?.kind).toBe("setCell")
    expect(plan.paintOps[1]?.kind).toBe("paintFill")
    expect(plan.paintOps[2]?.kind).toBe("fillBg")
    expect(plan.paintOps[3]?.kind).toBe("restyleRegion")

    expect(plan.overlayOps).toHaveLength(1)
    expect(plan.overlayOps[0]?.kind).toBe("mergeAttrsInRect")

    expect(plan.postStateOps).toHaveLength(2)
    expect(plan.postStateOps[0]?.kind).toBe("setSelectableMode")
    expect(plan.postStateOps[1]?.kind).toBe("setRowMeta")
  })

  test("PlanSink + commitSectionedPlan: replay matches BufferSink output (non-overlapping ops)", () => {
    // The L4 round-trip on non-overlapping ops: when ops don't overlap,
    // BufferSink (walk-order direct mutation) and PlanSink + sectioned
    // commit produce the same buffer cell-for-cell. This is the
    // substrate proof that the sink interface is sound.
    //
    // NOTE: this test deliberately avoids overlap between clears and
    // paints — those would diverge under sectioned commit by design
    // (clears commit first; see the next test which exercises that
    // structural property). For non-overlapping ops, both paths are
    // equivalent.
    const cols = 12
    const rows = 6

    function emitTo(sink: BufferSink | PlanSink): void {
      // Non-overlapping regions: paint cells in row 0, clear region in
      // row 4, paint bg in row 5, set cells + overlay in row 1.
      sink.setSelectableMode(true)
      // Row 0: text content.
      for (let i = 0; i < 5; i++) {
        sink.emitSetCell(i, 0, { char: String.fromCharCode(65 + i), fg: 3, bg: 1 })
      }
      // Row 1: text content + overlay (bold attr merges into existing
      // cells, applied after paint so cells exist).
      for (let i = 0; i < 5; i++) {
        sink.emitSetCell(i, 1, { char: "x", fg: 3, bg: null })
      }
      sink.emitMergeAttrs(0, 1, 5, 1, { bold: true })
      // Row 4: clear region.
      sink.emitClearRect(0, 4, cols, 1, 2)
      // Row 5: bg paint.
      sink.emitPaintFill(0, 5, cols, 1, { bg: 4 })
      sink.setRowMeta(2, { lastContentCol: 9 })
    }

    const direct = new TerminalBuffer(cols, rows)
    emitTo(new BufferSink(direct))

    const planSink = new PlanSink(cols, rows)
    emitTo(planSink)
    const plan = planSink.toPlan()

    const replayed = new TerminalBuffer(cols, rows)
    commitSectionedPlan(replayed, plan)

    const mismatch = compareBuffers(replayed, direct)
    if (mismatch) {
      throw new Error(
        `PlanSink + commitSectionedPlan diverges from BufferSink direct path:\n${formatMismatch(mismatch)}`,
      )
    }
  })

  test("PlanSink: section ordering is structural — clears before paints, regardless of emission order", () => {
    // Demonstrates the L4 property: the renderer can emit a paint THEN a
    // clear that overlaps it (walk order), and the sectioned commit
    // applies the clear FIRST so the paint wins. With direct buffer
    // mutation (BufferSink), the emission-order paint gets stomped by
    // the trailing clear. PlanSink + commitSectionedPlan reorders by
    // section, making the wrong-order stomp unrepresentable.
    const cols = 4
    const rows = 1

    // Walk-order emission: paint cell A, then "clear" the same cell.
    // BufferSink (legacy semantics): clear stomps paint.
    // PlanSink + sectioned commit: clear committed first, paint wins.
    function emitOverlapping(sink: BufferSink | PlanSink): void {
      sink.emitSetCell(0, 0, { char: "A", bg: 1, fg: 2 })
      sink.emitClearRect(0, 0, 1, 1, 3)
    }

    const buffered = new TerminalBuffer(cols, rows)
    emitOverlapping(new BufferSink(buffered))
    // BufferSink: emission order rules. clear came after paint so the
    // cell ends up cleared (space, bg=3).
    expect(buffered.getCell(0, 0).char).toBe(" ")
    expect(buffered.getCell(0, 0).bg).toBe(3)

    const planSink = new PlanSink(cols, rows)
    emitOverlapping(planSink)
    const plan = planSink.toPlan()
    const replayed = new TerminalBuffer(cols, rows)
    commitSectionedPlan(replayed, plan)
    // Sectioned commit: clear committed first (cleanupOps), then paint
    // (paintOps). Paint wins — the cell is "A" with paint's bg.
    expect(replayed.getCell(0, 0).char).toBe("A")
    expect(replayed.getCell(0, 0).bg).toBe(1)
  })
})
