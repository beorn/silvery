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
