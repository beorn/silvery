/**
 * Cross-render residue — one renderer's frame must not clear another's
 * pending dirty bits.
 *
 * Bead: @km/silvery/render-no-stale-residue-invariant (P1).
 *
 * Dirty flags are epoch stamps: the reconciler writes `node.dirtyEpoch`, and
 * `isDirty()` reports true only while that stamp equals its tree's current
 * epoch, which `renderPhase` advances at the end of every frame. While that
 * epoch was a process-global counter, ANY renderer completing a frame
 * invalidated EVERY other renderer's pending stamps.
 *
 * The window is real because React's commit and the pipeline are separate
 * steps: `updateContainerSync` + `flushSyncWork` stamp the dirty bits, and
 * `doRender()` consumes them afterwards. A layout effect that drives a second
 * surface lands between the two — the shape of any multi-pane app, `yrd watch`
 * included. The victim's changed nodes read clean, the fast path skipped them,
 * and the cloned previous pixels survived as on-screen residue.
 *
 * The epoch now lives on a per-tree `EpochOwner` (packages/ag/src/epoch.ts).
 * These tests pin that: the single-renderer control passed even while the bug
 * was live, so only the peer-driven subject discriminates.
 */
import React, { useLayoutEffect } from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import {
  CONTENT_BIT,
  advanceRenderEpoch,
  createEpochOwner,
  isDirty,
  markDirty,
} from "@silvery/ag/epoch"

function withStrictEnv<T>(value: string, fn: () => T): T {
  const saved = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = value
  resetStrictCache()
  try {
    return fn()
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
}

beforeEach(() => resetStrictCache())
afterEach(() => resetStrictCache())

// Realistic scale (pipeline/CLAUDE.md: 50+ nodes, never a toy fixture).
// A highlight walks the list — the cascade shape that produced the original
// cyan-strip residue. Row text runs to the right edge so a skipped repaint
// leaves its evidence in the rightmost columns.
const ROW_COUNT = 60

function Rows({ cursor, cols }: { cursor: number; cols: number }) {
  return (
    <Box width={cols} flexDirection="column">
      {Array.from({ length: ROW_COUNT }, (_, i) => (
        <Box key={i} flexDirection="row" backgroundColor={i === cursor ? "$fg-accent" : undefined}>
          <Text color={i === cursor ? "$fg-on-inverse" : "$fg"}>
            {`row ${i} `.padEnd(cols - 4, i === cursor ? "#" : ".")}
          </Text>
          <Text color="$fg-muted">{i === cursor ? "<<<<" : "    "}</Text>
        </Box>
      ))}
    </Box>
  )
}

/**
 * Renders `Rows`, and runs `duringCommit` from a layout effect — i.e. after
 * React has stamped this tree's dirty bits but before the pipeline reads
 * them. Models a pane that drives a second surface.
 */
function RowsDrivingPeer({
  cursor,
  cols,
  duringCommit,
}: {
  cursor: number
  cols: number
  duringCommit: () => void
}) {
  useLayoutEffect(() => {
    duringCommit()
  })
  return <Rows cursor={cursor} cols={cols} />
}

describe("residue: cross-render pipeline state", () => {
  test("a peer tree's epoch advance leaves this tree's dirty bits standing", () => {
    // Two trees, each with its own epoch state, as the reconciler mints them.
    const ours = { epochOwner: createEpochOwner(), dirtyBits: 0, dirtyEpoch: -1 }
    const peer = { epochOwner: createEpochOwner(), dirtyBits: 0, dirtyEpoch: -1 }

    // Stamp our node dirty the way the reconciler does on a React commit.
    markDirty(ours, CONTENT_BIT)
    expect(isDirty(ours, CONTENT_BIT)).toBe(true)

    // The peer renders a frame. Nothing about OUR node changed — its content
    // is still pending a repaint — so it must still read dirty. When the epoch
    // was a process-global this returned false, our render phase fast-path
    // skipped the node, and the previous frame's pixels stayed on screen.
    advanceRenderEpoch(peer)
    expect(isDirty(ours, CONTENT_BIT)).toBe(true)

    // Our own frame is what consumes it.
    advanceRenderEpoch(ours)
    expect(isDirty(ours, CONTENT_BIT)).toBe(false)
  })

  test("control: ONE renderer walking the cursor is residue-clean", () => {
    withStrictEnv("residue,2", () => {
      const renderA = createRenderer({ cols: 80, rows: 24 })
      const app = renderA(<Rows cursor={0} cols={80} />)
      for (let frame = 1; frame <= 6; frame++) {
        app.rerender(<Rows cursor={frame} cols={80} />)
      }
      expect(app.text).toContain("row 6")
      app.unmount()
    })
  })

  test("subject: a peer renderer's frame must not clear this renderer's dirty bits", () => {
    withStrictEnv("residue,2", () => {
      const renderA = createRenderer({ cols: 80, rows: 24 })
      const renderB = createRenderer({ cols: 100, rows: 24 })

      // B is a live second surface with its own frame history.
      const appB = renderB(<Rows cursor={0} cols={100} />)
      let peerFrame = 0
      const renderPeer = () => {
        peerFrame++
        appB.rerender(<Rows cursor={peerFrame} cols={100} />)
      }

      // A never sees the peer directly — the peer renders from A's layout
      // effect, inside A's commit→pipeline window.
      const appA = renderA(<RowsDrivingPeer cursor={0} cols={80} duringCommit={() => {}} />)
      for (let frame = 1; frame <= 6; frame++) {
        appA.rerender(<RowsDrivingPeer cursor={frame} cols={80} duringCommit={renderPeer} />)
      }

      expect(appA.text).toContain("row 6")
      appA.unmount()
      appB.unmount()
    })
  })
})
