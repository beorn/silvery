/**
 * Quality-tier scroll features — covers three opt-in extensions on top of
 * the core `useKineticScroll` physics:
 *
 *   1. `animateToFloat`            — programmatic smooth scroll (cubic ease-out)
 *   2. `enableElasticEdges`        — rubber-band overscroll + spring-back
 *   3. `enableInputCadenceDetection` — trackpad vs mouse-wheel branching
 *
 * Bead context: @km/silvery/scroll-animated-scroll-to,
 * @km/silvery/scroll-elastic-edge-bounce,
 * @km/silvery/scroll-input-cadence-detection.
 *
 * Tests use real timers (matching the sibling `use-kinetic-scroll.test.tsx`
 * style) and budget settle windows generously — the animation loop runs at
 * KINETIC_FRAME_MS=16ms so a 250ms ease-out fully drains within ~280ms.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "../../src/index.js"
import {
  useKineticScroll,
  type UseKineticScrollOptions,
  type UseKineticScrollResult,
} from "../../packages/ag-react/src/hooks/useKineticScroll"

const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface HarnessRef {
  current: UseKineticScrollResult | null
}

function TestHarness({
  apiRef,
  options,
}: {
  apiRef: HarnessRef
  options: UseKineticScrollOptions
}): React.ReactElement {
  apiRef.current = useKineticScroll(options)
  return <Box width={20} height={5} />
}

describe("useKineticScroll — animated scrollTo", () => {
  test("animateToFloat reaches target within the configured duration", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 100 }} />)
    await settle()

    apiRef.current!.animateToFloat(50, 80)
    // Mid-animation: should be partway, not at start, not at target.
    await settle(40)
    const mid = apiRef.current!.scrollFloat
    expect(mid, "mid-animation: position has advanced").toBeGreaterThan(0)
    expect(mid, "mid-animation: not yet at target").toBeLessThan(50)

    // After full duration + a frame, should land at target exactly.
    await settle(80)
    expect(apiRef.current!.scrollFloat, "lands at target after duration").toBe(50)
  })

  test("animateToFloat clamps target to [0, maxScroll]", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 50 }} />)
    await settle()

    apiRef.current!.animateToFloat(999, 30)
    await settle(80)
    expect(apiRef.current!.scrollFloat).toBe(50)

    apiRef.current!.animateToFloat(-100, 30)
    await settle(80)
    expect(apiRef.current!.scrollFloat).toBe(0)
  })

  test("user wheel during animation cancels it", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 100 }} />)
    await settle()

    apiRef.current!.animateToFloat(80, 200)
    await settle(40)
    const beforeWheel = apiRef.current!.scrollFloat
    expect(beforeWheel, "animation has started").toBeGreaterThan(0)
    expect(beforeWheel, "animation hasn't completed").toBeLessThan(80)

    // User takes over with a wheel event — stops the animation.
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(80)
    // Should NOT have continued the original animation toward 80.
    // Position is wherever the wheel + (no momentum buffer) put us.
    expect(
      apiRef.current!.scrollFloat,
      "animation cancelled — not at the original target",
    ).toBeLessThan(80)
  })

  test("animateToFloat with tiny delta snaps instantly", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 100 }} />)
    await settle()
    apiRef.current!.setScrollFloat(40)
    await settle()
    apiRef.current!.animateToFloat(40.2, 200)
    // No animation needed — snaps and is done.
    await settle(20)
    expect(apiRef.current!.scrollFloat).toBe(40.2)
  })
})

describe("useKineticScroll — elastic edges", () => {
  test("wheel past top edge overshoots with resistance when elastic enabled", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 100, enableElasticEdges: true }} />)
    await settle()

    // Already at top — push further up. Five upward wheels.
    for (let i = 0; i < 5; i++) {
      apiRef.current!.onWheel({ deltaY: -1 })
      await settle(20)
    }
    const overshoot = apiRef.current!.scrollFloat
    expect(overshoot, "elastic overshoot goes below 0").toBeLessThan(0)
    // Resistance bounds the overshoot — never below -ELASTIC_BUDGET_ROWS (3).
    expect(overshoot, "overshoot stays within budget").toBeGreaterThanOrEqual(-3)
  })

  test("disabled elastic clamps to bound (regression — default off)", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 100 }} />)
    await settle()

    for (let i = 0; i < 5; i++) {
      apiRef.current!.onWheel({ deltaY: -1 })
      await settle(20)
    }
    expect(apiRef.current!.scrollFloat, "without elastic, hard-clamps at 0").toBe(0)
  })

  test("spring-back returns to bound after wheel release", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 100, enableElasticEdges: true }} />)
    await settle()

    // Push past bottom edge.
    apiRef.current!.setScrollFloat(100)
    await settle(10)
    for (let i = 0; i < 5; i++) {
      apiRef.current!.onWheel({ deltaY: 1 })
      await settle(20)
    }
    expect(apiRef.current!.scrollFloat, "overshot past 100").toBeGreaterThan(100)

    // Wait for release timeout (~60ms) + spring-back (200ms) + slack.
    await settle(350)
    // Land within a tenth of a row — the state-dedup threshold in
    // `updatePosition` (Math.abs < 0.001) intentionally swallows sub-row
    // drift on the final tick, so the state value can sit ~ε below maxS
    // even though the ref has been written to exact maxS.
    expect(apiRef.current!.scrollFloat, "spring-back lands at maxScroll").toBeCloseTo(100, 1)
  })

  test("rendered scrollOffset always clamps even when float overshoots", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 100, enableElasticEdges: true }} />)
    await settle()

    for (let i = 0; i < 5; i++) {
      apiRef.current!.onWheel({ deltaY: -1 })
      await settle(20)
    }
    expect(apiRef.current!.scrollFloat).toBeLessThan(0)
    expect(apiRef.current!.scrollOffset, "rendered offset never goes negative").toBe(0)
  })
})

describe("useKineticScroll — input cadence detection", () => {
  test("discrete cadence (large gaps + |deltaY|=1) jumps in larger steps", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(
      <TestHarness
        apiRef={apiRef}
        options={{ maxScroll: 1000, enableInputCadenceDetection: true }}
      />,
    )
    await settle()

    // Three events with 80ms gaps — well above CADENCE_DISCRETE_GAP_MS=50.
    // The first event has no predecessor so cadence stays "unknown" and
    // applies the continuous-step (1 row). The second establishes
    // "discrete" and jumps DISCRETE_STEP_MULTIPLIER=3 rows.
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(80)
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(80)
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(80)

    // First event = 1 row, then two more = 3 rows each → 1 + 3 + 3 = 7.
    expect(apiRef.current!.scrollFloat, "discrete-cadence events jump multiple rows").toBe(7)
  })

  test("continuous cadence (tight gaps) keeps single-row physics", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(
      <TestHarness
        apiRef={apiRef}
        options={{ maxScroll: 1000, enableInputCadenceDetection: true }}
      />,
    )
    await settle()

    // Six events back-to-back (no gap) — well under CADENCE_CONTINUOUS_GAP_MS=30.
    for (let i = 0; i < 6; i++) {
      apiRef.current!.onWheel({ deltaY: 1 })
    }
    await settle()
    expect(apiRef.current!.scrollFloat, "continuous cadence stays at 1-row-per-event").toBeCloseTo(
      6,
      5,
    )
  })

  test("cadence detection disabled by default — old behaviour preserved", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 1000 }} />)
    await settle()

    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(80)
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(80)

    // Without the flag, large gaps don't switch to discrete mode — both
    // events apply 1 row.
    expect(apiRef.current!.scrollFloat).toBe(2)
  })
})

describe("useKineticScroll — optional momentum", () => {
  test("enableMomentum=false does not synthesize post-wheel motion", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(<TestHarness apiRef={apiRef} options={{ maxScroll: 1000, enableMomentum: false }} />)
    await settle()

    for (let i = 0; i < 8; i++) {
      apiRef.current!.onWheel({ deltaY: 1 })
    }
    await settle()
    const afterWheel = apiRef.current!.scrollFloat

    await settle(250)
    expect(apiRef.current!.scrollFloat, "no synthetic coast after release").toBe(afterWheel)
  })
})
