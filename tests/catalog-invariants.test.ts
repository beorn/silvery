/**
 * Build gate: WCAG + visibility invariants for every bundled color scheme.
 *
 * Iterates all 84+ schemes in builtinPalettes, derives a Theme, and runs
 * validateThemeInvariants(theme, { wcag: true }) to ensure every shipped
 * scheme meets WCAG AA contrast requirements on the standard token pairs.
 *
 * This test fails CI when a new scheme author adds a low-contrast scheme
 * that slips through deriveTheme's ensureContrast pass. It is the build
 * gate that makes WCAG regressions visible at commit time rather than at
 * runtime (when users see invisible text or invisible selections).
 *
 * ## Exemptions
 *
 * If a scheme is intentionally low-contrast (e.g. a pastel palette that
 * sacrifices AA compliance for aesthetics), document the exemption in the
 * scheme's source file using a @wcagExempt JSDoc tag:
 *
 *   @wcagExempt contrast:primary/bg — intentionally pastel; visual hierarchy
 *              achieved via weight and spacing rather than contrast.
 *
 * Then add the scheme name to the WCAG_EXEMPT map below with the specific
 * rules to skip. Undocumented exemptions are not accepted — the rules that
 * are exempted must match exactly what is listed in the scheme's source.
 *
 * ## Token pairs checked
 *
 * All CONTRAST_PAIRS defined in packages/ansi/src/theme/invariants.ts:
 *   - fg/bg, fg/surfacebg, fg/popoverbg (AA 4.5:1)
 *   - muted/mutedbg (LARGE 3.0:1)
 *   - primary/bg, secondary/bg, accent/bg (AA 4.5:1)
 *   - error/bg, warning/bg, success/bg, info/bg, link/bg (AA 4.5:1)
 *   - inverse/inversebg, selection/selectionbg, cursor/cursorbg (AA 4.5:1)
 *   - primaryfg/primary, secondaryfg/secondary, accentfg/accent (AA 4.5:1)
 *   - errorfg/error, warningfg/warning, successfg/success, infofg/info (AA 4.5:1)
 *   - inputborder/bg, focusborder/bg (CONTROL 3.0:1)
 *   - disabledfg/bg (DIM 3.0:1)
 *   - border/bg (FAINT 1.5:1)
 *
 * Plus visibility invariants:
 *   - selectionbg vs bg: ΔL ≥ 0.08 (selection must be distinguishable)
 *   - cursorbg vs bg: OKLCH ΔE ≥ 0.15 (cursor must be distinguishable)
 */

import { describe, expect, it } from "vitest"
import { builtinPalettes, deriveTheme } from "@silvery/theme"
import { validateThemeInvariants } from "@silvery/ansi"

// ── Exemptions ────────────────────────────────────────────────────────
//
// Map from scheme name → set of rule strings that are intentionally exempt.
//
// HOW TO ADD AN EXEMPTION:
//   1. Add a @wcagExempt tag in the scheme's .ts source file documenting why.
//   2. Add the scheme name here with the exact failing rule strings.
//   3. The comment must reference the scheme file's documented rationale.
//
// Rules are strings like "contrast:primary/bg" or "visibility:selection".
// See packages/ansi/src/theme/invariants.ts for the full rule list.
//
// Currently no schemes require exemptions — all 84 bundled schemes pass.
const WCAG_EXEMPT: Record<string, Set<string>> = {
  // Example (not active):
  // "my-pastel-theme": new Set(["contrast:muted/mutedbg"]),
}

// ── Test suite ────────────────────────────────────────────────────────

const schemeEntries = Object.entries(builtinPalettes)

describe("catalog WCAG invariants", () => {
  // One test per scheme — failures clearly name the scheme and the rule.
  describe.each(schemeEntries)("%s", (schemeName, palette) => {
    it("passes WCAG AA contrast + visibility invariants", () => {
      const theme = deriveTheme(palette)
      const result = validateThemeInvariants(theme, { wcag: true, visibility: true })

      if (result.ok) return // all good

      // Filter out exempted rules for this scheme
      const exempt = WCAG_EXEMPT[schemeName] ?? new Set<string>()
      const nonExempt = result.violations.filter((v) => !exempt.has(v.rule))

      if (nonExempt.length === 0) return // all violations are exempted

      // Build a clear failure message: scheme + each violation
      const lines = nonExempt.map(
        (v) =>
          `  ${schemeName}: ${v.tokens[0]} on ${v.tokens[1]} fails ${v.rule.replace("contrast:", "").replace("visibility:", "visibility/")} (${v.actual.toFixed(2)}:1, need ${v.required.toFixed(1)}:1)`,
      )

      // Single expect with a descriptive message so CI shows exactly which
      // scheme and which token pairs fail — no need to dig through vitest output.
      expect.fail(
        `WCAG invariant violations in bundled scheme "${schemeName}":\n${lines.join("\n")}\n\n` +
          `If this is intentional, add an exemption in catalog-invariants.test.ts ` +
          `and document a @wcagExempt tag in the scheme's source file.`,
      )
    })
  })
})
