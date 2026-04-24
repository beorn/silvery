/**
 * ListView overscroll indicator — intent-based edge-bump detection.
 *
 * Bead: km-silvery.overline-attr (intent-based overscroll bump fix scoped
 *       here; wheel-handler-side coverage follows in a dedicated bead).
 *
 * Regression: when a nav-mode ListView starts with the cursor ALREADY at the
 * last item, pressing `j` / ArrowDown did not fire the bottom overscroll
 * indicator. The setCursorSilently clamp swallowed the intent before the
 * bump detector could see "tried to move past the edge". Mirror bug for
 * cursor=0 + `k` / ArrowUp.
 *
 * The fix compares the REQUESTED target against `items.length - 1` / `0`
 * BEFORE clamping so intent alone triggers the bump.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { ListView, Text } from "@silvery/ag-react"

const ITEMS = ["one", "two", "three", "four", "five", "six", "seven", "eight"]

/** The corner-line indicator uses block chars ▔ (top) / ▁ (bottom). */
const INDICATOR_GLYPHS = new Set(["▔", "▁"])

function hasIndicator(app: { cell: (col: number, row: number) => { char: string } }, cols = 30, rows = 6): boolean {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (INDICATOR_GLYPHS.has(app.cell(col, row).char)) return true
    }
  }
  return false
}

function hasIndicatorOnRow(app: { cell: (col: number, row: number) => { char: string } }, row: number, cols = 30): boolean {
  for (let col = 0; col < cols; col++) {
    if (INDICATOR_GLYPHS.has(app.cell(col, row).char)) return true
  }
  return false
}

describe("ListView overscroll bump — already-at-edge intent", () => {
  test("pressing j after navigating to the last item fires bottom overscroll indicator", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    for (let i = 0; i < ITEMS.length - 1; i++) {
      await app.press("j")
    }
    await app.press("j")
    expect(hasIndicator(app)).toBe(true)
  })

  test("pressing k at first item fires top overscroll indicator", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav cursor={0} renderItem={(item) => <Text>{item}</Text>} />,
    )
    await app.press("k")
    expect(hasIndicatorOnRow(app, 0)).toBe(true)
  })

  test("pressing j at mid-list (not at edge) does NOT fire bump", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav cursor={2} renderItem={(item) => <Text>{item}</Text>} />,
    )
    await app.press("j")
    expect(hasIndicator(app)).toBe(false)
  })

  test("ArrowDown after reaching last item fires bump (keyboard equivalence to j)", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    for (let i = 0; i < ITEMS.length - 1; i++) {
      await app.press("ArrowDown")
    }
    await app.press("ArrowDown")
    expect(hasIndicator(app)).toBe(true)
  })

  test("wheel-down when already at bottom fires bump on first event", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    for (let i = 0; i < ITEMS.length - 1; i++) await app.press("j")
    // Wait for the pre-existing bump (from the last j) to clear before
    // measuring the wheel's bump in isolation. 1700 ms > EDGE_BUMP_SHOW_MS
    // + EDGE_BUMP_COOLDOWN_MS.
    await new Promise((r) => setTimeout(r, 1700))

    app.rerender(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    expect(hasIndicator(app)).toBe(false)

    await app.wheel(5, 2, 1)
    expect(hasIndicator(app)).toBe(true)
  })

  test("wheel-up when already at top fires bump on first event", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    await app.wheel(5, 2, -1)
    expect(hasIndicatorOnRow(app, 0)).toBe(true)
  })

  // Note on timing-sensitive behavior (pulse on/off, auto-hide after
  // EDGE_BUMP_SHOW_MS, cooldown after EDGE_BUMP_COOLDOWN_MS): those are
  // driven by setInterval/setTimeout inside React useEffect, which doesn't
  // visibly advance in `createRenderer`'s synchronous frame model without
  // explicit rerender ticks. We cover pulsing in the live harness
  // separately; the unit tests here assert the IMMEDIATE-after-input
  // rendering contract (indicator character appears after bump intent).
})
