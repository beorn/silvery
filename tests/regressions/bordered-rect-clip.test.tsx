/**
 * STRICT bordered-rect-clip — assert every painted cell stays inside the
 * nearest bordered ancestor's inner content rect.
 *
 * Bead: @km/silvery/cell-outside-rect-strict-check (P2, 2026-05-08).
 *
 * Four cases mirror the slug's contract surface:
 *   1. Trips           — bordered Box without overflow:hidden, text overflows
 *   2. Skips (overflow) — same shape + overflow="hidden" → safe by construction
 *   3. Skips (truncate) — same shape + Text wrap="truncate" → text fits the inner rect
 *   4. Skips (sanity)   — same shape, text fits → no throw
 *
 * The slug is tier-2 (paranoid) so SILVERY_STRICT=1 must NOT trip it.
 * That's also asserted as part of the suite (no false positives at the
 * default test-fast tier).
 */

import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"
import {
  BorderedRectClipError,
  BORDERED_RECT_CLIP_MIN_TIER,
  BORDERED_RECT_CLIP_SLUG,
  isBorderedRectClipEnabled,
} from "@silvery/ag-term/strict-bordered-rect"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"

// ───────── env-var helpers ────────────────────────────────────────────────

function withStrict<T>(value: string | undefined, fn: () => T): T {
  const saved = process.env.SILVERY_STRICT
  if (value === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = value
  }
  resetStrictCache()
  try {
    return fn()
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
}

beforeEach(() => resetStrictCache())
afterEach(() => resetStrictCache())

// ───────── Strict-gate semantics ──────────────────────────────────────────

describe("bordered-rect-clip strict gate (SILVERY_STRICT)", () => {
  test("constants: slug='bordered-rect-clip', tier=2", () => {
    expect(BORDERED_RECT_CLIP_SLUG).toBe("bordered-rect-clip")
    expect(BORDERED_RECT_CLIP_MIN_TIER).toBe(2)
  })

  test("default-off: SILVERY_STRICT=1 does NOT enable bordered-rect-clip", () => {
    expect(withStrict("1", () => isBorderedRectClipEnabled())).toBe(false)
  })

  test("unset / 0: bordered-rect-clip stays off", () => {
    expect(withStrict(undefined, () => isBorderedRectClipEnabled())).toBe(false)
    expect(withStrict("0", () => isBorderedRectClipEnabled())).toBe(false)
  })

  test("tier-2: SILVERY_STRICT=2 enables bordered-rect-clip", () => {
    expect(withStrict("2", () => isBorderedRectClipEnabled())).toBe(true)
  })

  test("explicit slug: SILVERY_STRICT=bordered-rect-clip turns it on", () => {
    expect(withStrict("bordered-rect-clip", () => isBorderedRectClipEnabled())).toBe(true)
  })

  test("per-test opt-out: SILVERY_STRICT=2,!bordered-rect-clip skips it", () => {
    expect(withStrict("2,!bordered-rect-clip", () => isBorderedRectClipEnabled())).toBe(false)
  })
})

// ───────── End-to-end: cells outside the inner rect throw ────────────────

describe("bordered-rect-clip integration: cells outside bordered rect throw", () => {
  test("trips: bordered Box without overflow:hidden, text wraps past the inner row", () => {
    // Fixed-size bordered Box, breakable text whose natural width fits
    // (≤ inner 18 cols) but whose wrapped-line count exceeds the inner
    // height (1 row). Lines 2..N paint into / past the bottom border.
    //
    // We DELIBERATELY use wrappable text (spaces between letters) so
    // the layout-phase width-overflow check (gated only on width) does
    // not fire — only the new bordered-rect-clip cell-paint check does.
    const render = createRenderer({ cols: 80, rows: 12 })
    function App(): React.ReactElement {
      return (
        <Box width={20} height={3} borderStyle="round">
          <Text>{"a ".repeat(20)}</Text>
        </Box>
      )
    }

    let thrown: unknown = undefined
    try {
      withStrict("2", () => {
        render(<App />)
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(BorderedRectClipError)
    const msg = (thrown as Error).message
    expect(msg).toContain("STRICT bordered-rect-clip")
    expect(msg).toContain("cell painted outside ancestor's bordered rect")
    expect(msg).toContain("borderStyle='round'")
    expect(msg).toContain("Suggested fix")
  })

  test("skips (overflow): bordered Box with overflow='hidden' is safe by construction", () => {
    // Same overflowing shape, but the box clips children — the existing
    // computeChildClipBounds path enforces correctness, so bordered-rect-clip
    // must NOT flag it (would be a false positive).
    const render = createRenderer({ cols: 80, rows: 12 })
    function App(): React.ReactElement {
      return (
        <Box width={20} height={3} borderStyle="round" overflow="hidden">
          <Text>{"a ".repeat(20)}</Text>
        </Box>
      )
    }
    expect(() => {
      withStrict("2", () => {
        render(<App />)
      })
    }).not.toThrow()
  })

  test("skips (wrap='truncate' + minWidth=0): inner Text truncates to fit the inner rect", () => {
    // wrap="truncate" + minWidth={0} lets layout assign the Text a
    // narrower-than-natural width; the renderer then truncates the
    // text-with-ellipsis at the assigned width. Result: text fits the
    // inner rect on a single row, no cells leave the bordered ancestor.
    //
    // Without minWidth={0}, CSS §4.5 auto-min-size pins the Text to
    // its longest unbreakable token's natural width — which would trip
    // the existing layout-overflow check before bordered-rect-clip
    // ever runs. The minWidth=0 escape hatch is the canonical fix
    // (see e.g. tests/features/divider-overflow-clear.test.tsx).
    const render = createRenderer({ cols: 80, rows: 12 })
    function App(): React.ReactElement {
      return (
        <Box width={20} height={3} borderStyle="round">
          <Text wrap="truncate" minWidth={0}>
            {"a ".repeat(20)}
          </Text>
        </Box>
      )
    }
    expect(() => {
      withStrict("2", () => {
        render(<App />)
      })
    }).not.toThrow()
  })

  test("skips (sanity): text fits inside the inner rect — no throw", () => {
    // Baseline: the bordered Box's inner content area is 18×1 (20-2 by
    // 3-2) and a 10-char string fits comfortably. Must not throw.
    const render = createRenderer({ cols: 80, rows: 12 })
    function App(): React.ReactElement {
      return (
        <Box width={20} height={3} borderStyle="round">
          <Text>{"a".repeat(10)}</Text>
        </Box>
      )
    }
    expect(() => {
      withStrict("2", () => {
        render(<App />)
      })
    }).not.toThrow()
  })

  test("default tier 1: same overflowing shape does NOT throw (tier-2 only)", () => {
    // Back-compat: SILVERY_STRICT=1 must not introduce new failures.
    const render = createRenderer({ cols: 80, rows: 12 })
    function App(): React.ReactElement {
      return (
        <Box width={20} height={3} borderStyle="round">
          <Text>{"a ".repeat(20)}</Text>
        </Box>
      )
    }
    expect(() => {
      withStrict("1", () => {
        render(<App />)
      })
    }).not.toThrow()
  })
})
