/**
 * Pure helpers for "index" mode windowing math in ListView.
 *
 * Extracted so the math can be unit-tested without spinning up the renderer.
 *
 * `computeIndexTrailingSpacer` — height of the trailing spacer Box that
 * represents items `[end, n)` not in the rendered window. Must equal
 * `sumHeights(end, n)` (sum of effective heights of items end..n-1 plus
 * the gaps between THEM, not between the spacer and its neighbours).
 * Must be `>= 0` for every valid `(end, n)` — Yoga rejects negative
 * height props.
 */

import type { HeightModel } from "./height-model"

/**
 * Trailing spacer height for "index" mode.
 *
 * Mathematically: `sum(heights[end..n)) + max(0, n-end-1) * gap`
 *
 * We derive it from HeightModel by:
 *   `totalRows() - prefixSum(end) - (n-1)*gap + max(0, n-end-1)*gap`
 * because `totalRows()` already includes the full `(n-1)*gap` account.
 *
 * Always non-negative — guarded by clamp on the way out.
 */
export function computeIndexTrailingSpacer(
  heightModel: HeightModel,
  indexWindowEnd: number,
  itemCount: number,
  gap: number,
): number {
  if (itemCount <= 0) return 0
  const end = Math.max(0, Math.min(indexWindowEnd, itemCount))
  if (end >= itemCount) return 0
  const totalGapAccount = Math.max(0, itemCount - 1) * gap
  const trailingInternalGaps = Math.max(0, itemCount - end - 1) * gap
  const raw =
    heightModel.totalRows() - heightModel.prefixSum(end) - totalGapAccount + trailingInternalGaps
  // Defensive clamp — HeightModel arithmetic should make this always >= 0,
  // but rounding from fractional measurements can produce tiny negatives
  // and Yoga rejects negative heights.
  return Math.max(0, raw)
}
