import React, { useMemo } from "react"
import type { BoxProps } from "../../components/Box"
import { Box } from "../../components/Box"
import { useAgNode } from "../../hooks/useAgNode"
import { useSignal } from "../../hooks/useSignal"
import type { DecorationRect } from "@silvery/ag/layout-signals"
import type { CollisionStrategy, Decoration, Placement, Rect } from "@silvery/ag/types"

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
  const decorations = useMemo<Decoration[]>(() => {
    const decoration: Decoration = {
      kind: "popover",
      id: decorationId,
      anchorId,
      placement,
      size,
    }
    if (offset !== undefined) decoration.offset = offset
    if (alignOffset !== undefined) decoration.alignOffset = alignOffset
    if (collisionStrategy !== undefined) decoration.collisionStrategy = collisionStrategy
    return [decoration]
  }, [anchorId, alignOffset, collisionStrategy, decorationId, offset, placement, size])

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
  children,
}: {
  decorationId: string
  fallbackSize: { width: number; height: number }
  sizing: "fixed" | "max"
  boxProps: AnchoredOverlayBoxProps
  children: React.ReactNode
}): React.ReactElement | null {
  const ag = useAgNode()
  const decorationRects = useSignal<readonly DecorationRect[]>(ag?.signals.decorationRects ?? null)
  const hostRect = useSignal<Rect | null>(ag?.signals.boxRectCommitted ?? null) ?? ag?.node.boxRect
  const rect = decorationRects?.find((entry) => entry.id === decorationId)?.rects[0]
  if (!rect) return null
  const width = rect.width || fallbackSize.width
  const height = rect.height || fallbackSize.height
  const sizeProps = sizing === "max" ? { maxWidth: width, maxHeight: height } : { width, height }
  return (
    <Box
      {...boxProps}
      position="absolute"
      top={rect.y - (hostRect?.y ?? 0)}
      left={rect.x - (hostRect?.x ?? 0)}
      {...sizeProps}
    >
      {children}
    </Box>
  )
}

export type { Rect as AnchoredOverlayRect }
