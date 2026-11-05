/**
 * Sterling contrast guardrails — D3 from sterling-preflight.md.
 *
 * Two modes:
 *   - `strict` — throw when a core role pair fails WCAG AA 4.5:1.
 *     Used by the catalog test (all 84 shipped schemes must pass).
 *   - `auto-lift` — adjust OKLCH lightness until AA passes (±0.04L increments
 *     up to ~0.20L). Logs at debug; silent by default. Used for user schemes
 *     at runtime.
 *
 * Pinned tokens (per-role overrides supplied by scheme authors) are excluded
 * from auto-lift and from strict-mode enforcement — the author accepts the
 * contrast consequence of pinning.
 */

import { checkContrast, ensureContrast } from "@silvery/color"

/** WCAG AA threshold for normal text. */
export const WCAG_AA = 4.5

/**
 * Per-step L shift used in the design-system.md §Derivation guardrails:
 *   "adjust via OKLCH lightness shifts (±0.04L increments, up to ~0.20L)"
 * These constants are kept for documentation/testing; `autoLift` itself
 * uses `ensureContrast` from @silvery/color which binary-searches the
 * minimum L shift that achieves the target.
 */
export const LIFT_STEP = 0.04
export const LIFT_MAX = 0.2

export interface ContrastViolation {
  readonly token: string
  readonly fg: string
  readonly bg: string
  readonly ratio: number
  readonly target: number
}

export class ContrastError extends Error {
  readonly violations: readonly ContrastViolation[]
  constructor(violations: readonly ContrastViolation[]) {
    const summary = violations
      .slice(0, 5)
      .map((v) => `${v.token}: ${v.ratio.toFixed(2)} < ${v.target} (fg=${v.fg}, bg=${v.bg})`)
      .join("; ")
    const extra = violations.length > 5 ? ` (+${violations.length - 5} more)` : ""
    super(`Sterling contrast: ${violations.length} violation(s): ${summary}${extra}`)
    this.name = "ContrastError"
    this.violations = violations
  }
}

/**
 * Verify `fg` on `bg` meets `target` ratio. Returns `null` when already
 * passing; otherwise returns a ContrastViolation.
 */
export function checkAA(
  token: string,
  fg: string,
  bg: string,
  target = WCAG_AA,
): ContrastViolation | null {
  const r = checkContrast(fg, bg)
  if (!r) return null // non-hex input — skip rather than error
  if (r.ratio >= target) return null
  return { token, fg, bg, ratio: r.ratio, target }
}

/**
 * Auto-lift `fg` against `bg` until the `target` contrast ratio is met,
 * via OKLCH L shifts (hue + chroma preserved). Light bg → darken;
 * dark bg → lighten.
 *
 * Implementation note: binary-searches the minimum L shift achieving the
 * target. Falls back to a best-effort value if the target is unreachable
 * (e.g., yellow against white can never hit 4.5:1 at any lightness while
 * preserving yellow hue; the result is the darkest in-gamut yellow).
 */
export function autoLift(
  fg: string,
  bg: string,
  target = WCAG_AA,
): { value: string; lifted: boolean } {
  const current = checkContrast(fg, bg)
  if (!current) return { value: fg, lifted: false }
  if (current.ratio >= target) return { value: fg, lifted: false }

  // ensureContrast() in @silvery/color binary-searches OKLCH L for the
  // minimum shift that hits the target (and returns best-effort otherwise).
  const adjusted = ensureContrast(fg, bg, target)
  const lifted = adjusted !== fg
  return { value: adjusted, lifted }
}
