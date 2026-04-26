/**
 * ListView scroll-contract property tests.
 *
 * Guard for the `km-tui.column-top-disappears` bug class — reappeared 5+ times
 * during the 2026-04-20 session because each fix (forward-walk window,
 * gap accounting, body-card row-budget clamp) addressed ONE math shape of
 * the same failure mode, instead of policing the underlying contract.
 *
 * Existing tests hard-code specific dimensions (`cols=60 rows=120` in
 * `listview-variable-heights.test.tsx`, `cols=200 rows=120` in the real-vault
 * slow test). Real users have arbitrary terminal sizes (the final "still
 * broken at 240×117" report didn't match either seeded case). These property
 * tests sweep the (cols × rows × item-height-distribution × scrollTo) space
 * so ONE regression anywhere in that space fails loudly.
 *
 * Related beads:
 *   - km-tui.column-top-disappears (guarded)
 *   - km-silvery.virtualizer-from-layout (architectural fix — pending)
 *   - km-silvery.virtualized-overflow-indicator-counts (▼N/▲N accuracy)
 *
 * ============================================================================
 * Invariants asserted (shared with listview-scroll-contract.test.tsx)
 * ============================================================================
 *
 * See `listview-scroll-contract.test.tsx` for the full invariant specs.
 * Shared fixture builder + analysis + invariant checkers are imported from
 * that file so both stay in lock-step.
 *
 *   1. NO-BLANK-GAP              — ≤1 row between last ╰ and ▼N/viewport bot
 *   2. OVERFLOW-COUNT-ACCURACY   — ▲N + ▼N ≥ ceil(hidden/2)
 *   3. FIRST-VISIBLE-HAS-ZERO-OFFSET — at scrollTo=0, first ╭ at y ≤ 2
 *   4. VIEWPORT-TOP-CARD         — first card top near viewport top
 *   5. VIRTUALIZER ↔ SCROLL-PHASE AGREEMENT — every visible card identified
 *      by layout-phase (indicator counts indirectly reveal the window) must
 *      also be rendered by the virtualizer. With read-don't-walk activation
 *      (bead km-silvery.virtualizer-from-layout), this is a tautology: the
 *      virtualizer reads `firstVisibleChild`/`lastVisibleChild` directly from
 *      layout-phase, so divergence is impossible by construction. The
 *      invariant asserts the OBSERVABLE consequence: `visibleIndices ∩
 *      renderedWindow = visibleIndices` — i.e. no "phantom" hidden items
 *      that layout-phase reports visible but virtualizer dropped. See
 *      `checkVirtualizerScrollAgreement` in `listview-scroll-helpers.tsx`.
 *
 * ============================================================================
 * Spec ambiguities (documented per prompt)
 * ============================================================================
 *
 * - "non-sticky item" — ListView doesn't use position="sticky"; we treat every
 *   rendered card (identified by ╭/╰ borders around id text) as non-sticky.
 *
 * - "viewport" — the ListView's `height` prop defines the viewport. We trim
 *   the rendered buffer to that height for analysis.
 *
 * - "first rendered card" — smallest-y ╭ inside the viewport. If no ╭ is
 *   present (empty list, overscrolled, all clipped), invariants 1 + 4 are
 *   trivially satisfied.
 *
 * ============================================================================
 * Running
 * ============================================================================
 *
 *   # Fuzz sweep (200 cases, seeded for reproducibility)
 *   FUZZ=1 bun vitest run vendor/silvery/tests/features/listview-scroll-properties.fuzz.tsx
 *
 *   # Specific seed (on failure, fast-check prints a reproducible seed)
 *   FUZZ=1 bun vitest run vendor/silvery/tests/features/listview-scroll-properties.fuzz.tsx \
 *     -t "all 4 invariants"
 *
 * The seeded regression tests (at cols=240×117 and 200×120) live in the
 * sibling file `listview-scroll-contract.test.tsx` and always run.
 */

import { describe, test } from "vitest"
import fc from "fast-check"
import {
  type FixtureItem,
  type ListViewFixture,
  buildItems,
  renderFixture,
  dumpViewport,
  checkAllInvariants,
  checkVirtualizerScrollAgreement,
} from "./listview-scroll-helpers"

// ============================================================================
// Parameter space
// ============================================================================

// Include 240 and 117 to mirror the user's actual terminal.
const COL_CHOICES = [40, 60, 80, 120, 200, 240] as const
const ROW_CHOICES = [10, 24, 60, 117, 120, 150] as const
const COUNT_CHOICES = [10, 33, 100, 500] as const

type HeightShape = "uniform" | "short-first-tall-later" | "random"

function generateHeights(shape: HeightShape, count: number, rng: () => number): number[] {
  switch (shape) {
    case "uniform":
      return Array.from({ length: count }, () => 3)
    case "short-first-tall-later": {
      const pivot = Math.floor(count * 0.55)
      return Array.from({ length: count }, (_, i) => (i < pivot ? 3 : 20 + Math.floor(rng() * 15)))
    }
    case "random":
      return Array.from({ length: count }, () => 2 + Math.floor(rng() * 25))
  }
}

