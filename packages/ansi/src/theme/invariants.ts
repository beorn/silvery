/**
 * Theme invariants — post-derivation visibility + optional WCAG checks.
 *
 * Two independent invariant groups:
 *
 * 1. **Visibility (always checked)** — selection and cursor must be
 *    distinguishable from bg. These fail silently in the old system because
 *    ensureContrast doesn't touch selectionbg/cursorbg; you get "invisible
 *    selection" bugs that only surface via user complaints.
 *
 * 2. **WCAG contrast (opt-in)** — `deriveTheme()` already runs `ensureContrast`
 *    on every text/bg pair as it builds the Theme (lenient auto-adjust). A
 *    second validation pass is redundant for normal use. Enable it explicitly
 *    at build time to *verify* that shipped themes meet the targets, or when
 *    loading a hand-authored Theme object that skipped `deriveTheme`.
 *
 * This is why `validateThemeInvariants` defaults to `{ wcag: false }` — the
 * existing derivation already handles contrast. Callers opt in via
 * `validateThemeInvariants(theme, { wcag: true })` for strict pre-ship audits.
 */

import { checkContrast, hexToOklch, deltaE as oklchDeltaE } from "@silvery/color"
import type { Theme } from "./types.ts"

// WCAG thresholds (match derive.ts)
export const AA_RATIO = 4.5
export const LARGE_RATIO = 3.0
export const FAINT_RATIO = 1.5

// Visibility thresholds — calibrated against real terminal schemes (Catppuccin,
// Dracula, Nord, Solarized). The design spec's 0.15 was aspirational; light
// themes have less L range to work with, so a 0.08 floor is realistic while
// still catching "selection invisible" bugs.
export const SELECTION_DELTA_L = 0.08
export const CURSOR_DELTA_E = 0.15 // OKLCH ΔE (≈15 on ×100 scale)

export interface InvariantViolation {
  /** Which invariant failed (e.g. "contrast:fg/popoverbg", "visibility:selection"). */
  rule: string
  /** Token pair or concept involved. */
  tokens: string[]
  /** Measured value (e.g. contrast ratio or ΔE). */
  actual: number
  /** Required threshold. */
  required: number
  /** Human-readable error for logs/throws. */
  message: string
}

export interface InvariantResult {
  /** True when all invariants pass. */
  ok: boolean
  /** Every failing invariant. */
  violations: InvariantViolation[]
}

export interface InvariantOptions {
  /**
   * Check WCAG contrast ratios. Default `false` because `deriveTheme` already
   * runs `ensureContrast` during derivation (lenient auto-adjust). Enable for
   * build-time audits of bundled themes or to validate hand-authored Theme
   * objects that bypassed derivation.
   */
  wcag?: boolean
  /**
   * Check selection + cursor visibility (ΔL / ΔE vs bg). Default `true`
   * because these aren't handled by ensureContrast — they're independent
   * visibility invariants.
   */
  visibility?: boolean
}

interface Pair {
  rule: string
  fg: keyof Theme
  bg: keyof Theme
  min: number
}

const CONTRAST_PAIRS: Pair[] = [
  // AA — body text and accent-on-surface pairs
  { rule: "contrast:fg/bg", fg: "fg", bg: "bg", min: AA_RATIO },
  { rule: "contrast:fg/surfacebg", fg: "fg", bg: "surfacebg", min: AA_RATIO },
  { rule: "contrast:fg/popoverbg", fg: "fg", bg: "popoverbg", min: AA_RATIO },
  { rule: "contrast:muted/mutedbg", fg: "muted", bg: "mutedbg", min: LARGE_RATIO },
  { rule: "contrast:primary/bg", fg: "primary", bg: "bg", min: AA_RATIO },
  { rule: "contrast:secondary/bg", fg: "secondary", bg: "bg", min: AA_RATIO },
  { rule: "contrast:accent/bg", fg: "accent", bg: "bg", min: AA_RATIO },
  { rule: "contrast:error/bg", fg: "error", bg: "bg", min: AA_RATIO },
  { rule: "contrast:warning/bg", fg: "warning", bg: "bg", min: AA_RATIO },
  { rule: "contrast:success/bg", fg: "success", bg: "bg", min: AA_RATIO },
  { rule: "contrast:info/bg", fg: "info", bg: "bg", min: AA_RATIO },
  { rule: "contrast:link/bg", fg: "link", bg: "bg", min: AA_RATIO },

  // AA — inverse + selection + cursor + accent-on-accent pairs
  { rule: "contrast:inverse/inversebg", fg: "inverse", bg: "inversebg", min: AA_RATIO },
  { rule: "contrast:selection/selectionbg", fg: "selection", bg: "selectionbg", min: AA_RATIO },
  { rule: "contrast:cursor/cursorbg", fg: "cursor", bg: "cursorbg", min: AA_RATIO },
  { rule: "contrast:primaryfg/primary", fg: "primaryfg", bg: "primary", min: AA_RATIO },
  { rule: "contrast:secondaryfg/secondary", fg: "secondaryfg", bg: "secondary", min: AA_RATIO },
  { rule: "contrast:accentfg/accent", fg: "accentfg", bg: "accent", min: AA_RATIO },
  { rule: "contrast:errorfg/error", fg: "errorfg", bg: "error", min: AA_RATIO },
  { rule: "contrast:warningfg/warning", fg: "warningfg", bg: "warning", min: AA_RATIO },
  { rule: "contrast:successfg/success", fg: "successfg", bg: "success", min: AA_RATIO },
  { rule: "contrast:infofg/info", fg: "infofg", bg: "info", min: AA_RATIO },

  // Non-text chrome (WCAG 1.4.11)
  { rule: "contrast:inputborder/bg", fg: "inputborder", bg: "bg", min: LARGE_RATIO },
  { rule: "contrast:focusborder/bg", fg: "focusborder", bg: "bg", min: LARGE_RATIO },
  { rule: "contrast:disabledfg/bg", fg: "disabledfg", bg: "bg", min: LARGE_RATIO },

  // Structural dividers
  { rule: "contrast:border/bg", fg: "border", bg: "bg", min: FAINT_RATIO },
]

