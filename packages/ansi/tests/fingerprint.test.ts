/**
 * Tests for scheme fingerprinting.
 */

import { describe, expect, it } from "vitest"
import {
  fingerprintMatch,
  fingerprintCandidates,
  defaultDarkScheme,
  defaultLightScheme,
} from "@silvery/ansi"
import type { ColorScheme } from "@silvery/ansi"

const CATALOG: readonly ColorScheme[] = [defaultDarkScheme, defaultLightScheme]

describe("fingerprintMatch — exact", () => {
  it("matches an exact copy of a catalog scheme", () => {
    const match = fingerprintMatch(defaultDarkScheme, CATALOG)
    expect(match).not.toBeNull()
    expect(match!.scheme.name).toBe(defaultDarkScheme.name)
    expect(match!.sumDeltaE).toBeLessThan(0.5)
    expect(match!.confidence).toBeGreaterThan(0.9)
  })

  it("picks the closer scheme when two are available", () => {
    const match = fingerprintMatch(defaultLightScheme, CATALOG)
    expect(match!.scheme.name).toBe(defaultLightScheme.name)
  })
})

describe("fingerprintMatch — near matches", () => {
  it("matches when colors are within per-slot threshold", () => {
    // Slightly-tweaked copy of default-dark — all slots within a few units.
    const tweaked: ColorScheme = { ...defaultDarkScheme, red: "#BF6169" } // 1-unit off
    const match = fingerprintMatch(tweaked, CATALOG)
    expect(match).not.toBeNull()
    expect(match!.scheme.name).toBe(defaultDarkScheme.name)
  })

  it("returns null when sum ΔE exceeds threshold", () => {
    // Way-off scheme — no match should land.
    const far: Partial<ColorScheme> = {
      foreground: "#00FF00",
      background: "#FF00FF",
      red: "#FFFF00",
      green: "#00FFFF",
      blue: "#FF0000",
    }
    const match = fingerprintMatch(far, CATALOG)
    expect(match).toBeNull()
  })

  it("returns null when one slot exceeds per-slot threshold even if sum passes", () => {
    const broken: ColorScheme = { ...defaultDarkScheme, red: "#FF00FF" } // massive single-slot deviation
    const match = fingerprintMatch(broken, CATALOG, { perSlotThreshold: 5 })
    expect(match).toBeNull()
  })
})

describe("fingerprintMatch — partial probes", () => {
  it("matches from partial probed data (fg+bg only)", () => {
    const partial: Partial<ColorScheme> = {
      foreground: defaultDarkScheme.foreground,
      background: defaultDarkScheme.background,
    }
    const match = fingerprintMatch(partial, CATALOG)
    expect(match).not.toBeNull()
    expect(match!.slotsCompared).toBe(2)
  })

  it("returns null when no probed slots were compared", () => {
    const empty: Partial<ColorScheme> = {}
    const match = fingerprintMatch(empty, CATALOG)
    expect(match).toBeNull()
  })

  it("ignores non-hex slots (ansi16 mode)", () => {
    const ansiNames: Partial<ColorScheme> = {
      foreground: "whiteBright" as never, // non-hex
      background: "#2E3440",
      red: "#BF616A",
    }
    const match = fingerprintMatch(ansiNames, CATALOG)
    expect(match).not.toBeNull()
    // Only #2E3440 and #BF616A were compared.
    expect(match!.slotsCompared).toBeLessThanOrEqual(2)
  })
})

describe("fingerprintCandidates", () => {
  it("returns all matches sorted by sum ΔE", () => {
    const candidates = fingerprintCandidates(defaultDarkScheme, CATALOG, { sumThreshold: 1000 })
    expect(candidates.length).toBeGreaterThan(0)
    // Sorted ascending by sumDeltaE
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i]!.sumDeltaE).toBeGreaterThanOrEqual(candidates[i - 1]!.sumDeltaE)
    }
  })

  it("returns an empty array when nothing matches", () => {
    const far: Partial<ColorScheme> = {
      foreground: "#00FF00",
      background: "#FF00FF",
      red: "#FFFF00",
      green: "#00FFFF",
    }
    const candidates = fingerprintCandidates(far, CATALOG)
    expect(candidates).toEqual([])
  })
})

describe("confidence scoring", () => {
  it("perfect match scores near 1.0", () => {
    const match = fingerprintMatch(defaultDarkScheme, CATALOG)
    expect(match!.confidence).toBeGreaterThan(0.95)
  })

  it("ΔE within threshold but not exact scores lower", () => {
    const tweaked: ColorScheme = {
      ...defaultDarkScheme,
      red: "#BF6165",
      green: "#A3BE89",
      blue: "#81A1BE",
    }
    const match = fingerprintMatch(tweaked, CATALOG)
    expect(match).not.toBeNull()
    expect(match!.confidence).toBeLessThan(1.0)
    expect(match!.confidence).toBeGreaterThan(0)
  })
})
