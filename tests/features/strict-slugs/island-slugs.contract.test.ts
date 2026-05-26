/**
 * Contract: the 7 `<Island>` strict slugs are reserved at tier 2 and routed
 * through the canonical `isStrictEnabled(slug, minTier)` gate.
 *
 * Unit D of `@km/silvery/15646-islands`. The actual check logic at the call
 * sites lives in Unit B (factory) + Unit C (aggregator) + Phases 2-3 (guests
 * + rec adoption). This contract test only certifies that the gate parser
 * routes the seven slugs correctly under the SILVERY_STRICT contract.
 *
 * The seven slugs:
 *   island-paint-oob, island-grapheme-width, island-resize-race,
 *   island-mode-leak, island-dispose-leak, island-paint-budget,
 *   island-boundary-limits.
 *
 * All at tier 2 (paranoid — opt-in, not default), per the /pro-resolved
 * decision row in the epic.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { isStrictEnabled, resetStrictCache } from "@silvery/ag-term/strict-mode"

const ISLAND_SLUGS = [
  "island-paint-oob",
  "island-grapheme-width",
  "island-resize-race",
  "island-mode-leak",
  "island-dispose-leak",
  "island-paint-budget",
  "island-boundary-limits",
] as const

const ISLAND_MIN_TIER = 2

let prevStrict: string | undefined

beforeEach(() => {
  prevStrict = process.env.SILVERY_STRICT
})

afterEach(() => {
  if (prevStrict === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = prevStrict
  }
  resetStrictCache()
})

function setStrict(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = value
  }
  resetStrictCache()
}

describe("island-* strict slugs — tier 2, gated via SILVERY_STRICT", () => {
  test("SILVERY_STRICT unset → all 7 slugs disabled", () => {
    setStrict(undefined)
    for (const slug of ISLAND_SLUGS) {
      expect(isStrictEnabled(slug, ISLAND_MIN_TIER)).toBe(false)
    }
  })

  test("SILVERY_STRICT=1 → all 7 slugs disabled (tier 1 < tier 2)", () => {
    setStrict("1")
    for (const slug of ISLAND_SLUGS) {
      expect(isStrictEnabled(slug, ISLAND_MIN_TIER)).toBe(false)
    }
  })

  test("SILVERY_STRICT=2 → all 7 slugs enabled", () => {
    setStrict("2")
    for (const slug of ISLAND_SLUGS) {
      expect(isStrictEnabled(slug, ISLAND_MIN_TIER)).toBe(true)
    }
  })

  test("SILVERY_STRICT=island-paint-oob → only that slug enabled, others disabled", () => {
    setStrict("island-paint-oob")
    expect(isStrictEnabled("island-paint-oob", ISLAND_MIN_TIER)).toBe(true)
    for (const slug of ISLAND_SLUGS) {
      if (slug === "island-paint-oob") continue
      expect(isStrictEnabled(slug, ISLAND_MIN_TIER)).toBe(false)
    }
  })

  test("SILVERY_STRICT=2,!island-mode-leak → 6 slugs enabled, island-mode-leak disabled", () => {
    setStrict("2,!island-mode-leak")
    for (const slug of ISLAND_SLUGS) {
      const expected = slug !== "island-mode-leak"
      expect(isStrictEnabled(slug, ISLAND_MIN_TIER)).toBe(expected)
    }
  })

  test("each slug is individually selectable via explicit slug enablement", () => {
    for (const target of ISLAND_SLUGS) {
      setStrict(target)
      for (const slug of ISLAND_SLUGS) {
        expect(isStrictEnabled(slug, ISLAND_MIN_TIER)).toBe(slug === target)
      }
    }
  })

  test("each slug is individually skippable from tier 2 via `!slug`", () => {
    for (const target of ISLAND_SLUGS) {
      setStrict(`2,!${target}`)
      for (const slug of ISLAND_SLUGS) {
        const expected = slug !== target
        expect(isStrictEnabled(slug, ISLAND_MIN_TIER)).toBe(expected)
      }
    }
  })
})
