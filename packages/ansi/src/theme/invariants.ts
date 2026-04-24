/**
 * Theme invariants — post-derivation visibility + optional WCAG checks.
 *
 * Two independent invariant groups:
 *
 * 1. **Visibility (always checked)** — selection and cursor must be
 *    distinguishable from bg. These fail silently because ensureContrast
 *    doesn't touch `bg-selected`/`bg-cursor`; you get "invisible selection"
 *    bugs that only surface via user complaints.
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
 *
 * All token access is Sterling-shaped — flat hyphen keys (`bg-accent`,
 * `fg-on-error`, `border-focus`) exist on every Theme via the derive +
 * bakeFlat pipeline. No concat-kebab legacy names (`primaryfg`, `mutedbg`, …)
 * — those were removed in silvery 0.19.0 (Sterling interior migration).
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
  /** Which invariant failed (e.g. "contrast:fg/bg-surface-overlay", "visibility:selection"). */
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
  /**
   * Sterling flat-token key for the fg hex. Access via bracket lookup
   * (`theme[pair.fg]`). Keys follow `<channel>-<role>[-<state>]` or
   * `<channel>-on-<role>` grammar (see `@silvery/ansi/flatten.ts`).
   *
   * Two non-Sterling keys survive: `fg` and `bg` — they are the raw scheme
   * foreground and background. Sterling carries them at the top level as
   * convenience shortcuts (see `Theme` type).
   */
  fg: string
  /** Sterling flat-token key for the bg hex. */
  bg: string
  min: number
}

/**
 * Contrast invariant pairs — all Sterling flat-token keys.
 *
 * These keys are populated on every Theme at derivation time via `bakeFlat`;
 * bracket access (`theme["bg-accent"]`) is the canonical lookup form and is
 * what `validateThemeInvariants` uses below.
 */
