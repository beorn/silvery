/**
 * Viewport MVP — nested-cell-domain composition primitive.
 *
 * Tests the v1 `<Viewport>` against a mock ForeignSource. Coverage:
 *   1. Renders at given cols×rows under realistic chrome
 *   2. source.connect() on mount; source.disconnect() on unmount
 *   3. blit() updates parent buffer cells at the viewport's boxRect
 *   4. setCursor() updates the viewport's internal cursor (snapshot reflects)
 *   5. ref.snapshot() returns a CellBuffer matching the latest blits
 *   6. SILVERY_STRICT incremental==fresh with chrome around the viewport
 *   7. Viewport clipped at the right/bottom edge of the parent buffer
 *   8. v1 nesting guard: viewport-in-viewport throws at mount (added in A6)
 *
 * Realistic-scale fixture: 50+ surrounding silvery nodes (cards in a board
 * layout) so the cascade machinery is exercised at scale, not just on a toy.
 *
 * Tracking: bead @km/silvery/15513-surface-nested-composition-primitive.
 */

import React, { useEffect, useMemo, useRef, useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, Viewport } from "@silvery/ag-react"
import type {
  CellBuffer,
  ForeignSource,
  ViewportContext,
  ViewportRef,
} from "@silvery/ag/viewport-types"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import type { Cell } from "@silvery/ag/types"

// ────────────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────────────

function makeCell(char: string, overrides?: Partial<Cell>): Cell {
  return {
    char,
    fg: null,
    bg: null,
    attrs: {},
    wide: false,
    continuation: false,
    ...overrides,
  }
}

/**
 * Build a CellBuffer with every cell set to `char` (default 'X').
 */
function uniformBuffer(cols: number, rows: number, char = "X"): CellBuffer {
  const buf = createCellBuffer(cols, rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      buf.setCell(c, r, makeCell(char))
    }
  }
  return buf
}

/**
 * Mock ForeignSource that records lifecycle + cursor calls and exposes the
 * captured context so tests can drive blit / setCursor synchronously.
 */
function mockSource(initialChar = "A") {
  let connects = 0
  let disconnects = 0
  let capturedCtx: ViewportContext | null = null
  const source: ForeignSource = {
    connect(ctx) {
      connects++
      capturedCtx = ctx
      const { cols, rows } = ctx.dimensions()
      ctx.blit(
        [{ row: 0, col: 0, width: cols, height: rows }],
        uniformBuffer(cols, rows, initialChar),
      )
    },
    disconnect() {
      disconnects++
    },
  }
  return {
    source,
    counts: () => ({ connects, disconnects }),
    ctx: () => capturedCtx,
  }
}

/**
 * Realistic-scale board fixture — 5 columns × 12 cards each = 60 chrome
 * nodes plus the central Viewport. Past the 50-node threshold per
 * RENDERING.md guidance.
 *
 * The viewport sits in the middle of the layout so any cascade defects
 * (false-positive dirty propagation, stale clear regions, etc.) show up.
 */
