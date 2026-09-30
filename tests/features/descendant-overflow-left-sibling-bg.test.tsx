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
import { describe, test, expect, vi } from "vitest"

// The prewalk cost rows read the render phase's per-frame stats
// (__silvery_content_all), which render-phase.ts records only when
// instrumentation is on; it reads the switch once, at module load. The root
// setup turns it on through SILVERY_STRICT, silvery's own runner does not, so
// the file turns it on itself, before the imports below load the pipeline.
const instrumentBefore = vi.hoisted(() => {
  const before = process.env.SILVERY_INSTRUMENT
  process.env.SILVERY_INSTRUMENT = "1"
  return before
})

import { bufferToText, compareBuffers, createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { Viewport } from "@silvery/ag-react"
import type { ForeignSource, ViewportContext } from "@silvery/ag/viewport-types"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import type { Theme } from "@silvery/ansi"

// The pipeline has read the switch; give the environment back to the worker.
if (instrumentBefore === undefined) delete process.env.SILVERY_INSTRUMENT
else process.env.SILVERY_INSTRUMENT = instrumentBefore

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
// `tabOverflow` clips the one-row tab header: "hidden" on both axes, or
// "hidden-y-visible" (overflow hidden, overflowY visible), which clips only x
// and so still lets the tab paint below its header.
function StagePane({
  output,
  scrolled = false,
  stickyTab = false,
  borderOnly = false,
  boxEmitter = false,
  outsideOpaque = false,
  stableOutputKey,
  tabOverflow,
}: {
  output: string
  scrolled?: boolean
  stickyTab?: boolean
  borderOnly?: boolean
  boxEmitter?: boolean
  outsideOpaque?: boolean
  stableOutputKey?: string
  tabOverflow?: "hidden" | "hidden-y-visible"
}): React.ReactElement<React.ComponentProps<typeof Box>> {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor="#000000">
      <Box
        height={1}
        flexShrink={0}
        overflow={tabOverflow ? "hidden" : undefined}
        overflowY={tabOverflow === "hidden-y-visible" ? "visible" : undefined}
      >
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
            {!boxEmitter &&
              (stableOutputKey === undefined ? (
                <Text>{output}</Text>
              ) : (
                <Box id="stable-output" width={COLS} height={1} flexShrink={0}>
                  <Text id="stable-output-text" key={stableOutputKey}>
                    {output}
                  </Text>
                </Box>
              ))}
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
  /**
   * @failure Stable transparent output cleanup erases an earlier tab's fill after keyed Text replacement.
   * @level l2
   * @consumer Yrd stage-output pane; incremental Silvery clients with overlapping sibling paint.
   */
  test("stable transparent output replacement preserves earlier tab paint in the same frame", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<StagePane output="AAAAAAAAAAAAAAAAAAA" stableOutputKey="long" />)

    try {
      const before = app.locator("#stable-output").resolve()
      const oldText = app.locator("#stable-output-text").resolve()
      expect(before?.boxRect).toBeDefined()
      expect(oldText).toBeDefined()
      const stableBounds = { ...before!.boxRect! }
      expect(app.term.buffer.getCell(16, 1).char).toBe("A")

      app.rerender(<StagePane output="AAAAAAAAAAAAAAAA" stableOutputKey="short" />)

      const after = app.locator("#stable-output").resolve()
      const replacement = app.locator("#stable-output-text").resolve()
      expect(after?.boxRect).toEqual(stableBounds)
      expect(replacement).not.toBe(oldText)
      expect(replacement?.prevLayout).toBeNull()
      const revealed = app.term.buffer.getCell(16, 1)
      expect(revealed.char).toBe(" ")
      expect(revealed.bg).toEqual({ r: 0, g: 0, b: 255 })
      expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
    } finally {
      app.unmount()
    }
  })

  // The row above is the plain-header control. The two rows below clip the
  // header: on both axes the tab stays in its row, so the clear reveals the
  // pane; with overflowY visible only x is clipped and the tab still paints
  // below the header, so the clear must reveal the tab.
  /**
   * @failure A stable clear below a header clipped on both axes shows anything but the pane background.
   * @level l2
   * @consumer Silvery clients with an overflow="hidden" filled earlier sibling.
   */
  test("stable transparent clear below a fully hidden tab header reveals the pane background", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <StagePane output="AAAAAAAAAAAAAAAAAAA" stableOutputKey="long" tabOverflow="hidden" />,
    )

    try {
      expect(app.term.buffer.getCell(16, 2).bg).toEqual({ r: 0, g: 0, b: 0 })
      app.rerender(
        <StagePane output="AAAAAAAAAAAAAAAA" stableOutputKey="short" tabOverflow="hidden" />,
      )
      const revealed = app.term.buffer.getCell(16, 1)
      expect(revealed.char).toBe(" ")
      expect(revealed.bg).toEqual({ r: 0, g: 0, b: 0 })
      expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
    } finally {
      app.unmount()
    }
  })

  /**
   * @failure A header with overflow="hidden" and overflowY="visible" is treated as clipping both axes, so a stable clear below it erases the tab's fill.
   * @level l2
   * @consumer Silvery clients using per-axis overflow on a filled earlier sibling.
   */
  test("stable transparent clear below a y-visible hidden tab header preserves the tab's fill", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <StagePane
        output="AAAAAAAAAAAAAAAAAAA"
        stableOutputKey="long"
        tabOverflow="hidden-y-visible"
      />,
    )

    try {
      expect(app.term.buffer.getCell(16, 2).bg).toEqual({ r: 0, g: 0, b: 255 })
      app.rerender(
        <StagePane
          output="AAAAAAAAAAAAAAAA"
          stableOutputKey="short"
          tabOverflow="hidden-y-visible"
        />,
      )
      const revealed = app.term.buffer.getCell(16, 1)
      expect(revealed.char).toBe(" ")
      expect(revealed.bg).toEqual({ r: 0, g: 0, b: 255 })
      expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
    } finally {
      app.unmount()
    }
  })

  /**
   * @failure A clean, clipped earlier sibling makes a one-Text change scan its entire subtree.
   * @level l3
   * @consumer Large incremental Silvery trees with overlapping paint.
   */
  test("one Text change has prewalk work independent of a clipped, disjoint clean subtree", () => {
    function CostPane({ cleanGroup, short }: { cleanGroup: React.ReactNode; short: boolean }) {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor="#000000">
          {cleanGroup}
          <Box height={1} flexShrink={0}>
            <Box width={20} height={5} flexShrink={0} backgroundColor="#0000ff" />
          </Box>
          <Box width={20} height={1} flexShrink={0}>
            <Text key={short ? "short" : "long"}>
              {short ? "AAAAAAAAAAAAAAAA" : "AAAAAAAAAAAAAAAAAAA"}
            </Text>
          </Box>
        </Box>
      )
    }

    function measure(cleanCount: number) {
      const rows = Array.from({ length: cleanCount }, (_, i) => <Text key={i}>clean {i}</Text>)
      const cleanGroup = (
        <Box
          width={20}
          height={1}
          marginLeft={40}
          flexShrink={0}
          overflow="hidden"
          flexDirection="column"
        >
          {rows}
        </Box>
      )
      const render = createRenderer({ cols: COLS, rows: ROWS })
      const app = render(<CostPane cleanGroup={cleanGroup} short={false} />)
      try {
        ;(globalThis as any).__silvery_content_all = []
        app.rerender(<CostPane cleanGroup={cleanGroup} short />)
        const frames = ((globalThis as any).__silvery_content_all ?? []) as Array<
          Record<string, number>
        >
        const incremental = frames.find((frame) => frame._hasPrevBuffer === 1)
        expect(incremental).toBeDefined()
        expect(app.term.buffer.getCell(16, 2).bg).toEqual({ r: 0, g: 0, b: 255 })
        return {
          extents: incremental!.prewalkExtentDerivations,
          rectangles: incremental!.prewalkRectChecks,
          rendered: incremental!.nodesRendered,
          skipped: incremental!.nodesSkipped,
        }
      } finally {
        app.unmount()
      }
    }

    const small = measure(20)
    const large = measure(2100)
    expect(large.extents).toBe(small.extents)
    expect(large.rectangles).toBe(small.rectangles)
  }, 120_000)

  /**
   * @failure A flat prefix of disjoint clean painters makes one Text clear's prewalk outgrow the walk.
   * @level l3
   * @consumer Large incremental Silvery rows with many sibling items.
   */
  // Recorded cost, accepted by the CTO ruling on @i/10-yrd/26485 (2026-09-29
  // addendum): the walk itself skips every clean sibling on the dirty path, so
  // the prewalk may grow with the walk's rendered + skipped, never faster, for
  // each own-change emitter. Two emitters test the same earlier siblings here:
  // the wrapper whose keyed child was replaced, and the replacement Text.
  // Wall time is evidence and is not asserted: at 2,100 siblings the warmed
  // median of this frame against the delivered source (0e9e4810321) on one
  // host was 1.03x, inside the ruling's bound of 1.25x.
  test("one Text change has prewalk work that grows no faster than the walk over flat siblings", () => {
    function FlatPane({
      prefix,
      short,
      width,
    }: {
      prefix: React.ReactNode[]
      short: boolean
      width: number
    }) {
      return (
        <Box width={width} height={2} flexDirection="row" backgroundColor="#000000">
          {prefix}
          <Box width={20} height={1} flexShrink={0}>
            <Text key={short ? "short" : "long"}>
              {short ? "AAAAAAAAAAAAAAAA" : "AAAAAAAAAAAAAAAAAAA"}
            </Text>
          </Box>
        </Box>
      )
    }

    function measure(prefixCount: number) {
      const prefix = Array.from({ length: prefixCount }, (_, i) => (
        <Box key={i} width={1} height={1} flexShrink={0} backgroundColor="#0000ff" />
      ))
      const width = prefixCount + 20
      const render = createRenderer({ cols: width, rows: 2 })
      const app = render(<FlatPane prefix={prefix} short={false} width={width} />)
      try {
        ;(globalThis as any).__silvery_content_all = []
        app.rerender(<FlatPane prefix={prefix} short width={width} />)
        const frames = ((globalThis as any).__silvery_content_all ?? []) as Array<
          Record<string, number>
        >
        const incremental = frames.find((frame) => frame._hasPrevBuffer === 1)
        expect(incremental).toBeDefined()
        const stat = (key: string): number => {
          const value = incremental?.[key]
          if (typeof value !== "number") throw new Error(`Missing render-phase stat ${key}`)
          return value
        }
        return {
          extents: stat("prewalkExtentDerivations"),
          rectangles: stat("prewalkRectChecks"),
          rendered: stat("nodesRendered"),
          skipped: stat("nodesSkipped"),
        }
      } finally {
        app.unmount()
      }
    }

    const EMITTERS = 2
    const small = measure(20)
    const large = measure(2100)
    const walkGrowth = large.rendered + large.skipped - (small.rendered + small.skipped)
    expect(large.rendered).toBe(small.rendered)
    expect(large.extents - small.extents).toBeLessThanOrEqual(walkGrowth)
    expect(large.rectangles - small.rectangles).toBeLessThanOrEqual(EMITTERS * walkGrowth)
  }, 120_000)

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
// emitter on the row below clears cells under the Viewport's layout rect.
// Those cells are outside the clip, so no frame, fresh or incremental, holds a
// guest cell there, and the emitter's clear needs no repaint of the earlier
// sibling. Header rows above the box are what a guest scrolled up would cover.
function ClippedBlitPane({
  source,
  overflow,
  emitter,
  scrollOffset,
  headerRows = 0,
}: {
  source: ForeignSource
  overflow: "hidden" | "scroll"
  emitter: { text: string } | { width: number } | { label: string; tick: number }
  scrollOffset?: number
  headerRows?: number
}): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor="#000000">
      {Array.from({ length: headerRows }, (_, i) => (
        <Text key={`header-${i}`}>{`HEADER LINE ${i}`}</Text>
      ))}
      <Box
        height={3}
        flexShrink={0}
        overflow={overflow}
        scrollOffset={scrollOffset}
        flexDirection="column"
      >
        <Box flexShrink={0}>
          <Viewport cols={12} rows={6} source={source} />
        </Box>
      </Box>
      {"width" in emitter ? (
        <Box width={emitter.width} height={1} flexShrink={0} />
      ) : "label" in emitter ? (
        // A partly dirty row: the label stays clean while the counter changes.
        <Box width={COLS} height={1} flexShrink={0} flexDirection="row">
          <Text>{emitter.label}</Text>
          <Text>{`t${emitter.tick}`}</Text>
        </Box>
      ) : (
        <Box width={COLS} height={1} flexShrink={0}>
          <Text key={emitter.text}>{emitter.text}</Text>
        </Box>
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

  // A scroll step moves the guest without dirtying the rows below the box;
  // cells an earlier offset's blit wrote there were tracked by nothing.
  test("scrolling a guest frame 0,1,2,3,2,1,0 through its scroll box keeps incremental equal to fresh", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const guest = blitSource("G")
    const scene = (scrollOffset: number) => (
      <ClippedBlitPane
        source={guest.source}
        overflow="scroll"
        scrollOffset={scrollOffset}
        emitter={{ text: "exit code 1" }}
      />
    )
    const app = render(scene(0))
    try {
      for (const scrollOffset of [1, 2, 3, 2, 1, 0]) {
        app.rerender(scene(scrollOffset))
        expect(
          compareBuffers(app.term.buffer, app.freshRender()),
          `scrollOffset=${scrollOffset}`,
        ).toBeNull()
      }
      expect(app.term.buffer.getCell(8, 4).char).toBe(" ")
    } finally {
      app.unmount()
    }
  })

  // The row below the box renders for its own reason (its counter), so the
  // overlap pass does not force it and its clean label stays on the fast path
  // (the LESSONS 2026-09-28 gap). A blit inside its clip never reaches it.
  test("a partly dirty later sibling keeps its clean label while the guest repaints", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const guest = blitSource("G")
    const scene = (tick: number) => (
      <ClippedBlitPane
        source={guest.source}
        overflow="scroll"
        emitter={{ label: "exit code 1 ", tick }}
      />
    )
    const app = render(scene(0))
    try {
      guest.paint("B")
      app.rerender(scene(1))
      expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
      expect(app.term.buffer.getCell(0, 0).char).toBe("B")
      expect(app.term.buffer.getCell(0, 3).char).toBe("e")
    } finally {
      app.unmount()
    }
  })

  // Scrolled down, the guest's top rows sit above the box, over the header an
  // earlier sibling paints: a fresh frame lost "HEADER LINE 1" to guest cells.
  test("a guest frame scrolled above its scroll box leaves the earlier header intact", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const guest = blitSource("G")
    const scene = (scrollOffset: number) => (
      <ClippedBlitPane
        source={guest.source}
        overflow="scroll"
        scrollOffset={scrollOffset}
        headerRows={3}
        emitter={{ text: "exit code 1" }}
      />
    )
    const app = render(scene(2))
    try {
      const fresh = bufferToText(app.freshRender()).split("\n")
      expect(fresh.slice(0, 3).map((line) => line.trimEnd())).toEqual([
        "HEADER LINE 0",
        "HEADER LINE 1",
        "HEADER LINE 2",
      ])
      for (const scrollOffset of [1, 0, 1, 2, 3, 2]) {
        app.rerender(scene(scrollOffset))
        expect(
          compareBuffers(app.term.buffer, app.freshRender()),
          `scrollOffset=${scrollOffset}`,
        ).toBeNull()
      }
    } finally {
      app.unmount()
    }
  })
})

