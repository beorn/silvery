/**
 * cursorOffset Box prop — layout-output cursor positioning.
 *
 * Phase 2 of `km-silvery.view-as-layout-output`: cursor coordinates are
 * declared as a Box prop and resolved by the layout phase, replacing the
 * legacy `useCursor` hook chain. This test pins:
 *
 *   1. cursorOffset on a deeply-nested Box produces a non-null
 *      `app.getCursorState()` on the FIRST frame (no second-render dance).
 *   2. cursorOffset takes border + padding into account automatically.
 *   3. Toggling visible flips the cursor state without changing layout.
 *   4. The "deepest visible cursor wins" rule: nested cursors override
 *      ancestor cursors in tree order.
 *   5. Realistic-scale tree (50+ nodes) — STRICT incremental ≡ fresh holds
 *      under conditional cursor mounts (the regression class for
 *      `km-silvercode.cursor-startup-position`).
 *
 * Tests run with SILVERY_STRICT=1 by default (km-infra setup) — every
 * rerender is auto-verified incremental ≡ fresh.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("cursorOffset prop (Phase 2: cursor as layout output)", () => {
  test("first frame: cursorOffset produces non-null cursor state without re-render", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box cursorOffset={{ col: 3, row: 0, visible: true }}>
            <Text>hello world</Text>
          </Box>
        </Box>
      )
    }

    // The crux of the bug fix: cursor must be resolved on the FIRST render,
    // before any effect chain has a chance to run. With the old useCursor
    // hook, this returned null until the next React commit.
    const app = render(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // Outer padding(1) — inner box has no border/padding — col offset 3.
    expect(cursor!.x).toBe(1 + 3)
    expect(cursor!.y).toBe(1 + 0)
  })

  test("cursorOffset accounts for border + padding on the same Box", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box borderStyle="round" paddingX={1} cursorOffset={{ col: 2, row: 0, visible: true }}>
            <Text>abc</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // Outer padding(1) + border(1) + paddingX(1) + cursorCol(2) = 5
    expect(cursor!.x).toBe(5)
    // Outer padding(1) + border(1) + cursorRow(0) = 2
    expect(cursor!.y).toBe(2)
  })

  test("visible: false suppresses the cursor without touching layout", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ visible }: { visible: boolean }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box cursorOffset={{ col: 3, row: 0, visible }}>
            <Text>hello</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App visible={true} />)
    expect(app.getCursorState()?.visible).toBe(true)

    app.rerender(<App visible={false} />)
    // When invisible, getCursorState returns the rect with visible=false
    // (or null when no cursor exists at all). Either signals "do not show".
    const c = app.getCursorState()
    if (c) expect(c.visible).toBe(false)
  })

  test("deepest visible cursor wins (nested TextArea-style components)", () => {
    const render = createRenderer({ cols: 60, rows: 12 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box cursorOffset={{ col: 0, row: 0, visible: true }}>
            <Text>outer</Text>
          </Box>
          <Box flexDirection="column" padding={1}>
            <Box borderStyle="round" paddingX={1} cursorOffset={{ col: 5, row: 0, visible: true }}>
              <Text>deeper</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // Deeper cursor should win — its x = padding(1) + padding(1) + border(1)
    // + paddingX(1) + col(5) = 9. y = padding(1) + outer-text(1) + padding(1)
    // + border(1) + row(0) = 4.
    expect(cursor!.x).toBe(9)
    expect(cursor!.y).toBe(4)
  })

  test("realistic-scale tree: conditional cursor mount preserves incremental ≡ fresh", () => {
    const render = createRenderer({ cols: 80, rows: 30 })

    // Build a 50-node tree: 10 columns × 5 rows. Cursor mounts conditionally
    // on a single deep cell — mirrors the silvercode startup pattern where
    // CommandBox conditionally appears after side-panel renders.
    function App({ showCursor }: { showCursor: boolean }) {
      return (
        <Box flexDirection="column" padding={1}>
          {/* Side region (mounted first, sets up the buffer) */}
          <Box flexDirection="column" gap={0}>
            {Array.from({ length: 5 }).map((_, row) => (
              <Box key={row} flexDirection="row" gap={1}>
                {Array.from({ length: 10 }).map((_, col) => (
                  <Box key={col} paddingX={0}>
                    <Text>{`r${row}c${col}`}</Text>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
          {/* Bottom command region — cursor lives here, conditionally */}
          {showCursor ? (
            <Box borderStyle="round" paddingX={1} cursorOffset={{ col: 4, row: 0, visible: true }}>
              <Text>{">"} command</Text>
            </Box>
          ) : (
            <Box>
              <Text>(loading…)</Text>
            </Box>
          )}
        </Box>
      )
    }

    // Frame 1: no cursor (mirrors pre-mount startup)
    const app = render(<App showCursor={false} />)
    expect(app.getCursorState()).toBeNull()

    // Frame 2: conditional mount — cursor MUST appear on this frame.
    // SILVERY_STRICT=1 verifies incremental === fresh; that pins that
    // cursor-as-layout-output doesn't break the incremental cascade for
    // the larger tree around it.
    app.rerender(<App showCursor={true} />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // padding(1) + border(1) + paddingX(1) + col(4) = 7
    expect(cursor!.x).toBe(7)

    // Frame 3: unmount — cursor disappears without leaving a stale rect.
    app.rerender(<App showCursor={false} />)
    expect(app.getCursorState()).toBeNull()
  })

  test("cursorOffset can move within an unchanging tree (typing)", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ col }: { col: number }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box cursorOffset={{ col, row: 0, visible: true }}>
            <Text>abcdefgh</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App col={0} />)
    expect(app.getCursorState()!.x).toBe(1)

    // Each "keystroke" advances col — pin that the cursor moves on each
    // frame without re-rendering the surrounding tree.
    for (let i = 1; i <= 5; i++) {
      app.rerender(<App col={i} />)
      expect(app.getCursorState()!.x).toBe(1 + i)
    }
  })
})
