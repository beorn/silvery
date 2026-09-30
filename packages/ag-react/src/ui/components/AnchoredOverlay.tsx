import React, { useMemo, useState } from "react"
import type { BoxProps } from "../../components/Box"
import { Box } from "../../components/Box"
import { useAgNode } from "../../hooks/useAgNode"
import { useSignal } from "../../hooks/useSignal"
import type { DecorationRect } from "@silvery/ag/layout-signals"
import type { CollisionStrategy, Decoration, Placement, Rect } from "@silvery/ag/types"
import { OverlaySizeProbe } from "./OverlaySizeProbe"

export interface AnchoredOverlayProps extends Omit<
  BoxProps,
  "children" | "decorations" | "height" | "left" | "position" | "right" | "top" | "width"
> {
  /** Stable `Box anchorRef` id to position against. */
  anchorId: string
  /** Unique id for this overlay decoration. Defaults to `anchorId`. */
  overlayId?: string
  /** Whether to render the overlay. Default: true. */
  open?: boolean
  /** Placement relative to the anchor. Default: "bottom-start". */
  placement?: Placement
  /** Intrinsic overlay size in terminal cells. */
  size: { width: number; height: number }
  /**
   * How to apply `size` to the rendered overlay. `"fixed"` gives the overlay
   * that exact cell footprint. `"max"` uses `size` as the collision footprint
   * but lets content shrink inside `maxWidth` / `maxHeight`.
   *
   * Default: "fixed".
   */
  sizing?: "fixed" | "max"
  /** Gap along the placement axis, in cells. */
  offset?: number
  /** Nudge along the alignment axis, in cells. */
  alignOffset?: number
  /** Viewport collision policy. Default: "flip-then-shift". */
  collisionStrategy?: CollisionStrategy
  children: React.ReactNode
}

type AnchoredOverlayBoxProps = Omit<
  AnchoredOverlayProps,
  | "alignOffset"
  | "anchorId"
  | "children"
  | "collisionStrategy"
  | "offset"
  | "open"
  | "overlayId"
  | "placement"
  | "size"
  | "sizing"
>

/**
 * Render a fixed-size overlay positioned from a named `Box anchorRef`.
 *
 * The geometry is resolved by the `anchorRef`/`decorations` layout-output
 * substrate, so callers do not read `useBoxRect()` to position popovers,
 * menus, or tooltips. `size` is explicit because terminal overlays need a
 * known cell footprint before the layout pass can place them.
 */
export function AnchoredOverlay({
  anchorId,
  overlayId,
  open = true,
  placement = "bottom-start",
  size,
  sizing = "fixed",
  offset,
  alignOffset,
  collisionStrategy = "flip-then-shift",
  children,
  ...boxProps
}: AnchoredOverlayProps): React.ReactElement | null {
  const decorationId = overlayId ?? anchorId

  // For `sizing="max"`, `size` is a CAP, not the real footprint. Declaring the
  // full cap (often the whole viewport height) as the collision footprint makes
  // placement believe the popover is screen-tall: a short popover anchored low
  // then overflows its placement side, and the shift/flip step drags it across
  // the anchor — clipping the popover's leading lines under surrounding chrome
  // (the @km/code/v0.2/19777 top-clip). The real footprint is the rendered
  // box's natural size (its border box: content, padding and border), which
  // we learn by measuring the box one frame late and feeding
  // `min(cap, measured)` back as the collision size, on BOTH axes: the box is
  // as wide as its content, not as wide as the cap (#26388), so a `left-*` or
  // `*-end` placement must subtract the measured width, never the cap's
  // (#26660). The committed-rect read + layout-prop write converges in one
  // event batch (see useLayout's reactive-rect contract), so this settles
  // deterministically: frame 1 places at the cap, frame 2 at the measured size.
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null)
  const collisionWidth =
    sizing === "max" && measuredSize !== null ? Math.min(size.width, measuredSize.width) : size.width
  const collisionHeight =
    sizing === "max" && measuredSize !== null
      ? Math.min(size.height, measuredSize.height)
      : size.height
  const collisionSize = useMemo(
    () => ({ width: collisionWidth, height: collisionHeight }),
    [collisionWidth, collisionHeight],
  )

  const decorations = useMemo<Decoration[]>(() => {
    const decoration: Decoration = {
      kind: "popover",
      id: decorationId,
      anchorId,
      placement,
      size: collisionSize,
    }
    if (offset !== undefined) decoration.offset = offset
    if (alignOffset !== undefined) decoration.alignOffset = alignOffset
    if (collisionStrategy !== undefined) decoration.collisionStrategy = collisionStrategy
    return [decoration]
  }, [anchorId, alignOffset, collisionStrategy, collisionSize, decorationId, offset, placement])

  if (!open) return null
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      flexShrink={0}
      decorations={decorations}
    >
      <AnchoredOverlayContent
        decorationId={decorationId}
        fallbackSize={size}
        sizing={sizing}
        boxProps={boxProps}
        onMeasureSize={sizing === "max" ? setMeasuredSize : undefined}
      >
        {children}
      </AnchoredOverlayContent>
    </Box>
  )
}