// ag-code's transcript shape (19383): a transparent wrapper holds a scroll
// container whose content runs past its viewport; a clean one-row status bar
// is the wrapper's later sibling. The streamed word's unscrolled layout box
// sits on the status bar's row: one row below the viewport at offset 0, five
// rows below where it paints at offset 5. When the word grows, the wrapper
// flags descendant overflow and clears below itself at that unscrolled row,
// although the scroll viewport (and a hidden wrapper) clipped the word's
// paint there. The status bar is the only owner of that row. Before #26485's
// d9e824de91 the overlap pass counted the wrapper's unclipped, unscrolled
// descendant rects and repainted the status bar after the clear; with paint
// extents clipped to their viewport it stays on the fast path.
function StreamPane({
  word,
  wrapper,
  scrollOffset,
}: {
  word: string
  wrapper: "hidden" | "visible"
  scrollOffset: number
}): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column">
      <Box flexGrow={1} flexShrink={1} minHeight={0} overflow={wrapper} flexDirection="column">
        <Box
          flexGrow={1}
          flexShrink={1}
          minHeight={0}
          overflow="scroll"
          scrollOffset={scrollOffset}
          flexDirection="column"
        >
          {Array.from({ length: ROWS - 1 }, (_, i) => (
            <Box key={i} height={1} flexShrink={0}>
              <Text>{`line ${i}`}</Text>
            </Box>
          ))}
          <Box height={1} flexShrink={0} flexDirection="row">
            <Text>{"• "}</Text>
            <Text>{word}</Text>
          </Box>
          {Array.from({ length: scrollOffset }, (_, i) => (
            <Box key={`tail-${i}`} height={1} flexShrink={0}>
              <Text>{`tail ${i}`}</Text>
            </Box>
          ))}
        </Box>
      </Box>
      <Box height={1} flexShrink={0} backgroundColor="#0000ff">
        <Text>{"  Claude Sonnet 4.6"}</Text>
      </Box>
    </Box>
  )
}