// ============================================================================
// Property tests (gated on FUZZ=1 via repo vitest.config.ts include pattern)
// ============================================================================

describe("ListView scroll-contract fuzz sweep (cols × rows × heights × scrollTo)", () => {
  test("property: all 4 invariants hold across random (cols, rows, count, height-shape, scrollTo)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COL_CHOICES),
        fc.constantFrom(...ROW_CHOICES),
        fc.constantFrom(...COUNT_CHOICES),
        fc.constantFrom<HeightShape>("uniform", "short-first-tall-later", "random"),
        fc.double({ noNaN: true, min: 0, max: 1, noDefaultInfinity: true }),
        fc.double({ noNaN: true, min: 0, max: 1, noDefaultInfinity: true }),
        (cols, rows, count, shape, heightSeed, scrollSeed) => {
          let s = heightSeed * 0xfffff
          const rng = () => {
            s = (s * 9301 + 49297) % 233280
            return s / 233280
          }
          const heights = generateHeights(shape, count, rng)
          const items: FixtureItem[] = heights.map((h, i) => ({
            id: `f-${i}`,
            height: h,
          }))

          // viewport = rows - 2 (Box breathing room), minimum 4.
          const viewport = Math.max(4, rows - 2)

          // scrollTo: 25% chance undefined; otherwise seeded index.
          const scrollTo = scrollSeed < 0.25 ? undefined : Math.floor(scrollSeed * count) % count

          const fixture: ListViewFixture = {
            items,
            cols,
            rows,
            viewport,
            scrollTo,
            estimateHeight: 4,
          }

          const analysis = renderFixture(fixture)
          // INV-5 FIRST, as its own primary assertion: the virtualizer-
          // scroll agreement is the architectural invariant load-bearing
          // for read-don't-walk. A breakdown here means the virtualizer
          // and scroll-phase disagree about what's visible — fail loudly.
          const inv5 = checkVirtualizerScrollAgreement(fixture, analysis)
          if (!inv5.ok) {
            throw new Error(`[INV-5 primary] ${inv5.message}\n\n${dumpViewport(fixture, analysis)}`)
          }
          const violation = checkAllInvariants(fixture, analysis)
          if (violation) {
            throw new Error(`${violation.message}\n\n${dumpViewport(fixture, analysis)}`)
          }
        },
      ),
      {
        numRuns: 200,
        seed: 0xc01dcafe,
        verbose: 1,
        endOnFailure: false,
      },
    )
  }, 180_000)

  test("property: viewport exact-fill — no indicator, no gap", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COL_CHOICES),
        fc.integer({ min: 10, max: 100 }),
        fc.integer({ min: 2, max: 8 }),
        (cols, viewport, itemHeight) => {
          const count = Math.floor(viewport / itemHeight)
          if (count < 1) return // skip degenerate
          const items = buildItems(count, () => itemHeight, "e")
          const fixture: ListViewFixture = {
            items,
            cols,
            rows: viewport + 4,
            viewport,
            estimateHeight: itemHeight,
          }
          const analysis = renderFixture(fixture)
          if (analysis.indicatorDownCount > 0 || analysis.indicatorUpCount > 0) {
            throw new Error(
              `exact-fill: unexpected indicator ▲${analysis.indicatorUpCount}/▼${analysis.indicatorDownCount}\n${dumpViewport(fixture, analysis)}`,
            )
          }
          const violation = checkAllInvariants(fixture, analysis)
          if (violation)
            throw new Error(`${violation.message}\n\n${dumpViewport(fixture, analysis)}`)
        },
      ),
      { numRuns: 60, seed: 0xf17f17 },
    )
  }, 60_000)

  test("property: viewport partial-fill — content < viewport, no indicator", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COL_CHOICES),
        fc.integer({ min: 20, max: 100 }),
        fc.integer({ min: 1, max: 5 }),
        (cols, viewport, count) => {
          const items = buildItems(count, () => 3, "pf")
          const contentHeight = items.reduce((s, x) => s + x.height, 0)
          if (contentHeight >= viewport) return // not partial
          const fixture: ListViewFixture = {
            items,
            cols,
            rows: viewport + 4,
            viewport,
            estimateHeight: 3,
          }
          const analysis = renderFixture(fixture)
          if (analysis.indicatorDownCount > 0 || analysis.indicatorUpCount > 0) {
            throw new Error(
              `partial-fill: unexpected indicator ▲${analysis.indicatorUpCount}/▼${analysis.indicatorDownCount}\n${dumpViewport(fixture, analysis)}`,
            )
          }
          const violation = checkAllInvariants(fixture, analysis)
          if (violation)
            throw new Error(`${violation.message}\n\n${dumpViewport(fixture, analysis)}`)
        },
      ),
      { numRuns: 40, seed: 0xc0ffee },
    )
  }, 60_000)
})
