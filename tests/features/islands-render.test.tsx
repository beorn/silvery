/**
 * <Island> render-phase blit — end-to-end paint tests.
 *
 * Phase 1 Unit ("painter") of `@km/silvery/15646-islands`. Verifies the
 * pipeline's render phase blits the guest's cell buffer into the parent
 * `TerminalBuffer` at the island's `boxRect`. Mirrors the `silvery-viewport`
 * blit pattern at `pipeline/render-viewport.ts` but reads from
 * `node.islandState.handle.output.buffer` instead of `node.viewportState.buffer`.
 *
 * Coverage:
 *   1. Renders an island at given cols×rows under realistic chrome (60+ nodes)
 *   2. Guest output buffer content shows up in parent frame
 *   3. Re-render with mutated guest buffer shows new content
 *   4. SILVERY_STRICT incremental==fresh across multiple frames with chrome change
 *   5. Pending-lifecycle island (no handle yet) skips blit cleanly — no crash
 *      and no stray pixels (parent's inherited bg paints through)
 *   6. Island clipped at right/bottom edge of parent buffer — no out-of-bounds writes
 *
 * The test fixture uses a synchronous snapshot guest — `init()` resolves
 * immediately with an IslandHandle whose output.buffer is pre-populated.
 * No PTY, no async deferral, no input routing — just paint.
 *
 * Tracking: bead `@km/silvery/15646-islands`.
 */

import React, { type ReactElement, type ReactNode } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Island, ScopeProvider, Text } from "@silvery/ag-react"
import { createCellBuffer, type MutableCellBuffer } from "@silvery/ag/viewport-buffer"
import { createScope } from "@silvery/scope"
import type { Cell } from "@silvery/ag/types"
import type {
  IslandGuest,
  IslandHandle,
  IslandOutputOwner,
  IslandSizeOwner,
} from "@silvery/ag/island-types"

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

function fillBuffer(buf: MutableCellBuffer, char: string): MutableCellBuffer {
  for (let r = 0; r < buf.rows; r++) {
    for (let c = 0; c < buf.cols; c++) {
      buf.setCell(c, r, makeCell(char))
    }
  }
  return buf
}

/**
 * Snapshot guest — synchronously returns an IslandHandle whose output.buffer
 * is pre-filled with the given character. Holds a reference so the test can
 * mutate the buffer between frames.
 */
function asyncSnapshotGuest(initialChar = "L", delayMs = 10) {
  let initCount = 0
  let disposeCount = 0
  const subscribers = new Set<() => void>()

  const guest: IslandGuest = {
    async init(ctx) {
      initCount++
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const buf = fillBuffer(createCellBuffer(ctx.cols, ctx.rows), initialChar)
      const size: IslandSizeOwner = {
        get cols() {
          return ctx.cols
        },
        get rows() {
          return ctx.rows
        },
        subscribe: () => () => {},
        requestResize() {},
      }
      const output: IslandOutputOwner = {
        buffer: buf,
        cursor: null,
        cursorVisible: false,
        subscribe(listener) {
          subscribers.add(listener)
          return () => subscribers.delete(listener)
        },
        writeCells() {},
        invalidateAll() {
          for (const fn of subscribers) fn()
        },
      }
      ctx.emit({ type: "ready" })
      return {
        size,
        output,
        dispose() {
          disposeCount++
        },
      }
    },
  }

  return {
    guest,
    get initCount() {
      return initCount
    },
    get disposeCount() {
      return disposeCount
    },
  }
}

