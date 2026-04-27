/**
 * Phase 1 parity test for render-plan-commit (km-silvery.paint-clear-invariant).
 *
 * Drives the existing imperative renderer against a `RecordingBuffer` so
 * every buffer mutation is captured as a `RenderOp`. Then replays the
 * captured plan into a fresh clone of the same prevBuffer via `commitPlan`
 * and asserts the two resulting buffers are cell-for-cell identical.
 *
 * The contract:
 *
 *   commitPlan(prevBuffer.clone(), captureRenderPlan(scene).plan) === renderPhase(scene)
 *
 * If this holds, the plan/commit substrate captures every mutation the
 * renderer makes and replaying the plan reproduces the exact buffer.
 * Phase 2 will rewrite renderers to emit ops directly; Phase 3 will then
 * delete `clearExcessArea`'s `hasPrevBuffer` guard (silvery 168b4989).
 *
 * The fixture mirrors the AI-chat repro shape from
 * km-silvery.ai-chat-incremental-mismatch (the bug 168b4989 fixed): a
 * scrollbar absolute child shrinking in place while a normal-flow row
 * with backgroundColor renders into the vacated cells. That scenario
 * exercises both `clearNodeRegion` and `clearExcessArea`, plus normal
 * children + absolute children + bg fills.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { Box, Text } from "@silvery/ag-react"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
} from "@silvery/ag-react/reconciler"
import {
  measurePhase,
  layoutPhase,
  scrollPhase,
  stickyPhase,
  scrollrectPhase,
  notifyLayoutSubscribers,
} from "@silvery/ag-term/pipeline"
import { renderPhase } from "@silvery/ag-term/pipeline/render-phase"
import {
  commitPlan,
  RecordingBuffer,
  type RenderPlan,
  wrapPrevBufferForRecording,
} from "@silvery/ag-term/pipeline/render-plan"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import {
  setLayoutEngine,
  isLayoutEngineInitialized,
} from "@silvery/ag-term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { compareBuffers, formatMismatch } from "@silvery/test"

function ensureLayoutEngine(): void {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
}

/**
 * Run measure/layout/scroll/sticky/scrollRect/notify twice (matching the
 * standard two-pass layout in ag.ts) so layout feedback settles before
 * the render phase reads positions.
 */
function runLayoutPhases(root: ReturnType<typeof getContainerRoot>, cols: number, rows: number) {
  for (let i = 0; i < 2; i++) {
    measurePhase(root)
    layoutPhase(root, cols, rows)
    scrollPhase(root)
    stickyPhase(root)
    scrollrectPhase(root)
    notifyLayoutSubscribers(root)
  }
}

function mountScene(element: React.ReactElement, cols: number, rows: number) {
  ensureLayoutEngine()
  const container = createContainer(() => {})
  const root = getContainerRoot(container)
  const fiberRoot = createFiberRoot(container)
  reconciler.updateContainerSync(element, fiberRoot, null, null)
  reconciler.flushSyncWork()
  runLayoutPhases(root, cols, rows)
  reconciler.flushSyncWork()
  runLayoutPhases(root, cols, rows)
  return { container, root, fiberRoot }
}

/**
 * AI-chat repro fixture (mirrors km-silvery.ai-chat-incremental-mismatch
 * scaled to a 5×5 grid). `frame` selects the state:
 *   - `"a"`: scrollbar tall (height=5), last row plain (no bg)
 *   - `"b"`: scrollbar shrunk (height=2), last row gains bg=red
 */
function Scene({ frame }: { frame: "a" | "b" }) {
  const thumbHeight = frame === "a" ? 5 : 2
  const lastRowHasBg = frame === "b"
  return (
    <Box position="relative" width={5} height={5} flexDirection="column">
      <Text>row0.</Text>
      <Text>row1.</Text>
      <Text>row2.</Text>
      <Text>row3.</Text>
      {lastRowHasBg ? (
        <Box backgroundColor="red" width={5} height={1}>
          <Text>row4.</Text>
        </Box>
      ) : (
        <Text>row4.</Text>
      )}
      <Box position="absolute" left={4} top={0} width={1} height={thumbHeight}>
        <Text>{"█".repeat(thumbHeight)}</Text>
      </Box>
    </Box>
  )
}

