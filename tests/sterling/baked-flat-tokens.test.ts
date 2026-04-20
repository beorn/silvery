/**
 * Regression tests for baked-in Sterling flat tokens on every shipped default
 * theme. Replaces the pre-0.18.1 tests of `augmentWithSterlingFlat` (that
 * helper was inlined into `schemes/index.ts` when its public API was removed).
 *
 * Invariants:
 *   - Every Sterling flat token is present and hex-valued on each default theme
 *   - Legacy role keys (`accent`, `error`, `surface`, etc.) keep their legacy
 *     string values (nested Sterling role objects are not populated on the
 *     legacy Theme)
 */

import { describe, it, expect } from "vitest"
import {
  STERLING_FLAT_TOKENS,
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
} from "@silvery/theme"

const HEX = /^#[0-9a-fA-F]{6}$/

describe("default themes ship Sterling flat tokens", () => {
  const pairs = [
    ["defaultDarkTheme", defaultDarkTheme],
    ["defaultLightTheme", defaultLightTheme],
    ["ansi16DarkTheme", ansi16DarkTheme],
    ["ansi16LightTheme", ansi16LightTheme],
  ] as const

  for (const [name, theme] of pairs) {
    it(`${name} has every Sterling flat token`, () => {
      for (const token of STERLING_FLAT_TOKENS) {
        expect(
          (theme as unknown as Record<string, unknown>)[token],
          `${name} missing ${token}`,
        ).toMatch(HEX)
      }
    })

    it(`${name} preserves legacy string role values`, () => {
      for (const role of [
        "accent",
        "error",
        "muted",
        "surface",
        "border",
        "info",
        "success",
        "warning",
      ]) {
        expect(typeof (theme as unknown as Record<string, unknown>)[role], `${name}.${role}`).toBe(
          "string",
        )
      }
    })
  }
})
