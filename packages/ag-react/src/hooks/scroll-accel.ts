/**
 * ScrollAccel — pluggable wheel-acceleration strategy interface.
 *
 * Pattern source: OpenTUI's `LinearScrollAccel` / `MacOSScrollAccel` in
 * `@opentui/core` (`packages/core/src/renderables/ScrollBox.ts`). The
 * strategy exposes a single hot path:
 *
 *   tick(now: number): number  // returns a multiplier (rows-per-tick)
 *
 * Bead: `@km/silvery/15340-W11-scrollaccel-strategy-wrapper`
 * Spec: `hub/silvercode/design/scroll-wave3-plan.md` § W11
 *
 * ## Design notes
 *
 * - This file is **strategy-only**. It does not wire into
 *   `useKineticScroll`; that integration is a follow-up sub-bead. The
 *   point of W11 is to land the interface + default + factory in
 *   isolation so the surface can be reviewed without disturbing the
 *   live physics in `useKineticScroll`.
 * - Default strategy is **identity** — `tick(now)` returns `1.0`,
 *   matching today's behavior bit-for-bit. Custom strategies opt-in.
 * - The `tick` contract treats `now` as a monotonic timestamp in
 *   milliseconds (i.e. `performance.now()` flavor). Strategies that
 *   need state (last-tick timing, decay envelopes, gesture window)
 *   own it internally. Callers pass `now` and consume the returned
 *   multiplier; no other state crosses the boundary.
 * - Multipliers are **rows-per-tick**, not pixels. Terminal scroll is
 *   row-quantized; downstream code is responsible for rounding or
 *   accumulating fractional remainders if needed.
 * - The interface is intentionally small. Future strategies
 *   (`MacOSScrollAccel`, `WheelDirectAccel`, `TouchInertialAccel`)
 *   compose by holding internal state and returning their own
 *   multiplier from `tick`. They MUST NOT replace the kinetic
 *   physics; per decision 5 of the Wave 3 plan, physics stays in
 *   silvery's `useKineticScroll` — accel is a multiplier layer in
 *   front of it.
 *
 * ## Usage (preview — wiring is a follow-up)
 *
 *   const accel = createIdentityScrollAccel()
 *   const multiplier = accel.tick(performance.now())
 *   // future: useKineticScroll consumes `accel` from options
 */

/** Strategy interface. Implementations may carry internal state. */
export interface ScrollAccel {
  /**
   * Compute the row-per-tick multiplier for a wheel sample at `now`.
   * @param now Monotonic timestamp (ms), `performance.now()`-flavor.
   * @returns A non-negative finite multiplier. Identity strategies
   *          return `1.0`.
   */
  tick(now: number): number
  /**
   * Reset any internal accumulators / decay state. Called by the host
   * on gesture boundaries (release, direction reversal) or when the
   * consumer wants to start fresh. Identity strategies are no-ops.
   */
  reset(): void
}

/**
 * The neutral strategy: every tick returns `1.0`. Stateless. Used as
 * the default in callers that wire `ScrollAccel` without opting into
 * a custom curve.
 */
export function createIdentityScrollAccel(): ScrollAccel {
  return {
    tick: identityTick,
    reset: noop,
  }
}

function identityTick(_now: number): number {
  return 1
}

function noop(): void {
  /* identity strategy carries no state */
}

/**
 * Shared default singleton. Stateless — safe to reuse across consumers.
 * Equivalent to `createIdentityScrollAccel()` but avoids an allocation
 * for the (very common) "no acceleration" case.
 */
export const DEFAULT_SCROLL_ACCEL: ScrollAccel = createIdentityScrollAccel()

/**
 * Predicate — true when the strategy is the shared identity singleton.
 * Lets fast paths skip the `tick` call entirely when wiring into
 * `useKineticScroll` lands. Not required for correctness; purely an
 * optimization hint.
 */
export function isIdentityScrollAccel(accel: ScrollAccel): boolean {
  return accel === DEFAULT_SCROLL_ACCEL
}
