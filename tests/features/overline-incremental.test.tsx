/**
 * Overline attr prop — incremental + realistic-scale feature tests.
 *
 * Bead: km-silvery.overline-attr
 *
 * Exercises the full 5-phase pipeline at scale:
 *  - 50+ row fixture with overline Box overlays toggled across frames,
 *    catching cascade bugs (false-positive re-renders, stale prev-frame merge
 *    bits) that synthetic 2-3 node micro-tests miss. Mirrors
 *    `attr-props-overlay.test.tsx`'s realistic-scale pattern per
 *    silvery CLAUDE.md.
 *  - Overline toggled on/off — stylePropsDirty on a Box with prev-frame
 *    overline escalates to contentAreaAffected so the merge-attr bits clear
 *    cleanly next frame (see `hadBoxAttrOverlay` in render-phase.ts).
 *  - Nested overline — outer + inner both set, child cells carry the bit.
 *  - Scroll container with overline overlay on the top row (the ListView
 *    overscroll-indicator shape).
 *  - Incremental-render invariant (SILVERY_STRICT=1 at the vitest level
 *    catches any incremental-vs-fresh mismatch automatically on every
 *    rerender).
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

// ============================================================================
// Basic: single-frame overline via the full pipeline
// ============================================================================

describe("feature: overline renders via the full pipeline", () => {
  test("Text overline → cell.overline=true + ANSI has SGR 53", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app = render(<Text overline>hello</Text>)
    expect(app.cell(0, 0).overline).toBe(true)
    expect(app.cell(4, 0).overline).toBe(true)
    expect(app.ansi).toMatch(/\x1b\[[\d;:]*(?<![\d:])53(?=[m;:])/)
  })

  test("Box overline + Text child — transparent overlay, glyph survives", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app = render(
      <Box overline>
        <Text color="green">world</Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("w")
    expect(cell.fg).not.toBeNull() // green preserved
    expect(cell.overline).toBe(true)
  })

  test("nested Box overline — inner overline Box still has overline on cells", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app = render(
      <Box>
        <Box overline>
          <Text>deep</Text>
        </Box>
      </Box>,
    )
    expect(app.cell(0, 0).overline).toBe(true)
    expect(app.cell(3, 0).overline).toBe(true)
  })

  test("overline + underline on same Box — both layered onto child cells", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app = render(
      <Box overline underline="single">
        <Text>both</Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    expect(cell.overline).toBe(true)
    expect(cell.underline).toBe("single")
  })
})

// ============================================================================
// Realistic scale: 50 rows with mixed overline state, cursor-marker sweep
// ============================================================================

interface Row {
  id: number
  label: string
  emphasis: "none" | "overline" | "underline" | "both"
}

function ScaleFixture({ rows, selectedId }: { rows: Row[]; selectedId: number }) {
  return (
    <Box flexDirection="column" width={40}>
      {rows.map((row) => (
        <Box
          key={row.id}
          id={`row-${row.id}`}
          overline={row.id === selectedId || row.emphasis === "overline" || row.emphasis === "both"}
          underline={
            row.emphasis === "underline" || row.emphasis === "both" ? "single" : false
          }
        >
          <Text>
            {String(row.id).padStart(2, "0")} {row.label}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

function buildRows(count: number): Row[] {
  const emphases = ["none", "overline", "underline", "both"] as const
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    label: `Item number ${i}`,
    emphasis: emphases[i % emphases.length]!,
  }))
}

describe("feature: overline at 50-row scale", () => {
  test("50 rows with mixed overline/underline state render without STRICT mismatch", () => {
    const render = createRenderer({ cols: 40, rows: 60 })
    const rows = buildRows(50)
    const app = render(<ScaleFixture rows={rows} selectedId={-1} />)

    // Row 0 emphasis = "none" → neither
    expect(app.cell(0, 0).overline).toBe(false)
    expect(app.cell(0, 0).underline).toBe(false)
    // Row 1 emphasis = "overline"
    expect(app.cell(0, 1).overline).toBe(true)
    expect(app.cell(0, 1).underline).toBe(false)
    // Row 2 emphasis = "underline"
    expect(app.cell(0, 2).overline).toBe(false)
    expect(app.cell(0, 2).underline).toBe("single")
    // Row 3 emphasis = "both"
    expect(app.cell(0, 3).overline).toBe(true)
    expect(app.cell(0, 3).underline).toBe("single")
  })

  test("moving 'selected' overline marker across 50 items — SILVERY_STRICT validates incremental=fresh each frame", () => {
    const render = createRenderer({ cols: 40, rows: 60 })
    const rows = buildRows(50)
    const app = render(<ScaleFixture rows={rows} selectedId={0} />)

    // Row 0 gets overline because it's selected (even though emphasis=none).
    expect(app.cell(0, 0).overline).toBe(true)

    // Sweep the selection through all 50 rows. SILVERY_STRICT=1 (default in
    // tests) auto-verifies incremental == fresh on every rerender — any
    // cascade bug in mergeAttrsInRect's prev-frame clear would throw here.
    for (let i = 1; i < 50; i++) {
      app.rerender(<ScaleFixture rows={rows} selectedId={i} />)
      expect(app.cell(0, i).overline).toBe(true)
    }

    // After the 49-frame journey, previously-selected rows revert to their
    // emphasis default rather than getting stuck with overline:
    // row 0 emphasis = "none" → overline=false (not stuck)
    // row 1 emphasis = "overline" → overline=true (from emphasis, not selection)
    // row 2 emphasis = "underline" → overline=false
    expect(app.cell(0, 0).overline).toBe(false)
    expect(app.cell(0, 1).overline).toBe(true)
    expect(app.cell(0, 2).overline).toBe(false)
  })

  test("stateful on/off toggle across a 50-row list preserves per-row attrs", () => {
    const render = createRenderer({ cols: 40, rows: 60 })
    function App({ rev }: { rev: number }) {
      const [rows] = useState(buildRows(50))
      // rev cycles through rows 0..49, selecting each in turn.
      return <ScaleFixture rows={rows} selectedId={rev % 50} />
    }
    const app = render(<App rev={0} />)
    for (let rev = 1; rev < 15; rev++) {
      app.rerender(<App rev={rev} />)
    }
    // After 15 frames: row 14 selected (overline), and earlier rows back to
    // their emphasis-default overline state.
    expect(app.cell(0, 14).overline).toBe(true)
    expect(app.cell(0, 0).overline).toBe(false) // emphasis "none"
    expect(app.cell(0, 1).overline).toBe(true) // emphasis "overline"
  })
})

// ============================================================================
// Overline toggle: on → off → on across frames (hadBoxAttrOverlay cascade)
// ============================================================================

describe("feature: overline toggle clears prev-frame merge bits", () => {
  test("Box overline=true → false → true round-trip cleans cell attrs", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    function App({ on }: { on: boolean }) {
      return (
        <Box overline={on}>
          <Text>toggle</Text>
        </Box>
      )
    }
    const app = render(<App on={true} />)
    expect(app.cell(0, 0).overline).toBe(true)

    app.rerender(<App on={false} />)
    expect(app.cell(0, 0).overline).toBe(false)

    app.rerender(<App on={true} />)
    expect(app.cell(0, 0).overline).toBe(true)
  })
})

// ============================================================================
// Scroll-container overscroll-indicator shape (the ListView use case)
// ============================================================================

describe("feature: overscroll indicator shape — height=1 overline Box over scrollable content", () => {
  test("top row has overline painted on every column; subsequent rows do not", () => {
    // Mirror the ListView overscroll-indicator shape: an absolutely-positioned
    // height=1 Box with only `overline` at top=0, stretched across the full
    // width. This is the primary motivating use case for the prop.
    const render = createRenderer({ cols: 20, rows: 10 })
    const app = render(
      <Box flexDirection="column" width={20} height={10}>
        <Text>row A</Text>
        <Text>row B</Text>
        <Text>row C</Text>
        <Box position="absolute" top={0} left={0} right={0} height={1} overline />
      </Box>,
    )
    // Row 0 has overline on every cell (incl. the space cells past "row A").
    for (let col = 0; col < 20; col++) {
      expect(app.cell(col, 0).overline).toBe(true)
    }
    // Row 1 and 2 do not have overline.
    expect(app.cell(0, 1).overline).toBe(false)
    expect(app.cell(0, 2).overline).toBe(false)
    // Row 0's text content is preserved (transparent overlay).
    expect(app.cell(0, 0).char).toBe("r")
    expect(app.cell(1, 0).char).toBe("o")
  })

  test("asymmetric edge: top uses overline, bottom uses underline — both overlays coexist on the same frame", () => {
    // Exact ListView shape: top row overline, bottom row underline. Exercises
    // the mirror-symmetry the prop was added to support.
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(
      <Box flexDirection="column" width={20} height={5}>
        <Text>row 0</Text>
        <Text>row 1</Text>
        <Text>row 2</Text>
        <Text>row 3</Text>
        <Text>row 4</Text>
        <Box position="absolute" top={0} left={0} right={0} height={1} overline />
        <Box
          position="absolute"
          top={4}
          left={0}
          right={0}
          height={1}
          underline="single"
          underlineColor="$muted"
        />
      </Box>,
    )
    // Top row: overline only, no underline.
    expect(app.cell(0, 0).overline).toBe(true)
    expect(app.cell(0, 0).underline).toBe(false)
    // Middle rows: neither.
    expect(app.cell(0, 2).overline).toBe(false)
    expect(app.cell(0, 2).underline).toBe(false)
    // Bottom row: underline only, no overline.
    expect(app.cell(0, 4).overline).toBe(false)
    expect(app.cell(0, 4).underline).toBe("single")
  })

  test("toggling overscroll Box mount/unmount across frames preserves incremental invariant", () => {
    // The indicator comes and goes based on `bumpedEdge` state in ListView.
    // A mount/unmount cycle exercises the childrenDirty path + the
    // hadBoxAttrOverlay-driven cascade that clears prev-frame merge bits.
    const render = createRenderer({ cols: 20, rows: 5 })
    function App({ showTop }: { showTop: boolean }) {
      return (
        <Box flexDirection="column" width={20} height={5}>
          <Text>row 0</Text>
          <Text>row 1</Text>
          <Text>row 2</Text>
          {showTop && (
            <Box position="absolute" top={0} left={0} right={0} height={1} overline />
          )}
        </Box>
      )
    }
    const app = render(<App showTop={true} />)
    expect(app.cell(0, 0).overline).toBe(true)

    app.rerender(<App showTop={false} />)
    expect(app.cell(0, 0).overline).toBe(false)

    app.rerender(<App showTop={true} />)
    expect(app.cell(0, 0).overline).toBe(true)

    app.rerender(<App showTop={false} />)
    expect(app.cell(0, 0).overline).toBe(false)
  })
})
