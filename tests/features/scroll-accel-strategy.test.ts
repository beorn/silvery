/**
 * ScrollAccel strategy interface — acceptance tests.
 *
 * Bead: `@km/silvery/15340-W11-scrollaccel-strategy-wrapper`
 * Spec: `hub/silvercode/design/scroll-wave3-plan.md` § W11
 *
 * Scope: this file covers the strategy primitive only. Wiring into
 * `useKineticScroll` is a follow-up sub-bead; the W11 acceptance
 * bullet "existing kinetic-scroll tests still pass" is satisfied
 * trivially today because no kinetic-scroll call site has been
 * touched.
 */

import { describe, test, expect } from "vitest"
import {
  createIdentityScrollAccel,
  DEFAULT_SCROLL_ACCEL,
  isIdentityScrollAccel,
  type ScrollAccel,
} from "@silvery/ag-react/hooks/scroll-accel"

describe("ScrollAccel — identity strategy (default)", () => {
  test("createIdentityScrollAccel().tick(now) returns 1.0 for any now", () => {
    const accel = createIdentityScrollAccel()
    expect(accel.tick(0)).toBe(1)
    expect(accel.tick(16.7)).toBe(1)
    expect(accel.tick(1_000)).toBe(1)
    expect(accel.tick(Number.MAX_SAFE_INTEGER)).toBe(1)
  })

  test("identity strategy reset() is a no-op (no state to mutate)", () => {
    const accel = createIdentityScrollAccel()
    expect(accel.tick(100)).toBe(1)
    accel.reset()
    expect(accel.tick(100)).toBe(1)
    accel.reset()
    accel.reset()
    expect(accel.tick(2_000)).toBe(1)
  })

  test("DEFAULT_SCROLL_ACCEL singleton matches createIdentityScrollAccel behavior", () => {
    expect(DEFAULT_SCROLL_ACCEL.tick(0)).toBe(1)
    expect(DEFAULT_SCROLL_ACCEL.tick(500)).toBe(1)
    DEFAULT_SCROLL_ACCEL.reset()
    expect(DEFAULT_SCROLL_ACCEL.tick(500)).toBe(1)
  })

  test("isIdentityScrollAccel recognises the shared singleton only", () => {
    expect(isIdentityScrollAccel(DEFAULT_SCROLL_ACCEL)).toBe(true)
    // Freshly constructed identity instances are NOT the shared singleton —
    // the predicate is a referential-equality fast-path hint, not a
    // structural check.
    expect(isIdentityScrollAccel(createIdentityScrollAccel())).toBe(false)
  })

  test("identity tick output is independent of monotonic clock progression", () => {
    const accel = createIdentityScrollAccel()
    const samples = [0, 1, 1.5, 16, 33, 100, 250, 1_000, 10_000]
    for (const now of samples) {
      expect(accel.tick(now)).toBe(1)
    }
  })
})

describe("ScrollAccel — custom strategy overrides multiplier", () => {
  test("a custom strategy may return any non-negative finite multiplier", () => {
    // Trivial linear strategy — illustrates the contract for downstream
    // implementers without taking a position on physics.
    const linear: ScrollAccel = {
      tick: (now) => 1 + Math.min(now / 1_000, 3),
      reset: () => {
        /* no-op for this test */
      },
    }
    expect(linear.tick(0)).toBe(1)
    expect(linear.tick(500)).toBe(1.5)
    expect(linear.tick(1_000)).toBe(2)
    expect(linear.tick(10_000)).toBe(4) // clamped at 1 + 3
  })

  test("a custom strategy may carry internal state and reset() clears it", () => {
    // Counts ticks; resets on demand. Mirrors a real gesture-window
    // strategy's life cycle without committing to physics.
    let ticks = 0
    const counting: ScrollAccel = {
      tick: () => {
        ticks += 1
        return ticks
      },
      reset: () => {
        ticks = 0
      },
    }
    expect(counting.tick(0)).toBe(1)
    expect(counting.tick(16)).toBe(2)
    expect(counting.tick(32)).toBe(3)
    counting.reset()
    expect(counting.tick(48)).toBe(1)
  })

  test("custom strategy may use `now` to derive decay envelopes", () => {
    // Exponential-decay illustration. Verifies that the host hands the
    // strategy enough information (a monotonic clock) to build any
    // envelope shape it wants — silvery does not constrain the curve.
    let last = 0
    let mult = 1
    const decay: ScrollAccel = {
      tick: (now) => {
        const dt = now - last
        last = now
        mult = Math.max(1, mult - dt * 0.001)
        return mult
      },
      reset: () => {
        last = 0
        mult = 1
      },
    }
    decay.reset()
    last = 0
    mult = 4
    expect(decay.tick(0)).toBe(4)
    // 500 ms later, decay of 0.5 applied → 3.5
    expect(decay.tick(500)).toBeCloseTo(3.5, 10)
    // 2,000 ms after that, 3.5 - 2 = 1.5 (still above floor)
    expect(decay.tick(2_500)).toBeCloseTo(1.5, 10)
    // 1,000 ms after that, would be 0.5, clamped at floor 1
    expect(decay.tick(3_500)).toBe(1)
  })

  test("ScrollAccel is a plain interface — duck-typed objects satisfy it", () => {
    const adhoc = {
      tick: (_now: number) => 2,
      reset: () => {
        /* no-op */
      },
    }
    const consumer = (a: ScrollAccel) => a.tick(0)
    expect(consumer(adhoc)).toBe(2)
  })
})
