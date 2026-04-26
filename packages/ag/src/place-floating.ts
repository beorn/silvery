/**
 * placeFloating — pure rect math for anchor-relative floating decorations.
 *
 * Phase 4c of `km-silvery.view-as-layout-output` (overlay-anchor v1).
 *
 * Given an anchor rect (the Box's contentRect, looked up via `findAnchor`),
 * a floating target's intrinsic size, and a `Placement` directive, return the
 * rect at which the floating element should be painted this frame. No DOM,
 * no canvas, no terminal — just rects → rect. Mirrors Floating UI / Popper.js
 * vocabulary so apps moving between targets carry placement intent verbatim.
 *
 * v1 is **fixed-placement only**:
 *   - The result is deterministic given (anchor, size, placement).
 *   - No collision detection, no auto-flip, no auto-shift. Apps that need flip
 *     behavior should detect overflow themselves and pick a different
 *     placement.
 *   - No `offset` is applied to the cardinal-edge axis here; callers can
 *     thread `Decoration.offset` through and add it post-hoc if they want a
 *     gap between anchor and target.
 *
 * **Placement vocabulary**:
 *
 *   "top-start"     "top-center"       "top-end"
 *      ┌───────┐  ┌──────────────┐  ┌───────┐
 *      │       │  │              │  │       │
 *      └───────┘  └──────────────┘  └───────┘
 *      ┌───────────────────────────────────┐
 *  "left-start"     anchor              "right-start"
 *      │                                   │
 *      │         (this is the              │
 *  "left-center"     anchor                "right-center"
 *      │          contentRect)             │
 *      │                                   │
 *  "left-end"                            "right-end"
 *      └───────────────────────────────────┘
 *      ┌───────┐  ┌──────────────┐  ┌───────┐
 *      │       │  │              │  │       │
 *      └───────┘  └──────────────┘  └───────┘
 *  "bottom-start" "bottom-center"   "bottom-end"
 *
 * Side: which edge of the anchor the floating element sits ALONG.
 * Alignment: where on the perpendicular axis the floating element starts.
 *
 *   - top/bottom side → start aligns floating's left edge to anchor's left,
 *                        end aligns floating's right edge to anchor's right,
 *                        center centers along the X axis.
 *   - left/right side → start aligns floating's top edge to anchor's top,
 *                        end aligns floating's bottom edge to anchor's bottom,
 *                        center centers along the Y axis.
 */

import type { Placement, Rect } from "./types"

/**
 * Compute the absolute rect at which a floating decoration should be painted
 * relative to its anchor.
 *
 * Inputs:
 *   - `anchor`: the anchor's rect (typically `findAnchor(root, id)` →
 *     `contentRect`). Origin in the same absolute terminal cell space as
 *     other rect signals.
 *   - `target.{width, height}`: intrinsic size of the floating decoration.
 *     Both must be `>= 0` — this function does not enforce minimums; callers
 *     pass through what their renderer asked for.
 *   - `placement`: 12-placement vocabulary. See module docstring for the
 *     visual reference.
 *
 * Output: `Rect` in the same coordinate space as `anchor`. Width/height equal
 * `target.width`/`target.height` exactly (no clamping, no shifting).
 *
 * **Pure**: no allocation other than the result rect, no I/O, no logging.
 * Suitable for property tests and SILVERY_STRICT cross-checks.
 */
export function placeFloating(
  anchor: Rect,
  target: { width: number; height: number },
  placement: Placement,
): Rect {
  const { x: ax, y: ay, width: aw, height: ah } = anchor
  const tw = target.width
  const th = target.height

  // Decompose the placement into side + alignment. The 12 placements split
  // into 4 sides × 3 alignments; we resolve each axis independently.
  const dashIdx = placement.indexOf("-")
  const side = placement.slice(0, dashIdx) as "top" | "bottom" | "left" | "right"
  const align = placement.slice(dashIdx + 1) as "start" | "center" | "end"

  let x = 0
  let y = 0

  if (side === "top" || side === "bottom") {
    // Floating sits on the top or bottom edge of the anchor.
    // Y is fixed by the side; X varies by alignment.
    y = side === "top" ? ay - th : ay + ah
    if (align === "start") x = ax
    else if (align === "end") x = ax + aw - tw
    // center: place floating's mid-X on anchor's mid-X.
    else x = ax + Math.round((aw - tw) / 2)
  } else {
    // Floating sits on the left or right edge of the anchor.
    // X is fixed by the side; Y varies by alignment.
    x = side === "left" ? ax - tw : ax + aw
    if (align === "start") y = ay
    else if (align === "end") y = ay + ah - th
    else y = ay + Math.round((ah - th) / 2)
  }

  return { x, y, width: tw, height: th }
}
