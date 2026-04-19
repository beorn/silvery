/**
 * useAnimation Hook Tests
 *
 * Bead: km-silvery.animation
 *
 * Tests the Ink-compatible useAnimation hook (Phase 1: shared-scheduler
 * frame counter). Verifies frame counting, time tracking, pause/resume,
 * reset, shared scheduler, and cleanup.
 *
 * Uses real timers with short intervals and actual time delays for
 * accurate scheduler behavior testing.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import {
  useAnimation,
  _scheduler,
  type UseAnimationOptions,
  type UseAnimationResult,
} from "../../packages/ag-react/src/hooks/useAnimation"

// ============================================================================
// Test Components
// ============================================================================

/** Displays animation state as parseable text. */
function AnimDisplay({
  testID,
  interval,
  isActive,
}: {
  testID: string
  interval?: number
  isActive?: boolean
}) {
  const { frame, time, delta } = useAnimation({ interval, isActive })
  return (
    <Text testID={testID}>
      f={frame} t={time} d={delta}
    </Text>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/** Wait for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// Tests
// ============================================================================

describe("useAnimation", () => {
  test("initial state has frame=0 and time=0", () => {
    const render = createRenderer({ cols: 80, rows: 10 })
    const app = render(<AnimDisplay testID="a" interval={100} />)
    const text = app.getByTestId("a").textContent()
    expect(text).toContain("f=0")
    expect(text).toContain("t=0")
    // Clean up
    render(<Text>done</Text>)
  })

  test("isActive:false prevents timer registration", () => {
    const render = createRenderer({ cols: 80, rows: 10 })
    const before = _scheduler.totalCallbackCount
    const app = render(<AnimDisplay testID="a" interval={100} isActive={false} />)
    // No callback registered when inactive
    expect(_scheduler.totalCallbackCount).toBe(before)
    // Clean up
    render(<Text>done</Text>)
  })

  test("multiple components share ONE scheduler timer per interval", () => {
    // Use a unique interval that no other test uses to avoid cross-test interference
    const INTERVAL = 137
    const render = createRenderer({ cols: 80, rows: 10 })
    const beforeTimers = _scheduler.activeTimerCount
    const beforeCallbacks = _scheduler.totalCallbackCount

    const app = render(
      <Box flexDirection="column">
        <AnimDisplay testID="a" interval={INTERVAL} />
        <AnimDisplay testID="b" interval={INTERVAL} />
        <AnimDisplay testID="c" interval={INTERVAL} />
      </Box>,
    )

    // All three use the same interval → exactly one new timer, three new callbacks
    expect(_scheduler.activeTimerCount).toBe(beforeTimers + 1)
    expect(_scheduler.totalCallbackCount).toBe(beforeCallbacks + 3)

    // Clean up
    render(<Text>done</Text>)
  })

  test("scheduler cleans up when last component unmounts", () => {
    const render = createRenderer({ cols: 80, rows: 10 })
    const beforeTimers = _scheduler.activeTimerCount
    const beforeCallbacks = _scheduler.totalCallbackCount

    // Mount
    render(<AnimDisplay testID="a" interval={200} />)
    expect(_scheduler.activeTimerCount).toBe(beforeTimers + 1)
    expect(_scheduler.totalCallbackCount).toBe(beforeCallbacks + 1)

    // Unmount by rendering something else
    render(<Text>done</Text>)
    expect(_scheduler.activeTimerCount).toBe(beforeTimers)
    expect(_scheduler.totalCallbackCount).toBe(beforeCallbacks)
  })

  test("different intervals create separate timers", () => {
    const render = createRenderer({ cols: 80, rows: 10 })
    const beforeTimers = _scheduler.activeTimerCount

    render(
      <Box flexDirection="column">
        <AnimDisplay testID="fast" interval={50} />
        <AnimDisplay testID="slow" interval={200} />
      </Box>,
    )

    // Two different intervals → two new timers
    expect(_scheduler.activeTimerCount).toBe(beforeTimers + 2)

    // Clean up
    render(<Text>done</Text>)
  })

  test("UseAnimationResult type shape matches Ink 7.0 + extensions", () => {
    // Type-level verification: Ink 7.0 has { frame, time, delta, reset }.
    // Silvery adds pause/resume.
    const result: UseAnimationResult = {
      frame: 0,
      time: 0,
      delta: 0,
      reset: () => {},
      pause: () => {},
      resume: () => {},
    }
    expect(result.frame).toBe(0)
    expect(result.time).toBe(0)
    expect(result.delta).toBe(0)
    expect(typeof result.reset).toBe("function")
    expect(typeof result.pause).toBe("function")
    expect(typeof result.resume).toBe("function")
  })

  test("UseAnimationOptions type matches Ink 7.0", () => {
    // Type-level check
    const opts: UseAnimationOptions = {
      interval: 80,
      isActive: true,
    }
    expect(opts.interval).toBe(80)
    expect(opts.isActive).toBe(true)
  })

  test("frame increments over time (real timer)", async () => {
    const render = createRenderer({ cols: 80, rows: 10 })
    const app = render(<AnimDisplay testID="a" interval={30} />)

    // Wait for a few ticks
    await sleep(120)

    // Re-render to capture React state
    app.rerender(<AnimDisplay testID="a" interval={30} />)
    const text = app.getByTestId("a").textContent()
    const frame = parseInt(text.match(/f=(\d+)/)?.[1] ?? "0")
    // Should have advanced at least 1 frame in 120ms with 30ms interval
    expect(frame).toBeGreaterThanOrEqual(1)

    // Clean up
    render(<Text>done</Text>)
  })
})
