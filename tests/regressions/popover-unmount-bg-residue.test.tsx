/**
 * Regression: Stale bg pixels remain after a popover-shaped absolute child
 * unmounts.
 *
 * Symptom (km capture, 82×75 Ghostty): hover triggers a popover with
 * backgroundColor="$bg-surface-overlay" (rgb 52,58,70). When the popover
 * unmounts, one row of the popover's bg fill persists in the buffer — visible
 * as a "cyan-strip" of bg cells in the prior popover region with no border
 * chars and no content chars.
 *
 * Hypothesis: when an absolute child unmounts, it disappears from
 * `node.children`, so `_hasAbsoluteChildMutated` (which iterates current
 * children only) returns false. The parent gets `childrenDirty=true` from
 * the unmount, which triggers `clearNodeRegion` on the parent's CURRENT
 * rect. But the popover may have extended beyond the parent's rect (typical
 * for absolutely-positioned overlays), and those out-of-parent pixels stay
 * stale because no shrink-clear runs.
 *
 * The fix shape: when a previously-tracked absolute child is GONE this
 * frame, treat that as a structural change in the parent and clear the
 * union of (parent rect ∪ popover's prevLayout). Or: keep a per-frame
 * record of the absolute child's prevLayout and run an excess-clear on
 * UNMOUNT independent of the gate (since hasPrevBuffer=true at the parent
 * level, just not inside the second-pass dispatch).
 *
 * Tracking: km-silvery.popover-unmount-bg-residue
 */
import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

// Hex matches the captured popover overlay; actual rendered RGB is determined
// dynamically by sampling the open frame, since color spaces / token resolution
// can shift the precise bytes.
const POPOVER_HEX = "#34384a"

function bgEqual(
  bg: { r: number; g: number; b: number } | null,
  target: { r: number; g: number; b: number },
): boolean {
  return bg !== null && bg.r === target.r && bg.g === target.g && bg.b === target.b
}

function countCellsWithBg(
  app: { width: number; height: number; cell: (x: number, y: number) => { bg: any } },
  target: { r: number; g: number; b: number },
): { count: number; coords: Array<[number, number]> } {
  let count = 0
  const coords: Array<[number, number]> = []
  for (let y = 0; y < app.height; y++) {
    for (let x = 0; x < app.width; x++) {
      if (bgEqual(app.cell(x, y).bg, target)) {
        count++
        if (coords.length < 30) coords.push([x, y])
      }
    }
  }
  return { count, coords }
}

// Sample the most-frequent non-null bg in a frame's body (usually the overlay).
function dominantBg(app: {
  width: number
  height: number
  cell: (x: number, y: number) => { bg: { r: number; g: number; b: number } | null }
}): { r: number; g: number; b: number } | null {
  const tally = new Map<string, { rgb: { r: number; g: number; b: number }; n: number }>()
  for (let y = 0; y < app.height; y++) {
    for (let x = 0; x < app.width; x++) {
      const bg = app.cell(x, y).bg
      if (!bg) continue
      const key = `${bg.r},${bg.g},${bg.b}`
      const e = tally.get(key) ?? { rgb: bg, n: 0 }
      e.n++
      tally.set(key, e)
    }
  }
  let best: { rgb: { r: number; g: number; b: number }; n: number } | null = null
  for (const e of tally.values()) {
    if (!best || e.n > best.n) best = e
  }
  return best?.rgb ?? null
}

describe("regression: popover-unmount bg residue", () => {
  test("absolute child with backgroundColor unmounts cleanly (no stale bg cells)", () => {
    function App({ showPopover }: { showPopover: boolean }) {
      return (
        <Box flexDirection="column" width={82} height={20}>
          <Text>row 0 — anchor row</Text>
          <Box flexDirection="row" flexGrow={1}>
            <Text>card content (under the popover)</Text>
            {showPopover ? (
              <Box
                position="absolute"
                top={3}
                left={20}
                width={14}
                height={5}
                backgroundColor={POPOVER_HEX}
              >
                <Text>popover</Text>
              </Box>
            ) : null}
          </Box>
        </Box>
      )
    }

    const r = createRenderer({ cols: 82, rows: 20 })

    // Frame 1: popover visible — sample the actual rendered overlay bg
    const app = r(<App showPopover={true} />)
    const overlayBg = dominantBg(app)
    expect(overlayBg, "expected an overlay bg color in the open frame").not.toBeNull()
    if (!overlayBg) return

    const open = countCellsWithBg(app, overlayBg)
    expect(open.count, "open frame must paint the overlay").toBeGreaterThan(0)

    // Frame 2: popover unmounts
    app.rerender(<App showPopover={false} />)

    // Assertion: no cells with the popover's bg color should remain.
    const after = countCellsWithBg(app, overlayBg)
    expect(
      after.count,
      `stale popover-bg cells (${after.count}) at ${JSON.stringify(after.coords)}`,
    ).toBe(0)
  })

  test("absolute child unmount in a row layout (matches captured 14-cell strip pattern)", () => {
    function App({ open }: { open: boolean }) {
      return (
        <Box flexDirection="column" width={82} height={20}>
          {Array.from({ length: 18 }, (_, i) => (
            <Box key={i} flexDirection="row">
              <Text>line {i}</Text>
            </Box>
          ))}
          {open ? (
            <Box
              position="absolute"
              top={5}
              left={65}
              width={14}
              height={6}
              backgroundColor={POPOVER_HEX}
              borderStyle="round"
            >
              <Text>preview</Text>
            </Box>
          ) : null}
        </Box>
      )
    }

    const r = createRenderer({ cols: 82, rows: 20 })
    const app = r(<App open={true} />)

    const overlayBg = dominantBg(app)
    expect(overlayBg, "expected an overlay bg color in the open frame").not.toBeNull()
    if (!overlayBg) return

    const open = countCellsWithBg(app, overlayBg)
    expect(open.count, `overlay should paint when open; got ${open.count}`).toBeGreaterThan(0)

    app.rerender(<App open={false} />)
    const after = countCellsWithBg(app, overlayBg)
    expect(
      after.count,
      `overlay-bg residue (${after.count}) at ${JSON.stringify(after.coords)}`,
    ).toBe(0)
  })
})
