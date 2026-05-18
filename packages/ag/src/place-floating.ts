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
 * `placeFloating` is **fixed-placement only**:
 *   - The result is deterministic given (anchor, size, placement).
 *   - No collision detection, no auto-flip, no auto-shift. Apps that need flip
 *     behavior use `resolveFloatingPlacement`.
 *   - `offset` and `alignOffset` are simple deterministic nudges, not collision
 *     handling.
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

import type { CollisionStrategy, Placement, Rect } from "./types"

export interface FloatingPlacementOptions {
  /** Gap along the placement axis, in cells. Default: 0. */
  offset?: number
  /** Nudge along the alignment axis, in cells. Default: 0. */
  alignOffset?: number
}

export interface FloatingCollisionOptions extends FloatingPlacementOptions {
  /** Boundary rect used for collision handling. Usually the viewport/root rect. */
  boundary?: Rect | null
  /** Collision policy. Default: "none". */
  collisionStrategy?: CollisionStrategy
}

export interface FloatingPlacementResult {
  /** Final rect. Width/height always equal the requested target size. */
  rect: Rect
  /** Final placement after any flip. */
  placement: Placement
  /** True when collision handling used the opposite side. */
  flipped: boolean
  /** True when collision handling clamped the rect inside the boundary. */
  shifted: boolean
}

type Side = "top" | "bottom" | "left" | "right"
type Align = "start" | "center" | "end"

function splitPlacement(placement: Placement): { side: Side; align: Align } {
  const dashIdx = placement.indexOf("-")
  return {
    side: placement.slice(0, dashIdx) as Side,
    align: placement.slice(dashIdx + 1) as Align,
  }
}

function oppositePlacement(placement: Placement): Placement {
  const { side, align } = splitPlacement(placement)
  const opposite: Record<Side, Side> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  }
  return `${opposite[side]}-${align}` as Placement
}

function rectFitsWithin(rect: Rect, boundary: Rect): boolean {
  return (
    rect.x >= boundary.x &&
    rect.y >= boundary.y &&
    rect.x + rect.width <= boundary.x + boundary.width &&
    rect.y + rect.height <= boundary.y + boundary.height
  )
}

function clampAxis(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function shiftIntoBoundary(rect: Rect, boundary: Rect): Rect {
  return {
    x: clampAxis(rect.x, boundary.x, boundary.x + boundary.width - rect.width),
    y: clampAxis(rect.y, boundary.y, boundary.y + boundary.height - rect.height),
    width: rect.width,
    height: rect.height,
  }
}

function rectEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function sideOverflow(rect: Rect, boundary: Rect, side: Side): number {
  switch (side) {
    case "top":
      return Math.max(0, boundary.y - rect.y)
    case "bottom":
      return Math.max(0, rect.y + rect.height - (boundary.y + boundary.height))
    case "left":
      return Math.max(0, boundary.x - rect.x)
    case "right":
      return Math.max(0, rect.x + rect.width - (boundary.x + boundary.width))
  }
}

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
  options: FloatingPlacementOptions = {},
): Rect {
  const { x: ax, y: ay, width: aw, height: ah } = anchor
  const tw = target.width
  const th = target.height

  // Decompose the placement into side + alignment. The 12 placements split
  // into 4 sides × 3 alignments; we resolve each axis independently.
  const { side, align } = splitPlacement(placement)

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

  const offset = options.offset ?? 0
  const alignOffset = options.alignOffset ?? 0
  if (side === "top") y -= offset
  else if (side === "bottom") y += offset
  else if (side === "left") x -= offset
  else x += offset

  if (side === "top" || side === "bottom") x += alignOffset
  else y += alignOffset

  return { x, y, width: tw, height: th }
}

/**
 * Resolve a floating rect with optional viewport collision handling.
 *
 * This is the collision-aware peer of `placeFloating`. The fixed-placement
 * helper remains intentionally simple and deterministic; this function adds
 * the behavior needed by declarative popovers/tooltips: gap offsets, alignment
 * nudges, side flipping, viewport shifting, and hide-on-overflow.
 */
export function resolveFloatingPlacement(
  anchor: Rect,
  target: { width: number; height: number },
  placement: Placement,
  options: FloatingCollisionOptions = {},
): FloatingPlacementResult | null {
  const boundary = options.boundary ?? null
  const strategy = options.collisionStrategy ?? "none"
  const requested = placeFloating(anchor, target, placement, options)
  if (!boundary || strategy === "none") {
    return { rect: requested, placement, flipped: false, shifted: false }
  }
  if (strategy === "hide") {
    return rectFitsWithin(requested, boundary)
      ? { rect: requested, placement, flipped: false, shifted: false }
      : null
  }

  let finalPlacement = placement
  let rect = requested
  let flipped = false

  if (strategy === "flip" || strategy === "flip-then-shift") {
    const side = splitPlacement(placement).side
    const requestedSideOverflow = sideOverflow(requested, boundary, side)
    if (requestedSideOverflow > 0) {
      const candidatePlacement = oppositePlacement(placement)
      const candidate = placeFloating(anchor, target, candidatePlacement, options)
      const candidateSide = splitPlacement(candidatePlacement).side
      const candidateSideOverflow = sideOverflow(candidate, boundary, candidateSide)
      if (candidateSideOverflow < requestedSideOverflow) {
        finalPlacement = candidatePlacement
        rect = candidate
        flipped = true
      }
    }
  }

  let shifted = false
  if (strategy === "shift" || strategy === "flip-then-shift") {
    const shiftedRect = shiftIntoBoundary(rect, boundary)
    shifted = !rectEqual(shiftedRect, rect)
    rect = shiftedRect
  }

  return { rect, placement: finalPlacement, flipped, shifted }
}