function snapshotGuest(initialChar = "A") {
  let initCount = 0
  let disposeCount = 0
  const subscribers = new Set<() => void>()

  // Keep this fixture synchronous so the base render tests exercise the
  // earliest possible handle attachment. The delayed-hydration case is pinned
  // separately below.
  const guest: IslandGuest = {
    init(ctx) {
      initCount++
      const buf = fillBuffer(createCellBuffer(ctx.cols, ctx.rows), initialChar)
      let cols = ctx.cols
      let rows = ctx.rows
      const size: IslandSizeOwner = {
        get cols() {
          return cols
        },
        get rows() {
          return rows
        },
        subscribe: () => () => {},
        requestResize(nc, nr) {
          cols = nc
          rows = nr
        },
      }
      const output: IslandOutputOwner = {
        buffer: buf,
        cursor: null,
        cursorVisible: false,
        subscribe(listener) {
          subscribers.add(listener)
          return () => subscribers.delete(listener)
        },
        writeCells(_dirtyRects, _src) {
          // No-op for the snapshot fixture — real guests would copy cells
          // from `src` into `buf` at the given rects.
        },
        invalidateAll() {
          for (const fn of subscribers) fn()
        },
      }
      const handle: IslandHandle = {
        size,
        output,
        dispose() {
          disposeCount++
        },
      }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }

  return {
    guest,
    get initCount() {
      return initCount
    },
    get disposeCount() {
      return disposeCount
    },
  }
}

/**
 * Realistic-scale board fixture — 4 columns × 6 cards each = 24 chrome
 * boxes + the central <Island>. Past the 50-node threshold once you count
 * the inner Texts (each card has a Text + a Box).
 *
 * The island sits in the middle of the layout so any cascade defects
 * (false-positive dirty propagation, stale clear regions) show up.
 */
function BoardWithIsland({
  guest,
  cols = 20,
  rows = 5,
  cardCount = 24,
}: {
  guest: IslandGuest
  cols?: number
  rows?: number
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
        <Island guest={guest} cols={cols} rows={rows} />
      </Box>
      <Box>
        <Text color="$muted">footer</Text>
      </Box>
    </Box>
  )
}

/**
 * Drain the init/subscribe/setMountTick chain. The factory's
 * `Promise.resolve().then(() => guest.init(ctx)).then(handle => ...)` plus
 * the `<Island>` binding's `queueMicrotask` retry + `setMountTick` React
 * scheduling take ~4+ microtask hops to settle. Mirrors the macrotask
 * boundary trick in `islands-lifecycle.test.tsx`.
 */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/**
 * Wrap a React tree in a Scope so `<Island>`'s `useScopeEffect` finds an
 * ancestor scope. Real apps use `withScope()` at the app root; tests don't
 * spin up the full create-app pipeline, so we provide one directly. Mirrors
 * the helper in `islands-lifecycle.test.tsx`.
 *
 * IMPORTANT: each test must construct one scope and reuse it across all
 * `render` / `rerender` calls — re-allocating a scope per call changes the
 * `ScopeContext` value, which forces `<Island>`'s `useScopeEffect` cleanup
 * (state.islandState gets nulled) before the next paint, losing the
 * guest's buffer.
 */
function makeTestScopeWrapper() {
  const scope = createScope("islands-render-test")
  return (children: ReactNode): ReactElement => (
    <ScopeProvider scope={scope}>{children}</ScopeProvider>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("Island — render-phase blit", () => {
  test("1. renders at given cols×rows under realistic chrome (50+ nodes)", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const wrap = makeTestScopeWrapper()
    const g = snapshotGuest("A")
    const app = render(wrap(<BoardWithIsland guest={g.guest} cols={10} rows={3} />))
    await flushMicrotasks()
    // Force a rerender so the islandState-bearing AgNode runs the render
    // phase WITH the freshly attached handle. (Without this, the first
    // paint runs before init resolves — the lifecycle == "pending" branch
    // exercised by test #5.)
    app.rerender(wrap(<BoardWithIsland guest={g.guest} cols={10} rows={3} />))
    // Chrome cards must render normally — incremental cascade is intact.
    expect(app.text).toContain("col-0")
    expect(app.text).toContain("col-3")
    expect(app.text).toContain("c0.0")
    expect(app.text).toContain("c3.5")
    // The island blit puts 10 'A' cells into the parent buffer per row.
    expect(app.text).toContain("AAAAAAAAAA")
    // Footer below the island still renders — island is a leaf, doesn't
    // swallow siblings.
    expect(app.text).toContain("footer")
    expect(g.initCount).toBe(1)
  })

  test("2b. async guest handle paints after delayed hydration without caller rerender", async () => {
    const render = createRenderer({ cols: 80, rows: 24, autoRender: true })
    const wrap = makeTestScopeWrapper()
    const g = asyncSnapshotGuest("L", 10)
    const app = render(wrap(<BoardWithIsland guest={g.guest} cols={8} rows={2} />))

    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(app.text).toContain("LLLLLLLL")
    expect(g.initCount).toBe(1)
  })

  test("2. guest output buffer content shows up in the parent frame", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const wrap = makeTestScopeWrapper()
    const g = snapshotGuest("B")
    const app = render(wrap(<BoardWithIsland guest={g.guest} cols={12} rows={2} />))
    await flushMicrotasks()
    app.rerender(wrap(<BoardWithIsland guest={g.guest} cols={12} rows={2} />))
    expect(app.text).toContain("BBBBBBBBBBBB")
  })

  test("2c. null-bg snapshot cells inherit the host chrome background", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const wrap = makeTestScopeWrapper()
    const g = snapshotGuest("I")
    const view = (backgroundColor: string) =>
      wrap(
        <Box width={80} height={24} backgroundColor={backgroundColor}>
          <Island guest={g.guest} cols={4} rows={1} />
        </Box>,
      )

    const app = render(view("$bg-surface-subtle"))
    await flushMicrotasks()
    app.rerender(view("$bg-surface-subtle"))

    const island = app.locator("silvery-island").boundingBox()
    expect(island).toBeTruthy()
    const x = island!.x
    const y = island!.y
    expect(app.cell(x, y).char).toBe("I")
    const restingBg = app.cell(x, y).bg
    expect(restingBg).toBeTruthy()

    app.rerender(view("$bg-surface-hover"))
    expect(app.cell(x, y).char).toBe("I")
    expect(app.cell(x, y).bg).not.toEqual(restingBg)
  })

  test("3. island renders correctly when its layout shrinks (clipping cascade)", async () => {
    // Validate that renderIsland clips to the smaller of layout.width and
    // src.cols when the layout slot is smaller than the guest's own cell
    // grid. This is the inverse of test #6 (layout overshoots parent
    // buffer) — here the layout is INSIDE the parent buffer, but smaller
    // than the guest's content.
    const render = createRenderer({ cols: 80, rows: 24 })
    const wrap = makeTestScopeWrapper()
    const g = snapshotGuest("Y")
    function App({ slotWidth }: { slotWidth: number }) {
      return (
        <Box width={80} height={24} flexDirection="column">
          <Text>top</Text>
          <Box width={slotWidth} height={3}>
            <Island guest={g.guest} cols={20} rows={3} width={slotWidth} height={3} />
          </Box>
          <Text>bottom</Text>
        </Box>
      )
    }
    const app = render(wrap(<App slotWidth={20} />))
    await flushMicrotasks()
    app.rerender(wrap(<App slotWidth={20} />))
    expect(app.text).toContain("YYYYYYYYYYYYYYYYYYYY") // 20 Y's
    // Shrink the slot to 10 — renderIsland must clip the blit horizontally.
    app.rerender(wrap(<App slotWidth={10} />))
    expect(app.text).toContain("YYYYYYYYYY") // 10 Y's
    expect(app.text).toContain("top")
    expect(app.text).toContain("bottom")
  })

  test("4. SILVERY_STRICT incremental==fresh across multiple chrome-only updates", async () => {
    // Default project setup sets SILVERY_STRICT=1 — every rerender runs the
    // incremental vs fresh comparator. If the island branch introduces a
    // false-positive cascade (e.g. island marked dirty when nothing
    // changed) or the renderIsland blit drifts between incremental and
    // fresh runs, STRICT throws here, failing the test.
    //
    // This test varies CHROME ONLY (cardCount) — the island content stays
    // stable. The cascade should keep the island's pixels intact across
    // every rerender, and STRICT compares per-frame.
    const render = createRenderer({ cols: 80, rows: 24 })
    const wrap = makeTestScopeWrapper()
    const g = snapshotGuest("H")
    const app = render(wrap(<BoardWithIsland guest={g.guest} cols={10} rows={3} cardCount={24} />))
    await flushMicrotasks()
    app.rerender(wrap(<BoardWithIsland guest={g.guest} cols={10} rows={3} cardCount={24} />))
    expect(app.text).toContain("HHHHHHHHHH")

    // 5 frames of chrome-only state change. The island re-blits each frame
    // (its node ends up subtree-dirty via parent cascade) but the content
    // stays "H" — STRICT compares incremental vs fresh on every frame.
    for (let i = 0; i < 5; i++) {
      app.rerender(wrap(<BoardWithIsland guest={g.guest} cols={10} rows={3} cardCount={24 + i} />))
      expect(app.text).toContain("HHHHHHHHHH")
    }
  })

  test("5. pending-lifecycle island (no handle yet) paints inherited bg, no crash", async () => {
    // Mount an Island whose guest's init() never resolves — the
    // IslandNodeState.lifecycle stays "pending" with handle: null. The
    // render branch must short-circuit cleanly (no exception, no stray
    // pixels — the host's chrome paints through where the island sits).
    const neverInitGuest: IslandGuest = {
      // Returns a never-resolving Promise. The handle slot stays null.
      init() {
        return new Promise<IslandHandle>(() => {
          /* never resolves */
        })
      },
    }
    const render = createRenderer({ cols: 80, rows: 24 })
    function App() {
      return (
        <Box flexDirection="column" width={80} height={5}>
          <Text>top-line</Text>
          <Island guest={neverInitGuest} cols={8} rows={2} />
          <Text>bottom-line</Text>
        </Box>
      )
    }
    // Should mount, render, and NOT throw even though the island has no
    // handle. The blit branch should bail.
    const wrap = makeTestScopeWrapper()
    expect(() => render(wrap(<App />))).not.toThrow()
    await flushMicrotasks()
    const wrap2 = makeTestScopeWrapper()
    const app = render(wrap2(<App />))
    await flushMicrotasks()
    app.rerender(wrap2(<App />))
    expect(app.text).toContain("top-line")
    expect(app.text).toContain("bottom-line")
  })

  test("6. island clipped at right/bottom edge of parent buffer — no out-of-bounds writes", async () => {
    // Renderer buffer is 30x10. Give the island cols/rows that overshoot
    // the parent buffer in BOTH dimensions. renderIsland must silently
    // clip the blit to the in-bounds region — no exceptions, no corrupted
    // parent cells past (buffer.width-1, buffer.height-1).
    const render = createRenderer({ cols: 30, rows: 10 })
    const g = snapshotGuest("Z")
    function ClippedApp() {
      return (
        <Box flexDirection="column" width={30} height={10}>
          <Text>top</Text>
          <Island guest={g.guest} cols={40} rows={20} />
        </Box>
      )
    }
    const wrap = makeTestScopeWrapper()
    const app = render(wrap(<ClippedApp />))
    await flushMicrotasks()
    app.rerender(wrap(<ClippedApp />))
    expect(app.text).toContain("top")
    // Visible portion of the island shows 'Z' cells.
    expect(app.text).toContain("Z")
  })
})
