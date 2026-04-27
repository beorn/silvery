/**
 * Phase 2 Step 7 — production SILVERY_RENDER_PLAN wiring
 * (km-silvery.paint-clear-invariant). Closes the Check 1 derisking gap
 * from Phase 1: the env flag is now read by ag.ts at the production
 * doRender entry point, not just by tests.
 *
 * What this verifies:
 *   1. `isRenderPlanEnabled()` reads SILVERY_RENDER_PLAN as advertised.
 *   2. `withPlanCapture` activates frame-shared plan capture across the
 *      module-level capture pointer; nested scopes restore correctly.
 *   3. `createFrameSink` returns BufferSink-only by default (no plan
 *      capture active) and TeeSink (BufferSink + frame PlanSink) when
 *      a capture scope is active.
 *   4. A scene rendered through `createFrameSink` emissions inside a
 *      `withPlanCapture` scope produces a buffer that, when the
 *      captured plan is replayed onto a fresh clone, matches the
 *      direct mutation result.
 *
 * The full-renderer parity test (every silvery STRICT scene under
 * SILVERY_RENDER_PLAN=1) is implicit: running the suite with the env
 * var on exercises the production wire path through every test in the
 * vendor STRICT corpus. See bead km-silvery.paint-clear-invariant.
 */
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import {
  commitSectionedPlan,
  isRenderPlanEnabled,
} from "@silvery/ag-term/pipeline/render-plan"
import {
  BufferSink,
  TeeSink,
  createFrameSink,
  withPlanCapture,
} from "@silvery/ag-term/pipeline/render-sink"
import { compareBuffers, formatMismatch } from "@silvery/test"

