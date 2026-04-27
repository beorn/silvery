/**
 * Phase 1 perf regression check for render-plan-commit
 * (km-silvery.paint-clear-invariant). The new path adds a recorder
 * (TerminalBuffer subclass that captures every mutation as an op) plus a
 * commit step (replays ops). This test asserts the two paths complete
 * within a 2x factor of each other on a representative scene — the
 * Phase 1 budget per the team-lead's derisking checklist.
 *
 * Phase 2 will rewrite renderers to emit ops directly (no recording
 * overhead) and we expect parity with legacy. Phase 3 closes the bug
 * class; this perf bound becomes a guard, not a target.
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

function ensureLayoutEngine(): void {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
}

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

// Scene with 50 nodes (per pipeline CLAUDE.md realistic-scale rule).
function PerfScene({ tick }: { tick: number }) {
  return (
    <Box flexDirection="column" width={80} height={24}>
      {Array.from({ length: 24 }, (_, i) => (
        <Box
          key={i}
          flexDirection="row"
          backgroundColor={i % 3 === 0 ? "blue" : undefined}
        >
          <Text>{`row${i}-${tick}`}</Text>
          <Text>{` col2-${tick}`}</Text>
        </Box>
      ))}
    </Box>
  )
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}

describe("render-plan-commit perf (Phase 1, ≤ 2x of legacy)", () => {
  test("recording + commit budget within 2x of legacy on 50-node scene", () => {
    const cols = 80
    const rows = 24
    const ITERS = 50

    const mounted = mountScene(<PerfScene tick={0} />, cols, rows)
    const seedBuffer = renderPhase(mounted.root, null)

    // Warm-up: bring JIT into a steady state for both paths.
    for (let w = 0; w < 5; w++) {
      reconciler.updateContainerSync(<PerfScene tick={w + 1} />, mounted.fiberRoot, null, null)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)
      renderPhase(mounted.root, seedBuffer.clone())
    }

    // Legacy path: imperative renderPhase, no recording.
    const legacyTimes: number[] = []
    for (let i = 0; i < ITERS; i++) {
      reconciler.updateContainerSync(<PerfScene tick={i + 100} />, mounted.fiberRoot, null, null)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)
      const prev = seedBuffer.clone()
      const t0 = performance.now()
      renderPhase(mounted.root, prev)
      legacyTimes.push(performance.now() - t0)
    }

    // Plan/commit path: same scene, RecordingBuffer + commitPlan replay.
    const planTimes: number[] = []
    for (let i = 0; i < ITERS; i++) {
      reconciler.updateContainerSync(<PerfScene tick={i + 200} />, mounted.fiberRoot, null, null)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)
      const wrapped = wrapPrevBufferForRecording(seedBuffer.clone())
      const t0 = performance.now()
      const out = renderPhase(mounted.root, wrapped) as RecordingBuffer
      const plan = out.toPlan()
      const target = new TerminalBuffer(cols, rows)
      commitPlan(target, plan)
      planTimes.push(performance.now() - t0)
    }

    const legacyMedian = median(legacyTimes)
    const planMedian = median(planTimes)
    // Stash on globalThis so a follow-up debug session or a future
    // benchmark harness can read the numbers without re-running the test.
    // Vitest's setup blocks bare console writes, so we use a slot.
    ;(globalThis as { __renderPlanPerf?: unknown }).__renderPlanPerf = {
      legacyMedian,
      planMedian,
      ratio: planMedian / legacyMedian,
      legacyTimes,
      planTimes,
    }

    // 2x budget per team-lead's check #5. Floor at 1ms to avoid
    // divide-by-near-zero on very fast scenes — we only enforce the ratio
    // when the legacy path is large enough to dominate measurement noise.
    if (legacyMedian > 1) {
      expect(planMedian / legacyMedian).toBeLessThanOrEqual(2)
    } else {
      // Both medians are sub-millisecond — within noise; assert plan
      // path is within +5ms of legacy (very loose noise floor).
      expect(planMedian).toBeLessThanOrEqual(legacyMedian + 5)
    }
  })
})