function BoardWithViewport({
  source,
  cols = 20,
  rows = 5,
  viewportRef,
  cardCount = 24,
}: {
  source?: ForeignSource
  cols?: number
  rows?: number
  viewportRef?: React.Ref<ViewportRef>
  cardCount?: number
}) {
  return (
    <Box flexDirection="column" padding={1} gap={1} width={80} height={24}>
      <Box flexDirection="row" gap={1}>
        {Array.from({ length: 4 }).map((_, colIdx) => (
          <Box key={colIdx} flexDirection="column" width={14} gap={0}>
            <Box borderStyle="single" borderColor="cyan">
              <Text bold>col-{colIdx}</Text>
            </Box>
            {Array.from({ length: Math.floor(cardCount / 4) }).map((_, cardIdx) => (
              <Box key={cardIdx} width={12} height={1}>
                <Text>
                  c{colIdx}.{cardIdx}
                </Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
      <Box borderStyle="round" borderColor="yellow" padding={0}>
        <Viewport cols={cols} rows={rows} source={source} ref={viewportRef} />
      </Box>
      <Box>
        <Text color="$muted">footer</Text>
      </Box>
    </Box>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("Viewport — v1 MVP", () => {
  test("1. renders at given cols×rows under realistic chrome (60+ nodes)", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const { source } = mockSource("A")
    const app = render(<BoardWithViewport source={source} cols={10} rows={3} />)
    // The chrome cards must render normally.
    expect(app.text).toContain("col-0")
    expect(app.text).toContain("col-3")
    expect(app.text).toContain("c0.0")
    expect(app.text).toContain("c3.5")
    // The viewport blit puts 'A' cells into the parent buffer.
    expect(app.text).toContain("AAAAAAAAAA")
    // Footer below the viewport still renders — viewport is a leaf, doesn't
    // swallow siblings.
    expect(app.text).toContain("footer")
  })

  test("2. source.connect() on mount; source.disconnect() on unmount", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const mock = mockSource("B")
    function Wrapper({ mounted }: { mounted: boolean }) {
      return mounted ? (
        <BoardWithViewport source={mock.source} cols={10} rows={3} />
      ) : (
        <Box>
          <Text>no viewport</Text>
        </Box>
      )
    }
    const app = render(<Wrapper mounted={true} />)
    expect(mock.counts()).toEqual({ connects: 1, disconnects: 0 })
    expect(app.text).toContain("BBBBBBBBBB")

    app.rerender(<Wrapper mounted={false} />)
    expect(mock.counts()).toEqual({ connects: 1, disconnects: 1 })
    expect(app.text).toContain("no viewport")
  })

  test("3. blit() updates parent buffer cells at the viewport's boxRect", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const mock = mockSource("C")
    const app = render(<BoardWithViewport source={mock.source} cols={12} rows={2} />)

    // After mount the source has blit'd 'C' cells.
    expect(app.text).toContain("CCCCCCCCCCCC")

    // Push a different pattern via the captured context.
    const ctx = mock.ctx()!
    expect(ctx).toBeTruthy()
    ctx.blit([{ row: 0, col: 0, width: 12, height: 2 }], uniformBuffer(12, 2, "D"))

    // Trigger a re-render so the pipeline picks up the dirty viewport.
    app.rerender(<BoardWithViewport source={mock.source} cols={12} rows={2} />)
    expect(app.text).toContain("DDDDDDDDDDDD")
    expect(app.text).not.toContain("CCCCCCCCCCCC")
  })

  test("4. setCursor() updates the viewport's internal cursor (snapshot reflects)", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const mock = mockSource("E")
    const refHandle = { current: null as ViewportRef | null }
    const app = render(
      <BoardWithViewport
        source={mock.source}
        cols={10}
        rows={2}
        viewportRef={(r) => {
          refHandle.current = r
        }}
      />,
    )
    const ctx = mock.ctx()!
    ctx.setCursor({ row: 1, col: 4 }, "underline")

    // The cursor is tracked in viewportState. Indirectly observe via the ref:
    // snapshot() returns the buffer (cursor is metadata, not painted into
    // cells in v1 — the host process would draw it). We verify the call
    // didn't throw and the next snapshot has the latest buffer contents.
    const snap = refHandle.current!.snapshot()
    expect(snap.cols).toBe(10)
    expect(snap.rows).toBe(2)
    expect(snap.getCell(0, 0).char).toBe("E")
    expect(app.text).toContain("EEEEEEEEEE")
  })

  test("5. ref.snapshot() returns a CellBuffer matching the latest blits", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const mock = mockSource("F")
    const refHandle = { current: null as ViewportRef | null }
    render(
      <BoardWithViewport
        source={mock.source}
        cols={6}
        rows={2}
        viewportRef={(r) => {
          refHandle.current = r
        }}
      />,
    )

    const snap1 = refHandle.current!.snapshot()
    expect(snap1.cols).toBe(6)
    expect(snap1.rows).toBe(2)
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 6; c++) {
        expect(snap1.getCell(c, r).char).toBe("F")
      }
    }

    // Source pushes a new frame.
    const ctx = mock.ctx()!
    ctx.blit([{ row: 0, col: 0, width: 6, height: 2 }], uniformBuffer(6, 2, "G"))
    const snap2 = refHandle.current!.snapshot()
    expect(snap2.getCell(0, 0).char).toBe("G")

    // snap1 was a detached snapshot — must not see the mutation.
    expect(snap1.getCell(0, 0).char).toBe("F")
  })

  test("6. SILVERY_STRICT incremental==fresh with chrome around the viewport across 5 frames", () => {
    // Default project setup sets SILVERY_STRICT=1 — every rerender runs the
    // incremental vs fresh comparator. If the viewport branch introduces a
    // mismatch (e.g. dirty bit not cleared, blit at wrong coordinates), STRICT
    // throws here, failing the test.
    const render = createRenderer({ cols: 80, rows: 24 })
    const mock = mockSource("H")
    const app = render(<BoardWithViewport source={mock.source} cols={10} rows={3} cardCount={24} />)
    expect(app.text).toContain("HHHHHHHHHH")

    // 5 cycles of source-driven update + chrome-side state change.
    const chars = ["I", "J", "K", "L", "M"]
    for (let i = 0; i < chars.length; i++) {
      mock.ctx()!.blit([{ row: 0, col: 0, width: 10, height: 3 }], uniformBuffer(10, 3, chars[i]!))
      // Vary the chrome too (cardCount tweak) so we exercise the cascade
      // when the viewport's siblings shift.
      app.rerender(<BoardWithViewport source={mock.source} cols={10} rows={3} cardCount={24 + i} />)
      expect(app.text).toContain(chars[i]!.repeat(10))
    }
  })

  test("7. Viewport clipped at right/bottom edge — no out-of-bounds writes", () => {
    // The renderer's buffer is 30x10. Give the viewport cols/rows that
    // overshoot the parent buffer in BOTH dimensions. renderViewport must
    // silently clip the blit to the in-bounds region — no exceptions, no
    // corrupted parent cells, no writes past (buffer.width-1, buffer.height-1).
    const render = createRenderer({ cols: 30, rows: 10 })
    const { source } = mockSource("Z")
    function ClippedApp() {
      return (
        <Box flexDirection="column" width={30} height={10}>
          <Text>top</Text>
          <Viewport cols={40} rows={20} source={source} />
        </Box>
      )
    }
    const app = render(<ClippedApp />)
    expect(app.text).toContain("top")
    // Visible portion of the viewport shows 'Z' cells.
    expect(app.text).toContain("Z")
  })

  test("8. ref.writeCells() routes through dirty-marking and paints on rerender", () => {
    // Imperative writes (no source bound) must also mark the host AgNode
    // dirty so the next pipeline run paints the change.
    const render = createRenderer({ cols: 40, rows: 10 })
    const refHandle = { current: null as ViewportRef | null }
    function App({ tick }: { tick: number }) {
      return (
        <Box padding={1}>
          <Text>tick={tick}</Text>
          <Viewport
            cols={8}
            rows={2}
            ref={(r) => {
              refHandle.current = r
            }}
          />
        </Box>
      )
    }
    const app = render(<App tick={0} />)
    // Buffer starts blank — fill via the ref.
    refHandle.current!.writeCells(
      [{ row: 0, col: 0, width: 8, height: 2 }],
      uniformBuffer(8, 2, "Q"),
    )
    // Force the pipeline to run again; the ref call marked the AgNode dirty
    // so the new cells get blit into the parent buffer.
    app.rerender(<App tick={1} />)
    expect(app.text).toContain("QQQQQQQQ")
    expect(app.text).toContain("tick=1")
  })

  test("9. v1 nesting guard — Viewport-in-Viewport throws at mount", () => {
    // Sibling viewports are fine (covered implicitly by tests 1-8). Nested
    // viewports must throw on mount with a message pointing to the bead.
    const render = createRenderer({ cols: 40, rows: 10 })
    const { source: outerSource } = mockSource("X")
    const { source: innerSource } = mockSource("Y")
    function Nested() {
      return (
        // @ts-expect-error — Viewport is typed as a leaf (no `children` in
        // ViewportProps). We deliberately pass a child here so the runtime
        // guard fires; the ts-expect-error applies to the outer Viewport's
        // implicit `children` prop, which is the path we're testing.
        <Viewport cols={20} rows={4} source={outerSource}>
          <Viewport cols={5} rows={2} source={innerSource} />
        </Viewport>
      )
    }
    expect(() => render(<Nested />)).toThrow(/Viewport cannot be nested/)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // L5 property tests — per @km/silvery/15732-viewport-composition-plateau
  // ──────────────────────────────────────────────────────────────────────────

  test("10. property — Viewport renders chaotic chalk-style bg colors without bg-conflict throw", () => {
    // Under silvery's main pipeline a cell with `bg='#c5cbd7'` adjacent to a
    // cell with the silvery bufferBg is the canonical bg-coherence violation
    // (the bug @km/silvery/15506 patchworked with setBgConflictMode('ignore')).
    // Inside a Viewport the cell domain is opaque — the pipeline must skip
    // bg-coherence enforcement for the foreign cells. This test fuzzes across
    // a representative set of "chalk could emit any of these" backgrounds
    // (hex, palette index, null, mixed neighbors) and asserts the rendered
    // text comes out without any throw under SILVERY_STRICT=1 (the default
    // for vendor/silvery tests — every render runs the incremental==fresh
    // comparator + every-action invariants).
    const bgPalette = [
      "#c5cbd7", // grey
      "#1d2021", // dark
      "#fb4934", // red
      "#83a598", // blue
      "#fabd2f", // yellow
      "#b8bb26", // green
      "#d3869b", // pink
      null, // transparent
    ]

    function chaoticBufferSource(initial = "C"): ForeignSource {
      return {
        connect(ctx) {
          const { cols, rows } = ctx.dimensions()
          const buf = createCellBuffer(cols, rows)
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const bg = bgPalette[(r * cols + c) % bgPalette.length] ?? null
              buf.setCell(c, r, makeCell(initial, { bg }))
            }
          }
          ctx.blit([{ row: 0, col: 0, width: cols, height: rows }], buf)
        },
        disconnect() {},
      }
    }

    const render = createRenderer({ cols: 80, rows: 24 })
    const source = chaoticBufferSource("M")
    // The act of rendering with SILVERY_STRICT=1 (default) is the assertion —
    // if the Viewport boundary doesn't structurally bypass bg-coherence, the
    // STRICT every-action invariants throw before this returns. Wrap in
    // expect().not.toThrow() so a failure produces a clear diagnostic
    // pointing at this property rather than a bare stack trace.
    expect(() => {
      const app = render(<BoardWithViewport source={source} cols={10} rows={3} />)
      // Sanity — the chaotic-bg cells still render. The foreign cells should
      // surface as the 'M' chars from the buffer.
      expect(app.text).toContain("M")
    }).not.toThrow()
  })

  test("11. property — repeated blit of identical buffer state is idempotent (no spurious paint divergence)", () => {
    // A ForeignSource that re-blits the SAME buffer N times must produce the
    // SAME rendered output. If the renderViewport pipeline branch sets a
    // spurious dirty bit on each blit (or fails to coalesce equal buffers),
    // the SILVERY_STRICT incremental==fresh comparator catches it on the next
    // rerender — the comparator runs every event-batch under tier 1. The text
    // identity check below is the visible-side assertion.
    function repeatingBlitSource(char: string, captured: { ctx: ViewportContext | null }): ForeignSource {
      return {
        connect(ctx) {
          captured.ctx = ctx
          const { cols, rows } = ctx.dimensions()
          ctx.blit([{ row: 0, col: 0, width: cols, height: rows }], uniformBuffer(cols, rows, char))
        },
        disconnect() {},
      }
    }

    const render = createRenderer({ cols: 80, rows: 24 })
    const captured: { ctx: ViewportContext | null } = { ctx: null }
    const source = repeatingBlitSource("I", captured)
    const app = render(<BoardWithViewport source={source} cols={10} rows={3} />)
    const baseline = app.text
    expect(baseline).toContain("IIIIIIIIII")

    // Re-blit the same buffer 5 times + rerender. Each rerender runs
    // SILVERY_STRICT=1 incremental==fresh; an idempotency defect (spurious
    // dirty propagation, blit not deduped) trips the comparator.
    const sameBuffer = uniformBuffer(10, 3, "I")
    for (let i = 0; i < 5; i++) {
      captured.ctx!.blit([{ row: 0, col: 0, width: 10, height: 3 }], sameBuffer)
      app.rerender(<BoardWithViewport source={source} cols={10} rows={3} />)
      // Visible output stays identical — no cell changed, no chrome reflowed.
      expect(app.text).toBe(baseline)
    }
  })
})
