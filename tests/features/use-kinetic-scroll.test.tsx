/**
 * Regression test for `useKineticScroll`'s gesture-state preservation.
 *
 * `nudgeScrollFloat` must NOT reset the internal `WheelGestureFilter` —
 * otherwise a layout-anchor reflow during a sustained scroll would clear
 * the streaming-direction state and the next opposite-direction wheel
 * event would commit as a fresh gesture (allowing trackpad inertia
 * bounces to seed a viewport reversal). `setScrollFloat`, by contrast,
 * IS user-driven (e.g. scrollbar click-to-position) and SHOULD reset.
 *
 * Bead context: km-silvery.scroll-top-edge-oscillation traced wrong
 * resets to gestures slipping through a buffer-empty boundary; the same
 * shape recurs whenever any post-mount API call quietly resets filter
 * state mid-gesture.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "../../src/index.js"
import {
  useKineticScroll,
  type UseKineticScrollResult,
} from "../../packages/ag-react/src/hooks/useKineticScroll"

const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface HarnessRef {
  current: UseKineticScrollResult | null
}

function TestHarness({ apiRef }: { apiRef: HarnessRef }): React.ReactElement {
  const result = useKineticScroll({ maxScroll: 100, enableSameDirCompounding: true })
  apiRef.current = result
  return <Box width={20} height={5} />
}

describe("useKineticScroll", () => {
  test("nudgeScrollFloat preserves gesture state — lone opposite stays buffered", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} />)
    await settle()
    expect(apiRef.current).not.toBeNull()

    // Sustained downward gesture (deltaY=+1 → viewport advances). Five
    // events put the WheelGestureFilter solidly in "streaming dir=+1".
    for (let i = 0; i < 5; i++) {
      apiRef.current!.onWheel({ deltaY: 1 })
    }
    await settle()
    const advancedFloat = apiRef.current!.scrollFloat
    expect(advancedFloat, "viewport must advance after 5 downward wheels").toBeGreaterThan(0)

    // Anchoring-style reflow: nudge the float without disturbing gesture
    // state. The filter must remain in streaming dir=+1.
    apiRef.current!.nudgeScrollFloat(advancedFloat + 5)
    await settle()
    const afterNudge = apiRef.current!.scrollFloat
    expect(afterNudge, "nudge moves the float").toBe(advancedFloat + 5)

    // First opposite-direction wheel event after nudge: with filter still
    // streaming dir=+1, this lands in the "pending" state and produces
    // ZERO displacement. If nudge had reset the filter, the opposite
    // event would commit immediately and `scrollFloat` would decrease.
    apiRef.current!.onWheel({ deltaY: -1 })
    await settle()
    expect(
      apiRef.current!.scrollFloat,
      "lone opposite after nudge must be filtered (no displacement)",
    ).toBe(afterNudge)
  })

  test("setScrollFloat resets gesture state — opposite wheel applies immediately", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} />)
    await settle()

    // Same sustained downward gesture.
    for (let i = 0; i < 5; i++) {
      apiRef.current!.onWheel({ deltaY: 1 })
    }
    await settle()
    const advancedFloat = apiRef.current!.scrollFloat
    expect(advancedFloat).toBeGreaterThan(0)

    // User-driven setScrollFloat (e.g. scrollbar click) — gesture state
    // resets so the next wheel event is a brand new gesture.
    apiRef.current!.setScrollFloat(advancedFloat + 5)
    await settle()
    const afterSet = apiRef.current!.scrollFloat
    expect(afterSet).toBe(advancedFloat + 5)

    // Opposite wheel event after setScrollFloat: filter is back to idle,
    // so a single -1 establishes a NEW streaming dir=-1 and applies the
    // displacement immediately.
    apiRef.current!.onWheel({ deltaY: -1 })
    await settle()
    expect(
      apiRef.current!.scrollFloat,
      "opposite after setScrollFloat must apply (filter was reset)",
    ).toBeLessThan(afterSet)
  })

  test("reset arms getInitialFloat for the next wheel event", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} />)
    await settle()

    apiRef.current!.setScrollFloat(50)
    await settle()
    expect(apiRef.current!.scrollFloat).toBe(50)

    // Reset the gesture state. Without an explicit getInitialFloat
    // configured here, the seed defaults to the current scrollFloat —
    // so the next wheel event applies displacement from 50, not 0.
    apiRef.current!.reset()
    await settle()
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle()
    expect(apiRef.current!.scrollFloat, "wheel after reset starts from current float").toBe(51)
  })
})
