/**
 * Regression: a descendant that overflows a transparent (bg-less) flex
 * container must NOT have its overflow cleared over a sibling's painted
 * background that lies outside the container's colored-ancestor context.
 *
 * `clearDescendantOverflowRegions` (render-phase.ts) erases the region where a
 * descendant's prevLayout extended beyond the clearing node's rect, filling it
 * with the node's inherited bg (`clearBg`). That inherited bg is the correct
 * fresh background ONLY inside the colored ancestor that provides it — exactly
 * the invariant `clearNodeRegion` already enforces by clipping its own fill to
 * `inherited.ancestorRect`. The overflow clear had no such clamp, so when the
 * clearing node is bg-less (`ancestorRect == null` ⇒ `clearBg == null`) its
 * left/right overflow clear could paint `null` past its own edge, OVER the bg a
 * sibling owns — and the sibling (clean, or painted earlier) never restores it.
 *
 * Production signature (@si/render/20598, hab-deck pane rebalance): the fleet
 * navbar is a `<Box backgroundColor>` sibling to a transparent, flexGrow pane
 * region. During a Ctrl+G Ctrl+L rebalance a pane transiently overflows past the
 * region's edge, so on the next pass its prevLayout overflows toward the navbar;
 * the region's overflow clear nulled the navbar's bg column (STRICT `MISMATCH at
 * (23,9): incremental bg=null vs fresh bg=<surface>` on the session-roster rows).
 *
 * Fixture (realistic scale, 50+ nodes): a transparent flexGrow region (child 0)
 * whose inner pane — a `flexShrink=0` child whose width toggles, the proven
 * overflow trigger from descendant-overflow-border-clear.test.tsx — overflows
 * RIGHT into a bg RAIL sibling (child 1). The rail owns those columns; when the
 * pane retreats, the region's overflow clear runs over the rail's columns. STRICT
 * (enabled by createRenderer) auto-verifies incremental ≡ fresh on every
 * rerender; the mismatch throws before the assertions if the rail bg is clobbered.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

const COLS = 60
const ROWS = 40
const RAIL_W = 20

// Bg-filled rail — mirrors the hab-deck fleet navbar (`<Box backgroundColor>`
// wrapping a roster). As the LATER sibling it paints last, so its bg is the
// authoritative content in the cloned buffer that the region's overflow clear
// must not stomp.
function Rail({ tick }: { tick: number }): React.ReactElement {
  return (
    <Box width={RAIL_W} flexShrink={0} flexDirection="column" backgroundColor="blue">
      {Array.from({ length: 30 }, (_, i) => (
        <Box key={i} flexDirection="row">
          <Text wrap="truncate">{` row ${i} t${tick}`}</Text>
        </Box>
      ))}
    </Box>
  )
}

// Transparent, flexGrow region (child 0, laid out on the LEFT). Its inner pane
// is a `flexShrink=0` child whose width toggles; when `wide` its right edge
// (prevRight) crosses the region boundary into the rail's columns, when narrow
// the region detects the retreat and clears the vacated rail columns.
const REGION_W = COLS - RAIL_W // 40 — pinned so the pane's overflow is detected

// Transparent, pinned region (child 1, laid out on the RIGHT at cols 20..59). A
// negative `shift` pushes its inner pane's left edge past the region boundary
// into the rail's columns (an EARLIER sibling that already painted its bg); when
// shift returns to 0 the pane's prevLayout still overflows left, so the region
// runs its overflow clear over the rail's columns. The rail is an EARLIER
// sibling, so the sibling-overlap force-repaint (which only rescues LATER
// siblings) does NOT cover it — the clear must not stomp it.
//
// Each pane row is a transparent Box whose text is kept RIGHT of the overflow
// zone (a fixed left spacer), so the columns that overflow into the rail paint
// NOTHING — the rail's bg shows through them, exactly as the real deck pane's
// transparent chrome let the navbar bg show. The clone therefore holds the
// rail's bg in those columns, and the region's overflow clear is the only op
// that touches them.
function Region({ shift }: { shift: number }): React.ReactElement {
  return (
    <Box width={REGION_W} flexShrink={0} flexDirection="column">
      <Box marginLeft={shift} width={34} flexShrink={0} flexDirection="column">
        {Array.from({ length: 25 }, (_, i) => (
          <Box key={i} flexDirection="row" overflow="hidden">
            {/* transparent spacer covering the overflow zone */}
            <Box width={18} flexShrink={0} />
            <Text wrap="truncate">{`pane ${i}`}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function App({ tick, shift }: { tick: number; shift: number }): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="row">
      {/* Rail (bg) FIRST — paints its columns, laid out on the left (cols
          0..19). `tick` re-dirties it each frame so it repaints its bg (as the
          navbar does when it is in the cascade); the region's later overflow
          clear then runs over the rail's freshly-painted columns. Region
          (transparent, bg-less clearing node) SECOND, laid out on the right
          (cols 20..59); its pane overflows LEFT into the rail. */}
      <Rail tick={tick} />
      <Region shift={shift} />
    </Box>
  )
}

