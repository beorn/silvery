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
import { compareBuffers, createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { Viewport } from "@silvery/ag-react"
import type { ForeignSource, ViewportContext } from "@silvery/ag/viewport-types"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"

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
function StagePane({
  output,
  scrolled = false,
  stickyTab = false,
  borderOnly = false,
  boxEmitter = false,
  outsideOpaque = false,
}: {
  output: string
  scrolled?: boolean
  stickyTab?: boolean
  borderOnly?: boolean
  boxEmitter?: boolean
  outsideOpaque?: boolean
}): React.ReactElement<React.ComponentProps<typeof Box>> {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor="#000000">
      <Box height={1} flexShrink={0}>
        {stickyTab ? (
          <Box
            width={20}
            height={5}
            flexShrink={0}
            overflow="scroll"
            scrollOffset={8}
            flexDirection="column"
          >
            <Box height={6} flexShrink={0} />
            <Box width={20} height={2} flexShrink={0} position="sticky" backgroundColor="#0000ff" />
            <Box height={10} flexShrink={0} />
          </Box>
        ) : (
          <Box
            width={20}
            height={scrolled ? 2 : 5}
            flexShrink={0}
            backgroundColor={borderOnly ? undefined : "#0000ff"}
            borderStyle={borderOnly ? "single" : undefined}
          />
        )}
      </Box>
      <Box
        width={outsideOpaque ? 12 : COLS}
        backgroundColor={outsideOpaque ? "#000000" : undefined}
        height={8}
        flexShrink={0}
        flexDirection="column"
        overflow={scrolled ? "scroll" : undefined}
        scrollOffset={scrolled ? 1 : undefined}
      >
        <Box width={COLS} height={scrolled ? 10 : undefined} flexShrink={0} flexDirection="column">
          {scrolled && <Box height={1} flexShrink={0} />}
          <Box
            width={boxEmitter ? output.length : COLS}
            height={boxEmitter ? 1 : undefined}
            alignItems="flex-start"
          >
            {!boxEmitter && <Text>{output}</Text>}
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

  test("scrolled text retreat reveals an earlier sibling outside its viewport", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    // Text has content y=2 but rendered y=1. The earlier tab ends at y=2,
    // so unscrolled rect intersection misses the revealed background.
    const app = render(<StagePane output="AAAAAAAAAAAAAAAAAAA" scrolled />)
    try {
      expect(app.term.buffer.getCell(16, 1).char).toBe("A")
      app.rerender(<StagePane output="AAAAAAAAAAAAAAAA" scrolled />)
      const revealed = app.term.buffer.getCell(16, 1)
      expect(revealed.char).toBe(" ")
      expect(revealed.bg).toEqual({ r: 0, g: 0, b: 255 })
    } finally {
      app.unmount()
    }
  })

  // Requirement: a transparent scroll wrapper's opaque sticky child owns its
  // actual pinned rows, even when stored screen geometry lies above the clip.
  test("text retreat reveals the pinned background inside an earlier transparent scroll wrapper", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<StagePane output="AAAAAAAAAAAAAAAAAAA" stickyTab />)
    try {
      expect(app.term.buffer.getCell(16, 1).char).toBe("A")
      app.rerender(<StagePane output="AAAAAAAAAAAAAAAA" stickyTab />)
      expect(app.term.buffer.getCell(16, 1).char).toBe(" ")
      expect(app.term.buffer.getCell(16, 1).bg).toEqual({ r: 0, g: 0, b: 255 })
    } finally {
      app.unmount()
    }
  })

  // Requirement: borders are own paint without an explicit background.
  test("text retreat reveals an earlier border-only box", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<StagePane output="AAAAAAAAAAAAAAAAAAAAA" borderOnly />)
    try {
      expect(app.term.buffer.getCell(19, 1).char).toBe("A")
      app.rerender(<StagePane output="AAAAAAAAAAAAAAAA" borderOnly />)
      expect(app.term.buffer.getCell(19, 1).char).toBe("│")
    } finally {
      app.unmount()
    }
  })

  // Requirement: a transparent box's excess cleanup must preserve earlier
  // paint too; no changing text exists inside this shrinking emitter.
  test("shrinking transparent box reveals the earlier filled tab background", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<StagePane output="AAAAAAAAAAAAAAAAAAA" boxEmitter />)
    try {
      expect(app.term.buffer.getCell(16, 1).bg).toEqual({ r: 0, g: 0, b: 255 })
      app.rerender(<StagePane output="AAAAAAAAAAAAAAAA" boxEmitter />)
      expect(app.term.buffer.getCell(16, 1).bg).toEqual({ r: 0, g: 0, b: 255 })
    } finally {
      app.unmount()
    }
  })

  // Residual: without an opaque common ancestor, text cleanup still overwrites
  // earlier sibling paint. Keep STRICT's alarm until that recovery is supported.
  test.fails("text retreat without an opaque common ancestor still loses the earlier background", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const scene = (output: string) =>
      React.cloneElement(StagePane({ output }), { backgroundColor: undefined })
    const app = render(scene("AAAAAAAAAAAAAAAAAAA"))

    try {
      expect(app.term.buffer.getCell(16, 1).char).toBe("A")
      app.rerender(scene("AAAAAAAAAAAAAAAA"))
      expect(app.term.buffer.getCell(16, 1).bg).toEqual({ r: 0, g: 0, b: 255 })
    } finally {
      app.unmount()
    }
  })

  // Requirement/residual: old glyphs outside the nearest opaque ancestor are
  // not recovered by this slice. Preserve STRICT's alarm rather than widening.
  test.fails("text retreat outside its opaque ancestor still leaves overflow residue (@i/10-yrd/26485)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<StagePane output="AAAAAAAAAAAAAAAAAAA" outsideOpaque />)
    try {
      expect(app.term.buffer.getCell(16, 1).char).toBe("A")
      app.rerender(<StagePane output="AAAAAAAAAAAAAAAA" outsideOpaque />)
      expect(app.term.buffer.getCell(16, 1).char).toBe(" ")
      expect(app.term.buffer.getCell(16, 1).bg).toEqual({ r: 0, g: 0, b: 255 })
    } finally {
      app.unmount()
    }
  })
})