/**
 * @failure A streamed word's descendant-overflow clear blanks a clean status bar below its scroll viewport.
 * @invariant A descendant-overflow clear stays inside the clip its descendant painted under.
 * @level l2
 * @consumer ag-code transcript over its bottom status bar (19383 streaming repaint hole); public scroll users.
 * @testonly none
 */
describe("regression: a descendant-overflow clear stays inside its scroll viewport (19383)", () => {
  for (const wrapper of ["hidden", "visible"] as const) {
    for (const scrollOffset of [0, 5]) {
      test(`a growing word laid out on the status row keeps the status bar (${wrapper} wrapper, offset ${scrollOffset})`, () => {
        const render = createRenderer({ cols: COLS, rows: ROWS })
        const scene = (word: string) => (
          <StreamPane word={word} wrapper={wrapper} scrollOffset={scrollOffset} />
        )
        const app = render(scene("Complex"))
        try {
          const paintedRow = bufferToText(app.term.buffer).split("\n")[ROWS - 1 - scrollOffset]
          expect(paintedRow?.trimEnd()).toBe(scrollOffset > 0 ? "• Complex" : "  Claude Sonnet 4.6")
          app.rerender(scene("Complexity?"))
          expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
          const status = app.term.buffer.getCell(2, ROWS - 1)
          expect(status.char).toBe("C")
          expect(status.bg).toEqual({ r: 0, g: 0, b: 255 })
        } finally {
          app.unmount()
        }
      })
    }
  }
})

