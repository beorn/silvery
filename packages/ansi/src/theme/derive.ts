/**
 * Public theme-construction entry points.
 *
 * Sterling is the sole semantic derivation authority. These wrappers retain
 * the established `@silvery/ansi` imports while delegating to its frozen
 * nested-role plus flat-projection factory; they must not add fields or
 * derive a second set of values.
 */

import type { ColorScheme, Theme } from "./types.ts"
import {
  validateThemeInvariants,
  ThemeInvariantError,
  type InvariantViolation,
} from "./invariants.ts"
import { sterling } from "../sterling/sterling.ts"

/**
 * A contrast lift reported by Sterling's canonical derivation trace.
 *
 * This preserves `loadTheme({ adjustments })` as a useful diagnostic without
 * inventing a parallel measurement model: every value is projected from the
 * exact Sterling trace step which changed it.
 */
export interface ThemeAdjustment {
  readonly token: string
  readonly from: string
  readonly to: string
  readonly rule: string
  readonly inputs: readonly string[]
}

function deriveCanonicalTheme(palette: ColorScheme, adjustments?: ThemeAdjustment[]): Theme {
  const theme = sterling.deriveFromScheme(palette, adjustments ? { trace: true } : undefined)
  if (adjustments) {
    for (const step of theme.derivationTrace ?? []) {
      if (step.liftedFrom === undefined) continue
      adjustments.push({
        token: step.token,
        from: step.liftedFrom,
        to: step.output,
        rule: step.rule,
        inputs: step.inputs,
      })
    }
  }
  return theme
}

/**
 * Derive a frozen Sterling Theme from a ColorScheme.
 *
 * ANSI16 is a renderer capability, not a separate theme shape: the returned
 * Theme is hex-valued and the output phase quantizes it when needed.
 */
export function deriveTheme(palette: ColorScheme, adjustments?: ThemeAdjustment[]): Theme {
  return deriveCanonicalTheme(palette, adjustments)
}

/**
 * Existing ergonomic ANSI16 entry point. It intentionally performs the same
 * canonical derivation as `deriveTheme`; paint-time quantization owns ANSI16.
 */
export function deriveAnsi16Theme(palette: ColorScheme): Theme {
  return deriveCanonicalTheme(palette)
}

export interface LoadThemeOptions {
  /**
   * Invariant enforcement:
   *   - `"strict"` — throw `ThemeInvariantError` when invariants fail.
   *   - `"lenient"` (default) — keep the Theme and populate `violations`.
   *   - `"off"` — skip post-derivation invariant validation.
   */
  enforce?: "strict" | "lenient" | "off"
  /** Run the optional WCAG invariant audit in addition to visibility checks. */
  wcag?: boolean
  /** Out-parameter for canonical Sterling contrast-lift trace entries. */
  adjustments?: ThemeAdjustment[]
  /** Out-parameter for post-derivation invariant violations in lenient mode. */
  violations?: InvariantViolation[]
}

/**
 * Derive and validate a Theme. Diagnostics are projections of the canonical
 * Sterling trace; no legacy derivation or ANSI16 mode branch exists here.
 */
export function loadTheme(palette: ColorScheme, opts: LoadThemeOptions = {}): Theme {
  const enforce = opts.enforce ?? "lenient"
  const theme = deriveCanonicalTheme(palette, opts.adjustments)
  if (enforce === "off") return theme

  const { ok, violations } = validateThemeInvariants(theme, { wcag: opts.wcag })
  if (!ok) {
    if (enforce === "strict") throw new ThemeInvariantError(violations)
    opts.violations?.push(...violations)
  }
  return theme
}
