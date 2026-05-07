/**
 * Bounded-convergence tests (C3b).
 *
 * Asserts that the renderer's convergence loops never need more passes than
 * the per-PassCause bound model says they should — i.e. pass-count is bounded
 * by edge inventory, not by a retry constant.
 *
 * Replaces the historical safety-margin constants
 * `MAX_SINGLE_PASS_ITERATIONS = 15`, `MAX_LAYOUT_ITERATIONS = 5`,
 * `MAX_EFFECT_FLUSHES = 5`, and `maxFlushes = 5` with an explicit, attributed
 * bound. The C3a v3 corpus (105 termless app teardowns / 11 538 records)
 * showed the observed maximum was pass 0 → 1; the structural maximum
 * (1 initial + 1 settle + sum of per-cause bounds) is MAX_CONVERGENCE_PASSES.
 *
 * Tracking: km-silvery.renderer-convergence-by-design (C3b)
 */
import { describe, test, expect } from "vitest"
import {
  PASS_CAUSE_BOUNDS,
  MAX_CONVERGENCE_PASSES,
  INITIAL_RENDER_MAX_PASSES,
  assertBoundedConvergence,
  type PassCause,
  type ConvergenceLoopName,
} from "@silvery/ag-term/runtime/pass-cause"

describe("bounded-convergence: per-cause bound model", () => {
  test("PASS_CAUSE_BOUNDS covers every PassCause category", () => {
    // Compile-time Record<PassCause, number> enforces totality, but the
    // runtime check catches drift if the type is widened without a matching
    // bound entry.
    const expectedCauses: PassCause[] = [
      "layout-invalidate",
      "intrinsic-shrinkwrap",
      "scrollto-settle",
      "sticky-resettle",
      "viewport-resize",
      "unknown",
    ]
    for (const cause of expectedCauses) {
      expect(PASS_CAUSE_BOUNDS).toHaveProperty(cause)
      expect(typeof PASS_CAUSE_BOUNDS[cause]).toBe("number")
    }
  })

  test("PassCause type contains exactly the 6 audited categories (no scaffolding)", () => {
    // C3b audited the C3a v2 14-category enum; 9 categories were removed
    // because they had no production emit path. The remaining 6 each have
    // at least one logPass site in the pipeline.
    const causeCount = Object.keys(PASS_CAUSE_BOUNDS).length
    expect(causeCount).toBe(6)
  })

  test("MAX_CONVERGENCE_PASSES = 2 (1 initial + 1 settle, no extra-pass bounds)", () => {
    // C3a v3 confirmed pass-0-only convergence across 105 app teardowns;
    // every per-cause bound is 0 because each settles within the canonical
    // settle pass. Total = 1 initial + 1 settle = 2.
    expect(MAX_CONVERGENCE_PASSES).toBe(2)
  })

  test("INITIAL_RENDER_MAX_PASSES = 5 (initial render needs wider cap for hook subscription)", () => {
    // Initial render of a fresh fiber root needs hooks like useBoxRect to
    // subscribe → layout → forceUpdate → re-render before the first frame
    // is stable. Used exclusively at first-render time in the test renderer.
    expect(INITIAL_RENDER_MAX_PASSES).toBe(5)
  })

  test("MAX_CONVERGENCE_PASSES is dramatically tighter than the prior magic constants", () => {
    // Historical: single-pass=15, classic=5, effect-flush=5, prod-flush=5.
    // The 15-pass cap was 7.5x the structural ceiling.
    expect(MAX_CONVERGENCE_PASSES).toBeLessThan(15)
    expect(MAX_CONVERGENCE_PASSES).toBeLessThan(5)
  })

  test("MAX_CONVERGENCE_PASSES = 1 + 1 + sum of per-cause bounds", () => {
    const sum =
      PASS_CAUSE_BOUNDS["layout-invalidate"] +
      PASS_CAUSE_BOUNDS["intrinsic-shrinkwrap"] +
      PASS_CAUSE_BOUNDS["scrollto-settle"] +
      PASS_CAUSE_BOUNDS["sticky-resettle"] +
      PASS_CAUSE_BOUNDS["viewport-resize"] +
      PASS_CAUSE_BOUNDS.unknown
    expect(MAX_CONVERGENCE_PASSES).toBe(1 + 1 + sum)
  })

  test("unknown bound is 0 (any non-zero unknown is a bug, not budget)", () => {
    expect(PASS_CAUSE_BOUNDS.unknown).toBe(0)
  })

  test("every cross-pass cause has a bound of 0 extra passes (one-shot invariants)", () => {
    // Each category has a structural one-shot invariant — the edge fires
    // once during the settle pass, then the edge can't re-fire on the SAME
    // input. The settle pass is shared across causes (the +1 in
    // MAX_CONVERGENCE_PASSES), not per-cause budget.
    for (const cause of Object.keys(PASS_CAUSE_BOUNDS) as PassCause[]) {
      expect(PASS_CAUSE_BOUNDS[cause]).toBe(0)
    }
  })
})

describe("bounded-convergence: assertion behaviour", () => {
  const ORIGINAL_STRICT = process.env.SILVERY_STRICT

  function withStrict<T>(level: string | undefined, fn: () => T): T {
    if (level === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = level
    try {
      return fn()
    } finally {
      if (ORIGINAL_STRICT === undefined) delete process.env.SILVERY_STRICT
      else process.env.SILVERY_STRICT = ORIGINAL_STRICT
    }
  }

  test("at-bound passCount does not assert (boundary is inclusive of the bound)", () => {
    withStrict("2", () => {
      const loops: ConvergenceLoopName[] = ["layout-pass", "effect-flush", "production-flush"]
      for (const loop of loops) {
        expect(() => assertBoundedConvergence(MAX_CONVERGENCE_PASSES, loop, MAX_CONVERGENCE_PASSES)).not.toThrow()
      }
    })
  })

  test("STRICT=2 throws when passCount exceeds the bound", () => {
    withStrict("2", () => {
      const loops: ConvergenceLoopName[] = ["layout-pass", "effect-flush", "production-flush"]
      for (const loop of loops) {
        expect(() =>
          assertBoundedConvergence(MAX_CONVERGENCE_PASSES + 1, loop, MAX_CONVERGENCE_PASSES),
        ).toThrow(new RegExp(`convergence bound exceeded in ${loop}`))
      }
    })
  })

  test("caller-supplied cap controls the bound (test renderer can opt into wider caps)", () => {
    // Tests that legitimately need stabilization across multiple iterations
    // (e.g. legacy multi-iteration scrollable virtualization) can pass a
    // higher cap explicitly via createRenderer({ maxLayoutPasses: 5 }).
    withStrict("2", () => {
      expect(() => assertBoundedConvergence(5, "layout-pass", 5)).not.toThrow()
      expect(() => assertBoundedConvergence(6, "layout-pass", 5)).toThrow(/layout-pass/)
    })
  })

  test("STRICT unset is a no-op even when the bound is exceeded", () => {
    withStrict(undefined, () => {
      expect(() =>
        assertBoundedConvergence(MAX_CONVERGENCE_PASSES + 100, "layout-pass", MAX_CONVERGENCE_PASSES),
      ).not.toThrow()
      expect(() =>
        assertBoundedConvergence(INITIAL_RENDER_MAX_PASSES + 100, "layout-pass", INITIAL_RENDER_MAX_PASSES),
      ).not.toThrow()
    })
  })
})