/**
 * @failure A scroll container directly above a status bar clears its unscrolled descendant's row over that bar.
 * @invariant The clearing node's own child clip bounds its descendant-overflow clear.
 * @level l2
 * @consumer ag-code transcript without a wrapper (19383, the clear's entry); public scroll users.
 * @testonly none
 */
describe("regression: a scroll container's own clip bounds its descendant-overflow clear (19383, the entry)", () => {
  // StreamPane without the wrapper: the scroll container is the node that
  // flags the descendant overflow, so the clip the clear starts from is its
  // own child clip (its viewport), not the clip it paints under itself.
  function BareStreamPane({
    word,
    scrollOffset,
  }: {
    word: string
    scrollOffset: number
  }): React.ReactElement {
    return (
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box
          flexGrow={1}
          flexShrink={1}
          minHeight={0}
          overflow="scroll"
          scrollOffset={scrollOffset}
          flexDirection="column"
        >
          {Array.from({ length: ROWS - 1 }, (_, i) => (
            <Box key={i} height={1} flexShrink={0}>
              <Text>{`line ${i}`}</Text>
            </Box>
          ))}
          <Box height={1} flexShrink={0} flexDirection="row">
            <Text>{"• "}</Text>
            <Text>{word}</Text>
          </Box>
          {Array.from({ length: scrollOffset }, (_, i) => (
            <Box key={`tail-${i}`} height={1} flexShrink={0}>
              <Text>{`tail ${i}`}</Text>
            </Box>
          ))}
        </Box>
        <Box height={1} flexShrink={0} backgroundColor="#0000ff">
          <Text>{"  Claude Sonnet 4.6"}</Text>
        </Box>
      </Box>
    )
  }

  for (const scrollOffset of [0, 5]) {
    test(`a growing word laid out on the status row keeps the status bar (no wrapper, offset ${scrollOffset})`, () => {
      const render = createRenderer({ cols: COLS, rows: ROWS })
      const scene = (word: string) => <BareStreamPane word={word} scrollOffset={scrollOffset} />
      const app = render(scene("Complex"))
      try {
        const paintedRow = bufferToText(app.term.buffer).split("\n")[ROWS - 1 - scrollOffset]
        expect(paintedRow?.trimEnd()).toBe(scrollOffset > 0 ? "• Complex" : "  Claude Sonnet 4.6")
        app.rerender(scene("Complexity?"))
        expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
        const status = app.term.buffer.getCell(2, ROWS - 1)
        expect(status.char).toBe("C")
        expect(status.bg).toEqual({ r: 0, g: 0, b: 255 })
      } finally {
        app.unmount()
      }
    })
  }
})

