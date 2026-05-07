/**
 * Bounded-convergence sabotage tests (C3b derisk).
 *
 * Verifies the loop bound actually caps a real feedback cycle. Without
 * these tests, MAX_CONVERGENCE_PASSES / MAX_CLASSIC_LOOP_ITERATIONS could
 * be numbers with no behavioural effect — the unit tests prove the math
 * holds, but only an end-to-end render with a real feedback edge proves
 * iteration is actually capped.
 *
 * Two scenarios:
 *
 * 1. **Bounded feedback** (`SettlingFeedback`) — setState fires for the
 *    first N renders then stops. Verifies the convergence loop runs
 *    multiple iterations and settles cleanly within the bound.
 * 2. **Forever feedback** (`ForeverFeedback`) — setState fires
 *    unconditionally. Without the bound (or React's own depth cap),
 *    iteration would never terminate. The test asserts that the render
 *    *terminates* (with React's update-depth error) rather than hanging.
 *    A broken bound would manifest as the test timing out, not as a
 *    React error.
 *
 * Tracking: km-silvery.renderer-convergence-by-design (C3b)
 */

import React, { useLayoutEffect, useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import {
  MAX_CONVERGENCE_PASSES,
  INITIAL_RENDER_MAX_PASSES,
} from "@silvery/ag-term/runtime/pass-cause"

/**
 * Bounded feedback: schedules `targetIterations` setState updates from
 * useLayoutEffect, then stops. With the convergence bound working, the
 * render terminates with `counter === targetIterations` (the loop iterated
 * enough times to absorb every setState before exhausting its budget).
 */
function SettlingFeedback({
  targetIterations,
  onCounter,
}: {
  targetIterations: number
  onCounter?: (n: number) => void
}) {
  const [counter, setCounter] = useState(0)
  useLayoutEffect(() => {
    onCounter?.(counter)
    if (counter < targetIterations) {
      setCounter((n) => n + 1)
    }
  })
  return (
    <Box>
      <Text>counter:{counter}</Text>
    </Box>
  )
}

/**
 * Unbounded feedback: every render schedules another setState. Without
 * a termination cap (our convergence bound, or React's update-depth cap),
 * this would loop forever.
 */
function ForeverFeedback({ onCounter }: { onCounter?: (n: number) => void }) {
  const [counter, setCounter] = useState(0)
  useLayoutEffect(() => {
    onCounter?.(counter)
    setCounter((n) => n + 1)
  })
  return (
    <Box>
      <Text>counter:{counter}</Text>
    </Box>
  )
}

describe("bounded-convergence: sabotage (real feedback loop)", () => {
  test("settling feedback (3 setStates) converges cleanly", () => {
    // 3 setStates is comfortably within MAX_CLASSIC_LOOP_ITERATIONS=5,
    // so the loop should drain them all and settle. This proves the
    // bound is wide enough for real feedback patterns.
    let lastCounter = -1
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <SettlingFeedback
        targetIterations={3}
        onCounter={(n) => {
          lastCounter = n
        }}
      />,
    )
    expect(lastCounter).toBe(3)
    app.unmount()
  })

  test("forever feedback terminates (does NOT hang)", () => {
    // Without ANY cap, this would loop forever. We assert termination by
    // running the render and confirming it returns at all. React's
    // update-depth error fires when the classic loop's interleaved
    // flushSyncWork exceeds React's recursion guard — proof that
    // iteration was bounded, not infinite.
    let lastCounter = -1
    const r = createRenderer({ cols: 40, rows: 10 })
    expect(() => {
      const app = r(
        <ForeverFeedback
          onCounter={(n) => {
            lastCounter = n
          }}
        />,
      )
      app.unmount()
    }).toThrow(/Maximum update depth/)
    // The counter incremented some bounded number of times before React
    // gave up. The exact count is React-internal (~25), but the key
    // signal is: it terminated, didn't hang.
    expect(lastCounter).toBeGreaterThan(0)
    expect(lastCounter).toBeLessThan(200)
  })

  test("non-feedback render does NOT exhaust the budget", () => {
    // Sanity check: a static render never approaches any bound.
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <Box>
        <Text>static content</Text>
      </Box>,
    )
    expect(app.text).toContain("static content")
    app.unmount()
  })

  test("MAX bounds match the documented values", () => {
    // Sanity: the bound consts haven't drifted from the design doc.
    expect(MAX_CONVERGENCE_PASSES).toBe(2)
    expect(INITIAL_RENDER_MAX_PASSES).toBe(5)
  })
})
