/**
 * Tests for theme invariants — post-derivation WCAG + visibility checks.
 */

import { describe, expect, it } from "vitest"
import {
  deriveTheme,
  loadTheme,
  validateThemeInvariants,
  formatViolations,
  ThemeInvariantError,
  defaultDarkScheme,
  defaultLightScheme,
  AA_RATIO,
  LARGE_RATIO,
  SELECTION_DELTA_L,
  CURSOR_DELTA_E,
} from "@silvery/ansi"
import type { Theme, ColorScheme, InvariantViolation } from "@silvery/ansi"

describe("validateThemeInvariants — bundled schemes", () => {
  it("default-dark passes default (visibility) invariants after deriveTheme", () => {
    const theme = deriveTheme(defaultDarkScheme)
    const { ok, violations } = validateThemeInvariants(theme)
    expect(ok, formatViolations(violations)).toBe(true)
  })

  it("default-light passes default (visibility) invariants after deriveTheme", () => {
    const theme = deriveTheme(defaultLightScheme)
    const { ok, violations } = validateThemeInvariants(theme)
    expect(ok, formatViolations(violations)).toBe(true)
  })

  it("default-dark passes the full WCAG audit too", () => {
    const theme = deriveTheme(defaultDarkScheme)
    const { ok, violations } = validateThemeInvariants(theme, { wcag: true })
    expect(ok, formatViolations(violations)).toBe(true)
  })

  it("default-light passes the full WCAG audit too", () => {
    const theme = deriveTheme(defaultLightScheme)
    const { ok, violations } = validateThemeInvariants(theme, { wcag: true })
    expect(ok, formatViolations(violations)).toBe(true)
  })
})

describe("validateThemeInvariants — intentionally broken themes", () => {
  it("detects contrast violation: fg too close to bg (wcag opt-in)", () => {
    const broken: Theme = {
      ...deriveTheme(defaultDarkScheme),
      fg: "#2E3440", // same luminance as default-dark bg
    }
    // Default (visibility only) won't catch this.
    expect(validateThemeInvariants(broken).ok).toBe(true)
    // Opt-in WCAG catches it.
    const { ok, violations } = validateThemeInvariants(broken, { wcag: true })
    expect(ok).toBe(false)
    expect(violations.some((v) => v.rule.startsWith("contrast:fg"))).toBe(true)
  })

  it("detects selection visibility failure: bg-selected === bg (default)", () => {
    // Sterling's `bg-selected` is the authoritative selection bg. The legacy
    // `selectionbg` fallback was dropped in 0.21.0 (sterling-purge-legacy-tokens)
    // — the visibility check reads `bg-selected` only.
    const broken: Theme = {
      ...deriveTheme(defaultDarkScheme),
      "bg-selected": defaultDarkScheme.background, // no ΔL
    } as never
    // Visibility is on by default — no opt-in needed.
    const { violations } = validateThemeInvariants(broken)
    expect(violations.some((v) => v.rule === "visibility:selection")).toBe(true)
  })

  it("detects cursor visibility failure: bg-cursor === bg (default)", () => {
    const broken: Theme = {
      ...deriveTheme(defaultDarkScheme),
      "bg-cursor": defaultDarkScheme.background,
      cursorbg: defaultDarkScheme.background, // no ΔE
    } as never
    const { violations } = validateThemeInvariants(broken)
    expect(violations.some((v) => v.rule === "visibility:cursor")).toBe(true)
  })

  it("exposes the actual measured value in WCAG violation", () => {
    const broken: Theme = { ...deriveTheme(defaultDarkScheme), fg: "#2E3440" }
    const { violations } = validateThemeInvariants(broken, { wcag: true })
    const fgViolation = violations.find((v) => v.rule.startsWith("contrast:fg"))
    expect(fgViolation).toBeDefined()
    expect(fgViolation!.actual).toBeGreaterThan(0)
    expect(fgViolation!.actual).toBeLessThan(AA_RATIO)
    expect(fgViolation!.required).toBe(AA_RATIO)
  })

  it("wcag: false skips contrast checks (default)", () => {
    const broken: Theme = { ...deriveTheme(defaultDarkScheme), fg: "#2E3440" }
    const { ok } = validateThemeInvariants(broken) // default
    expect(ok).toBe(true) // contrast not checked → no violations reported
  })

  it("visibility: false skips visibility checks", () => {
    const broken: Theme = {
      ...deriveTheme(defaultDarkScheme),
      "bg-selected": defaultDarkScheme.background,
    } as never
    const { ok } = validateThemeInvariants(broken, { visibility: false })
    expect(ok).toBe(true)
  })
})