describe("render-plan-commit parity (Phase 1)", () => {
  test("captureRenderPlan + commitPlan reproduces the renderer's buffer", () => {
    const cols = 5
    const rows = 5
    const mounted = mountScene(<Scene frame="a" />, cols, rows)

    // Frame 1: prevBuffer = null (fresh), gives us a real prev for frame 2.
    const frame1 = renderPhase(mounted.root, null)
    expect(frame1.width).toBe(cols)
    expect(frame1.height).toBe(rows)

    // Mutate scene to frame 2 and re-flush layout.
    reconciler.updateContainerSync(<Scene frame="b" />, mounted.fiberRoot, null, null)
    reconciler.flushSyncWork()
    runLayoutPhases(mounted.root, cols, rows)
    reconciler.flushSyncWork()
    runLayoutPhases(mounted.root, cols, rows)

    // Path A (legacy): renderPhase mutates a clone of frame1 imperatively.
    // We use a separate scene clone so the renderer's epoch advance + dirty
    // clear doesn't pollute path B. The cleanest seam is to rebuild frame1
    // from the original starting prev buffer for both paths — same input,
    // two execution strategies.
    const startPrev = frame1.clone()
    const legacyOut = renderPhase(mounted.root, startPrev)

    // Path B (plan/commit): wrap a fresh copy of the same starting prev,
    // run the renderer, capture the plan, replay it onto another fresh
    // copy. The renderer mutates state on the AgNode tree (epoch advance,
    // dirty bits cleared), so we re-mount the scene at frame "b" against
    // the same prevBuffer to get a fair comparison.
    const mountedB = mountScene(<Scene frame="a" />, cols, rows)
    renderPhase(mountedB.root, null) // seed prev (epoch parity)
    reconciler.updateContainerSync(<Scene frame="b" />, mountedB.fiberRoot, null, null)
    reconciler.flushSyncWork()
    runLayoutPhases(mountedB.root, cols, rows)
    reconciler.flushSyncWork()
    runLayoutPhases(mountedB.root, cols, rows)
    const startPrevB = frame1.clone()
    const wrappedPrev = wrapPrevBufferForRecording(startPrevB)
    const recordedOut = renderPhase(mountedB.root, wrappedPrev)
    expect(recordedOut).toBeInstanceOf(RecordingBuffer)
    const plan = (recordedOut as RecordingBuffer).toPlan()
    expect(plan.ops.length).toBeGreaterThan(0)

    // Replay the plan into a fresh clone of frame1 — the same starting
    // state the renderer began from.
    const replayed = frame1.clone()
    commitPlan(replayed, plan)

    // Phase 1 contract: replaying the captured plan reproduces the
    // recorded buffer cell-for-cell. This proves the recorder captures
    // every mutation and that commitPlan applies them faithfully.
    const mismatchVsRecorded = compareBuffers(replayed, recordedOut)
    if (mismatchVsRecorded) {
      throw new Error(
        `replayed plan diverges from recorded buffer:\n${formatMismatch(mismatchVsRecorded)}`,
      )
    }

    // Stronger claim (where it holds): the legacy and plan/commit paths
    // produce equivalent buffers when given the same starting state. This
    // is the long-run parity claim — Phase 2 will tighten it once
    // renderers emit ops directly. In Phase 1 we record in plan-emission
    // order so this holds for the same scene/state pair.
    const mismatchVsLegacy = compareBuffers(replayed, legacyOut)
    if (mismatchVsLegacy) {
      throw new Error(
        `plan/commit path diverges from legacy renderer:\n${formatMismatch(mismatchVsLegacy)}`,
      )
    }
  })

  test("parity check is sensitive: mutating the plan breaks parity", () => {
    // Sensitivity / anti-parity guard. If we drop or corrupt one op in the
    // plan, the replay must DIVERGE from the recorded buffer. Without this
    // test, "compareBuffers returns null" might be a tautology where both
    // sides hit the same code path. This test proves the comparison has
    // real teeth: when we deliberately introduce a divergence, it fires.
    const cols = 5
    const rows = 5
    const mounted = mountScene(<Scene frame="a" />, cols, rows)
    const frame1 = renderPhase(mounted.root, null)

    reconciler.updateContainerSync(<Scene frame="b" />, mounted.fiberRoot, null, null)
    reconciler.flushSyncWork()
    runLayoutPhases(mounted.root, cols, rows)
    reconciler.flushSyncWork()
    runLayoutPhases(mounted.root, cols, rows)

    const wrappedPrev = wrapPrevBufferForRecording(frame1.clone())
    const recordedOut = renderPhase(mounted.root, wrappedPrev) as RecordingBuffer
    const plan = recordedOut.toPlan()

    // Drop every other op — guarantees divergence somewhere.
    const corruptedOps = plan.ops.filter((_, i) => i % 2 === 0)
    expect(corruptedOps.length).toBeLessThan(plan.ops.length)
    const corruptedPlan = { width: plan.width, height: plan.height, ops: corruptedOps }

    const replayed = frame1.clone()
    commitPlan(replayed, corruptedPlan)
    const mismatch = compareBuffers(replayed, recordedOut)
    expect(mismatch, "dropping ops must produce a buffer divergence — parity check is otherwise vacuous").not.toBeNull()
  })

  test("scrollbar-shrink-with-sibling-bg: both paths produce the SAME correct output", () => {
    // The exact bug shape from km-silvery.ai-chat-incremental-mismatch
    // that silvery 168b4989 fixed at runtime: an absolute-positioned
    // scrollbar shrinks while a normal-flow sibling gains backgroundColor
    // over the vacated cells. Before the fix, clearExcessArea stomped the
    // sibling's freshly-painted bg with the scrollbar's inherited bg
    // (null). After the fix, the hasPrevBuffer guard skips clearExcessArea
    // for the shrunken scrollbar's second-pass render.
    //
    // This test runs the legacy path AND the plan/commit path against the
    // exact frame transition that triggered the bug, and asserts that BOTH
    // produce the cell that the fresh render produces — i.e., the scrollbar
    // does NOT stomp the sibling row's bg under either path. This is the
    // claim that matters for shipping the substrate: the new path doesn't
    // re-introduce the bug the runtime guard fixed.
    const cols = 5
    const rows = 5

    const mountA = mountScene(<Scene frame="a" />, cols, rows)
    const frame1 = renderPhase(mountA.root, null)
    reconciler.updateContainerSync(<Scene frame="b" />, mountA.fiberRoot, null, null)
    reconciler.flushSyncWork()
    runLayoutPhases(mountA.root, cols, rows)
    reconciler.flushSyncWork()
    runLayoutPhases(mountA.root, cols, rows)

    // Legacy path: incremental render with frame1 as prev.
    const legacyOut = renderPhase(mountA.root, frame1.clone())

    // Plan/commit path: same scene, recorded prev wrapper, replay onto
    // a fresh clone of frame1.
    const mountB = mountScene(<Scene frame="a" />, cols, rows)
    renderPhase(mountB.root, null) // seed prev (epoch parity)
    reconciler.updateContainerSync(<Scene frame="b" />, mountB.fiberRoot, null, null)
    reconciler.flushSyncWork()
    runLayoutPhases(mountB.root, cols, rows)
    reconciler.flushSyncWork()
    runLayoutPhases(mountB.root, cols, rows)
    const wrappedPrev = wrapPrevBufferForRecording(frame1.clone())
    const recorded = renderPhase(mountB.root, wrappedPrev) as RecordingBuffer
    const replayed = frame1.clone()
    commitPlan(replayed, recorded.toPlan())

    // Fresh render is the oracle (no incremental pixels at all).
    const mountC = mountScene(<Scene frame="b" />, cols, rows)
    const freshOut = renderPhase(mountC.root, null)

    // The vacated scrollbar cell at (col=4, row=4) is the exact cell the
    // bug stomped. Under fresh render, its bg comes from the sibling
    // row4's backgroundColor="red". Under both incremental paths, the
    // scrollbar's clearExcessArea must NOT have stomped it.
    const freshCell = freshOut.getCell(4, 4)
    const legacyCell = legacyOut.getCell(4, 4)
    const replayedCell = replayed.getCell(4, 4)

    // sanity: fresh render at the bug-cell has the sibling's bg.
    // We don't assert the exact color (test framework theme normalization
    // varies), but assert legacy + plan/commit both match fresh.
    expect(legacyCell.bg).toEqual(freshCell.bg)
    expect(replayedCell.bg).toEqual(freshCell.bg)
    expect(legacyCell.char).toEqual(freshCell.char)
    expect(replayedCell.char).toEqual(freshCell.char)
  })

  test("type-level safety: @ts-expect-error documents what the type DOES and does NOT prevent", () => {
    // What the Phase 1 type DOES prevent (structural):
    //   - RenderPlan.ops is `readonly RenderOp[]` — TypeScript rejects
    //     in-place plan mutation by consumers.
    //   - clearExcessArea is unexported from render-phase.ts — consumers
    //     of the new path cannot import it. Pre-Phase-1, this was already
    //     true; the new path inherits the existing module boundary.
    //
    // What the Phase 1 type does NOT prevent (ceremonial gaps to close
    // in Phase 2/3 — documented here so we have a moving target):
    //   - Constructing arbitrary ops and feeding them to commitPlan.
    //     commitPlan applies ops in emission order; nothing in the type
    //     forces clears-before-paints. Phase 2 will tighten this by
    //     bucketing ops at type level (e.g. ClearOp[] + PaintOp[] + …).
    //   - Calling buffer.fill() / buffer.setCell() directly outside the
    //     plan/commit substrate. That's what the existing renderer does.
    //     The type doesn't (and can't, in Phase 1) prevent this — Phase 2
    //     will gate buffer mutation behind a private helper.
    const plan: RenderPlan = { width: 1, height: 1, ops: [] }

    // @ts-expect-error — readonly ops array rejects mutation.
    plan.ops.push({ kind: "fillBg", x: 0, y: 0, width: 1, height: 1, bg: null })

    // Compile-checked: clearExcessArea is not exported, so this import
    // fails to resolve. The // @ts-expect-error fires at the import site
    // when the directive is on the import line.
    // (Cannot @ts-expect-error a package import path easily; the
    // structural prevention is the missing export, not a type error.)

    // Demonstrates the Phase-1 ceremonial gap: a consumer CAN forge a
    // malformed plan because RenderOp is structurally typed. This compiles
    // — it should not, post-Phase-2.
    const malformedPlan: RenderPlan = {
      width: 1,
      height: 1,
      ops: [
        { kind: "setCell", x: 0, y: 0, cell: { char: "X" } },
        // Paint-then-clear: nothing in the type forbids this ordering.
        { kind: "fillBg", x: 0, y: 0, width: 1, height: 1, bg: null },
      ],
    }
    expect(malformedPlan.ops.length).toBe(2)
  })

  test("plan ops are non-empty and commit accepts the plan", () => {
    const cols = 10
    const rows = 4
    const { root } = mountScene(
      <Box flexDirection="column" backgroundColor="blue" width={cols} height={rows}>
        <Text>hello</Text>
        <Text>world</Text>
      </Box>,
      cols,
      rows,
    )

    const seed = new TerminalBuffer(cols, rows)
    // Seed with a non-default fill so we can prove commit overwrites it.
    seed.fill(0, 0, cols, rows, { char: "x", bg: null, fg: null })
    const wrapped = wrapPrevBufferForRecording(seed)
    const out = renderPhase(root, wrapped)
    expect(out).toBeInstanceOf(RecordingBuffer)
    const plan = (out as RecordingBuffer).toPlan()

    expect(plan.width).toBe(cols)
    expect(plan.height).toBe(rows)
    expect(plan.ops.length).toBeGreaterThan(0)

    const target = new TerminalBuffer(cols, rows)
    target.fill(0, 0, cols, rows, { char: "x", bg: null, fg: null })
    commitPlan(target, plan)

    const mismatch = compareBuffers(target, out)
    if (mismatch) {
      throw new Error(
        `commit replay diverges from recorded buffer:\n${formatMismatch(mismatch)}`,
      )
    }
  })
})
