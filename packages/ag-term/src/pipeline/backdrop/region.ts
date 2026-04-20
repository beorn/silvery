/**
 * Backdrop fade — shared region walker.
 *
 * Both stage 2 realizers (`realize-buffer.ts` and `realize-kitty.ts`) need
 * to iterate every cell covered by the plan's include + exclude rects with
 * single-visit semantics. Overlapping rects would otherwise double-fade
 * cells (buffer) or emit duplicate Kitty placements (overlay).
 *
 * `forEachFadeRegionCell` centralizes that walk with a `Uint8Array`
 * "visited" bitset. Pass an `includes` list to fade cells INSIDE each rect
 * (data-backdrop-fade), and an `excludes` list to fade everything OUTSIDE
 * each rect (data-backdrop-fade-excluded). Cells inside any include and
 * cells outside any exclude are both visited — but each cell is visited at
 * most once.
 *
 * The walker is pure / allocation-conscious: a single `Uint8Array` sized
 * to the buffer. No per-rect allocation; no closure captures beyond the
 * visitor callback.
 *
 * ### Determinism
 *
 * Visit order is stable and deterministic:
 *
 *   1. Includes are walked in their given order (parent before child,
 *      matching `collectBackdropMarkers` walk order).
 *   2. Within each include rect, rows ascend; within each row, cols ascend.
 *   3. Excludes follow, with the same row-ascending/col-ascending scan
 *      over the full buffer.
 *
 * The Kitty overlay's STRICT determinism invariant depends on this —
 * identical (plan, buffer) inputs must produce byte-identical overlay
 * strings across fresh and incremental paths.
 *
 * @see ./plan.ts — `Plan`, `PlanRect`
 * @see ./realize-buffer.ts — stage 2a (cell-level transform)
 * @see ./realize-kitty.ts — stage 2b (Kitty overlay emission)
 */

import type { PlanRect } from "./plan"

/**
 * Walk every cell covered by the plan's include and exclude rects and
 * invoke `visit(x, y)` for each unique cell.
 *
 * `includes` cells are those INSIDE any include rect.
 * `excludes` cells are those OUTSIDE any exclude rect (i.e., excluded from
 * the exclude's interior — the modal "cuts a hole" pattern).
 *
 * Rects are clipped to the buffer bounds (`[0, bufferWidth)` ×
 * `[0, bufferHeight)`). Zero-size rects are skipped. Cells are deduped
 * across all rects via a `Uint8Array` bitset — a cell belonging to two
 * overlapping includes is visited once, not twice.
 *
 * Returns the count of unique cells visited. Useful for short-circuiting
 * the "was any cell modified?" signal in realizers.
 */
export function forEachFadeRegionCell(
  bufferWidth: number,
  bufferHeight: number,
  includes: readonly PlanRect[],
  excludes: readonly PlanRect[],
  visit: (x: number, y: number) => void,
): number {
  if (bufferWidth <= 0 || bufferHeight <= 0) return 0
  if (includes.length === 0 && excludes.length === 0) return 0

  const seen = new Uint8Array(bufferWidth * bufferHeight)
  let count = 0

  const once = (x: number, y: number): void => {
    const i = y * bufferWidth + x
    if (seen[i] !== 0) return
    seen[i] = 1
    count += 1
    visit(x, y)
  }

  for (const { rect } of includes) {
    const x0 = Math.max(0, rect.x)
    const y0 = Math.max(0, rect.y)
    const x1 = Math.min(bufferWidth, rect.x + rect.width)
    const y1 = Math.min(bufferHeight, rect.y + rect.height)
    if (x0 >= x1 || y0 >= y1) continue
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) once(x, y)
    }
  }

  if (excludes.length > 0) {
    for (const { rect } of excludes) {
      const ix0 = Math.max(0, rect.x)
      const iy0 = Math.max(0, rect.y)
      const ix1 = Math.min(bufferWidth, rect.x + rect.width)
      const iy1 = Math.min(bufferHeight, rect.y + rect.height)
      const innerValid = ix0 < ix1 && iy0 < iy1
      for (let y = 0; y < bufferHeight; y++) {
        for (let x = 0; x < bufferWidth; x++) {
          if (innerValid && x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue
          once(x, y)
        }
      }
    }
  }

  return count
}
