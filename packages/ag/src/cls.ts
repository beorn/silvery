/**
 * CLS — Cumulative Layout Shift instrumentation for silvery.
 *
 * Analogous to Core Web Vitals CLS: a layout shift is the same block
 * rendering at a different rect in successive frames during a single
 * user-action window. Score = sum(area × distance) over all shifts.
 *
 * This module is pure: it defines the data shape + diff math. The pipeline
 * hook (cls-recorder) calls these helpers per frame; the strict-mode check
 * (pipeline/strict-cls) consumes the CLSReport. The termless capture API
 * (ag-term/app) drives begin/end of the capture window.
 *
 * Bead: km-silvery.cls-instrumentation-primitive
 */

import { rectEqual, type Rect } from "./types"

/**
 * Why a layout shift happened. Used to filter "expected" shifts (the user
 * scrolled, content arrived in a streaming view) from "unexpected" shifts
 * (a code fence resized mid-stream, a status line bounced) — only the
 * latter fail CLS strict checks.
 */
export type ReflowReason =
  | "user-action" // user did something — typed, scrolled, resized
  | "unexpected" // no triggering event — the bad kind, CLS we want to catch
  | "animation" // ongoing animation that's expected to move stuff
  | "content-arrival" // new content streamed in — expected for chat / log views

export interface LayoutShift {
  /** Stable identifier for the shifted block. */
  blockId: string
  /** Position + size in the previous frame. */
  fromRect: Rect
  /** Position + size in the current frame. */
  toRect: Rect
  /** Wall-clock timestamp at frame end (ms since epoch). */
  frameTimestamp: number
  /** Why the shift happened — see ReflowReason for taxonomy. */
  reflowReason: ReflowReason
}

export interface CLSReport {
  /** All shifts observed in the capture window. */
  shifts: readonly LayoutShift[]
  /** Sum of (area × distance) over all shifts (CLS metric proper). */
  cumulativeScore: number
  /** Subset of shifts with reflowReason="unexpected" — the actionable ones. */
  unexpectedShifts: readonly LayoutShift[]
}

/**
 * Compute the "impact" of a single shift: max(prev-area, curr-area) ×
 * euclidean-distance-moved between top-left corners. Returns 0 when the
 * rect is unchanged.
 *
 * Area is in cells (cols × rows); distance is in cells. Web CLS uses
 * "impact fraction" relative to viewport — we use raw area × distance
 * because terminal viewports are small and per-block context matters more
 * than viewport-relative weighting. Score is comparable across runs in the
 * same terminal-size + content envelope; not directly comparable across
 * different sizes.
 */
export function computeShiftScore(from: Rect, to: Rect): number {
  if (rectEqual(from, to)) return 0
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const fromArea = from.width * from.height
  const toArea = to.width * to.height
  return Math.max(fromArea, toArea) * distance
}

/**
 * Build a LayoutShift record from a rect transition. Returns null when the
 * rects are equal (no shift — caller can skip without branching).
 */
export function makeShift(
  blockId: string,
  fromRect: Rect,
  toRect: Rect,
  frameTimestamp: number,
  reflowReason: ReflowReason,
): LayoutShift | null {
  if (rectEqual(fromRect, toRect)) return null
  return { blockId, fromRect, toRect, frameTimestamp, reflowReason }
}

/**
 * Aggregate a list of shifts into a CLSReport. Pure: callers can stash
 * the shifts array however they like (per-frame, per-capture, per-test)
 * and call this once when building the report.
 *
 * cumulativeScore sums every shift, regardless of reflowReason — the
 * intent is "how much did the layout move?" — not "how much surprise?".
 * For surprise, callers check unexpectedShifts.length or
 * aggregateUnexpectedScore().
 */
export function aggregateReport(shifts: readonly LayoutShift[]): CLSReport {
  let cumulativeScore = 0
  const unexpectedShifts: LayoutShift[] = []
  for (const s of shifts) {
    cumulativeScore += computeShiftScore(s.fromRect, s.toRect)
    if (s.reflowReason === "unexpected") unexpectedShifts.push(s)
  }
  return { shifts, cumulativeScore, unexpectedShifts }
}

/**
 * Sum of impact scores for the unexpected subset only. Strict-mode checks
 * use this; "all shifts including content-arrival" is too noisy for an
 * assertion threshold.
 */
export function aggregateUnexpectedScore(shifts: readonly LayoutShift[]): number {
  let score = 0
  for (const s of shifts) {
    if (s.reflowReason !== "unexpected") continue
    score += computeShiftScore(s.fromRect, s.toRect)
  }
  return score
}

/**
 * Empty report shape — useful as the initial value for accumulators and
 * the return value when capture finds nothing.
 */
export function emptyReport(): CLSReport {
  return { shifts: [], cumulativeScore: 0, unexpectedShifts: [] }
}