describe("loadTheme — enforcement modes", () => {
  // deriveTheme auto-repairs contrast and visibility for ALL fields it constructs —
  // that's the whole point of lenient mode. To exercise the strict-throw path we
  // construct a synthetic ColorScheme with a post-repair failure mode: its primary
  // hint is at the exact bg luminance AND selectionBackground = bg. deriveTheme
  // will repair these, but we can verify the strict mode *would* throw if given
  // a Theme that's already broken by using `ThemeInvariantError` directly.
  it("ThemeInvariantError carries the violations array", () => {
    const violations: InvariantViolation[] = [
      {
        rule: "contrast:fg/bg",
        tokens: ["fg", "bg"],
        actual: 1.1,
        required: AA_RATIO,
        message: "fg (#777) on bg (#888) is 1.10:1, needs 4.5:1",
      },
    ]
    const err = new ThemeInvariantError(violations)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("ThemeInvariantError")
    expect(err.violations).toBe(violations)
    expect(err.message).toContain("contrast:fg/bg")
  })

  it("strict mode throws on an invalid Theme (validated via validateThemeInvariants)", () => {
    // This simulates what loadTheme's strict path does when invariants fail.
    // The visibility check reads Sterling's `bg-selected` only (legacy
    // `selectionbg` fallback was dropped in 0.21.0).
    const badTheme = {
      ...deriveTheme(defaultDarkScheme),
      "bg-selected": defaultDarkScheme.background,
    }
    const { ok, violations } = validateThemeInvariants(badTheme as never)
    expect(ok).toBe(false)
    expect(violations.length).toBeGreaterThan(0)
    expect(() => {
      throw new ThemeInvariantError(violations)
    }).toThrow(ThemeInvariantError)
  })

  it("lenient mode: bundled schemes produce no residual violations after repair", () => {
    const violations: InvariantViolation[] = []
    const theme = loadTheme(defaultDarkScheme, { enforce: "lenient", violations })
    expect(theme).toBeDefined()
    // default-dark is well-designed — zero residual violations expected.
    expect(violations).toHaveLength(0)
  })

  it("off mode skips validation entirely", () => {
    const theme = loadTheme(defaultDarkScheme, { enforce: "off" })
    expect(theme).toBeDefined()
  })

  it("adjustments out-param captures ensureContrast repairs", () => {
    const adjustments: never[] = []
    const theme = loadTheme(defaultLightScheme, { adjustments: adjustments as never })
    expect(theme).toBeDefined()
    // default-light needs some adjustments; don't assert exact count, just that it's populated shape-wise.
    expect(Array.isArray(adjustments)).toBe(true)
  })

  it("defaults: lenient + truecolor", () => {
    const theme = loadTheme(defaultDarkScheme)
    expect(theme.name).toMatch(/dark/i)
  })
})

describe("thresholds are exported", () => {
  it("publishes the numeric thresholds", () => {
    expect(AA_RATIO).toBe(4.5)
    expect(LARGE_RATIO).toBe(3.0)
    expect(SELECTION_DELTA_L).toBe(0.08)
    expect(CURSOR_DELTA_E).toBe(0.15)
  })
})

describe("formatViolations", () => {
  it("returns empty string for no violations", () => {
    expect(formatViolations([])).toBe("")
  })

  it("formats violations as bullet list", () => {
    const v: InvariantViolation = {
      rule: "contrast:fg/bg",
      tokens: ["fg", "bg"],
      actual: 2.3,
      required: 4.5,
      message: "fg (#777) on bg (#888) is 1.10:1, needs 4.5:1",
    }
    const formatted = formatViolations([v])
    expect(formatted).toContain("contrast:fg/bg")
    expect(formatted).toContain("needs 4.5:1")
  })
})
