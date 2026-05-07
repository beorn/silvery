/**
 * Tests for `useResponsiveValue` — pick a value per terminal-width breakpoint.
 *
 * Mirrors CSS `@media` / Polaris responsive tokens. Reactive on resize
 * (SIGWINCH in production; `app.resize()` in tests).
 *
 * Default thresholds (mobile-first cumulative):
 *   xs = 30, sm = 60, md = 90, lg = 120, xl = 150
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { useResponsiveValue, DEFAULT_BREAKPOINTS } from "@silvery/ag-react"

describe("useResponsiveValue — default breakpoints", () => {
  function Probe() {
    const value = useResponsiveValue<string>({
      default: "default",
      xs: "xs",
      sm: "sm",
      md: "md",
      lg: "lg",
      xl: "xl",
    })
    return <Text>{`v=${value}`}</Text>
  }

  test.each([
    [20, "default"], // below xs
    [30, "xs"], //   == xs
    [45, "xs"], //   xs..sm-1
    [60, "sm"], //   == sm
    [80, "sm"], //   sm..md-1
    [90, "md"], //   == md
    [110, "md"], //  md..lg-1
    [120, "lg"], //  == lg
    [140, "lg"], //  lg..xl-1
    [150, "xl"], //  == xl
    [200, "xl"], //  > xl
  ])("cols=%i picks %s", (cols, expected) => {
    const render = createRenderer({ cols, rows: 5 })
    const app = render(
      <Box width={cols} height={5}>
        <Probe />
      </Box>,
    )
    expect(app.text).toContain(`v=${expected}`)
  })

  test("missing breakpoints fall through to the next-lower defined value", () => {
    function PartialProbe() {
      // only default + md defined — sm-range falls through to default,
      // lg/xl ranges fall through to md.
      const value = useResponsiveValue<string>({ default: "small", md: "wide" })
      return <Text>{`v=${value}`}</Text>
    }

    {
      const render = createRenderer({ cols: 50, rows: 3 })
      const app = render(
        <Box width={50} height={3}>
          <PartialProbe />
        </Box>,
      )
      expect(app.text).toContain("v=small") // < md → default
    }

    {
      const render = createRenderer({ cols: 100, rows: 3 })
      const app = render(
        <Box width={100} height={3}>
          <PartialProbe />
        </Box>,
      )
      expect(app.text).toContain("v=wide") // >= md → md
    }

    {
      const render = createRenderer({ cols: 200, rows: 3 })
      const app = render(
        <Box width={200} height={3}>
          <PartialProbe />
        </Box>,
      )
      // xl undefined; lg undefined → falls back to md
      expect(app.text).toContain("v=wide")
    }
  })
})

describe("useResponsiveValue — overrides", () => {
  test("breakpoint thresholds can be overridden per call", () => {
    function CustomProbe() {
      // Push md up to 100, so cols=95 stays at sm even though it would normally be md
      const value = useResponsiveValue<string>(
        { default: "tiny", sm: "small", md: "medium" },
        { breakpoints: { md: 100 } },
      )
      return <Text>{`v=${value}`}</Text>
    }

    const render = createRenderer({ cols: 95, rows: 3 })
    const app = render(
      <Box width={95} height={3}>
        <CustomProbe />
      </Box>,
    )
    expect(app.text).toContain("v=small") // 95 < custom md=100, falls back to sm
  })
})

describe("useResponsiveValue — reactivity", () => {
  // term.size coalesces resize events with a ~16ms timer (RESIZE_COALESCE_MS).
  // After resize() schedules the coalesce, we wait past the timer + flush
  // microtasks (deferred useBoxRect's signal commit happens at a microtask
  // boundary) and then force a fresh paint via rerender() — the test renderer
  // doesn't auto-flush React commits to the buffer (autoRender: false) the
  // way production runs do.
  const waitForResize = async () => {
    await new Promise((r) => setTimeout(r, 50))
    for (let i = 0; i < 3; i++) await Promise.resolve()
  }

  test("resize re-evaluates and rerenders with new breakpoint value", async () => {
    function Probe() {
      const value = useResponsiveValue<string>({
        default: "narrow",
        sm: "compact",
        md: "wide",
      })
      return <Text>{`v=${value}`}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    const app = render(<Probe />)
    expect(app.text).toContain("v=narrow") // 40 < sm(60) → default

    app.resize(75, 3)
    await waitForResize()
    app.rerender(<Probe />)
    expect(app.text).toContain("v=compact") // 75 in sm..md → sm

    app.resize(120, 3)
    await waitForResize()
    app.rerender(<Probe />)
    expect(app.text).toContain("v=wide") // 120 >= md → md
  })
})

describe("useResponsiveValue — DEFAULT_BREAKPOINTS export", () => {
  test("exposes Bootstrap/Tailwind/Polaris-style defaults", () => {
    expect(DEFAULT_BREAKPOINTS).toEqual({
      xs: 30,
      sm: 60,
      md: 90,
      lg: 120,
      xl: 150,
    })
  })
})
