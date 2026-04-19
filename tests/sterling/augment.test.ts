/**
 * Tests for augmentWithSterlingFlat — the Phase 2b glue that merges Sterling
 * flat tokens onto a legacy Theme.
 *
 * Invariants:
 *   - Every legacy Theme field is preserved, unchanged
 *   - Every Sterling flat token is present and hex-valued
 *   - Legacy role keys (`accent`, `error`, `surface`, etc.) KEEP their legacy
 *     string value (NOT replaced by Sterling nested role objects)
 *   - The flat tokens are valid hex strings
 *
 * See hub/silvery/design/v10-terminal/design-system.md Phase 2b.
 */

import { describe, it, expect } from "vitest"
import { deriveTheme } from "@silvery/ansi"
import {
  augmentWithSterlingFlat,
  STERLING_FLAT_TOKENS,
  nord,
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
} from "@silvery/theme"

const HEX = /^#[0-9a-fA-F]{6}$/

describe("augmentWithSterlingFlat", () => {
  it("preserves every legacy field of the source theme", () => {
    const legacy = deriveTheme(nord)
    const unified = augmentWithSterlingFlat(legacy, nord)

    for (const key of Object.keys(legacy)) {
      expect((unified as Record<string, unknown>)[key], `legacy key ${key}`).toEqual(
        (legacy as Record<string, unknown>)[key],
      )
    }
  })

  it("populates every Sterling flat token with a hex string", () => {
    const unified = augmentWithSterlingFlat(deriveTheme(nord), nord)

    for (const token of STERLING_FLAT_TOKENS) {
      const v = (unified as Record<string, unknown>)[token]
      expect(typeof v, `${token} must be a string`).toBe("string")
      expect(v, `${token} must be a 6-digit hex`).toMatch(HEX)
    }
  })

  it("does NOT replace legacy string-valued role keys with Sterling role objects", () => {
    // Legacy keeps `accent`, `error`, `surface`, `border`, `cursor`, `muted`,
    // `info`, `success`, `warning` as hex strings. Sterling's nested role
    // objects arrive in Phase 2d.
    const unified = augmentWithSterlingFlat(deriveTheme(nord), nord)

    for (const role of ["accent", "error", "surface", "border", "cursor", "muted", "info", "success", "warning"]) {
      const v = (unified as Record<string, unknown>)[role]
      expect(typeof v, `${role} must remain a legacy hex string`).toBe("string")
    }
  })

  it("reconstructs a scheme from the theme when scheme is omitted", () => {
    const legacy = deriveTheme(nord)
    const unifiedWith = augmentWithSterlingFlat(legacy, nord)
    const unifiedWithout = augmentWithSterlingFlat(legacy)

    // Both should populate the full flat set; values may differ slightly
    // (reconstructed ANSI slots are lossy) but all tokens must be hex.
    for (const token of STERLING_FLAT_TOKENS) {
      expect((unifiedWith as Record<string, unknown>)[token]).toMatch(HEX)
      expect((unifiedWithout as Record<string, unknown>)[token]).toMatch(HEX)
    }
  })
})

describe("default themes ship Sterling flat tokens", () => {
  // Phase 2b: schemes/index.ts wraps every exported default in
  // augmentWithSterlingFlat so components get flat tokens out of the box.
  const pairs = [
    ["defaultDarkTheme", defaultDarkTheme],
    ["defaultLightTheme", defaultLightTheme],
    ["ansi16DarkTheme", ansi16DarkTheme],
    ["ansi16LightTheme", ansi16LightTheme],
  ] as const

  for (const [name, theme] of pairs) {
    it(`${name} has every Sterling flat token`, () => {
      for (const token of STERLING_FLAT_TOKENS) {
        expect((theme as Record<string, unknown>)[token], `${name} missing ${token}`).toMatch(HEX)
      }
    })

    it(`${name} preserves legacy string role values`, () => {
      for (const role of ["accent", "error", "muted", "surface", "border", "info", "success", "warning"]) {
        expect(typeof (theme as Record<string, unknown>)[role], `${name}.${role}`).toBe("string")
      }
    })
  }
})
