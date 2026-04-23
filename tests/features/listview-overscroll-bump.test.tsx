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

    // Corner-line indicator: 10-char "━" string positioned in the corner.
    const scanCornerLine = (): boolean => {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 30; col++) {
          if (app.cell(col, row).char === "━") return true
        }
      }
      return false
    }
    expect(scanCornerLine()).toBe(true)
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

    // Top indicator renders as 10-char "━" string in the top-right corner (row 0).
    let sawDash = false
    for (let col = 0; col < 30; col++) {
      if (app.cell(col, 0).char === "━") {
        sawDash = true
        break
      }
    }
    expect(sawDash).toBe(true)
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

    // Neither edge indicator should be active — scan whole frame for the dash.
    let sawDash = false
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 30; col++) {
        if (app.cell(col, row).char === "━") sawDash = true
      }
    }
    expect(sawDash).toBe(false)
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

    let sawDash = false
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 30; col++) {
        if (app.cell(col, row).char === "━") {
          sawDash = true
          break
        }
      }
      if (sawDash) break
    }
    expect(sawDash).toBe(true)
  })

  test("wheel-down when already at bottom fires bump on first event", async () => {
    // Reproduce: user navigates to the last item so the viewport is flush
    // against the bottom. A single wheel-down event is an intent to overscroll
    // — bottom indicator should fire immediately, NOT only after a second
    // event that "transitions into" the edge. The old `rawNext > maxRow`
    // strict inequality missed the "seeded at maxRow, push past" case.
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    // Navigate to the last item so the viewport is flush against the bottom.
    for (let i = 0; i < ITEMS.length - 1; i++) await app.press("j")
    // This first-round j sequence also ends with a bump at the last item;
    // wait for EDGE_BUMP_SHOW_MS to elapse so we can measure the wheel's
    // bump in isolation. 700 ms > EDGE_BUMP_SHOW_MS (600 ms).
    await new Promise((r) => setTimeout(r, 700))

    // Scan before wheel — no indicator should be visible (bump expired).
    const scanUnderline = (): boolean => {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 30; col++) {
          if (app.cell(col, row).char === "━") return true
        }
      }
      return false
    }
    app.rerender(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    expect(scanUnderline()).toBe(false)

    // Wheel down at a point inside the ListView box. Positive delta = down.
    await app.wheel(5, 2, 1)
    expect(scanUnderline()).toBe(true)
  })

  test("wheel-up when already at top fires bump on first event", async () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    // Starting cursor is already 0 → viewport flush-top. Negative delta = up.
    await app.wheel(5, 2, -1)

    let sawDash = false
    for (let col = 0; col < 30; col++) {
      if (app.cell(col, 0).char === "━") {
        sawDash = true
        break
      }
    }
    expect(sawDash).toBe(true)
  })

  test("overscroll indicator pulses on/off while active", async () => {
    // The indicator should flash dim on/off (EDGE_BUMP_PULSE_MS=250 ms toggle)
    // instead of drawing as a static line. Against inverted chrome, movement
    // is far easier to spot than a static overline/underline.
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
    )
    // Navigate to the last item so we are at the bottom edge.
    for (let i = 0; i < ITEMS.length - 1; i++) await app.press("j")
    // Trigger the bump — cursor is clamped, bottom overscroll fires.
    await app.press("j")

    const scanUnderline = (): boolean => {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 30; col++) {
          if (app.cell(col, row).char === "━") return true
        }
      }
      return false
    }

    // Sample across the first ~500 ms of the bump lifetime (EDGE_BUMP_SHOW_MS
    // = 600 ms, so the whole window fits). Pulse half-period is 250 ms, so
    // 5 samples at 120 ms cadence straddle at minimum one on→off transition.
    const observations: boolean[] = []
    observations.push(scanUnderline())
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 120))
      // Force a repaint so the pulse state is flushed to the buffer.
      app.rerender(
        <ListView items={ITEMS} height={4} nav renderItem={(item) => <Text>{item}</Text>} />,
      )
      observations.push(scanUnderline())
    }

    // At least one sample should have the line visible, and at least one
    // should not — the pulse is toggling on/off.
    expect(observations.some((on) => on)).toBe(true)
    expect(observations.some((on) => !on)).toBe(true)
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

    let sawDash = false
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 30; col++) {
        if (app.cell(col, row).char === "━") {
          sawDash = true
          break
        }
      }
      if (sawDash) break
    }
    expect(sawDash).toBe(false)
  })
})