describe("regression: descendant overflow clear must not stomp a sibling's bg (@si/render/20598)", () => {
  test("pane overflowing into the rail keeps the rail bg (STRICT incremental ≡ fresh)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    // Frame 0: pane overflows LEFT into the rail (establishes prevLayout with
    // the pane box reaching over the rail columns).
    const app = render(<App tick={0} shift={-16} />)
    expect(app.text).toContain("row 0 t0")

    // Frame 1: pane retreats to the region edge. Its prevLayout still starts
    // left of the region, so the transparent region runs its left-overflow clear
    // over the rail columns. The rail repaints its bg (tick changed) FIRST, then
    // the region's clear runs: without the clamp, incremental nulls that bg while
    // fresh keeps it → STRICT mismatch thrown inside rerender.
    app.rerender(<App tick={1} shift={0} />)

    // Final defense: the rail rows survive and STRICT stayed green.
    expect(app.text).toContain("row 0 t1")
  })

  test("fresh and incremental renders agree after the overflow sequence", () => {
    const r1 = createRenderer({ cols: COLS, rows: ROWS })
    const r2 = createRenderer({ cols: COLS, rows: ROWS })

    const incremental = r1(<App tick={0} shift={-16} />)
    incremental.rerender(<App tick={1} shift={0} />)

    const fresh = r2(<App tick={1} shift={0} />)

    expect(incremental.text).toBe(fresh.text)
  })
})

// A filled tab extends below its one-row header into the following transparent
// output branch. Unlike the transparent-box cases above, this branch paints
// text over the tab and must erase its retiring glyphs when the text shrinks.
// The output wrappers stay wide, so the text's old rect is inside its ancestors.
// The 27 status rows make this a real 50+ node pane rather than a tiny-tree case.
function StagePane({ output }: { output: string }): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor="#000000">
      <Box height={1} flexShrink={0}>
        <Box width={20} height={5} flexShrink={0} backgroundColor="#0000ff" />
      </Box>
      <Box width={COLS} height={8} flexShrink={0} flexDirection="column">
        <Box width={COLS} flexDirection="column">
          <Box width={COLS} alignItems="flex-start">
            <Text>{output}</Text>
          </Box>
        </Box>
      </Box>
      {Array.from({ length: 27 }, (_, i) => (
        <Box key={i} height={1} flexShrink={0}>
          <Text>{`status ${i}`}</Text>
        </Box>
      ))}
    </Box>
  )
}

/**
 * @failure Shrinking output replaces an earlier filled tab's background with the pane background.
 * @level l2
 * @consumer Yrd stage-output pane; public Box/Text users with visible sibling overflow.
 */
describe("regression: text cleanup reveals an earlier sibling's bg (@i/10-yrd/26485)", () => {
  test("shrinking text reveals the earlier filled tab background", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<StagePane output="AAAAAAAAAAAAAAAAAAA" />)

    try {
      expect(app.term.buffer.getCell(16, 1).char).toBe("A")

      app.rerender(<StagePane output="AAAAAAAAAAAAAAAA" />)

      const revealed = app.term.buffer.getCell(16, 1)
      expect(revealed.char).toBe(" ")
      expect(revealed.bg).toEqual({ r: 0, g: 0, b: 255 })
    } finally {
      app.unmount()
    }
  })
})
