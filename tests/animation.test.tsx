/**
 * Tests for animation utilities.
 *
 * Covers easing functions, resolveEasing, useAnimation, useTransition,
 * and useInterval hooks using fake timers.
 */

import React, { useState } from "react"
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"
import { easings, resolveEasing, type EasingFn } from "../src/animation/easing.js"
import { useAnimation, type UseAnimationOptions } from "../src/animation/useAnimation.js"
import { useTransition } from "../src/animation/useTransition.js"
import { useInterval } from "../src/animation/useInterval.js"

const render = createRenderer({ cols: 80, rows: 24 })

// ============================================================================
// Test Components
// ============================================================================

/** Displays the current animation value and isAnimating state. */
function AnimationProbe(props: UseAnimationOptions & { id?: string }) {
  const { id = "anim", ...opts } = props
  const { value, isAnimating, reset } = useAnimation(opts)

  return (
    <Box testID={id}>
      <Text testID="value">{value.toFixed(4)}</Text>
      <Text testID="animating">{isAnimating ? "yes" : "no"}</Text>
    </Box>
  )
}

/** Displays the current transition value. */
function TransitionProbe({ target, duration, easing }: { target: number; duration?: number; easing?: string }) {
  const value = useTransition(target, { duration, easing: easing as any })

  return (
    <Box>
      <Text testID="value">{value.toFixed(4)}</Text>
    </Box>
  )
}

/** Wrapper that allows changing the target for TransitionProbe. */
function TransitionDriver({ initial, duration, easing }: { initial: number; duration?: number; easing?: string }) {
  const [target, setTarget] = useState(initial)
  // Expose setter via testID so we can trigger changes
  ;(globalThis as any).__setTransitionTarget = setTarget

  return <TransitionProbe target={target} duration={duration} easing={easing} />
}

/** Counts interval ticks. */
function IntervalProbe({ ms, enabled = true }: { ms: number; enabled?: boolean }) {
  const [count, setCount] = useState(0)
  useInterval(() => setCount((c) => c + 1), ms, enabled)

  return (
    <Box testID="count">
      <Text>{String(count)}</Text>
    </Box>
  )
}

// ============================================================================
// Easing Functions
// ============================================================================

