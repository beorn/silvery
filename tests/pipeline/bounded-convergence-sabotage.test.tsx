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

import React, { useEffect, useLayoutEffect, useState } from "react"
import { afterEach, beforeEach, describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import {
  MAX_CONVERGENCE_PASSES,
  INITIAL_RENDER_MAX_PASSES,
  resetPassHistogram,
} from "@silvery/ag-term/runtime/pass-cause"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
// run.tsx (not .ts) — the `./*` package export maps to `./src/*.ts`, so import
// the .tsx entry via a package-relative path (matches auto-panic-circuit-break).
import { _resetPanicCircuitBreaker, run } from "../../packages/ag-term/src/runtime/run"

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

// ===========================================================================
// Observability regression: the convergence-bound throw must name the cause
// under plain SILVERY_STRICT (INSTRUMENT off).
//
// `assertBoundedConvergence` builds its per-cause breakdown from
// `getPassHistogram().byCause`, which was populated ONLY under
// SILVERY_INSTRUMENT=1. Under plain `SILVERY_STRICT=2` the breakdown was
// empty and the crash message ended with "(no records — INSTRUMENT off)" —
// a bounded-convergence breach that named no looping edge.
//
// This drives the production standalone-frame drain
// (`drainStandaloneCommitRerenders`) — the loop that ACTUALLY throws on a
// runaway feedback edge (it asserts at commitRerenders+1 > cap; the other
// loops cap inclusively and never exceed). It is reached via a timer-driven
// setState (case 3 → renderStandaloneFrame), exactly the production trigger
// (timers / session hydration / resource probes). The throw is routed
// through the runtime's panic handler, which flushes the error message +
// stack to stderr; we capture stderr and assert the breakdown is populated.
//
// Bead: @km/silvery/19436-production-flush-convergence-bound-crash
// ===========================================================================

function createMockStdout(): NodeJS.WriteStream {
  const writable = {
    write() {
      return true
    },
    isTTY: true,
    columns: 40,
    rows: 10,
    fd: -1,
    on: () => writable,
    off: () => writable,
    once: () => writable,
    emit: () => true,
    removeListener: () => writable,
    addListener: () => writable,
  } as unknown as NodeJS.WriteStream
  return writable
}

function createMockStdin(): NodeJS.ReadStream {
  const stdin = {
    isTTY: true,
    isRaw: false,
    fd: 0,
    setRawMode: () => stdin,
    resume: () => stdin,
    pause: () => stdin,
    setEncoding: () => stdin,
    read: () => null,
    on: () => stdin,
    off: () => stdin,
    once: () => stdin,
    removeListener: () => stdin,
    removeAllListeners: () => stdin,
    addListener: () => stdin,
    listenerCount: () => 0,
    listeners: () => [],
  } as unknown as NodeJS.ReadStream
  return stdin
}

/**
 * Deterministic standalone runaway. A one-shot timer flips `active` from
 * OUTSIDE any event handler (store-subscription case 3 →
 * renderStandaloneFrame → drainStandaloneCommitRerenders). Once active, an
 * effect with no deps unconditionally re-setStates every render, so
 * `pendingRerender` stays true past MAX_CONVERGENCE_PASSES and the drain
 * loop throws. (Unlike `ForeverFeedback` under `createRenderer`, this hits
 * the hard-capped production drain — no React update-depth dependence.)
 */
function StandaloneRunaway() {
  const [active, setActive] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setActive(true), 5)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (active) setTick((n) => n + 1)
  })
  return <Text>tick:{tick}</Text>
}

describe("bounded-convergence: breakdown is populated under STRICT (INSTRUMENT off)", () => {
  // Capture stderr in this suite's own buffer so the panic message doesn't
  // trip the km vitest setup's "no console output" afterEach guard, and so
  // we can assert on the thrown breakdown. Mirrors
  // tests/runtime/auto-panic-circuit-break.test.tsx.
  let origStderrWrite: typeof process.stderr.write
  let origStdoutWrite: typeof process.stdout.write
  let stderr: string[]

  beforeEach(() => {
    stderr = []
    origStderrWrite = process.stderr.write
    origStdoutWrite = process.stdout.write
    process.stderr.write = ((chunk: unknown) => {
      stderr.push(typeof chunk === "string" ? chunk : String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = (() => true) as typeof process.stdout.write
    _resetPanicCircuitBreaker()
    resetPassHistogram()
    // Production behavior is process.exit(2) after the panic circuit-break;
    // opt out so the runner survives.
    vi.stubEnv("SILVERY_AUTO_PANIC_TEST_NO_EXIT", "1")
  })

  afterEach(() => {
    process.stderr.write = origStderrWrite
    process.stdout.write = origStdoutWrite
    vi.unstubAllEnvs()
    resetStrictCache()
    resetPassHistogram()
    _resetPanicCircuitBreaker()
  })

  test("STRICT=2 production-flush over cap throws WITH a populated per-cause breakdown", async () => {
    vi.stubEnv("SILVERY_STRICT", "2")
    // INSTRUMENT explicitly OFF — this is the whole point of the regression.
    delete process.env.SILVERY_INSTRUMENT
    resetStrictCache()

    const handle = await run(<StandaloneRunaway />, {
      cols: 40,
      rows: 10,
      stdout: createMockStdout(),
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)

    // Let the timer fire → standalone runaway → drain throws → panic flush.
    await new Promise((r) => setTimeout(r, 300))
    await handle.waitUntilExit()

    const visible = stderr.join("")

    // The bounded-convergence breach fired in the production drain loop.
    expect(visible).toContain("convergence bound exceeded in production-flush")

    // The whole point: the breakdown is POPULATED, not the empty sentinel.
    expect(visible).not.toContain("(no records — INSTRUMENT off)")
    expect(visible).not.toContain("no records")

    // The message names a cause with its per-cause bound — e.g.
    // "Per-cause breakdown: unknown=N(bound=0)". Assert the breakdown line
    // exists and carries at least one `cause=count(bound=...)` entry.
    expect(visible).toMatch(/Per-cause breakdown: \S+=\d+\(bound=\d+\)/)
  })

  test("STRICT=2 + INSTRUMENT=1 still populates the breakdown (no regression)", async () => {
    vi.stubEnv("SILVERY_STRICT", "2")
    vi.stubEnv("SILVERY_INSTRUMENT", "1")
    resetStrictCache()

    const handle = await run(<StandaloneRunaway />, {
      cols: 40,
      rows: 10,
      stdout: createMockStdout(),
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)

    await new Promise((r) => setTimeout(r, 300))
    await handle.waitUntilExit()

    const visible = stderr.join("")
    expect(visible).toContain("convergence bound exceeded in production-flush")
    expect(visible).not.toContain("no records")
    expect(visible).toMatch(/Per-cause breakdown: \S+=\d+\(bound=\d+\)/)
  })
})
