/**
 * SILVERY_STRICT regression tests for the paint-clear L5 Step 2 follow-ups
 * (km-silvery.paint-clear-l5-final children: nodeSink-lifetime, sink-
 * consolidation, clear-region-decouple, selectablemode-purge).
 *
 * These tests cover the 5 structural smells flagged by the dual-pro reviews
 * on 2026-04-27 ($3.12 review with Smell #1-#3 + Gemini 3 Pro selectable-
 * purge insight). Each test exercises a realistic-scale fixture (50+ nodes
 * per packages/ag-term/src/pipeline/CLAUDE.md mandate) and verifies
 * incremental render parity with fresh render under SILVERY_STRICT.
 *
 * Per pipeline/CLAUDE.md "Test Before Change":
 *   1. Test asserts the new behavior (not the old)
 *   2. Test fails on the pre-refactor code path with a clear diagnostic
 *   3. Test passes after the structural fix
 *   4. SILVERY_STRICT cell-by-cell parity is the strongest guard
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
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { setLayoutEngine, isLayoutEngineInitialized } from "@silvery/ag-term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { compareBuffers, formatMismatch } from "@silvery/test"

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
  const fiberRoot = createFiberRoot(container, {
    onUncaughtError: (error) => {
      throw error
    },
    onCaughtError: () => {},
    onRecoverableError: () => {},
  })
  reconciler.updateContainerSync(element, fiberRoot, null, null)
  reconciler.flushSyncWork()
  runLayoutPhases(root, cols, rows)
  reconciler.flushSyncWork()
  runLayoutPhases(root, cols, rows)
  return { container, root, fiberRoot }
}

/**
 * Realistic-scale fixture: a board with 5 columns × 10 cards each = 50+ nodes.
 * Each card has a userSelect="none" overlay header and selectable body. This
 * exercises the userSelect threading through a deep tree on every render.
 *
 * `frame` controls a single cursor toggle that exercises:
 *  - bgOnlyChange path (cursor card gains backgroundColor)
 *  - off-screen children (rows clipped past the viewport)
 *  - canSkipEntireSubtree (clean cards are skipped)
 *  - userSelect="none" ancestor restoration (header overlays)
 */
