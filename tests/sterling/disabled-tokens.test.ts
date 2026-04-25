/**
 * Disabled token regression test — Sterling v1 completeness, no negative surprises.
 *
 * Validates the composite-based derivation rule for the disabled token family:
 *   fg-disabled    = composite(fg @ 0.38, bg-surface-default), ≥ 3:1 vs surface
 *   border-disabled = composite(border-default @ 0.24, bg-surface-default)
 *   bg-disabled    = composite(border-default @ 0.12, bg-surface-default)
 *
 * Disabled is a NEUTRAL family (sourced from the base interface tokens, not
 * accent/status), so the resulting hex must:
 *   - differ from the base tokens it deemphasizes
 *   - meet ≥3:1 contrast for fg-disabled against bg-surface-default
 *     (matches WCAG 1.4.3 AA-Large for non-essential text — disabled labels
 *     stay legible)
 *   - cover all 84 builtin palettes (no negative surprises across themes)
 */

import { describe, test, expect } from "vitest"
import { sterling } from "@silvery/theme/sterling"
import { builtinPalettes } from "@silvery/theme/schemes"
import { checkContrast } from "@silvery/color"

const contrastRatio = (fg: string, bg: string): number => checkContrast(fg, bg)?.ratio ?? 0

describe("Sterling disabled tokens", () => {
  const names = Object.keys(builtinPalettes)

  test("catalog has 84 schemes", () => {
    expect(names.length).toBe(84)
  })

  test.each(names)("'%s' — disabled tokens are populated and distinct", (name) => {
    const scheme = builtinPalettes[name]!
    const theme = sterling.deriveFromScheme(scheme)

    const fgDisabled = theme["fg-disabled"]
    const bgDisabled = theme["bg-disabled"]
    const borderDisabled = theme["border-disabled"]
    expect(fgDisabled, `${name} fg-disabled`).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    expect(bgDisabled, `${name} bg-disabled`).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    expect(borderDisabled, `${name} border-disabled`).toMatch(/^#[0-9a-fA-F]{3,8}$/)

    // Same-reference invariant — flat keys and nested role share the same string
    expect(theme.disabled.fg).toBe(fgDisabled)
    expect(theme.disabled.bg).toBe(bgDisabled)
    expect(theme.disabled.border).toBe(borderDisabled)

    // Disabled must be deemphasized vs the live tokens it relates to.
    expect(fgDisabled).not.toBe(theme["fg-default"])
    expect(borderDisabled).not.toBe(theme["border-default"])
  })

  test.each(names)("'%s' — fg-disabled has ≥3:1 contrast against bg-surface-default", (name) => {
    const scheme = builtinPalettes[name]!
    const theme = sterling.deriveFromScheme(scheme)
    const ratio = contrastRatio(theme["fg-disabled"], theme["bg-surface-default"])
    // Allow a small tolerance for the auto-lift floor (WCAG ratio computation
    // can drift by ~0.01 across browser/server color libraries).
    expect(ratio, `${name} contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(2.99)
  })
})