describe("easings", () => {
  test("linear: endpoints and midpoint", () => {
    expect(easings.linear(0)).toBe(0)
    expect(easings.linear(1)).toBe(1)
    expect(easings.linear(0.5)).toBe(0.5)
  })

  test("easeIn: starts slow (value at 0.5 < 0.5)", () => {
    const mid = easings.easeIn(0.5)
    expect(mid).toBeLessThan(0.5)
    expect(easings.easeIn(0)).toBe(0)
    expect(easings.easeIn(1)).toBe(1)
  })

  test("easeOut: starts fast (value at 0.5 > 0.5)", () => {
    const mid = easings.easeOut(0.5)
    expect(mid).toBeGreaterThan(0.5)
    expect(easings.easeOut(0)).toBe(0)
    expect(easings.easeOut(1)).toBe(1)
  })

  test("easeInOut: endpoints correct", () => {
    expect(easings.easeInOut(0)).toBe(0)
    expect(easings.easeInOut(1)).toBe(1)
  })

  test("easeInCubic: starts even slower than easeIn", () => {
    const cubic = easings.easeInCubic(0.5)
    const quad = easings.easeIn(0.5)
    expect(cubic).toBeLessThan(quad)
  })

  test("easeOutCubic: endpoints correct", () => {
    expect(easings.easeOutCubic(0)).toBe(0)
    expect(easings.easeOutCubic(1)).toBe(1)
  })

  test("all easings produce values in [0, 1] for inputs in [0, 1]", () => {
    for (const [name, fn] of Object.entries(easings)) {
      for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const v = fn(t)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})

// ============================================================================
// resolveEasing
// ============================================================================

describe("resolveEasing", () => {
  test("accepts a string name and returns the preset function", () => {
    const fn = resolveEasing("easeIn")
    expect(fn).toBe(easings.easeIn)
  })

  test("accepts a custom function and returns it as-is", () => {
    const custom: EasingFn = (t) => t * t * t * t
    const fn = resolveEasing(custom)
    expect(fn).toBe(custom)
  })
})

// ============================================================================
// useAnimation
// ============================================================================

describe("useAnimation", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("starts at 0", () => {
    const app = render(<AnimationProbe duration={300} />)
    expect(app.locator('[testID="value"]').textContent()).toBe("0.0000")
    expect(app.locator('[testID="animating"]').textContent()).toBe("yes")
  })

  test("reaches 1 after duration", async () => {
    const app = render(<AnimationProbe duration={300} easing="linear" />)

    // Advance past the full duration
    await vi.advanceTimersByTimeAsync(350)

    expect(app.locator('[testID="value"]').textContent()).toBe("1.0000")
    expect(app.locator('[testID="animating"]').textContent()).toBe("no")
  })

  test("respects easing (easeIn produces lower value at midpoint)", async () => {
    const app = render(<AnimationProbe duration={300} easing="easeIn" />)

    // Advance to roughly the midpoint
    await vi.advanceTimersByTimeAsync(150)

    const value = parseFloat(app.locator('[testID="value"]').textContent())
    // easeIn(0.5) = 0.25, so should be around that
    expect(value).toBeLessThan(0.5)
    expect(value).toBeGreaterThan(0)
  })

  test("calls onComplete when animation finishes", async () => {
    const onComplete = vi.fn()
    render(<AnimationProbe duration={200} onComplete={onComplete} />)

    expect(onComplete).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)

    expect(onComplete).toHaveBeenCalledOnce()
  })

  test("enabled=false keeps value at 0 and does not animate", async () => {
    const app = render(<AnimationProbe duration={200} enabled={false} />)

    await vi.advanceTimersByTimeAsync(300)

    expect(app.locator('[testID="value"]').textContent()).toBe("0.0000")
    expect(app.locator('[testID="animating"]').textContent()).toBe("no")
  })

  test("delay postpones animation start", async () => {
    const app = render(<AnimationProbe duration={200} delay={100} easing="linear" />)

    // After 50ms (still in delay period), value should be 0
    await vi.advanceTimersByTimeAsync(50)
    expect(app.locator('[testID="value"]').textContent()).toBe("0.0000")

    // After delay + full duration, should reach 1
    await vi.advanceTimersByTimeAsync(300)
    expect(app.locator('[testID="value"]').textContent()).toBe("1.0000")
  })
})

// ============================================================================
// useTransition
// ============================================================================

describe("useTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).__setTransitionTarget
  })

  test("returns initial value immediately (no animation)", () => {
    const app = render(<TransitionDriver initial={42} />)
    expect(app.locator('[testID="value"]').textContent()).toBe("42.0000")
  })

  test("animates toward new target value", async () => {
    const app = render(<TransitionDriver initial={0} duration={300} easing="linear" />)

    expect(app.locator('[testID="value"]').textContent()).toBe("0.0000")

    // Change the target
    const setTarget = (globalThis as any).__setTransitionTarget as (v: number) => void
    setTarget(100)

    // Flush the state update
    await vi.advanceTimersByTimeAsync(0)

    // Partway through, should be between 0 and 100
    await vi.advanceTimersByTimeAsync(150)
    const mid = parseFloat(app.locator('[testID="value"]').textContent())
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(100)

    // After full duration, should reach target
    await vi.advanceTimersByTimeAsync(200)
    expect(app.locator('[testID="value"]').textContent()).toBe("100.0000")
  })
})

// ============================================================================
// useInterval
// ============================================================================

describe("useInterval", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("calls callback at interval", async () => {
    const app = render(<IntervalProbe ms={100} />)

    expect(app.locator('[testID="count"]').textContent()).toBe("0")

    // Advance multiple intervals — the callback fires on each tick
    // Use extra time margin to allow React reconciler to flush
    await vi.advanceTimersByTimeAsync(350)
    const count = Number(app.locator('[testID="count"]').textContent())
    expect(count).toBeGreaterThanOrEqual(1)
    expect(count).toBeLessThanOrEqual(4)
  })

  test("does not call callback when enabled=false", async () => {
    const app = render(<IntervalProbe ms={100} enabled={false} />)

    await vi.advanceTimersByTimeAsync(500)
    expect(app.locator('[testID="count"]').textContent()).toBe("0")
  })

  test("callback is not called on mount (only on ticks)", () => {
    const app = render(<IntervalProbe ms={100} />)
    expect(app.locator('[testID="count"]').textContent()).toBe("0")
  })
})
