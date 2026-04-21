/**
 * ListView scroll-contract: seeded regression tests.
 *
 * Always-run counterpart to `listview-scroll-properties.fuzz.tsx`. That file
 * holds the full property/fuzz sweep (gated on FUZZ=1 per repo convention
 * — see vitest.config.ts `.fuzz` include pattern); these are the specific
 * failing cases the user hit that must stay green once
 * `km-silvery.virtualizer-from-layout` lands.
 *
 * Shared machinery (fixture builder, render + analysis, invariant checkers)
 * lives in `listview-scroll-helpers.tsx` so both test files stay in
 * lock-step.
 *
 * ============================================================================
 * Invariants asserted (4 of 5 from the spec; see .fuzz.tsx header for full)
 * ============================================================================
 *
 * 1. NO-BLANK-GAP — ≤ 1 blank row between the last rendered card's ╰ border
 *    and the ▼N indicator. (Only applies when a ▼N is present — trailing
 *    blank rows in a non-overflow viewport are fine.)
 *
 * 2. OVERFLOW-COUNT-ACCURACY
 *    (2a) Content fits viewport → NO ▲/▼ indicator.
 *    (2b) Last item visible → ▼ must be 0. First item visible → ▲ must be 0.
 *    (2c) ▲N + ▼N ≥ ceil(hiddenCount / 2). Catches "stuck at 1 for N>>1".
 *
 * 3. FIRST-VISIBLE-HAS-ZERO-OFFSET — at scrollTo=0 (or undefined), first
 *    card's ╭ is at y ≤ 2.
 *
 * 4. VIEWPORT-TOP-CARD — first rendered card's top must lie within
 *    max(firstItemHeight + 1, viewport/4 + 1) of the viewport top —
 *    "window is anchored to the viewport top, not floating mid-column."
 *
 * 5. (DEFERRED) VIRTUALIZER ↔ SCROLL-PHASE AGREEMENT — requires exposing
 *    useVirtualizer's window through a test-accessible ref. The other 4
 *    catch the bug at the rendered-pixel level (where the user sees it).
 *
 * ============================================================================
 * Expected current state
 * ============================================================================
 *
 * - REGRESSION 240×117 (short-first-tall-later, scrollTo=0): PASS on HEAD —
 *   the body-card-clamp + forward-walk fixes cover this shape.
 * - REGRESSION 240×117 scrollTo=last: FAIL on HEAD — phantom ▼1 when cursor
 *   is on the last item. This is `km-silvery.virtualized-overflow-indicator-counts`.
 * - REGRESSION 200×120 (short-first-tall-later): PASS on HEAD (size matches
 *   the shape verified by existing listview-variable-heights tests).
 *
 * The failing case proves the contract is real and still incomplete. These
 * tests stay in place as the GUARD — do NOT close
 * `km-tui.column-top-disappears` or `km-silvery.virtualizer-from-layout`
 * until all three go green.
 */

import { describe, test, expect } from "vitest"
import {
  type ListViewFixture,
  buildItems,
  renderFixture,
  dumpViewport,
  checkAllInvariants,
} from "./listview-scroll-helpers"

describe("ListView scroll-contract: seeded regressions", () => {
  test("REGRESSION 240×117: short-first tall-later heterogeneous heights (user's failing size)", () => {
    // 33 items, 18 short × h=3 (54 rows) + 15 tall × h=30 (450 rows) = 504 rows.
    // viewport = 115 → overflow. avgHeight ≈ 15.3 → estimatedVisibleCount ≈ 8.
    //
    // Pre-forward-walk-fix this reproduced the blank-gap bug. Post-fix (and
    // post body-card-clamp) it should pass — confirms those fixes cover this
    // shape at the user's actual terminal size.
    const items = buildItems(33, (i) => (i < 18 ? 3 : 30), "r1")

    const fixture: ListViewFixture = {
      items,
      cols: 240,
      rows: 117,
      viewport: 115,
      estimateHeight: 4,
    }
    const analysis = renderFixture(fixture)
    const violation = checkAllInvariants(fixture, analysis)

    expect(
      violation,
      violation ? `${violation.message}\n\n${dumpViewport(fixture, analysis)}` : "ok",
    ).toBeNull()
  })

  test("REGRESSION 240×117 scrollTo=last: phantom ▼1 when cursor on last item", () => {
    // 50 items, 30 short × h=3 + 20 tall × h=20 = 490 rows.
    // scrollTo=49 (cursor on last item) → ▼ MUST be 0. Currently renders ▼1.
    //
    // Root cause (traced): layout-phase's calculateScrollState counts the
    // trailing placeholder Box as a "partially-visible bottom child" even
    // when there are no real items below the cursor. The indicator count
    // should come from virtualizer's hiddenAfter (= count - endIndex), not
    // from the placeholder Box's position.
    //
    // Expected on HEAD: FAIL (INV-2b). Guards the fix for bead
    // `km-silvery.virtualized-overflow-indicator-counts`.
    const items = buildItems(50, (i) => (i < 30 ? 3 : 20), "r3")

    const fixture: ListViewFixture = {
      items,
      cols: 240,
      rows: 117,
      viewport: 115,
      scrollTo: 49,
      estimateHeight: 4,
    }
    const analysis = renderFixture(fixture)
    const violation = checkAllInvariants(fixture, analysis)

    expect(
      violation,
      violation ? `${violation.message}\n\n${dumpViewport(fixture, analysis)}` : "ok",
    ).toBeNull()
  })

  test("REGRESSION 200×120: same distribution, the 'supposedly passes' size", () => {
    // Mirror the shape from listview-variable-heights.test.tsx test 1 but
    // verified through the full 4-invariant contract. If this passes AND
    // 240×117 passes but 240×117 scrollTo=49 fails, we've isolated the
    // remaining hole: overflow-indicator count when cursor is at the end.
    const items = buildItems(33, (i) => (i < 18 ? 3 : 30), "r2")

    const fixture: ListViewFixture = {
      items,
      cols: 200,
      rows: 120,
      viewport: 115,
      estimateHeight: 4,
    }
    const analysis = renderFixture(fixture)
    const violation = checkAllInvariants(fixture, analysis)

    expect(
      violation,
      violation ? `${violation.message}\n\n${dumpViewport(fixture, analysis)}` : "ok",
    ).toBeNull()
  })
})
