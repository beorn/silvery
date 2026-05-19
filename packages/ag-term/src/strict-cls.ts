/**
 * STRICT cls — assert no unexpected layout shifts in a CLS capture window.
 *
 * Bead: km-silvery.cls-instrumentation-primitive (Phase 4/7, 2026-05-13).
 *
 * The CLS instrumentation primitive (packages/ag/src/cls.ts) measures
 * layout shifts per frame, classifies each as user-action / animation /
 * content-arrival / unexpected, and aggregates into a CLSReport. Most
 * apps want shifts of the first three reasons to be allowed (they
 * correspond to legitimate reflow events). The "unexpected" reason is
 * the actionable subset — it's the bug class CLS is designed to catch
 * (a code fence resizing mid-stream, a status line bouncing, a card
 * flashing flush-left before snapping to its real position).
 *
 * SILVERY_STRICT=cls flips this from "consumers decide" to "assert that
 * the active capture observed no unexpected shifts." Termless tests can
 * then ship a green close-gate via the umbrella env var rather than
 * hand-rolled assertions in every test.
 *
 * Tier 2 (paranoid). `SILVERY_STRICT=2` includes it; `SILVERY_STRICT=1`
 * does NOT — the default fast pass leaves CLS to consumer-side checks
 * so that pre-existing unfixed shift offenders don't fail every test
 * run before they're fixed.
 *
 * Why ag-term/src/ and not pipeline/strict-cls.ts: this check fires at
 * capture-end (termless `endCLSCapture()`), not per-frame in the pipeline.
 * It has no coupling to render-phase / layout-phase internals — it
 * consumes a CLSReport and decides via the SILVERY_STRICT contract. The
 * placement parallels `strict-bordered-rect.ts` (another pure assertion
 * helper that sits outside `pipeline/`).
 */

import { aggregateUnexpectedScore, type CLSReport, type LayoutShift } from "@silvery/ag/cls"
import { isStrictEnabled } from "./strict-mode"

/** SILVERY_STRICT slug for the CLS check. Tier 2 by design. */
export const CLS_STRICT_SLUG = "cls"
export const CLS_STRICT_MIN_TIER = 2

/** Returns true when SILVERY_STRICT=cls (or =2 / =3 / etc.) is enabled. */
export function isClsStrictEnabled(): boolean {
  return isStrictEnabled(CLS_STRICT_SLUG, CLS_STRICT_MIN_TIER)
}

/**
 * Thrown when SILVERY_STRICT=cls is enabled and a capture window saw at
 * least one shift with reflowReason="unexpected".
 *
 * Carries the offending shifts AND the cumulative unexpected-only score
 * so failing tests can point at the worst offenders without rerunning.
 * `.message` is human-readable; `.shifts` + `.score` are for programmatic
 * inspection.
 */
export class UnexpectedLayoutShiftError extends Error {
  readonly shifts: readonly LayoutShift[]
  readonly score: number

  constructor(shifts: readonly LayoutShift[], score: number) {
    const summary = shifts
      .slice(0, 5)
      .map(
        (s) =>
          `  ${s.blockId}: (${s.fromRect.x},${s.fromRect.y} ${s.fromRect.width}×${s.fromRect.height}) → (${s.toRect.x},${s.toRect.y} ${s.toRect.width}×${s.toRect.height})`,
      )
      .join("\n")
    const tail = shifts.length > 5 ? `\n  ... and ${shifts.length - 5} more` : ""
    super(
      `[SILVERY_STRICT=cls] CLSReport contains ${shifts.length} unexpected layout shift(s), cumulative score ${score.toFixed(2)}:\n${summary}${tail}`,
    )
    this.name = "UnexpectedLayoutShiftError"
    this.shifts = shifts
    this.score = score
  }
}

/**
 * Throws `UnexpectedLayoutShiftError` if the report contains any
 * `reflowReason="unexpected"` shifts AND `SILVERY_STRICT=cls` (or a
 * stricter tier) is enabled. Otherwise a no-op.
 *
 * Callers (termless `endCLSCapture`, test harnesses, app-level
 * close-gate hooks) should invoke this immediately after producing a
 * CLSReport — the error names the offending blocks so the failure
 * message points at the bug.
 */
export function assertNoUnexpectedShifts(report: CLSReport): void {
  if (!isClsStrictEnabled()) return
  if (report.unexpectedShifts.length === 0) return
  const score = aggregateUnexpectedScore(report.shifts)
  throw new UnexpectedLayoutShiftError(report.unexpectedShifts, score)
}