describe("RenderPlan production wiring (Phase 2 Step 7)", () => {
  test("isRenderPlanEnabled defaults ON (Phase 3); opt-out via SILVERY_RENDER_PLAN=0", () => {
    const original = process.env.SILVERY_RENDER_PLAN
    try {
      // Phase 3: default ON. Unset env var → enabled.
      delete process.env.SILVERY_RENDER_PLAN
      expect(isRenderPlanEnabled()).toBe(true)

      // Explicit opt-out values disable.
      process.env.SILVERY_RENDER_PLAN = "0"
      expect(isRenderPlanEnabled()).toBe(false)

      process.env.SILVERY_RENDER_PLAN = "false"
      expect(isRenderPlanEnabled()).toBe(false)

      process.env.SILVERY_RENDER_PLAN = ""
      expect(isRenderPlanEnabled()).toBe(false)

      process.env.SILVERY_RENDER_PLAN = "off"
      expect(isRenderPlanEnabled()).toBe(false)

      process.env.SILVERY_RENDER_PLAN = "no"
      expect(isRenderPlanEnabled()).toBe(false)

      // Any other value (including legacy "1" / "true") enables.
      process.env.SILVERY_RENDER_PLAN = "1"
      expect(isRenderPlanEnabled()).toBe(true)

      process.env.SILVERY_RENDER_PLAN = "true"
      expect(isRenderPlanEnabled()).toBe(true)
    } finally {
      if (original === undefined) delete process.env.SILVERY_RENDER_PLAN
      else process.env.SILVERY_RENDER_PLAN = original
    }
  })

  test("createFrameSink returns BufferSink by default (outside capture scope)", () => {
    const buffer = new TerminalBuffer(10, 5)
    const sink = createFrameSink(buffer)
    expect(sink).toBeInstanceOf(BufferSink)
  })

  test("createFrameSink returns TeeSink inside withPlanCapture scope", () => {
    const buffer = new TerminalBuffer(10, 5)
    const captured = withPlanCapture(10, 5, () => {
      const sink = createFrameSink(buffer)
      expect(sink).toBeInstanceOf(TeeSink)
      // After the scope exits, capture is no longer active.
      return sink
    })
    expect(captured.plan).toBeDefined()
    expect(captured.plan.width).toBe(10)
    expect(captured.plan.height).toBe(5)

    // Outside the scope, frame sinks revert to BufferSink.
    const post = createFrameSink(buffer)
    expect(post).toBeInstanceOf(BufferSink)
  })

  test("nested withPlanCapture restores outer scope on exit", () => {
    const buffer = new TerminalBuffer(10, 5)
    let outerSinkAfterInner: import("@silvery/ag-term/pipeline/render-sink").RenderSink | null = null

    withPlanCapture(10, 5, () => {
      const innerCapture = withPlanCapture(10, 5, () => createFrameSink(buffer))
      // After inner scope exits, outer capture is restored.
      outerSinkAfterInner = createFrameSink(buffer)
      expect(innerCapture.plan).toBeDefined()
    })

    // The outer scope's createFrameSink call returned a TeeSink (because
    // outer capture was still active when called).
    expect(outerSinkAfterInner).toBeInstanceOf(TeeSink)

    // Outside both scopes, sinks are BufferSink again.
    const final = createFrameSink(buffer)
    expect(final).toBeInstanceOf(BufferSink)
  })

  test("captured plan replay matches the BufferSink-mutated buffer for a non-trivial scene", () => {
    // Simulate what the production wiring does inside ag.ts: emit ops
    // through createFrameSink (which is a TeeSink under withPlanCapture)
    // and verify the captured plan, replayed onto a fresh clone, equals
    // the BufferSink output.
    const cols = 20
    const rows = 8
    const prevBuffer = new TerminalBuffer(cols, rows)
    // Seed the prev buffer with some content so the clone has stale pixels
    // worth clearing — exercises the cleanup section of the plan.
    prevBuffer.fill(0, 0, cols, rows, { char: "X", bg: 7, fg: 1 })

    function emitScene(): TerminalBuffer {
      // The "renderer" mutates the cloned prev buffer through createFrameSink
      // (which under capture is a TeeSink that ALSO records to the plan).
      const buffer = prevBuffer.clone()
      const sink = createFrameSink(buffer)

      // Cleanup: clear the whole viewport (intent: clear stale prev pixels)
      sink.emitClearRect(0, 0, cols, rows, null)

      // Paint: bg fill (intent: paint constructive bg)
      sink.emitPaintFill(0, 0, cols, 4, { bg: 4 })

      // Paint: a couple of cells with text
      sink.emitSetCell(2, 1, { char: "H", bg: 4, fg: 15 })
      sink.emitSetCell(3, 1, { char: "i", bg: 4, fg: 15 })

      // Paint: bg-only fast path on a different row
      sink.emitFillBg(0, 5, cols, 1, 2)

      // Overlay: bold attr on the paint-row
      sink.emitMergeAttrs(2, 1, 2, 1, { bold: true } as never)

      // Post-state
      sink.setSelectableMode(true)
      sink.setRowMeta(0, { softWrapped: false })

      return buffer
    }

    // Run with capture
    const captured = withPlanCapture(cols, rows, emitScene)
    const direct = captured.result

    // Replay the captured plan onto a fresh clone of prevBuffer.
    const replay = prevBuffer.clone()
    commitSectionedPlan(replay, captured.plan)

    // Both paths must produce identical buffers.
    const mismatch = compareBuffers(direct, replay)
    if (mismatch) {
      throw new Error(
        `TeeSink-captured plan replay diverges from direct BufferSink path:\n${formatMismatch(mismatch)}`,
      )
    }

    // Plan should have ops in each section — this proves the TeeSink fans
    // emissions out by intent (not by classifying buffer mutations).
    expect(captured.plan.cleanupOps.length).toBeGreaterThan(0)
    expect(captured.plan.paintOps.length).toBeGreaterThan(0)
    expect(captured.plan.overlayOps.length).toBeGreaterThan(0)
    expect(captured.plan.postStateOps.length).toBeGreaterThan(0)
  })
})
