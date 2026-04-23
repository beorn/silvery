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

describe("ListView overscroll bump — already-at-edge intent", () => {
  test("pressing j after navigating to the last item fires bottom overscroll indicator", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView
        items={ITEMS}
        height={4}
        nav
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )

    // Navigate to the last item by pressing j repeatedly. Each press scrolls
    // the viewport as the cursor moves past visible bounds.
    for (let i = 0; i < ITEMS.length - 1; i++) {
      await app.press("j")
    }

    // Now at the last item. One more `j` is an intent to move past the end
    // — cursor clamps, but intent is bottom overscroll.
    await app.press("j")

    const scanUnderline = (): boolean => {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 30; col++) {
          if (app.cell(col, row).underline === "single") return true
        }
      }
      return false
    }
    expect(scanUnderline()).toBe(true)
  })

  test("pressing k at first item fires top overscroll indicator", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView
        items={ITEMS}
        height={4}
        nav
        cursor={0} // Start at the FIRST item.
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )

    await app.press("k")

    // Top indicator renders as overline on the first visible row (row 0).
    let sawOverline = false
    for (let col = 0; col < 30; col++) {
      if (app.cell(col, 0).overline === true) {
        sawOverline = true
        break
      }
    }
    expect(sawOverline).toBe(true)
  })

  test("pressing j at mid-list (not at edge) does NOT fire bump", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView
        items={ITEMS}
        height={4}
        nav
        cursor={2} // Mid-list — lots of room to move in either direction.
        renderItem={(item) => <Text>{item}</Text>}
      />,
    )

    await app.press("j")

    // Neither edge indicator should be active — scan whole frame.
    let sawUnderline = false
    let sawOverline = false
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 30; col++) {
        if (app.cell(col, row).underline === "single") sawUnderline = true
        if (app.cell(col, row).overline === true) sawOverline = true
      }
    }
    expect(sawUnderline).toBe(false)
    expect(sawOverline).toBe(false)
  })

  test("ArrowDown after reaching last item fires bump (keyboard equivalence to j)", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )

    // Navigate to last item with ArrowDown.
    for (let i = 0; i < ITEMS.length - 1; i++) {
      await app.press("ArrowDown")
    }
    await app.press("ArrowDown") // One past — intent to overscroll.

    let sawUnderline = false
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 30; col++) {
        if (app.cell(col, row).underline === "single") {
          sawUnderline = true
          break
        }
      }
      if (sawUnderline) break
    }
    expect(sawUnderline).toBe(true)
  })

  test("G from last item is idempotent — no bump (request = cap, not past-edge)", async () => {
    // `G` requests `items.length - 1` explicitly — exactly the cap. Our
    // intent check uses `next > items.length - 1` (strict), so this should
    // NOT bump when already at the last item. `G` is a jump-to-end command,
    // not an overscroll command.
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    // Navigate to last via repeated j.
    for (let i = 0; i < ITEMS.length - 1; i++) {
      await app.press("j")
    }
    // Now press `G` — asks for items.length-1, already there. No bump.
    await app.press("G")

    let sawUnderline = false
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 30; col++) {
        if (app.cell(col, row).underline === "single") {
          sawUnderline = true
          break
        }
      }
      if (sawUnderline) break
    }
    expect(sawUnderline).toBe(false)
  })
})