// A guest frame repaints inside a scroll container shorter than its Viewport.
// The blit is clipped to the scroll viewport like every other paint, so the
// rows below it stay the clean later sibling's, which may stay on the fast
// path. Before #26811 the blit painted those rows too, and the forward-overlap
// pass had to count them or the sibling was skipped under the guest's cells.
function BlitPane({ source }: { source: ForeignSource }): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor="#000000">
      <Box height={3} flexShrink={0} overflow="scroll" flexDirection="column">
        <Box flexShrink={0}>
          <Viewport cols={12} rows={6} source={source} />
        </Box>
      </Box>
      <Text>exit code 1</Text>
      {Array.from({ length: 27 }, (_, i) => (
        <Box key={i} height={1} flexShrink={0}>
          <Text>{`status ${i}`}</Text>
        </Box>
      ))}
    </Box>
  )
}

function blitSource(initial = "A"): { source: ForeignSource; paint: (char: string) => void } {
  let ctx: ViewportContext | null = null
  const paint = (char: string): void => {
    if (!ctx) throw new Error("viewport source is not connected")
    const { cols, rows } = ctx.dimensions()
    const frame = createCellBuffer(cols, rows)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        frame.setCell(c, r, {
          char,
          fg: null,
          bg: null,
          attrs: {},
          wide: false,
          continuation: false,
        })
      }
    }
    ctx.blit([{ row: 0, col: 0, width: cols, height: rows }], frame)
  }
  const source: ForeignSource = {
    connect(connected) {
      ctx = connected
      paint(initial)
    },
    disconnect() {
      ctx = null
    },
  }
  return { source, paint }
}

