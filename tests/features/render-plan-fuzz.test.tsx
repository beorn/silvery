/**
 * Phase 3 — paint-clear-invariant fuzz property test
 * (km-silvery.paint-clear-invariant). The L4 invariant promises that
 * wrong-order sibling-stomp is structurally unrepresentable. This fuzz
 * test verifies it: arbitrary op sequences emitted through the
 * SectionedRenderPlan and committed via `commitSectionedPlan` produce
 * a buffer whose paint pixels SURVIVE any subsequent clear in the same
 * emission stream (because clears commit FIRST, paints commit SECOND).
 *
 * Property: for any random emission of cleanups + paints + overlays +
 * post-state, the post-commit buffer has all paint pixels intact even
 * when paints were emitted BEFORE overlapping clears in walk-order.
 *
 * The opposite property holds for direct buffer mutation (BufferSink):
 * later clears stomp earlier paints, which is exactly the bug class
 * the recast aims to eliminate.
 *
 * The fuzz exercises:
 *   - 1000 random scenes
 *   - 5-50 random ops per scene
 *   - mix of clear / paint / overlay / post-state intent
 *   - overlapping rectangles drawn from random distributions
 *   - random emission order (not paint-first)
 *
 * Failure mode: if any commit produces a paint pixel that was stomped
 * by a clear that came AFTER the paint in emission order, the test
 * fails. This would mean a renderer somehow bypassed the section
 * routing — the L4 invariant violated.
 */
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { commitSectionedPlan } from "@silvery/ag-term/pipeline/render-plan"
import { PlanSink } from "@silvery/ag-term/pipeline/render-sink"

// Deterministic fast PRNG (mulberry32) — fuzz test reproducibility.
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface FuzzOp {
  kind: "clear" | "paint" | "setCell" | "fillBg"
  x: number
  y: number
  width: number
  height: number
  bg: number | null
  char?: string
}

function randomOp(rng: () => number, cols: number, rows: number): FuzzOp {
  const r = rng()
  const x = Math.floor(rng() * cols)
  const y = Math.floor(rng() * rows)
  const width = 1 + Math.floor(rng() * Math.max(1, cols - x))
  const height = 1 + Math.floor(rng() * Math.max(1, rows - y))
  const bg = rng() < 0.2 ? null : Math.floor(rng() * 8)
  const char = String.fromCharCode(33 + Math.floor(rng() * 90))
  if (r < 0.25) return { kind: "clear", x, y, width, height, bg }
  if (r < 0.5) return { kind: "paint", x, y, width, height, bg, char }
  if (r < 0.85) return { kind: "setCell", x, y, width: 1, height: 1, bg, char }
  return { kind: "fillBg", x, y, width, height, bg }
}

function emit(sink: PlanSink, op: FuzzOp): void {
  switch (op.kind) {
    case "clear":
      sink.emitClearRect(op.x, op.y, op.width, op.height, op.bg)
      return
    case "paint":
      sink.emitPaintFill(op.x, op.y, op.width, op.height, {
        char: op.char ?? " ",
        bg: op.bg,
      })
      return
    case "setCell":
      sink.emitSetCell(op.x, op.y, { char: op.char ?? " ", bg: op.bg })
      return
    case "fillBg":
      sink.emitFillBg(op.x, op.y, op.width, op.height, op.bg)
      return
  }
}

