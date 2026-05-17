import { useLayoutEffect, useRef } from "react"
import type { HeightModel } from "./height-model"
import {
  captureAnchorAtViewportY,
  resolveScrollPositionTop,
  type AnchorPoint,
  type ContentGeometry,
  type Key,
} from "./scroll-position"

export interface ScrollAnchoringOptions {
  enabled: boolean
  geometry: ContentGeometry
  currentTopRow: number
  viewportHeight: number
  followOwnsViewport: boolean
  activeScrollDirection?: "up" | "down" | null
  maxActiveCorrectionRows?: number
  maxOppositeActiveCorrectionRows?: number
  modelVersion?: unknown
  onApplyTopRow: (row: number) => void
  toleranceRows?: number
}

export interface ScrollAnchoringController {
  maintainedTopRow: number | null
  suppressOnce(): void
}

export type VisibleContentAnchor = AnchorPoint<Key>

export function resolveRowsAboveViewport({
  virtualization,
  layoutScrollOffset,
  layoutOwnsScroll,
  virtualizerScrollOffset,
  model,
}: {
  virtualization: "none" | "index" | "measured"
  layoutScrollOffset: number | null | undefined
  layoutOwnsScroll: boolean
  virtualizerScrollOffset: number
  model: HeightModel
}): number {
  if (
    virtualization === "index" &&
    layoutOwnsScroll &&
    layoutScrollOffset !== null &&
    layoutScrollOffset !== undefined
  ) {
    return layoutScrollOffset
  }
  return model.rowOfIndex(virtualizerScrollOffset)
}

export function shouldApplyVisibleContentAnchoring({
  maintainVisibleContentPosition,
  followOwnsViewport,
  wheelGestureActive = false,
}: {
  maintainVisibleContentPosition: boolean
  followOwnsViewport: boolean
  wheelGestureActive?: boolean
}): boolean {
  return maintainVisibleContentPosition && !followOwnsViewport && !wheelGestureActive
}

const DEFAULT_TOLERANCE_ROWS = 0.5
export function resolveActiveAnchorCorrectionBudgetRows(contentViewportHeight: number): number {
  void contentViewportHeight
  return 0
}

export function resolveActiveScrollMeasuredHeightFallback({
  wheelGestureActive,
  wheelDriven,
  snapshotAvgMeasuredHeight,
  liveAvgMeasuredHeight,
}: {
  wheelGestureActive: boolean
  wheelDriven?: boolean
  snapshotAvgMeasuredHeight: number | undefined
  liveAvgMeasuredHeight: number | undefined
}): number | undefined {
  if ((wheelGestureActive || wheelDriven === true) && snapshotAvgMeasuredHeight !== undefined)
    return snapshotAvgMeasuredHeight
  return liveAvgMeasuredHeight
}