/**
 * @failure A scroll container that shrinks out of a non-clipping wrapper leaves last frame's rows below its new viewport.
 * @invariant A descendant-overflow clear covers the cells its descendant painted last frame, under last frame's clip.
 * @level l2
 * @consumer any scroll container taller than a non-clipping wrapper (26846); public scroll users.
 * @testonly none
 */
describe("regression: a descendant-overflow clear reaches last frame's viewport rows (26846)", () => {
  // A scroll container 8 rows tall in a 3-row wrapper that does not clip
  // shrinks to 6 rows while the Text on its row 7 shortens. Last frame the
  // Text painted rows 0..7 of the viewport; this frame's viewport ends at
  // row 6. The wrapper clears the Text's retreat below itself, and a clear
  // clipped to this frame's viewport only keeps last frame's rows 6 and 7.
  function ShrinkingViewport({ height, len }: { height: number; len: number }): React.ReactElement {
    return (
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box width={30} height={3} flexShrink={0} flexDirection="column">
          <Box width={30} height={height} flexShrink={0} flexDirection="column" overflow="scroll">
            {Array.from({ length: 40 }, (_, i) => (
              <Text key={i}>{`row${i} ` + "y".repeat(i === 7 ? len : 20)}</Text>
            ))}
          </Box>
        </Box>
        <Text>footer</Text>
      </Box>
    )
  }

  test("a viewport shrinking 8 to 6 rows under a shortening row leaves no row of last frame", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<ShrinkingViewport height={8} len={20} />)
    try {
      expect(bufferToText(app.term.buffer).split("\n")[7]?.trimEnd()).toBe("row7 " + "y".repeat(20))
      app.rerender(<ShrinkingViewport height={6} len={8} />)
      expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
      for (const y of [6, 7]) expect(app.term.buffer.getCell(0, y).char).toBe(" ")
    } finally {
      app.unmount()
    }
  })
})