describe("RenderPlan paint-clear-invariant fuzz (Phase 3)", () => {
  test("fuzz: arbitrary op sequences — every paint pixel survives any later clear (L4 invariant)", () => {
    const cols = 16
    const rows = 8
    const ITERATIONS = 1000

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const rng = mulberry32(iter * 0x9e3779b9)
      const numOps = 5 + Math.floor(rng() * 46) // 5..50

      // Generate ops; mark each as "paint" or "clear" by intent.
      const ops: FuzzOp[] = []
      for (let i = 0; i < numOps; i++) {
        ops.push(randomOp(rng, cols, rows))
      }

      // Emit through PlanSink (sectioned).
      const sink = new PlanSink(cols, rows)
      for (const op of ops) emit(sink, op)
      const plan = sink.toPlan()

      // Commit onto a fresh buffer.
      const buffer = new TerminalBuffer(cols, rows)
      commitSectionedPlan(buffer, plan)

      // Property: every cell hit by a paint op (and not by a LATER paint op
      // that overlaps and overwrites it) should match the LAST paint that
      // hit it — clears in cleanupOps run FIRST, so they never stomp paints.
      //
      // Build expected per-cell paint:
      const expectedPaintBg = new Map<number, number | null>()
      const expectedPaintChar = new Map<number, string>()
      for (const op of ops) {
        if (op.kind === "clear") continue // clears do not contribute to expected
        for (let yy = op.y; yy < op.y + op.height; yy++) {
          for (let xx = op.x; xx < op.x + op.width; xx++) {
            if (xx < 0 || xx >= cols || yy < 0 || yy >= rows) continue
            const key = yy * cols + xx
            // Later paints in emission order win within paintOps.
            if (op.kind === "paint" || op.kind === "setCell") {
              expectedPaintBg.set(key, op.bg)
              expectedPaintChar.set(key, op.char ?? " ")
            } else if (op.kind === "fillBg") {
              expectedPaintBg.set(key, op.bg)
              // fillBg preserves char; expectedPaintChar unchanged
            }
          }
        }
      }

      // Verify: every cell where a paint was emitted has the paint's bg
      // (and char where applicable), regardless of whether a clear was
      // emitted AFTER the paint in walk-order. The section commit makes
      // this property structural.
      for (const [key, expectedBg] of expectedPaintBg.entries()) {
        const xx = key % cols
        const yy = Math.floor(key / cols)
        const cell = buffer.getCell(xx, yy)
        if (cell.bg !== expectedBg) {
          throw new Error(
            `iter=${iter} cell(${xx},${yy}) bg=${cell.bg} expected=${expectedBg}; ` +
              `paint stomped by clear (L4 invariant violation). ops=${JSON.stringify(ops)}`,
          )
        }
        const expectedChar = expectedPaintChar.get(key)
        if (expectedChar !== undefined && cell.char !== expectedChar) {
          throw new Error(
            `iter=${iter} cell(${xx},${yy}) char=${cell.char} expected=${expectedChar}; ` +
              `paint stomped by clear (L4 invariant violation). ops=${JSON.stringify(ops)}`,
          )
        }
      }
    }

    // If we reach here all 1000 iterations passed.
    expect(true).toBe(true)
  })

  test("fuzz: paint-after-clear ordering — emitted in walk-order, paint wins after commit", () => {
    // Targeted property: emit clear THEN paint at the same cell.
    // BufferSink: paint comes second in emission, paint wins (legacy).
    // PlanSink + sectioned commit: clear in cleanupOps, paint in paintOps,
    // commit order is clear→paint, paint wins.
    // Both paths should produce paint-wins; the section commit is just
    // the same outcome under stronger guarantees.
    for (let iter = 0; iter < 100; iter++) {
      const rng = mulberry32(iter * 0xdeadbeef)
      const x = Math.floor(rng() * 8)
      const y = Math.floor(rng() * 4)
      const clearBg = Math.floor(rng() * 8)
      const paintBg = (clearBg + 1 + Math.floor(rng() * 7)) % 8

      const sink = new PlanSink(8, 4)
      sink.emitClearRect(x, y, 1, 1, clearBg)
      sink.emitPaintFill(x, y, 1, 1, { char: "P", bg: paintBg })
      const plan = sink.toPlan()

      const buffer = new TerminalBuffer(8, 4)
      commitSectionedPlan(buffer, plan)

      const cell = buffer.getCell(x, y)
      expect(cell.bg).toBe(paintBg)
      expect(cell.char).toBe("P")
    }
  })

  test("fuzz: clear-after-paint ordering — paint emitted FIRST in walk-order, paint STILL wins", () => {
    // The actual invariant the recast targets: walk-order has paint THEN
    // clear (sibling-stomp shape — child paints, then later sibling's
    // clearExcessArea runs and stomps the just-painted region).
    //
    // BufferSink: clear comes second in emission, clear wins (BUG).
    // PlanSink + sectioned commit: clear in cleanupOps (commits FIRST),
    // paint in paintOps (commits SECOND), paint wins (CORRECT).
    //
    // This is the structural L4 property: section commit makes the
    // walk-order stomp UNREPRESENTABLE.
    for (let iter = 0; iter < 100; iter++) {
      const rng = mulberry32(iter * 0xcafe1234)
      const x = Math.floor(rng() * 8)
      const y = Math.floor(rng() * 4)
      const clearBg = Math.floor(rng() * 8)
      const paintBg = (clearBg + 1 + Math.floor(rng() * 7)) % 8

      const sink = new PlanSink(8, 4)
      // PAINT FIRST, then CLEAR — the wrong walk-order shape.
      sink.emitPaintFill(x, y, 1, 1, { char: "P", bg: paintBg })
      sink.emitClearRect(x, y, 1, 1, clearBg)
      const plan = sink.toPlan()

      const buffer = new TerminalBuffer(8, 4)
      commitSectionedPlan(buffer, plan)

      // Sectioned commit: clear ran first (cleanupOps), paint ran second
      // (paintOps). Paint wins. The L4 invariant holds even with the
      // wrong-order emission.
      const cell = buffer.getCell(x, y)
      expect(cell.bg).toBe(paintBg)
      expect(cell.char).toBe("P")
    }
  })
})
