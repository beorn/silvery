/**
 * Sterling user-scheme auto-lift — D3 rule 2.
 *
 * Construct a scheme with known AA failures; derive in auto-lift mode;
 * assert the failing tokens got lifted and now pass AA.
 */

import { describe, test, expect } from "vitest"
import { sterling } from "@silvery/color/design"
import { checkContrast } from "@silvery/color"
import type { ColorScheme } from "@silvery/ansi"

const WCAG_AA = 4.5

const failingDarkScheme: ColorScheme = {
  name: "test-bad-dark",
  dark: true,
  // Seeds deliberately too close to bg to fail AA at default L.
  primary: "#2E3440", // same as bg — 1:1 ratio
  black: "#2E3440",
  red: "#3B4048", // reddish but basically identical L to bg
  green: "#3B4058",
  yellow: "#3E3E3E",
  blue: "#2E3440",
  magenta: "#504060",
  cyan: "#3E5060",
  white: "#D8DEE9",
  brightBlack: "#4C566A",
  brightRed: "#3B4048",
  brightGreen: "#3B4058",
  brightYellow: "#3E3E3E",
  brightBlue: "#2E3440",
  brightMagenta: "#504060",
  brightCyan: "#3E5060",
  brightWhite: "#FFFFFF",
  foreground: "#ECEFF4",
  background: "#2E3440",
  cursorColor: "#ECEFF4",
  cursorText: "#2E3440",
  selectionBackground: "#4C566A",
  selectionForeground: "#ECEFF4",
}

describe("sterling auto-lift — user-scheme rescue", () => {
  test("auto-lift lifts warning.fg to AA when scheme.yellow fails against bg", () => {
    // Sanity: the raw seed fails AA
    const rawRatio = checkContrast(failingDarkScheme.yellow, failingDarkScheme.background)!.ratio
    expect(rawRatio).toBeLessThan(WCAG_AA)

    const theme = sterling.deriveFromScheme(failingDarkScheme, { contrast: "auto-lift" })
    const finalRatio = checkContrast(theme.warning.fg, theme.surface.default)!.ratio
    expect(finalRatio).toBeGreaterThanOrEqual(WCAG_AA)
    expect(theme.warning.fg).not.toBe(failingDarkScheme.yellow)
  })

  test("auto-lift rescues error.fg (red) too close to bg", () => {
    const theme = sterling.deriveFromScheme(failingDarkScheme, { contrast: "auto-lift" })
    const ratio = checkContrast(theme.error.fg, theme.surface.default)!.ratio
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA)
  })

  test("pinned tokens bypass auto-lift", () => {
    const pinned = "#3B4048" // deliberately too dim — normally would be lifted
    const theme = sterling.deriveFromScheme(failingDarkScheme, {
      contrast: "auto-lift",
      pins: { "error.fg": pinned },
    })
    expect(theme.error.fg).toBe(pinned)
    expect(theme["fg-error"]).toBe(pinned)
  })

  test("flat-form pins are accepted as equivalent to nested pins", () => {
    const pinned = "#AA00AA"
    const theme = sterling.deriveFromScheme(failingDarkScheme, {
      contrast: "auto-lift",
      pins: { "fg-error": pinned },
    })
    expect(theme.error.fg).toBe(pinned)
  })

  test("strict mode still succeeds when auto-lift can reach AA", () => {
    // Should NOT throw — auto-lift internally lifts to AA.
    const theme = sterling.deriveFromScheme(failingDarkScheme, { contrast: "strict" })
    expect(theme.warning.fg).toBeDefined()
  })
})
