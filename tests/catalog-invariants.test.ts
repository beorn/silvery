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
 *   - canonical root, text-on-surface, status, selection, cursor, and
 *     border pairs listed in `CONTRAST_PAIRS` (AA/LARGE/CONTROL/DIM/FAINT)
 *
 * Plus visibility invariants:
 *   - bg-selected vs bg: ΔL ≥ 0.08 (selection must be distinguishable)
 *   - bg-cursor vs bg: OKLCH ΔE ≥ 0.15 (cursor must be distinguishable)
 */

import { describe, expect, it } from "vitest"
import { builtinPalettes } from "@silvery/theme"
import { deriveTheme } from "@silvery/ansi"
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
const WCAG_EXEMPT: Record<string, Set<string>> = {
  // Example (not active):
  // "my-pastel-theme": new Set(["contrast:fg-muted/bg-muted"]),
}

// ── Global (per-rule) exemptions ──────────────────────────────────────
//
// Rules that are exempt across ALL schemes. Use sparingly — these are for
// cases where Sterling's design intent overrides a WCAG requirement.
//
// As of 2026-04-24 (km-silvery.sterling-{borders,cursor,surface}-adaptive)
// Sterling applies adaptive lift to border-default, border-muted, cursor.bg
// (visibility) + cursor.fg (AA), bg-surface-overlay/hover (AA against the
// post-lift theme.fg), and fg-muted (AA against the worst-case bg-muted).
// Every shipped catalog scheme passes the corresponding contrast / visibility
// invariants without exemption. The set is intentionally empty so a future
// regression in Sterling derivation surfaces as a CI failure on the offending
// scheme rather than being silently absorbed.
const GLOBAL_EXEMPT: ReadonlySet<string> = new Set([])

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
      const nonExempt = result.violations.filter(
        (v) => !exempt.has(v.rule) && !GLOBAL_EXEMPT.has(v.rule),
      )

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