const CONTRAST_PAIRS: Pair[] = [
  // AA — fg on every co-occurring surface background. The full matrix matters
  // because consumers compose `$fg` (text) freely on top of any surface bg
  // (`$bg`, `$bg-surface-*`, `$bg-muted`). If any pair is uncovered, a theme
  // can ship low-contrast text without tripping CI.
  { rule: "contrast:fg/bg", fg: "fg", bg: "bg", min: AA_RATIO },
  { rule: "contrast:fg/bg-surface-default", fg: "fg", bg: "bg-surface-default", min: AA_RATIO },
  { rule: "contrast:fg/bg-surface-subtle", fg: "fg", bg: "bg-surface-subtle", min: AA_RATIO },
  { rule: "contrast:fg/bg-surface-raised", fg: "fg", bg: "bg-surface-raised", min: AA_RATIO },
  { rule: "contrast:fg/bg-surface-hover", fg: "fg", bg: "bg-surface-hover", min: AA_RATIO },
  { rule: "contrast:fg/bg-surface-overlay", fg: "fg", bg: "bg-surface-overlay", min: AA_RATIO },
  { rule: "contrast:fg/bg-muted", fg: "fg", bg: "bg-muted", min: AA_RATIO },

  // fg-muted at LARGE_RATIO (3:1) — Sterling derives it at the same floor,
  // matching the original deemphasis contract. Tightening fg-muted to AA
  // (4.5:1) across every surface is tracked in km-silvery.invariant-matrix-gaps;
  // doing it here first would force catalog theme churn that's out of scope
  // for the cursor-contrast fix.
  { rule: "contrast:fg-muted/bg", fg: "fg-muted", bg: "bg", min: LARGE_RATIO },
  { rule: "contrast:fg-muted/bg-muted", fg: "fg-muted", bg: "bg-muted", min: LARGE_RATIO },

  // AA — role-tinted text on default bg (accent, status)
  { rule: "contrast:fg-accent/bg", fg: "fg-accent", bg: "bg", min: AA_RATIO },
  { rule: "contrast:fg-error/bg", fg: "fg-error", bg: "bg", min: AA_RATIO },
  { rule: "contrast:fg-warning/bg", fg: "fg-warning", bg: "bg", min: AA_RATIO },
  { rule: "contrast:fg-success/bg", fg: "fg-success", bg: "bg", min: AA_RATIO },
  { rule: "contrast:fg-info/bg", fg: "fg-info", bg: "bg", min: AA_RATIO },

  // AA — fg-on-<role> pairs (text on filled emphasis surfaces)
  { rule: "contrast:fg-on-accent/bg-accent", fg: "fg-on-accent", bg: "bg-accent", min: AA_RATIO },
  { rule: "contrast:fg-on-error/bg-error", fg: "fg-on-error", bg: "bg-error", min: AA_RATIO },
  {
    rule: "contrast:fg-on-warning/bg-warning",
    fg: "fg-on-warning",
    bg: "bg-warning",
    min: AA_RATIO,
  },
  {
    rule: "contrast:fg-on-success/bg-success",
    fg: "fg-on-success",
    bg: "bg-success",
    min: AA_RATIO,
  },
  { rule: "contrast:fg-on-info/bg-info", fg: "fg-on-info", bg: "bg-info", min: AA_RATIO },

  // AA — selection + cursor pairs
  {
    rule: "contrast:fg-on-selected/bg-selected",
    fg: "fg-on-selected",
    bg: "bg-selected",
    min: AA_RATIO,
  },
  { rule: "contrast:fg-cursor/bg-cursor", fg: "fg-cursor", bg: "bg-cursor", min: AA_RATIO },

  // Non-text chrome (WCAG 1.4.11)
  {
    rule: "contrast:border-default/bg",
    fg: "border-default",
    bg: "bg",
    min: LARGE_RATIO,
  },
  { rule: "contrast:border-focus/bg", fg: "border-focus", bg: "bg", min: LARGE_RATIO },

  // Structural dividers — border-muted is the subtle rule line
  { rule: "contrast:border-muted/bg", fg: "border-muted", bg: "bg", min: FAINT_RATIO },
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
    // Bracket access into Sterling flat tokens + the `fg`/`bg` root shortcuts.
    // We type-cast through Record because `pair.fg` / `pair.bg` are strings
    // (Sterling flat keys) rather than legacy `keyof Theme` members.
    const themeRecord = theme as unknown as Record<string, string | undefined>
    for (const pair of CONTRAST_PAIRS) {
      const fg = themeRecord[pair.fg]
      const bg = themeRecord[pair.bg]
      if (typeof fg !== "string" || typeof bg !== "string") continue
      const r = checkContrast(fg, bg)
      if (r === null) continue // non-hex — skip (ANSI16 mode)
      if (r.ratio < pair.min) {
        violations.push({
          rule: pair.rule,
          tokens: [pair.fg, pair.bg],
          actual: r.ratio,
          required: pair.min,
          message: `${pair.fg} (${fg}) on ${pair.bg} (${bg}) is ${r.ratio.toFixed(2)}:1, needs ${pair.min.toFixed(1)}:1`,
        })
      }
    }
  }

  if (checkVisibility) {
    // Read Sterling flat keys first, fall back to legacy fields. Sterling
    // doesn't yet ship `bg-selected` or `bg-cursor` as first-class flat
    // tokens (only `bg-selected-hover`), so the legacy shape `selectionbg`
    // / `cursorbg` is the authoritative source until Sterling's selection +
    // cursor flat tokens land. Tracked under
    // `km-silvery.sterling-selection-tokens`.
    const themeAny = theme as unknown as Record<string, string | undefined>
    const selectionBg = themeAny["bg-selected"] ?? themeAny["selectionbg"] ?? ""
    const cursorBg = themeAny["bg-cursor"] ?? themeAny["cursorbg"] ?? ""
    // Prefer Sterling key in violation tokens/messages when populated.
    const selectionKey = themeAny["bg-selected"] !== undefined ? "bg-selected" : "selectionbg"
    const cursorKey = themeAny["bg-cursor"] !== undefined ? "bg-cursor" : "cursorbg"

    // Selection visibility — ΔL ≥ 0.08 between selection bg and bg (so highlight is distinguishable)
    const lBg = lightness(theme.bg)
    const lSelBg = lightness(selectionBg)
    if (lBg !== null && lSelBg !== null) {
      const dL = Math.abs(lSelBg - lBg)
      if (dL < SELECTION_DELTA_L) {
        violations.push({
          rule: "visibility:selection",
          tokens: [selectionKey, "bg"],
          actual: dL,
          required: SELECTION_DELTA_L,
          message: `${selectionKey} (${selectionBg}) differs from bg (${theme.bg}) by ΔL=${dL.toFixed(3)}, needs ≥ ${SELECTION_DELTA_L.toFixed(2)}`,
        })
      }
    }

    // Cursor visibility — ΔE ≥ 0.15 (OKLCH) between cursor bg and bg
    const oBg = hexToOklch(theme.bg)
    const oCursorBg = hexToOklch(cursorBg)
    if (oBg && oCursorBg) {
      const de = oklchDeltaE(oBg, oCursorBg)
      if (de < CURSOR_DELTA_E) {
        violations.push({
          rule: "visibility:cursor",
          tokens: [cursorKey, "bg"],
          actual: de,
          required: CURSOR_DELTA_E,
          message: `${cursorKey} (${cursorBg}) differs from bg (${theme.bg}) by ΔE=${de.toFixed(3)}, needs ≥ ${CURSOR_DELTA_E.toFixed(2)}`,
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
