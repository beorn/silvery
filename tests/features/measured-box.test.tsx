/**
 * MeasuredBox primitive — render-prop wrapper that defers rendering its
 * children until its own measured rect is non-zero.
 *
 * Eliminates the "render with width=0 then re-render with real width" flash
 * that consumers using `useBoxRect()` hand-roll today.
 *
 * Source: bead km-silvery.measuredbox-primitive (P0).
 */
import { describe, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { Box, Text, MeasuredBox, useBoxRect } from "silvery"

describe("MeasuredBox", () => {
  test("never renders children with width=0", () => {
    const r = createRenderer({ cols: 80, rows: 10 })

    const observedWidths: number[] = []

    function Probe({ width }: { width: number }) {
      observedWidths.push(width)
      return <Text>w={width}</Text>
    }

    const app = r(
      <MeasuredBox width={50} height={3} flexDirection="column" alignItems="center">
        {({ width }) => <Probe width={width} />}
      </MeasuredBox>,
    )

    // The Probe must NEVER be called with width=0.
    expect(observedWidths.every((w) => w > 0)).toBe(true)
    // It must have been called at least once with the real width.
    expect(observedWidths.length).toBeGreaterThan(0)

    // No frame should contain "w=0" — even on the very first paint.
    for (const frame of app.frames) {
      expect(frame).not.toMatch(/w=0\b/)
    }

    // Final visible text contains the real width (50 since alignItems=center
    // doesn't constrain main-axis when MeasuredBox has explicit width=50).
    expect(app.text).toContain("w=50")
  })

  test("passes Box props through to the outer measured Box", () => {
    const r = createRenderer({ cols: 80, rows: 10 })

    const app = r(
      <MeasuredBox width={40} height={5} borderStyle="round" padding={1} flexDirection="column">
        {({ width }) => <Text>inner-w={width}</Text>}
      </MeasuredBox>,
    )

    // Border on rounded box.
    expect(app.text).toMatch(/[╭╮╰╯]/)
    // Inner width = outer 40 − 2 (border) − 2 (padding=1 each side) = 36.
    expect(app.text).toContain("inner-w=36")
  })

  test("function-children rect values match useBoxRect", () => {
    const r = createRenderer({ cols: 60, rows: 8 })

    let useBoxRectWidth = -1

    function HookProbe() {
      const { width } = useBoxRect()
      if (width > 0) useBoxRectWidth = width
      return null
    }

    let renderPropWidth = -1

    const app = r(
      <MeasuredBox width={30} height={4} flexDirection="column">
        {({ width }) => {
          renderPropWidth = width
          return (
            <>
              <HookProbe />
              <Text>render-prop-w={width}</Text>
            </>
          )
        }}
      </MeasuredBox>,
    )

    expect(useBoxRectWidth).toBeGreaterThan(0)
    expect(renderPropWidth).toBe(useBoxRectWidth)
    expect(app.text).toContain(`render-prop-w=${useBoxRectWidth}`)
  })

  test("plain ReactNode children are deferred until measured", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    let renderCount = 0
    function Tracker() {
      renderCount++
      return <Text>tracked</Text>
    }

    const app = r(
      <MeasuredBox width={20} height={3} flexDirection="column">
        <Tracker />
      </MeasuredBox>,
    )

    // Plain children mount once measurement is available.
    expect(renderCount).toBeGreaterThan(0)
    expect(app.text).toContain("tracked")
  })
})
