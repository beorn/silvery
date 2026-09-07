/**
 * Regression tests for baked-in Sterling flat tokens on every shipped default
 * theme. The public default-theme exports must expose the canonical shape,
 * not a legacy string-role wrapper around its flat projection.
 *
 * Invariants:
 *   - Every Sterling flat token is present and hex-valued on each default theme
 *   - Nested role objects are frozen and agree with the flat projection.
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

    it(`${name} exposes canonical frozen roles and matching flat tokens`, () => {
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
        const value = (theme as unknown as Record<string, unknown>)[role]
        expect(typeof value, `${name}.${role}`).toBe("object")
        expect(Object.isFrozen(value), `${name}.${role}`).toBe(true)
      }
      expect(theme.accent.fg).toBe(theme["fg-accent"])
      expect(theme.surface.default).toBe(theme["bg-surface-default"])
      expect(theme.backdrop.bg).toBe(theme["bg-backdrop"])
    })
  }
})