function AnchoredOverlayContent({
  decorationId,
  fallbackSize,
  sizing,
  boxProps,
  onMeasureSize,
  children,
}: {
  decorationId: string
  fallbackSize: { width: number; height: number }
  sizing: "fixed" | "max"
  boxProps: AnchoredOverlayBoxProps
  onMeasureSize?: (size: { width: number; height: number }) => void
  children: React.ReactNode
}): React.ReactElement | null {
  const ag = useAgNode()
  const decorationRects = useSignal<readonly DecorationRect[]>(ag?.signals.decorationRects ?? null)
  const hostRect = useSignal<Rect | null>(ag?.signals.boxRectCommitted ?? null) ?? ag?.node.boxRect
  const rect = decorationRects?.find((entry) => entry.id === decorationId)?.rects[0]
  if (!rect) return null
  // First-render guard: when the overlay opens before the wrapper's
  // boxRect has committed, hostRect is null and the `rect.x - hostRect.x`
  // subtraction degenerates to `rect.x` (screen-absolute) used as a
  // *parent-relative* `left` — the overlay paints at
  // `wrapper.x + rect.x` (screen-far-right when the wrapper is itself
  // offset by the parent container, e.g. a right-side panel). Defer the
  // paint one frame so the next signal commit gives us a real hostRect.
  // Refs @km/code/15390-account-switch-bugs Bug 3.
  if (!hostRect) return null
  const width = rect.width || fallbackSize.width
  const height = rect.height || fallbackSize.height
  // For `sizing="max"`, `rect` is the COLLISION footprint (refined to the
  // measured size to place the popover correctly — see the parent's note). It
  // must NOT cap the rendered box: the box keeps the generous `fallbackSize`
  // cap on both axes so content fills to its natural size and only wraps or
  // scrolls when it genuinely exceeds the cap. Using the shrunk collision size
  // here would re-clip the content we just measured to place it.
  const sizeProps =
    sizing === "max"
      ? { maxWidth: fallbackSize.width, maxHeight: fallbackSize.height }
      : { width, height }
  // When measuring (sizing="max"), the probe reads the overlay box's committed
  // border-box size and reports it up. Because the box keeps the GENEROUS
  // `fallbackSize` cap (not the shrunk collision size), its measured size is
  // its natural size (only clamped if content truly exceeds the cap) — so
  // there is no shrinking feedback loop. The collision footprint refines to it
  // one frame later, placing the popover against the anchor.
  return (
    <Box
      {...boxProps}
      position="absolute"
      top={rect.y - (hostRect?.y ?? 0)}
      left={rect.x - (hostRect?.x ?? 0)}
      {...sizeProps}
    >
      {onMeasureSize ? <OverlaySizeProbe onMeasure={onMeasureSize} /> : null}
      {children}
    </Box>
  )
}

export type { Rect as AnchoredOverlayRect }
