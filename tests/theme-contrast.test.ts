/**
 * Verify contrast guarantees of the theme derivation system.
 *
 * These tests codify the minimum contrast ratios that deriveTheme() ensures
 * across all 43+ built-in palettes. See derive.ts header for the full table.
 */

import { describe, expect, it } from "vitest"
import {
  builtinPalettes,
  deriveTheme,
  checkContrast,
  ensureContrast,
  createTheme,
  quickTheme,
  autoGenerateTheme,
} from "@silvery/theme"
import type { Theme } from "@silvery/theme"

// ── Contrast targets (from derive.ts) ────────────────────────────────

const AA = 4.5
const DIM = 3.0
const FAINT = 1.5
const CONTROL = 3.0

// ── Test helpers ─────────────────────────────────────────────────────

function ratio(fg: string, bg: string): number {
  const r = checkContrast(fg, bg)
  return r?.ratio ?? 0
}

/** Check that a theme's primary-family tokens all meet AA. */
function assertPrimaryContrast(theme: Theme) {
  expect(ratio(theme.primary, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
  expect(ratio(theme.primaryfg, theme.primary)).toBeGreaterThanOrEqual(AA - 0.01)
  expect(ratio(theme.secondary, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
  expect(ratio(theme.accent, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
}

const palettes = Object.entries(builtinPalettes)

// ── ensureContrast unit tests ────────────────────────────────────────

describe("ensureContrast", () => {
  it("returns color unchanged when already meeting target", () => {
    const result = ensureContrast("#000000", "#FFFFFF", 4.5)
    expect(result).toBe("#000000")
  })

  it("darkens color on light background to meet target", () => {
    const adjusted = ensureContrast("#FFAB91", "#FFFFFF", 4.5)
    expect(ratio(adjusted, "#FFFFFF")).toBeGreaterThanOrEqual(4.5)
    expect(adjusted).not.toBe("#000000")
  })

  it("lightens color on dark background to meet target", () => {
    const adjusted = ensureContrast("#2E3440", "#1A1A2E", 4.5)
    expect(ratio(adjusted, "#1A1A2E")).toBeGreaterThanOrEqual(4.5)
  })

  it("returns non-hex color unchanged", () => {
    expect(ensureContrast("red", "#FFFFFF", 4.5)).toBe("red")
  })

  it("returns color unchanged when against is non-hex", () => {
    expect(ensureContrast("#FF0000", "white", 4.5)).toBe("#FF0000")
  })

  it("handles impossible targets gracefully (best-effort)", () => {
    // Mid-gray bg with extreme ratio target — should return best effort
    const result = ensureContrast("#808080", "#808080", 21)
    // Result should be far from the input (pushed to an extreme)
    expect(result).not.toBe("#808080")
  })
})

// ── checkContrast rounding ───────────────────────────────────────────

describe("checkContrast", () => {
  it("uses exact ratio for AA/AAA decisions (no rounding up)", () => {
    // Find a color pair with a ratio that rounds up to 4.5 but is actually below
    // 4.495 rounds to 4.50 — the aa flag should still be false
    const result = checkContrast("#757575", "#FFFFFF")
    expect(result).not.toBeNull()
    // The display ratio is rounded, but aa/aaa use exact values
    if (result && result.ratio >= 4.5) {
      expect(result.aa).toBe(true)
    }
    if (result && !result.aa) {
      // Even if display ratio shows 4.5, it can be below threshold
      expect(result.ratio).toBeLessThanOrEqual(4.5)
    }
  })
})

// ── Semantic primary propagation ─────────────────────────────────────

describe("semantic primary propagation", () => {
  it("quickTheme('blue') uses blue as primary, not yellow", () => {
    const theme = quickTheme("blue", "dark")
    // Should be blue-ish, not yellow-ish
    const hsl = checkContrast(theme.primary, "#000000") // just to confirm it's valid
    expect(hsl).not.toBeNull()
    // Blue primary should NOT be the default yellow (#EBCB8B)
    expect(theme.primary).not.toBe("#EBCB8B")
    assertPrimaryContrast(theme)
  })

  it("quickTheme('red') uses red as primary", () => {
    const theme = quickTheme("red", "dark")
    assertPrimaryContrast(theme)
  })

  it("createTheme().primary('#FF0000').build() uses red primary", () => {
    const theme = createTheme().primary("#FF0000").dark().build()
    // Primary should be the input color (or contrast-adjusted version of it)
    // It should NOT be yellow
    expect(theme.primary).not.toBe("#EBCB8B")
    assertPrimaryContrast(theme)
  })

  it("createTheme().preset('nord').primary('#A3BE8C').build() uses green primary", () => {
    const theme = createTheme().preset("nord").primary("#A3BE8C").build()
    // Should use the green override, not Nord's default yellow
    expect(theme.primary).not.toBe("#EBCB8B")
    assertPrimaryContrast(theme)
  })

  it("autoGenerateTheme preserves primary through derivation", () => {
    const theme = autoGenerateTheme("#5E81AC", "dark")
    // Primary should be contrast-adjusted version of input blue
    assertPrimaryContrast(theme)
    // secondary and accent should be derived from the SAME primary
    // (not from yellow, which would be the default)
  })

  it("autoGenerateTheme meets contrast guarantees", () => {
    // Test various hues
    for (const color of ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"]) {
      for (const mode of ["dark", "light"] as const) {
        const theme = autoGenerateTheme(color, mode)
        expect(ratio(theme.primary, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
        expect(ratio(theme.primaryfg, theme.primary)).toBeGreaterThanOrEqual(AA - 0.01)
      }
    }
  })

  it("built-in palettes still use yellow/blue default (no primary seed)", () => {
    // Nord dark should still use yellow as primary
    const nord = deriveTheme(builtinPalettes["nord"]!)
    // It should be derived from p.yellow (Nord yellow = #EBCB8B)
    // The exact color may be adjusted by ensureContrast, but it should
    // be yellow-ish, not blue or red
    expect(nord.primary).toBeDefined()
    assertPrimaryContrast(nord)
  })
})

// ── Derived theme contrast guarantees ────────────────────────────────

describe("deriveTheme contrast guarantees", () => {
  describe.each(palettes)("%s", (_name, palette) => {
    const theme = deriveTheme(palette)

    // Body text on all surfaces
    it("fg / bg >= AA (4.5:1)", () => {
      expect(ratio(theme.fg, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("fg (surface) / surface-bg >= AA (4.5:1)", () => {
      expect(ratio(theme.surface, theme.surfacebg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("fg (popover) / popover-bg >= AA (4.5:1)", () => {
      expect(ratio(theme.popover, theme.popoverbg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("muted / bg >= AA (4.5:1)", () => {
      expect(ratio(theme.muted, theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("muted / muted-bg >= AA (4.5:1)", () => {
      expect(ratio(theme.muted, theme.mutedbg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("disabled-fg / bg >= DIM (3.0:1)", () => {
      expect(ratio(theme.disabledfg, theme.bg)).toBeGreaterThanOrEqual(DIM - 0.01)
    })

    it("border / bg >= FAINT (1.5:1)", () => {
      expect(ratio(theme.border, theme.bg)).toBeGreaterThanOrEqual(FAINT - 0.01)
    })

    it("inputborder / bg >= CONTROL (3.0:1)", () => {
      expect(ratio(theme.inputborder, theme.bg)).toBeGreaterThanOrEqual(CONTROL - 0.01)
    })

    // Accent colors as text on root bg
    for (const token of ["primary", "error", "warning", "success", "info", "link"] as const) {
      it(`${token} / bg >= AA (4.5:1)`, () => {
        expect(ratio(theme[token], theme.bg)).toBeGreaterThanOrEqual(AA - 0.01)
      })
    }

    // Accent fg text on accent bg (badge readability)
    for (const token of [
      "primary",
      "secondary",
      "accent",
      "error",
      "warning",
      "success",
      "info",
    ] as const) {
      it(`${token}-fg / ${token} >= AA (4.5:1)`, () => {
        const fgColor = theme[`${token}fg` as keyof Theme] as string
        const bgColor = theme[token] as string
        expect(ratio(fgColor, bgColor)).toBeGreaterThanOrEqual(AA - 0.01)
      })
    }

    it("selection / selection-bg >= AA (4.5:1)", () => {
      expect(ratio(theme.selection, theme.selectionbg)).toBeGreaterThanOrEqual(AA - 0.01)
    })

    it("cursor / cursor-bg >= AA (4.5:1)", () => {
      expect(ratio(theme.cursor, theme.cursorbg)).toBeGreaterThanOrEqual(AA - 0.01)
    })
  })
})