/**
 * @failure A scrolled container's descendant-overflow clear lands at the unscrolled row and keeps the stale cells.
 * @invariant A descendant-overflow clear projects a scroll container's descendants with that container's own offset.
 * @level l2
 * @consumer any vertical scroller whose rows are wider than it (26842); public scroll users.
 * @testonly none
 */
describe("known gap: a descendant-overflow clear uses the clearing node's offset (26842)", () => {
  // A 20-column vertical scroller at offset 3 holds rows 40 columns wide; a
  // scroll container clips vertically only, so each row paints past its right
  // edge. Row 5's text shortens from 40 to 22 columns. It paints at row
  // 1 + 5 - 3 = 3; the clear projects it with the offset its ancestors paint
  // at (0), clears row 6 and keeps the stale columns 22..39 on row 3.
  //
  // Pinned as a failure until 26842 lands. Projecting each child with the
  // offset the painter gives it (paintChildStates, sticky children included)
  // passes this row and all 46 wide-row transitions of @dev/review2's probe,
  // and 54 more of the 37,500 random transitions, but newly fails 10 there,
  // 4 of them where the scroll offset changed this frame: the stale cells
  // were painted at last frame's offset, which the clear does not have for
  // every child.
  function WideRows({
    len5,
    scrollOffset,
  }: {
    len5: number
    scrollOffset: number
  }): React.ReactElement {
    return (
      <Box width={COLS} height={24} flexDirection="column">
        <Text>header</Text>
        <Box flexDirection="row" flexShrink={0}>
          <Box
            width={20}
            height={10}
            flexShrink={0}
            flexDirection="column"
            overflow="scroll"
            scrollOffset={scrollOffset}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <Box key={i} width={40} height={1} flexShrink={0}>
                <Text>{`r${i} ` + "x".repeat((i === 5 ? len5 : 40) - 4)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
        <Box height={1} flexShrink={0} backgroundColor="#0000ff">
          <Text>{"  status bar"}</Text>
        </Box>
      </Box>
    )
  }

  test.fails("a shortening wide row in a scrolled vertical scroller clears where it painted", () => {
    const render = createRenderer({ cols: COLS, rows: 24 })
    const app = render(<WideRows len5={40} scrollOffset={3} />)
    try {
      expect(bufferToText(app.term.buffer).split("\n")[3]?.trimEnd()).toBe("r5 " + "x".repeat(36))
      app.rerender(<WideRows len5={22} scrollOffset={3} />)
      expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
      expect(bufferToText(app.term.buffer).split("\n")[3]?.trimEnd()).toBe("r5 " + "x".repeat(18))
    } finally {
      app.unmount()
    }
  })
})

// Ruling 26485 condition 3: one function names the node that gives a node its
// inherited background, for the walk's clear and for the prewalk. A `theme`
// whose bg is empty is not a filled box (getEffectiveBg is falsy), yet the walk
// takes it as the inherited-background source and clamps the clear to its rect.
// The prewalk has to take the same node, or it looks for the earlier painter in
// the wrong place. The wrapper sits around the header and the output, around
// the output only, or around the emitter; the opaque output is the control.
const THEME_ONLY = { name: "theme-only", bg: "", fg: "#cccccc" } as unknown as Theme

function ThemedStagePane({
  output,
  outputKey,
  wrap,
  opaqueOutput = false,
}: {
  output: string
  outputKey: string
  wrap: "header-and-output" | "output" | "emitter"
  opaqueOutput?: boolean
}): React.ReactElement {
  const header = (
    <Box key="header" height={1} flexShrink={0}>
      <Box width={20} height={5} flexShrink={0} backgroundColor="#0000ff" />
    </Box>
  )
  const text = (
    <Box width={COLS} height={1} flexShrink={0}>
      <Text key={outputKey}>{output}</Text>
    </Box>
  )
  const output_ = (
    <Box
      key="output"
      width={COLS}
      height={8}
      flexShrink={0}
      flexDirection="column"
      backgroundColor={opaqueOutput ? "#101820" : undefined}
    >
      <Box width={COLS} flexShrink={0} alignItems="flex-start" flexDirection="column">
        {wrap === "emitter" ? (
          <Box theme={THEME_ONLY} width={COLS} flexShrink={0} flexDirection="column">
            {text}
          </Box>
        ) : (
          text
        )}
      </Box>
    </Box>
  )
  return (
    <Box width={COLS} height={ROWS} flexDirection="column" backgroundColor="#000000">
      {wrap === "header-and-output" ? (
        <Box theme={THEME_ONLY} width={COLS} flexShrink={0} flexDirection="column">
          {header}
          {output_}
        </Box>
      ) : wrap === "output" ? (
        [
          header,
          <Box key="themed" theme={THEME_ONLY} width={COLS} flexShrink={0} flexDirection="column">
            {output_}
          </Box>,
        ]
      ) : (
        [header, output_]
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
 * @failure A theme-only node between the output and the pane makes a stable text clear erase an earlier tab's fill.
 * @invariant The walk and the prewalk name the same inherited-background ancestor (inheritedBgSource).
 * @level l2
 * @consumer Yrd stage-output pane under a themed subtree; public Box users with theme-only wrappers.
 * @testonly none
 */
describe("regression: a theme-only wrapper names the same inherited background for the walk and the prewalk (@i/10-yrd/26485)", () => {
  for (const wrap of ["header-and-output", "output", "emitter"] as const) {
    test(`a stable text clear under a theme-only wrapper around the ${wrap} keeps the tab's fill`, () => {
      const render = createRenderer({ cols: COLS, rows: ROWS })
      const app = render(<ThemedStagePane output={"A".repeat(19)} outputKey="long" wrap={wrap} />)
      try {
        expect(app.term.buffer.getCell(16, 1).char).toBe("A")
        app.rerender(<ThemedStagePane output={"A".repeat(16)} outputKey="short" wrap={wrap} />)
        const revealed = app.term.buffer.getCell(16, 1)
        expect(revealed.char).toBe(" ")
        expect(revealed.bg).toEqual({ r: 0, g: 0, b: 255 })
        expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
      } finally {
        app.unmount()
      }
    })
  }

  test("an opaque output under a theme-only wrapper clears to its own fill", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const scene = (output: string, outputKey: string) => (
      <ThemedStagePane
        output={output}
        outputKey={outputKey}
        wrap="header-and-output"
        opaqueOutput
      />
    )
    const app = render(scene("A".repeat(19), "long"))
    try {
      app.rerender(scene("A".repeat(16), "short"))
      const revealed = app.term.buffer.getCell(16, 1)
      expect(revealed.char).toBe(" ")
      expect(revealed.bg).toEqual({ r: 16, g: 24, b: 32 })
      expect(compareBuffers(app.term.buffer, app.freshRender())).toBeNull()
    } finally {
      app.unmount()
    }
  })
})
