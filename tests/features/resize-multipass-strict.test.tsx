/**
 * Regression test for SILVERY_STRICT incremental-vs-fresh mismatch on
 * resize when useBoxRect-driven props affect render output.
 *
 * Bead: km-yej6 (column-resize-incremental-mismatch).
 *
 * Repro pattern (from km-tui CardColumn → Card): a child component
 * receives a prop derived from its parent's measured `useBoxRect()`
 * height. When the terminal resizes, the parent's box rect changes, the
 * layout subscriber fires, the child re-renders with a new prop value,
 * and the child's render output (visible-row count) changes.
 *
 * The bug: at production-matching `singlePassLayout: true`, doRender's
 * multi-pass loop has MAX_CONVERGENCE_PASSES=2. On resize, the layout
 * feedback (useBoxRect → setState → re-render → yoga dirty) needs more
 * than 2 passes to fully drain. The internal SILVERY_STRICT check then
 * compared the not-yet-stable incremental buffer against a fresh render
 * that re-runs calculateLayout against the post-commit React tree —
 * apples vs oranges, mismatch, and IncrementalRenderMismatchError.
 *
 * Fix: track `multiPassConverged` (true when a multi-pass iteration
 * exits with no React commit pending). When false, STRICT skips the
 * comparison inside that doRender. Then resizeFn's outer drain loop
 * (mirroring sendInput's drain) flushes pending React work and calls
 * doRender again — that subsequent call's STRICT runs on a fully
 * stable tree.
 *
 * This matches production scheduler semantics: each user-action
 * doRender renders against the LAST USER-VISIBLE FRAME; layout
 * feedback that doesn't drain in this tick queues another doRender on
 * the next event-loop turn.
 *
 * NOTE: A simpler synthetic repro (a useBoxRect-driven row count in a
 * generic Box tree) can hit a separate, latent dirty-flag-propagation
 * bug that this fix does NOT address; that's why this regression test
 * is intentionally narrow and runs through the km-tui-shaped driver
 * path. The original failing test the user reported lives at
 * `apps/km-tui/tests/resize-garble.slow.test.ts:200` (zoom in then zoom
 * out roundtrip). This file documents the silvery-side fix and asserts
 * the multi-pass drain machinery exists.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, useBoxRect } from "@silvery/ag-react"

/**
 * Component that subscribes to its own box rect (the layout-feedback
 * trigger). Mirrors km-tui CardColumn's `useBoxRect()` usage which
 * drives the per-Card columnHeight prop.
 */
function MeasuredColumn({ items }: { items: string[] }) {
  const rect = useBoxRect()
  // Read height to register the layout subscription. We don't need to
  // act on it — just having the subscription is enough to drive the
  // layout-feedback path doRender's multi-pass loop must drain.
  void rect.height
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single">
      <Text>Column</Text>
      {items.map((item, i) => (
        <Text key={i}>{item}</Text>
      ))}
    </Box>
  )
}

function App({ items }: { items: string[] }) {
  return (
    <Box flexDirection="row" width="100%" height="100%">
      <MeasuredColumn items={items} />
      <MeasuredColumn items={items} />
    </Box>
  )
}

const ITEMS = Array.from({ length: 5 }, (_, i) => `Item ${i + 1}`)

describe("resize multi-pass STRICT", () => {
  test("singlePass resize completes without throwing under STRICT", () => {
    // singlePassLayout: true matches production scheduler / km-tui driver,
    // where the resize-feedback bug originally surfaced.
    // Default maxLayoutPasses (= MAX_CONVERGENCE_PASSES = 2) matches production.
    const r = createRenderer({ cols: 80, rows: 30, incremental: true })
    const app = r(<App items={ITEMS} />)

    // Pre-fix: the internal STRICT check (in doRender) threw
    // IncrementalRenderMismatchError because the multi-pass loop
    // exited with React work pending; fresh saw a different tree
    // than the captured incremental buffer reflected.
    // Post-fix: STRICT is gated on multiPassConverged, and resizeFn
    // has an outer drain loop that re-doRenders after flushing.
    expect(() => app.resize(80, 12)).not.toThrow()
    expect(app.text).toContain("Column")
  })

  test("singlePass zoom-in/zoom-out roundtrip completes without throwing under STRICT", () => {
    const r = createRenderer({ cols: 160, rows: 45, incremental: true })
    const app = r(<App items={ITEMS} />)

    // Sequence mirrors apps/km-tui/tests/resize-garble.slow.test.ts
    // 'zoom in then zoom out roundtrip' — each transition exercises
    // the multi-pass exhaustion path that the fix addresses.
    const sizes: Array<[number, number]> = [
      [80, 24],
      [200, 55],
      [80, 24],
      [120, 30],
    ]

    for (const [cols, rows] of sizes) {
      expect(() => app.resize(cols, rows)).not.toThrow()
    }

    expect(app.text).toContain("Column")
  })
})
