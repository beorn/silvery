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

function busyWait(ms: number): void {
  const start = performance.now()
  while (performance.now() - start < ms) {
    // Simulate a render/logging turn that blocks timer callbacks.
  }
}

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
        options={{ maxScroll: 1000, enableInputCadenceDetection: true, enableMomentum: false }}
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
        options={{ maxScroll: 1000, enableInputCadenceDetection: true, enableMomentum: false }}
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

  test("continuous cadence keeps inertial tail from becoming discrete jumps", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(
      <TestHarness
        apiRef={apiRef}
        options={{ maxScroll: 1000, enableInputCadenceDetection: true, enableMomentum: false }}
      />,
    )
    await settle()

    // First establish a continuous trackpad stream, then let the inertial
    // tail spread out beyond the mouse-wheel discrete threshold. The tail
    // is still part of the same gesture and must stay one row per packet.
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(10)
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(10)
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(80)
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(80)
    apiRef.current!.onWheel({ deltaY: 1 })
    await settle(20)

    expect(apiRef.current!.scrollFloat, "continuous tail stays continuous").toBe(5)
  })

  test("smoothWheelPackets drains same-turn trackpad bursts over frame budget", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(
      <TestHarness
        apiRef={apiRef}
        options={{
          maxScroll: 1000,
          enableInputCadenceDetection: true,
          enableMomentum: false,
          smoothWheelPackets: true,
        }}
      />,
    )
    await settle()

    // Real terminal trackpad traces can batch 13-16 same-timestamp SGR
    // wheel packets. The old path applied all of them before the next
    // paint, producing a visible row jump. Smooth packet mode preserves
    // total distance but caps the first paint to the frame budget.
    for (let i = 0; i < 16; i++) {
      apiRef.current!.onWheel({ deltaY: 1 })
    }

    await settle(5)
    expect(apiRef.current!.scrollFloat, "first paint is capped").toBeLessThanOrEqual(4)

    await settle(90)
    expect(apiRef.current!.scrollFloat, "burst eventually drains in full").toBe(16)
  })

  test("smoothWheelPackets does not freeze if timers are starved between real-time packet groups", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(
      <TestHarness
        apiRef={apiRef}
        options={{
          maxScroll: 1000,
          enableInputCadenceDetection: true,
          enableMomentum: false,
          smoothWheelPackets: true,
        }}
      />,
    )
    await settle()

    for (let i = 0; i < 12; i++) {
      apiRef.current!.onWheel({ deltaY: 1 })
    }
    expect(apiRef.current!.getScrollFloat(), "first packet group consumes one frame budget").toBe(4)

    const start = performance.now()
    while (performance.now() - start < 25) {
      // Simulate a busy render/logging turn: wall-clock time advances, but the
      // setTimeout-based smooth-drain callback cannot run yet.
    }

    for (let i = 0; i < 12; i++) {
      apiRef.current!.onWheel({ deltaY: 1 })
    }
    expect(
      apiRef.current!.getScrollFloat(),
      "next real-time packet group should move immediately, not wait for the starved drain timer",
    ).toBe(8)

    await settle(150)
    expect(apiRef.current!.scrollFloat, "both packet groups eventually drain in full").toBe(24)
  })

  test("smoothWheelPackets catches up after a starved captured flick instead of adding a long tail", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(
      <TestHarness
        apiRef={apiRef}
        options={{
          maxScroll: 1000,
          enableInputCadenceDetection: true,
          enableMomentum: false,
          smoothWheelPackets: true,
        }}
      />,
    )
    await settle()

    // Packet-group counts from the user's 2026-05-16 08:51 trace. The busy
    // wait forces the worst case we saw live: wheel input keeps arriving while
    // render work prevents the smooth-drain timer from running on schedule.
    const groups = [
      1, 1, 11, 42, 26, 9, 22, 18, 10, 2, 15, 3, 6, 7, 6, 3, 3, 2, 1, 2, 1, 1, 2, 1, 1,
    ]
    for (const events of groups) {
      for (let i = 0; i < events; i++) {
        apiRef.current!.onWheel({ deltaY: 1 })
      }
      busyWait(8)
    }

    const afterInput = apiRef.current!.getScrollFloat()
    expect(afterInput, "input turn should still move immediately").toBeGreaterThan(30)

    await settle(320)
    expect(apiRef.current!.scrollFloat, "captured flick backlog drains by the deadline").toBe(196)
    const afterDeadline = apiRef.current!.scrollFloat

    await settle(160)
    expect(apiRef.current!.scrollFloat, "no extra post-input tail after the backlog is gone").toBe(
      afterDeadline,
    )
  })

  test("smoothWheelPackets does not speed up after a starved captured flick releases", async () => {
    const apiRef: HarnessRef = { current: null }
    const r = createRenderer({ cols: 30, rows: 8 })
    r(
      <TestHarness
        apiRef={apiRef}
        options={{
          maxScroll: 1000,
          enableInputCadenceDetection: true,
          enableMomentum: false,
          smoothWheelPackets: true,
        }}
      />,
    )
    await settle()

    const groups = [
      1, 1, 11, 42, 26, 9, 22, 18, 10, 2, 15, 3, 6, 7, 6, 3, 3, 2, 1, 2, 1, 1, 2, 1, 1,
    ]
    for (const events of groups) {
      for (let i = 0; i < events; i++) {
        apiRef.current!.onWheel({ deltaY: 1 })
      }
      busyWait(8)
    }

    const afterInput = apiRef.current!.getScrollFloat()
    expect(
      afterInput,
      "captured input should not be mostly deferred until after release",
    ).toBeGreaterThanOrEqual(90)

    await settle(220)
    const final = apiRef.current!.scrollFloat
    expect(final).toBe(196)
    expect(
      final - afterInput,
      "post-input drain should not dominate the input-owned motion",
    ).toBeLessThanOrEqual(afterInput + 8)
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
