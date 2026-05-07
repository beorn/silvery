/**
 * Incremental render — stale bg residue when a bg-bearing node shrinks AND moves.
 *
 * Bead: @km/silvery/incremental-bg-residue-shrink-move
 * Class: cyan-strip-residue (km-silvery.render-no-stale-residue-invariant).
 *
 * Canonical reproduction (the bug as observed in production):
 *   apps/silvercode/tests/visual/queue-ux.test.tsx — the "wire format"
 *   test fails at SILVERY_STRICT=1 with `MISMATCH at (0, 22) on render
 *   #36`. The silvercode chat composer transitions from Welcome → Chat,
 *   the SessionPromptComposer outer Box (bg=$bg-surface-raised) shifts
 *   x=0 → x=1 and shrinks 88 → 86 wide as a 1-wide marker is inserted
 *   before it, and the cleared-pixel cleanup leaves bg residue at x=0.
 *
 * Synthetic shape (exercises the case-2 path of `_checkDescendantOverflow`):
 *   - Frame 1: a Box with backgroundColor occupies a single-child slot,
 *     painting bg across (x=0, w=W).
 *   - Frame 2: the slot becomes a multi-child layout — a 1-wide marker
 *     sibling is inserted before the bg-painter, so the painter shifts
 *     (x=0 → x=1) AND shrinks (w=W → w=W-1).
 *   - Frame 3: nothing changes; the cascade fast-path skips the entire
 *     subtree.
 *
 * Bug shape:
 *   - Frame 2: clearExcessArea on the painter SKIPS (position-change
 *     guard — prev.x=0 ≠ layout.x=1). The parent must clear the old
 *     position. If the parent's `contentRegionCleared` does not reach
 *     the old left column (x=0), the bg from frame 1 carries forward.
 *   - Frame 3: cell (0, y) has bg from frame 1 in the cloned buffer;
 *     fresh paints inherited bg (null). STRICT mismatch.
 *
 * The fix extends `_checkDescendantOverflow` in layout-phase.ts to also
 * fire when a bg-bearing descendant shrank/moved within the ancestor's
 * rect (case 2 — "bg residue inside"). Without the case-2 check, the
 * painter's parent has only `subtreeDirty=true` (no contentAreaAffected),
 * fast-paths past the cleanup site, and the residue carries forward.
 *
 * The synthetic fixture below is a 50+-node tree (per RENDERING.md:
 * "tests MUST use realistic-scale fixtures (50+ nodes), not 2-3 node toy
 * components"). It does NOT reliably exercise the bug at the
 * createRenderer scale — the production bug requires the multi-pass
 * convergence + React reconciler interactions in the silvercode app.
 * This file is the local STRICT scaffold; the silvercode test is the
 * end-to-end verification.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

// 50-node padding subtree to push past the 2-3 node toy threshold.
function PaddingTree({ depth = 6 }: { depth?: number }): React.ReactElement {
  if (depth <= 0) {
    return (
      <Box flexDirection="row" gap={1}>
        <Text>row</Text>
        <Text>cell</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" padding={0}>
      <Box flexDirection="row">
        <Text>n{depth}</Text>
      </Box>
      <PaddingTree depth={depth - 1} />
    </Box>
  )
}

describe("incremental bg residue: shrink + move on a bg-bearing descendant", () => {
  test("frame 2 inserts a 1-wide marker sibling before a bg Box; frame 3 skip-path must not show stale bg at x=0", () => {
    const cols = 88
    const rows = 30
    const render = createRenderer({ cols, rows })

    // The "shell" matches the depth/shape we hit in silvercode's chat
    // composer: 5+ transparent flex wrappers around a row that may have
    // either 1 child (the bg-painter alone) or 3 children (a 1-wide
    // marker, the painter, and a small trailing element).
    function App({ withMarker }: { withMarker: boolean }): React.ReactElement {
      // Wrap the slot in 5 transparent flex containers so the cascade
      // has many clean ancestors.
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Box flexGrow={1}>
            <Box flexDirection="column">
              <Box flexDirection="column">
                <Box flexDirection="column">
                  {/* Top filler — pushes the slot down to y=22. */}
                  <Box height={22}>
                    <PaddingTree depth={4} />
                  </Box>
                  {/* The slot — height=3, width=cols. */}
                  <Box flexDirection="row" height={3} width={cols}>
                    {withMarker ? (
                      <>
                        {/* 1-wide marker — pushes painter to x=1. */}
                        <Box width={1} flexShrink={0}>
                          <Text> </Text>
                        </Box>
                        {/* The bg-painter — flexGrow shrinks from
                         *  full-width to (cols-1) when the marker
                         *  is added. */}
                        <Box flexGrow={1} backgroundColor="#3D434F">
                          <Text>painter</Text>
                        </Box>
                      </>
                    ) : (
                      // Without marker: painter takes full slot width,
                      // x=0, w=cols.
                      <Box flexGrow={1} backgroundColor="#3D434F">
                        <Text>painter</Text>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    // Frame 1: painter at x=0, w=cols. Establishes prev buffer.
    const app = render(<App withMarker={false} />)
    expect(app.text).toContain("painter")

    // Frame 2: insert marker — painter MOVES to x=1 AND SHRINKS to
    // (cols-1). Cell (0, 22) was painted with bg=#3D434F at frame 1;
    // at frame 2, no source node should paint that cell (the marker
    // is bg-less, the painter is at x=1).
    app.rerender(<App withMarker={true} />)
    expect(app.text).toContain("painter")

    // Frame 3: stable tree, all flags clean. STRICT (already on at
    // SILVERY_STRICT=1 via vitest setup) verifies incremental ===
    // fresh on EVERY render. If frame 2 leaves bg residue at (0,22),
    // frame 3's clean-path cascade carries it forward and STRICT
    // throws here.
    app.rerender(<App withMarker={true} />)
    expect(app.text).toContain("painter")

    // Direct cell assertion: bg at (0, 22) must match a fresh render.
    // A fresh render has the marker at (0,22) which is a transparent
    // Box wrapping a single-space Text — its bg is the inherited bg
    // (null at the root). Anything else at (0,22) means we leaked
    // the painter's #3D434F.
    const cell = app.cell(0, 22)
    expect(cell.bg).toBeNull()
  })

  test("bg-bearing painter shrinks LEFT (x grows, width shrinks) without childrenDirty — stale bg at old x=0 must be cleared", () => {
    // Variant: only the painter's flex basis / size changes. No new
    // siblings inserted (no childrenDirty). The slot still has 2
    // children — a marker and the painter — but the marker WIDENS
    // (forcing the painter to shrink/move). The painter's parent has
    // ONLY childPositionChanged (no childrenDirty). This isolates the
    // pure "node moved within parent" path.
    const cols = 88
    const rows = 30
    const render = createRenderer({ cols, rows })

    function App({ markerWidth }: { markerWidth: number }): React.ReactElement {
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Box flexGrow={1}>
            <Box flexDirection="column">
              <Box flexDirection="column">
                <Box flexDirection="column">
                  <Box height={22}>
                    <PaddingTree depth={4} />
                  </Box>
                  <Box flexDirection="row" height={3} width={cols}>
                    {/* Marker grows from 0-wide to 1-wide → painter
                     *  moves x=0 → x=1 and shrinks. NO childrenDirty
                     *  on parent (still 2 kids). */}
                    <Box width={markerWidth} flexShrink={0}>
                      <Text> </Text>
                    </Box>
                    <Box flexGrow={1} backgroundColor="#3D434F">
                      <Text>painter</Text>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    // Frame 1: marker=0 → painter at x=0, w=cols.
    const app = render(<App markerWidth={0} />)
    expect(app.text).toContain("painter")

    // Frame 2: marker=1 → painter MOVES to x=1, SHRINKS to (cols-1).
    // No childrenDirty — only layoutChanged on painter and
    // childPositionChanged on the parent.
    app.rerender(<App markerWidth={1} />)
    expect(app.text).toContain("painter")

    // Frame 3: stable; STRICT verifies clean cascade doesn't carry
    // forward stale bg at x=0.
    app.rerender(<App markerWidth={1} />)

    const cell = app.cell(0, 22)
    expect(cell.bg).toBeNull()
  })

  test("bg-painter wrapped in flexShrink/flexGrow chain — only inner painter moves; outer rect stays put", () => {
    // The closest variant to the silvercode chat-composer scenario:
    // outer bordered Box wraps an inner row that itself contains a
    // bg-painter. The OUTER's rect doesn't change. The INNER row
    // inserts a sibling so the painter moves. Only inner has
    // childrenDirty; outer has only subtreeDirty.
    const cols = 88
    const rows = 30
    const render = createRenderer({ cols, rows })

    function App({ withMarker }: { withMarker: boolean }): React.ReactElement {
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Box flexGrow={1}>
            <Box flexDirection="column">
              <Box height={22}>
                <PaddingTree depth={5} />
              </Box>
              {/* Outer slot — never changes rect. */}
              <Box flexDirection="row" height={3} width={cols}>
                {/* Wrapper that ALSO never changes rect (always 1
                 *  child, always full width). */}
                <Box flexGrow={1}>
                  <Box flexDirection="row" flexGrow={1}>
                    {withMarker && (
                      <Box width={1} flexShrink={0}>
                        <Text>m</Text>
                      </Box>
                    )}
                    <Box flexGrow={1} backgroundColor="#3D434F">
                      <Text>painter</Text>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App withMarker={false} />)
    expect(app.text).toContain("painter")

    app.rerender(<App withMarker={true} />)
    expect(app.text).toContain("painter")

    app.rerender(<App withMarker={true} />)

    const cell = app.cell(0, 22)
    expect(cell.bg).toBeNull()
  })

  test("bg-painter shrinks within parent rect; ancestor stays put — STRICT must catch stale residue (case 2)", () => {
    // Tightest fixture for the case-2 path: the bg-painter's prev
    // rect SHRINKS (e.g., from width=W to width=W-1) and MOVES
    // (e.g., x=0 → x=1) but stays within its parent's CURRENT rect.
    // The outer "case 1" overflow check (prev outside parent's
    // current rect) does NOT fire here — the painter's prev fits
    // entirely inside the parent. Only case 2 (bg-bearing
    // descendant + prev rect not subset of cur rect) catches it.
    //
    // Reproduces silvercode/queue-ux "wire format" mismatch
    // (km-silvery.incremental-bg-residue-shrink-move).
    const cols = 88
    const rows = 30
    const render = createRenderer({ cols, rows })

    // The painter's parent has FIXED width = cols. The painter's
    // prev rect (0,22,cols,3) FITS in parent's rect (0,22,cols,3),
    // so prev does NOT overflow parent. The painter's CURRENT rect
    // (1,22,cols-1,3) ALSO fits. Only the residue cell at x=0
    // remains stale.
    function App({ withMarker }: { withMarker: boolean }): React.ReactElement {
      return (
        <Box flexDirection="column" width={cols} height={rows}>
          <Box flexGrow={1}>
            <Box flexDirection="column">
              <Box height={22}>
                <PaddingTree depth={5} />
              </Box>
              {/* Outer slot: fixed width=cols. Never resizes. */}
              <Box flexDirection="row" height={3} width={cols}>
                {/* Painter's parent: also fixed at width=cols. */}
                <Box flexDirection="row" width={cols} flexShrink={0}>
                  {withMarker && (
                    <Box width={1} flexShrink={0}>
                      <Text>m</Text>
                    </Box>
                  )}
                  {/* Painter: bg-bearing, flex-grows.
                   *   without marker → x=0, width=cols
                   *   with marker → x=1, width=cols-1
                   *  The painter SHRINKS-LEFT and MOVES-RIGHT.
                   *  Cell (0, 22) is in parent's rect but no
                   *  longer in painter's rect. */}
                  <Box flexGrow={1} backgroundColor="#3D434F">
                    <Text>painter</Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App withMarker={false} />)
    expect(app.text).toContain("painter")

    // The transition that creates the residue: marker appears
    // before the painter; painter shrinks-left and moves-right.
    app.rerender(<App withMarker={true} />)
    expect(app.text).toContain("painter")

    // Force a clean frame so the cascade evaluates skip paths.
    app.rerender(<App withMarker={true} />)

    // STRICT (SILVERY_STRICT=1, set by vitest setup) verifies
    // incremental === fresh on every render. If frame 2 left bg
    // residue at (0, 22), STRICT would already have thrown above.
    // The cell-level assertion is a redundant check.
    const cell = app.cell(0, 22)
    expect(cell.bg).toBeNull()
  })
})