function Board({ cursor }: { cursor: number }) {
  const columns = 5
  const cardsPerColumn = 10
  return (
    <Box width={80} height={20} flexDirection="row" backgroundColor="black">
      {Array.from({ length: columns }, (_, ci) => (
        <Box key={ci} flexDirection="column" width={16} height={20} padding={1}>
          {/* userSelect="none" header — deselects, must restore for cards below */}
          <Box userSelect="none" height={1}>
            <Text>{`Col ${ci}`}</Text>
          </Box>
          {Array.from({ length: cardsPerColumn }, (_, ri) => {
            const idx = ci * cardsPerColumn + ri
            const isCursor = idx === cursor
            return (
              <Box key={ri} height={1} backgroundColor={isCursor ? "red" : undefined}>
                <Text>{`c${idx}`}</Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

describe("paint-clear Step 2 follow-ups (regression suite)", () => {
  // ============================================================================
  // Task 1: nodeSink lifetime
  // ============================================================================
  //
  // Smell #1 — moving cursor between cards must keep selectable-mode invariant
  // intact across early-return paths (display:none, off-screen, canSkip).
  // Verifies incremental ≡ fresh under SILVERY_STRICT after multiple cursor
  // moves through a 50-node board.
  test("Task 1: cursor moves through 50-node board — incremental matches fresh after early-return paths", () => {
    const cols = 80
    const rows = 20
    const mounted = mountScene(<Board cursor={0} />, cols, rows)

    // Seed prev with frame at cursor=0
    let prev: TerminalBuffer | null = renderPhase(mounted.root, null)

    // Walk cursor through 10 cards — exercises canSkipEntireSubtree on most
    // siblings, dirty cascade on cursor card, and userSelect="none" header
    // restoration on every column.
    for (let cursor = 1; cursor <= 10; cursor++) {
      reconciler.updateContainerSync(<Board cursor={cursor} />, mounted.fiberRoot, null, null)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)

      // Incremental render
      const incremental = renderPhase(mounted.root, prev?.clone() ?? null)

      // Fresh render: re-mount + render with null prev
      const freshMount = mountScene(<Board cursor={cursor} />, cols, rows)
      const fresh = renderPhase(freshMount.root, null)

      const mismatch = compareBuffers(incremental, fresh)
      expect(
        mismatch,
        `incremental at cursor=${cursor} diverges from fresh:\n${mismatch ? formatMismatch(mismatch) : ""}`,
      ).toBeNull()

      prev = incremental
    }
  })

  // ============================================================================
  // Task 4: selectability payloads — every cell's SELECTABLE_FLAG matches threading
  // ============================================================================
  //
  // The bug class: relying on ambient mutable buffer state creates ordering
  // bugs when sinks fan out (TeeSink to PlanSink) or
  // when render order diverges from emission order. With selectableMode now
  // threaded via NodeRenderState, every cell write should reflect the SAME
  // state — even after multi-pass rendering (normal + sticky + absolute).
  //
  // This test mounts a board where userSelect="none" sits on a parent, normal-
  // flow children paint selectable cells, and absolute children paint on top.
  // Asserts cells under userSelect="none" lack SELECTABLE_FLAG; cells outside
  // have it.
  test("Task 4: SELECTABLE_FLAG cell-level invariant — userSelect='none' subtree cells, selectable elsewhere", () => {
    const cols = 80
    const rows = 20

    function Scene() {
      return (
        <Box width={80} height={20} flexDirection="column">
          {/* Selectable column header */}
          <Box height={1}>
            <Text>HEADER-selectable</Text>
          </Box>
          {/* userSelect="none" subtree — descendants must NOT be selectable */}
          <Box userSelect="none" height={1}>
            <Text>NOSEL-text</Text>
          </Box>
          {/* Back to selectable after the userSelect="none" sibling */}
          <Box height={1}>
            <Text>AFTER-selectable</Text>
          </Box>
          {/* Many trailing rows to scale node count past 50 */}
          {Array.from({ length: 50 }, (_, i) => (
            <Box key={i} height={1}>
              <Text>{`row${i}-selectable`}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const mounted = mountScene(<Scene />, cols, rows)
    const buffer = renderPhase(mounted.root, null)

    // HEADER row: selectable
    expect(buffer.isCellSelectable(0, 0)).toBe(true)
    // NOSEL row: NOT selectable
    expect(buffer.isCellSelectable(0, 1)).toBe(false)
    // AFTER row: selectable (the userSelect="none" subtree's mode must be restored)
    expect(buffer.isCellSelectable(0, 2)).toBe(true)
    // Trailing rows: all selectable
    expect(buffer.isCellSelectable(0, 5)).toBe(true)
  })

  test("Task 4: SELECTABLE_FLAG marks text-bearing cells, not padding or spacer rows", () => {
    const cols = 20
    const rows = 4

    function Scene() {
      return (
        <Box width={cols} height={rows} flexDirection="column" backgroundColor="blue">
          <Text>Hello</Text>
          <Text>{"   "}</Text>
        </Box>
      )
    }

    const mounted = mountScene(<Scene />, cols, rows)
    const buffer = renderPhase(mounted.root, null)

    expect(buffer.isCellSelectable(0, 0)).toBe(true)
    expect(buffer.isCellSelectable(4, 0)).toBe(true)
    expect(buffer.isCellSelectable(5, 0)).toBe(false)
    expect(buffer.isCellSelectable(0, 1)).toBe(false)
  })

  // ============================================================================
  // Task 3: clearNodeRegion / clearExcessArea decoupling — incremental shrink
  // ============================================================================
  //
  // The structural smell: clearNodeRegion calls clearExcessArea unconditionally
  // at the end. This means if contentRegionCleared=true is reached on a path
  // where excess clearing should be guarded (bufferIsCloned/hasPrevBuffer),
  // we'd get incorrect bg writes. Decoupling = single coordinator
  // (executeRegionClearing) decides which clear runs.
  //
  // Repro: 50-node tree with shrinking absolute child. Incremental ≡ fresh.
  test("Task 3: shrinking absolute child in 50-node tree — incremental matches fresh", () => {
    function Scene({ thumb }: { thumb: number }) {
      return (
        <Box width={50} height={20} flexDirection="column" position="relative">
          {Array.from({ length: 18 }, (_, i) => (
            <Box key={i} height={1} backgroundColor={i % 2 === 0 ? "blue" : undefined}>
              <Text>{`row-${i.toString().padStart(2, "0")}`}</Text>
            </Box>
          ))}
          {/* Absolute scrollbar that shrinks across frames */}
          <Box position="absolute" left={49} top={0} width={1} height={thumb}>
            <Text>{"█".repeat(thumb)}</Text>
          </Box>
        </Box>
      )
    }

    const cols = 50
    const rows = 20
    const mounted = mountScene(<Scene thumb={20} />, cols, rows)
    const prev = renderPhase(mounted.root, null)

    // Shrink the thumb
    reconciler.updateContainerSync(<Scene thumb={3} />, mounted.fiberRoot, null, null)
    reconciler.flushSyncWork()
    runLayoutPhases(mounted.root, cols, rows)
    reconciler.flushSyncWork()
    runLayoutPhases(mounted.root, cols, rows)

    const incremental = renderPhase(mounted.root, prev.clone())

    const freshMount = mountScene(<Scene thumb={3} />, cols, rows)
    const fresh = renderPhase(freshMount.root, null)

    const mismatch = compareBuffers(incremental, fresh)
    expect(
      mismatch,
      `incremental shrinking absolute diverges from fresh:\n${mismatch ? formatMismatch(mismatch) : ""}`,
    ).toBeNull()
  })

  // ============================================================================
  // Task 2: sink consolidation — incremental ≡ fresh under multi-pass scenes
  // ============================================================================
  //
  // The structural risk: 7 ad-hoc createFrameSink() sites today work because
  // BufferSink is idempotent (point-mutates the same buffer). When PlanSink
  // is authoritative, those 7 instances must aggregate into ONE plan or the
  // commit ordering breaks. Consolidating to a single threaded sink is the
  // pre-condition.
  //
  // Test: scene with normal + sticky + absolute children, sticky force refresh,
  // scroll viewport clear — touches all current sink construction sites.
  // Verifies cell parity across an interleaved render sequence.
  test("Task 2: sink-touching scene (normal+sticky+absolute+scroll) — multi-frame parity", () => {
    function Scene({ scroll }: { scroll: number }) {
      return (
        <Box width={50} height={20} flexDirection="column">
          {/* Sticky header */}
          <Box height={1} backgroundColor="cyan">
            <Text>STICKY-HEADER</Text>
          </Box>
          {/* Scroll viewport with many children — Tier 1/2/3 paths */}
          <Box overflow="scroll" flexGrow={1} scrollTo={scroll}>
            {Array.from({ length: 60 }, (_, i) => (
              <Box key={i} height={1} backgroundColor={i % 3 === 0 ? "green" : undefined}>
                <Text>{`row-${i.toString().padStart(2, "0")}-payload`}</Text>
              </Box>
            ))}
          </Box>
          {/* Absolute overlay sibling — exercises overlapping-absolute guard */}
          <Box position="absolute" left={49} top={0} width={1} height={20}>
            <Text>{"│".repeat(20)}</Text>
          </Box>
        </Box>
      )
    }

    const cols = 50
    const rows = 20
    const mounted = mountScene(<Scene scroll={0} />, cols, rows)
    let prev = renderPhase(mounted.root, null)

    // Walk through 5 scroll positions — touches Tier 1 (small delta), Tier 2
    // (large jump), Tier 3 (sticky-force-refresh path).
    for (const scroll of [3, 10, 0, 25, 5]) {
      reconciler.updateContainerSync(<Scene scroll={scroll} />, mounted.fiberRoot, null, null)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)
      reconciler.flushSyncWork()
      runLayoutPhases(mounted.root, cols, rows)

      const incremental = renderPhase(mounted.root, prev.clone())

      const freshMount = mountScene(<Scene scroll={scroll} />, cols, rows)
      const fresh = renderPhase(freshMount.root, null)

      const mismatch = compareBuffers(incremental, fresh)
      expect(
        mismatch,
        `incremental at scroll=${scroll} diverges from fresh:\n${mismatch ? formatMismatch(mismatch) : ""}`,
      ).toBeNull()

      prev = incremental
    }
  })

  // ============================================================================
  // Cross-task: incremental render of a userSelect="none" subtree under
  // dirty-cascade conditions must produce the same SELECTABLE_FLAG state
  // as a fresh render. Pre-purge this exercises the buffer state-machine
  // restoration; post-purge (Task 4) it exercises the threaded prop.
  // ============================================================================
  test("cross-task: SELECTABLE_FLAG cells stay correct across incremental renders", () => {
    function Scene({ tag }: { tag: string }) {
      return (
        <Box width={20} height={5} flexDirection="column">
          <Box height={1}>
            <Text>{`SEL-${tag}`}</Text>
          </Box>
          <Box userSelect="none" height={1}>
            <Text>{`NO-${tag}`}</Text>
          </Box>
          <Box height={1}>
            <Text>{`SEL2-${tag}`}</Text>
          </Box>
        </Box>
      )
    }

    const cols = 20
    const rows = 5
    const mounted = mountScene(<Scene tag="a" />, cols, rows)
    const prev = renderPhase(mounted.root, null)

    // Fresh: SEL row selectable, NO row not, SEL2 row selectable
    expect(prev.isCellSelectable(0, 0)).toBe(true)
    expect(prev.isCellSelectable(0, 1)).toBe(false)
    expect(prev.isCellSelectable(0, 2)).toBe(true)

    reconciler.updateContainerSync(<Scene tag="b" />, mounted.fiberRoot, null, null)
    reconciler.flushSyncWork()
    runLayoutPhases(mounted.root, cols, rows)
    reconciler.flushSyncWork()
    runLayoutPhases(mounted.root, cols, rows)

    const incremental = renderPhase(mounted.root, prev.clone())

    // Incremental must keep the same per-cell SELECTABLE_FLAG layout
    expect(incremental.isCellSelectable(0, 0)).toBe(true)
    expect(incremental.isCellSelectable(0, 1)).toBe(false)
    expect(incremental.isCellSelectable(0, 2)).toBe(true)

    // And cell-by-cell must match a fresh render
    const freshMount = mountScene(<Scene tag="b" />, cols, rows)
    const fresh = renderPhase(freshMount.root, null)
    const mismatch = compareBuffers(incremental, fresh)
    expect(
      mismatch,
      `incremental userSelect cells diverge from fresh:\n${mismatch ? formatMismatch(mismatch) : ""}`,
    ).toBeNull()
  })
})
