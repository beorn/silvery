/**
 * Sterling contrast catalog gate — D3 hard-fail.
 *
 * All 84 shipped schemes MUST pass WCAG AA in strict mode on the core role
 * pairs:
 *   - fg/bg for each role (accent, info, success, warning, error)
 *     • muted gets a 3:1 floor (deemphasized by design)
 *   - fgOn/bg for each interactive role
 *   - border.focus/bg
 *
 * This test is the canonical build-time gate. Failure blocks 2a.
 */

import { describe, test, expect } from "vitest"
import { sterling, WCAG_AA } from "@silvery/design"
import { builtinPalettes } from "@silvery/schemes/schemes"
import { checkContrast } from "@silvery/color"

const names = Object.keys(builtinPalettes)

describe("sterling catalog — strict-mode WCAG AA gate", () => {
  test.each(names)("'%s' passes strict mode", (name) => {
    const scheme = builtinPalettes[name]!
    // Should NOT throw.
    const theme = sterling.deriveFromScheme(scheme, { contrast: "strict" })

    // Double-check core pairs after the derivation.
    const bg = theme.surface.default
    const pairs: Array<[string, string, string, number]> = [
      ["accent.fg", theme.accent.fg, bg, WCAG_AA],
      ["info.fg", theme.info.fg, bg, WCAG_AA],
      ["success.fg", theme.success.fg, bg, WCAG_AA],
      ["warning.fg", theme.warning.fg, bg, WCAG_AA],
      ["error.fg", theme.error.fg, bg, WCAG_AA],
      ["muted.fg", theme.muted.fg, bg, 3.0],
      ["fg-on-accent", theme.accent.fgOn, theme.accent.bg, WCAG_AA],
      ["fg-on-info", theme.info.fgOn, theme.info.bg, WCAG_AA],
      ["fg-on-success", theme.success.fgOn, theme.success.bg, WCAG_AA],
      ["fg-on-warning", theme.warning.fgOn, theme.warning.bg, WCAG_AA],
      ["fg-on-error", theme.error.fgOn, theme.error.bg, WCAG_AA],
      ["border.focus", theme.border.focus, bg, WCAG_AA],
    ]

    for (const [label, fg, against, target] of pairs) {
      const r = checkContrast(fg, against)
      expect(r, `${name}: ${label}`).not.toBeNull()
      expect(r!.ratio, `${name}: ${label} fg=${fg} bg=${against}`).toBeGreaterThanOrEqual(target)
    }
  })
})
