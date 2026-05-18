/**
 * Pure helpers for "index" mode windowing math in ListView.
 *
 * Extracted so the math can be unit-tested without spinning up the renderer.
 * Two pieces:
 *
 * 1. `computeIndexTrailingSpacer` — height of the trailing spacer Box that
 *    represents items `[end, n)` not in the rendered window. Must equal
 *    `sumHeights(end, n)` (sum of effective heights of items end..n-1 plus
 *    the gaps between THEM, not between the spacer and its neighbours).
 *    Must be `>= 0` for every valid `(end, n)` — Yoga rejects negative
 *    height props.
 *
 * 2. `mapChildIndexToItem` — given a child index from layout-phase's
 *    `firstVisibleChild` / `lastVisibleChild`, return the corresponding
 *    virtual-item index. Accounts for the optional leading spacer AND the
 *    interstitial gap-Box (or `renderSeparator` node) injected between
 *    every pair of consecutive visible items.
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

export interface ResolveTrailingSpacerFillEndInput {
  endIndex: number
  previousEndIndex: number
  itemCount: number
  viewportHeight: number
  overscan: number
  trailingSpacerVisible: boolean
  rowSpaceAtEnd: boolean
  gestureDirection?: "up" | "down" | null
  renderScrollRow?: number | null
  previousRenderScrollRow?: number | null
}

export interface ResolveRetainedIndexWindowInput {
  startIndex: number
  endIndex: number
  previousStartIndex: number
  previousEndIndex: number
  itemCount: number
  retain: boolean
  maxGapItems: number
  maxRetainedItems: number
  maxRetainedRows: number
  rowsForRange(startIndex: number, endIndex: number): number
}

export interface RetainedIndexWindow {
  startIndex: number
  endIndex: number
  retained: boolean
}

/**
 * Keep recently-mounted trailing index-window items alive during active wheel scrolling.
 *
 * This is intentionally a render-window policy, not scroll physics: no input
 * is smoothed, capped, dropped, or delayed. We only avoid remounting content
 * just below the current window when the previous and current windows are
 * close enough to be represented as one contiguous slice.
 *
 * The leading edge is deliberately immutable. Changing `startIndex` changes
 * the leading spacer height, which can move the visible anchor during active
 * wheel input. Retention is allowed only on the trailing edge until ListView
 * has a separate off-flow retained subtree.
 */
export function resolveRetainedIndexWindow({
  startIndex,
  endIndex,
  previousStartIndex,
  previousEndIndex,
  itemCount,
  retain,
  maxGapItems,
  maxRetainedItems,
  maxRetainedRows,
  rowsForRange,
}: ResolveRetainedIndexWindowInput): RetainedIndexWindow {
  const currentStart = clampIndex(startIndex, itemCount)
  const currentEnd = Math.max(currentStart, clampIndex(endIndex, itemCount))
  if (!retain || previousEndIndex <= previousStartIndex || currentEnd <= currentStart) {
    return { startIndex: currentStart, endIndex: currentEnd, retained: false }
  }

  const previousStart = clampIndex(previousStartIndex, itemCount)
  const previousEnd = Math.max(previousStart, clampIndex(previousEndIndex, itemCount))
  if (previousEnd <= currentEnd) {
    return { startIndex: currentStart, endIndex: currentEnd, retained: false }
  }

  const gap = currentEnd < previousStart ? previousStart - currentEnd : 0
  if (gap > Math.max(0, maxGapItems)) {
    return { startIndex: currentStart, endIndex: currentEnd, retained: false }
  }

  const start = currentStart
  let end = Math.max(currentEnd, previousEnd)
  const itemBudget = Math.max(currentEnd - currentStart, Math.floor(maxRetainedItems))
  const rowBudget = Math.max(rowsForRange(currentStart, currentEnd), Math.floor(maxRetainedRows))

  while (end - start > itemBudget || rowsForRange(start, end) > rowBudget) {
    const canTrimEnd = end > currentEnd
    if (!canTrimEnd) break
    end--
  }

  return {
    startIndex: start,
    endIndex: end,
    retained: start !== currentStart || end !== currentEnd,
  }
}

function clampIndex(index: number, itemCount: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.min(Math.floor(index), Math.max(0, itemCount)))
}

/**
 * Extend the rendered tail when layout proves the viewport has reached the
 * trailing spacer before row-space says the list is at the bottom.
 *
 * This is the height-independent ListView escape hatch for stale/frozen height
 * predictions: row math can under-render the tail when rendered children are
 * shorter than the model expects. The layout pass is authoritative about the
 * visible children, so a visible trailing spacer means the next window must
 * mount more real items.
 */
