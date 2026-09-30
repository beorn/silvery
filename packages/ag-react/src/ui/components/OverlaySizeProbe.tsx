import { useLayoutEffect } from "react"
import { useAgNode } from "../../hooks/useAgNode"
import { useSignal } from "../../hooks/useSignal"
import { markObservedLayoutSignal } from "@silvery/ag/layout-signals"
import type { Rect } from "@silvery/ag/types"

/**
 * Zero-footprint child that measures its enclosing overlay box and reports its
 * size up, so an overlay placed first by its cap can refine its placement by
 * its real size one frame later (AnchoredOverlay's collision footprint,
 * Popover's slide from the right margin). The size is the overlay's BORDER
 * box: the committed boxRect, padding and border included, both axes from that
 * one read. `useBoxSize()` gives the content box, which is short by the
 * padding, so an overlay placed by it runs past the viewport edge. The
 * committed rect advances at the commit boundary, so the read/write pair
 * converges within one event batch and cannot form a layout feedback loop.
 */
export function OverlaySizeProbe({
  onMeasure,
}: {
  onMeasure: (size: { width: number; height: number }) => void
}): null {
  const ag = useAgNode()
  // Observed, as useBoxSize() marks it, so the runtime paints the refined
  // placement in the same event (commitLayoutSnapshot reports it promoted).
  if (ag) markObservedLayoutSignal(ag.node, "boxSize")
  const committed = useSignal<Rect | null>(ag?.signals.boxRectCommitted ?? null)
  const width = committed?.width ?? 0
  const height = committed?.height ?? 0
  // useLayoutEffect (not useEffect): the synchronous render path
  // (`flushSyncWork`) commits layout effects but defers passive effects, so a
  // passive effect would not propagate the measurement into the next sync
  // re-place — only a layout effect settles deterministically in one frame.
  useLayoutEffect(() => {
    if (width > 0 && height > 0) onMeasure({ width, height })
  }, [width, height, onMeasure])
  return null
}