/**
 * @failure A guest frame's blit past its scroll viewport stays over the clean text below it.
 * @level l2
 * @consumer ag-code tool-call output island inside a compact scroll; public Viewport users.
 */
describe("regression: an opaque blit past its scroll clip keeps the later sibling (@i/10-yrd/26485)", () => {
  test("a guest frame inside a shorter scroll container repaints the text below it", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const guest = blitSource()
    const app = render(<BlitPane source={guest.source} />)
    try {
      expect(app.term.buffer.getCell(0, 3).char).toBe("e")
      guest.paint("B")
      app.rerender(<BlitPane source={guest.source} />)
      expect(app.term.buffer.getCell(0, 0).char).toBe("B")
      expect(app.term.buffer.getCell(0, 3).char).toBe("e")
    } finally {
      app.unmount()
    }
  })
})

// A clean earlier sibling that clips holds a 12x6 Viewport in 3 rows; the
// emitter on row 3 clears cells under the Viewport's layout rect. Those cells
// are outside the clip, so no frame, fresh or incremental, holds a guest cell
// there, and the emitter's clear needs no repaint of the earlier sibling.
function ClippedBlitPane({
  source,
  overflow,
  emitter,
}: {
  source: ForeignSource
  overflow: "hidden" | "scroll"
  emitter: { text: string } | { width: number }
}): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor="#000000">
      <Box height={3} flexShrink={0} overflow={overflow} flexDirection="column">
        <Box flexShrink={0}>
          <Viewport cols={12} rows={6} source={source} />
        </Box>
      </Box>
      {"text" in emitter ? (
        <Box width={COLS} height={1} flexShrink={0}>
          <Text key={emitter.text}>{emitter.text}</Text>
        </Box>
      ) : (
        <Box width={emitter.width} height={1} flexShrink={0} />
      )}
      {Array.from({ length: 27 }, (_, i) => (
        <Box key={i} height={1} flexShrink={0}>
          <Text>{`status ${i}`}</Text>
        </Box>
      ))}
    </Box>
  )
}

/**
 * @failure A guest cell painted past a hidden or scroll box survives, or is lost, when a later sibling clears under it.
 * @level l2
 * @consumer ag-code tool-call output island inside a compact scroll; hab-deck shell panes; public Viewport users.
 */
describe("regression: an opaque blit stays inside its clipping ancestor (@i/10-yrd/26485-stage-switch-stale-background/26811-opaque-blit-ignores-scroll-clip)", () => {
  for (const overflow of ["hidden", "scroll"] as const) {
    test(`a shrinking box below a clipped guest frame clears to the pane background (${overflow})`, () => {
      const render = createRenderer({ cols: COLS, rows: ROWS })
      const guest = blitSource("G")
      const scene = (width: number) => (
        <ClippedBlitPane source={guest.source} overflow={overflow} emitter={{ width }} />
      )
      const app = render(scene(19))
      try {
        app.rerender(scene(6))
        expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
        const cleared = app.term.buffer.getCell(8, 3)
        expect(cleared.char).toBe(" ")
        expect(cleared.bg).toEqual({ r: 0, g: 0, b: 0 })
      } finally {
        app.unmount()
      }
    })

    test(`a stable text clear below a clipped guest frame keeps no guest cell (${overflow})`, () => {
      const render = createRenderer({ cols: COLS, rows: ROWS })
      const guest = blitSource("G")
      const scene = (text: string) => (
        <ClippedBlitPane source={guest.source} overflow={overflow} emitter={{ text }} />
      )
      const app = render(scene("exit code 1"))
      try {
        app.rerender(scene("exit 1"))
        expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
        expect(app.term.buffer.getCell(6, 3).char).toBe(" ")
        expect(app.term.buffer.getCell(6, 3).bg).toEqual({ r: 0, g: 0, b: 0 })
      } finally {
        app.unmount()
      }
    })
  }
})