export function resolveTrailingSpacerFillEnd({
  endIndex,
  previousEndIndex,
  itemCount,
  viewportHeight,
  overscan,
  trailingSpacerVisible,
  rowSpaceAtEnd,
  gestureDirection,
  renderScrollRow,
  previousRenderScrollRow,
}: ResolveTrailingSpacerFillEndInput): number {
  const clampedEnd = Math.max(0, Math.min(endIndex, itemCount))
  if (rowSpaceAtEnd || itemCount <= 0) {
    return clampedEnd
  }

  const previousEnd = Math.max(0, Math.min(previousEndIndex, itemCount))
  if (
    previousEnd > clampedEnd &&
    !rowMovedInGestureDirection({
      gestureDirection,
      renderScrollRow,
      previousRenderScrollRow,
    })
  ) {
    return previousEnd
  }

  if (!trailingSpacerVisible) {
    return clampedEnd
  }
  const baseEnd = Math.max(clampedEnd, previousEnd)
  if (baseEnd >= itemCount) return itemCount
  const fillItems = Math.max(1, Math.ceil(viewportHeight), Math.ceil(overscan))
  return Math.max(clampedEnd, Math.min(itemCount, baseEnd + fillItems))
}

function rowMovedInGestureDirection({
  gestureDirection,
  renderScrollRow,
  previousRenderScrollRow,
}: {
  gestureDirection?: "up" | "down" | null
  renderScrollRow?: number | null
  previousRenderScrollRow?: number | null
}): boolean {
  if (gestureDirection === undefined || gestureDirection === null) return true
  if (renderScrollRow == null || previousRenderScrollRow == null) return true
  const toleranceRows = 0.01
  if (gestureDirection === "up") {
    return renderScrollRow < previousRenderScrollRow - toleranceRows
  }
  return renderScrollRow > previousRenderScrollRow + toleranceRows
}

/**
 * Map a child-node index from layout-phase back to a virtual-item index.
 *
 * Last-frame's rendered child layout (height-independent / index mode):
 *
 *     [leadingSpacer?,
 *      item(prevStart),  [interstitial?],
 *      item(prevStart+1), [interstitial?],
 *      ...
 *      item(prevEnd-1),
 *      footer?, trailingSpacer?]
 *
 * `interstitial` is a single gap-Box (when `gap > 0`) OR a `renderSeparator()`
 * node. The two are mutually exclusive — see ListView.tsx render path.
 *
 * For `m = prevEnd - prevStart` items with one interstitial per pair:
 *   item(k) child index = leadingOffset + k * stride
 *   gap(k)  child index = leadingOffset + k * stride + 1   (k = 0..m-2)
 * where `stride = 1 + (hasInterstitial ? 1 : 0)`.
 *
 * Returns:
 *   - `{ kind: "before" }` if `c < leadingOffset` (in the leading spacer)
 *   - `{ kind: "item", index }` if `c` lands on an item slot
 *   - `{ kind: "interstitial" }` if `c` lands on a gap/separator slot
 *   - `{ kind: "after" }` if `c` is past the visible-items section
 */
export type MappedChild =
  | { kind: "before" }
  | { kind: "item"; index: number }
  | { kind: "interstitial" }
  | { kind: "after" }

export interface MapChildIndexOptions {
  hasLeadingSpacer: boolean
  prevStart: number
  prevEnd: number
  hasInterstitial: boolean
}

export function mapChildIndexToItem(c: number, opts: MapChildIndexOptions): MappedChild {
  const { hasLeadingSpacer, prevStart, prevEnd, hasInterstitial } = opts
  const leadingOffset = hasLeadingSpacer ? 1 : 0
  const m = Math.max(0, prevEnd - prevStart)
  if (c < leadingOffset) return { kind: "before" }
  if (m <= 0) return { kind: "after" }
  const stride = hasInterstitial ? 2 : 1
  // Total child-slots occupied by visible items + interstitials:
  //   m items * stride - (hasInterstitial ? 1 : 0)   (no trailing interstitial)
  const itemsSpan = m * stride - (hasInterstitial ? 1 : 0)
  const local = c - leadingOffset
  if (local >= itemsSpan) return { kind: "after" }
  if (!hasInterstitial) return { kind: "item", index: prevStart + local }
  // Even local index -> item; odd -> interstitial.
  if (local % 2 === 0) return { kind: "item", index: prevStart + local / 2 }
  return { kind: "interstitial" }
}