function lightness(hex: string): number | null {
  const o = hexToOklch(hex)
  return o ? o.L : null
}

/**
 * Validate post-derivation invariants on a Theme.
 *
 * Default: visibility checks only (selection ΔL, cursor ΔE). These are
 * invariants that `deriveTheme` doesn't enforce and that matter for every
 * theme regardless of authoring pedigree.
 *
 * Opt into WCAG contrast checks via `{ wcag: true }`. Use at build-time to
 * verify bundled themes, or when loading hand-authored Theme objects that
 * didn't flow through `deriveTheme`'s `ensureContrast` pass.
 *
 * Non-hex values (ANSI names from `ansi16` mode) are skipped with no
 * violation — ANSI 16 themes can't be contrast-checked in hex space.
 *
 * @example
 * ```ts
 * // Default — visibility only, fast
 * const { ok, violations } = validateThemeInvariants(theme)
 *
 * // Build-time audit — full WCAG check
 * const audit = validateThemeInvariants(theme, { wcag: true })
 * ```
 */
export function validateThemeInvariants(
  theme: Theme,
  opts: InvariantOptions = {},
): InvariantResult {
  const checkWcag = opts.wcag ?? false
  const checkVisibility = opts.visibility ?? true
  const violations: InvariantViolation[] = []

  if (checkWcag) {
    for (const pair of CONTRAST_PAIRS) {
      const fg = theme[pair.fg] as string
      const bg = theme[pair.bg] as string
      if (typeof fg !== "string" || typeof bg !== "string") continue
      const r = checkContrast(fg, bg)
      if (r === null) continue // non-hex — skip (ANSI16 mode)
      if (r.ratio < pair.min) {
        violations.push({
          rule: pair.rule,
          tokens: [String(pair.fg), String(pair.bg)],
          actual: r.ratio,
          required: pair.min,
          message: `${pair.fg} (${fg}) on ${pair.bg} (${bg}) is ${r.ratio.toFixed(2)}:1, needs ${pair.min.toFixed(1)}:1`,
        })
      }
    }
  }

  if (checkVisibility) {
    // Selection visibility — ΔL ≥ 0.08 between selectionbg and bg (so highlight is distinguishable)
    const lBg = lightness(theme.bg)
    const lSelBg = lightness(theme.selectionbg)
    if (lBg !== null && lSelBg !== null) {
      const dL = Math.abs(lSelBg - lBg)
      if (dL < SELECTION_DELTA_L) {
        violations.push({
          rule: "visibility:selection",
          tokens: ["selectionbg", "bg"],
          actual: dL,
          required: SELECTION_DELTA_L,
          message: `selectionbg (${theme.selectionbg}) differs from bg (${theme.bg}) by ΔL=${dL.toFixed(3)}, needs ≥ ${SELECTION_DELTA_L.toFixed(2)}`,
        })
      }
    }

    // Cursor visibility — ΔE ≥ 0.15 (OKLCH) between cursorbg and bg
    const oBg = hexToOklch(theme.bg)
    const oCursorBg = hexToOklch(theme.cursorbg)
    if (oBg && oCursorBg) {
      const de = oklchDeltaE(oBg, oCursorBg)
      if (de < CURSOR_DELTA_E) {
        violations.push({
          rule: "visibility:cursor",
          tokens: ["cursorbg", "bg"],
          actual: de,
          required: CURSOR_DELTA_E,
          message: `cursorbg (${theme.cursorbg}) differs from bg (${theme.bg}) by ΔE=${de.toFixed(3)}, needs ≥ ${CURSOR_DELTA_E.toFixed(2)}`,
        })
      }
    }
  }

  return { ok: violations.length === 0, violations }
}

/**
 * Format violations as a multiline error message for throws/logs.
 */
export function formatViolations(violations: InvariantViolation[]): string {
  if (violations.length === 0) return ""
  return violations.map((v) => `  - [${v.rule}] ${v.message}`).join("\n")
}

/**
 * Thrown by `loadTheme({ mode: "strict" })` when invariants fail.
 * Carries the violations array for programmatic inspection.
 */
export class ThemeInvariantError extends Error {
  readonly violations: InvariantViolation[]
  constructor(violations: InvariantViolation[]) {
    super(
      `Theme invariants failed (${violations.length} violation${violations.length === 1 ? "" : "s"}):\n${formatViolations(violations)}`,
    )
    this.name = "ThemeInvariantError"
    this.violations = violations
  }
}