export function useScrollAnchoring({
  enabled,
  geometry,
  currentTopRow,
  viewportHeight,
  followOwnsViewport,
  activeScrollDirection = null,
  maxActiveCorrectionRows,
  maxOppositeActiveCorrectionRows,
  modelVersion,
  onApplyTopRow,
  toleranceRows = DEFAULT_TOLERANCE_ROWS,
}: ScrollAnchoringOptions): ScrollAnchoringController {
  const anchorRef = useRef<VisibleContentAnchor | null>(null)
  const anchorModelVersionRef = useRef<unknown>(modelVersion)
  const suppressRef = useRef(false)

  const currentAnchor = anchorAtRow(geometry, currentTopRow)
  // During active wheel input the top row is expected to change every frame.
  // A previous-frame anchor only gets to override that motion when the
  // height model changed; otherwise it is stale and cancels explicit scroll.
  const modelChangedSinceAnchor =
    modelVersion === undefined || !Object.is(anchorModelVersionRef.current, modelVersion)
  const rawMaintainedTopRow =
    enabled &&
    !suppressRef.current &&
    !followOwnsViewport &&
    (activeScrollDirection === null || modelChangedSinceAnchor)
      ? resolveMaintainedTopRow({
          anchor: anchorRef.current,
          geometry,
          currentTopRow,
          viewportHeight,
          toleranceRows,
        })
      : null
  const maintainedTopRow = resolveDirectionalMaintainedTopRow({
    row: rawMaintainedTopRow,
    currentTopRow,
    activeScrollDirection,
    maxActiveCorrectionRows,
    maxOppositeActiveCorrectionRows,
    toleranceRows,
  })

  useLayoutEffect(() => {
    if (!enabled || suppressRef.current) {
      anchorRef.current = currentAnchor
      anchorModelVersionRef.current = modelVersion
      suppressRef.current = false
      return
    }

    if (followOwnsViewport) {
      anchorRef.current = currentAnchor
      anchorModelVersionRef.current = modelVersion
      return
    }

    if (maintainedTopRow !== null) {
      onApplyTopRow(maintainedTopRow)
      anchorRef.current = anchorAtRow(geometry, maintainedTopRow)
      anchorModelVersionRef.current = modelVersion
      return
    }

    anchorRef.current = currentAnchor
    anchorModelVersionRef.current = modelVersion
  }, [
    currentAnchor,
    enabled,
    followOwnsViewport,
    geometry,
    maintainedTopRow,
    modelVersion,
    onApplyTopRow,
  ])

  return {
    maintainedTopRow,
    suppressOnce() {
      suppressRef.current = true
    },
  }
}

export function resolveDirectionalMaintainedTopRow({
  row,
  currentTopRow,
  activeScrollDirection,
  maxActiveCorrectionRows,
  allowActiveAnchorCorrection,
  toleranceRows,
}: {
  row: number | null
  currentTopRow: number
  activeScrollDirection: "up" | "down" | null
  maxActiveCorrectionRows?: number
  maxOppositeActiveCorrectionRows?: number
  allowActiveAnchorCorrection?: boolean
  toleranceRows: number
}): number | null {
  if (row === null || activeScrollDirection === null) return row
  if (allowActiveAnchorCorrection === false) return null
  if (activeScrollDirection === "up" && row > currentTopRow + toleranceRows) return null
  if (activeScrollDirection === "down" && row < currentTopRow - toleranceRows) return null
  if (
    maxActiveCorrectionRows !== undefined &&
    Math.abs(row - currentTopRow) > maxActiveCorrectionRows
  ) {
    return currentTopRow + Math.sign(row - currentTopRow) * maxActiveCorrectionRows
  }
  return row
}

function anchorAtRow(geometry: ContentGeometry, row: number): VisibleContentAnchor | null {
  return captureAnchorAtViewportY({ geometry, viewportTopRow: row, viewportY: 0 })
}

function resolveMaintainedTopRow({
  anchor,
  geometry,
  currentTopRow,
  viewportHeight,
  toleranceRows,
}: {
  anchor: VisibleContentAnchor | null
  geometry: ContentGeometry
  currentTopRow: number
  viewportHeight: number
  toleranceRows: number
}): number | null {
  if (anchor === null) return null

  // No-overflow guard: when there's nothing to scroll (`maxTopRow = 0`),
  // anchoring has no work to do. Returning a clamped value here would
  // overwrite the caller's authoritative scrollTo with 0 — observed during
  // the pre-measurement → measured transition where the heightModel briefly
  // reports `totalRows < viewportHeight` (estimate=3 × N < viewport),
  // making `scrollableRows = 0` even though real content overflows. The
  // anchor's `desiredTopRow` (computed from the prior frame) gets clamped
  // to 0 and applied via `setScrollRow(0)`, which then suppresses the
  // declarative `scrollTo` prop in subsequent renders.
  // Bead: km-silvery.listview-scrollto-anchoring-stomp.
  const maxTopRow = geometry.maxTopRow(viewportHeight)
  if (maxTopRow <= 0) return null

  const resolved = resolveScrollPositionTop(
    { kind: "anchored", point: anchor, pin: { kind: "top" } },
    geometry,
    { height: viewportHeight },
  )
  return Math.abs(resolved.topRow - currentTopRow) > toleranceRows ? resolved.topRow : null
}
