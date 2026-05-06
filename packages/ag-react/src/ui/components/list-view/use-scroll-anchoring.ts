import { useLayoutEffect, useRef } from "react"
import type { HeightModel } from "./height-model"

export interface ScrollAnchoringOptions {
  enabled: boolean
  model: HeightModel
  keyAtIndex: (index: number) => string | number | null
  itemCount: number
  currentTopRow: number
  maxTopRow: number
  followOwnsViewport: boolean
  activeScrollDirection?: "up" | "down" | null
  onApplyTopRow: (row: number) => void
  toleranceRows?: number
}

export interface ScrollAnchoringController {
  maintainedTopRow: number | null
  suppressOnce(): void
}

export interface VisibleContentAnchor {
  key: string | number
  offsetWithinItem: number
}

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
  rowScrollOwnsViewport,
}: {
  maintainVisibleContentPosition: boolean
  followOwnsViewport: boolean
  rowScrollOwnsViewport: boolean
}): boolean {
  return maintainVisibleContentPosition && !followOwnsViewport && !rowScrollOwnsViewport
}

const DEFAULT_TOLERANCE_ROWS = 0.5
const END_ANCHOR_KEY = "__end__"

export function useScrollAnchoring({
  enabled,
  model,
  keyAtIndex,
  itemCount,
  currentTopRow,
  maxTopRow,
  followOwnsViewport,
  activeScrollDirection = null,
  onApplyTopRow,
  toleranceRows = DEFAULT_TOLERANCE_ROWS,
}: ScrollAnchoringOptions): ScrollAnchoringController {
  const anchorRef = useRef<VisibleContentAnchor | null>(null)
  const suppressRef = useRef(false)

  const currentAnchor = anchorAtRow(model, keyAtIndex, currentTopRow)
  const rawMaintainedTopRow =
    enabled && !suppressRef.current && !followOwnsViewport
      ? resolveMaintainedTopRow({
          anchor: anchorRef.current,
          keyAtIndex,
          itemCount,
          model,
          currentTopRow,
          maxTopRow,
          toleranceRows,
        })
      : null
  const maintainedTopRow = resolveDirectionalMaintainedTopRow({
    row: rawMaintainedTopRow,
    currentTopRow,
    activeScrollDirection,
    toleranceRows,
  })

  useLayoutEffect(() => {
    if (!enabled || suppressRef.current) {
      anchorRef.current = currentAnchor
      suppressRef.current = false
      return
    }

    if (followOwnsViewport) {
      anchorRef.current = currentAnchor
      return
    }

    if (maintainedTopRow !== null) {
      onApplyTopRow(maintainedTopRow)
      anchorRef.current = anchorAtRow(model, keyAtIndex, maintainedTopRow)
      return
    }

    anchorRef.current = currentAnchor
  }, [
    currentAnchor,
    enabled,
    followOwnsViewport,
    keyAtIndex,
    maintainedTopRow,
    model,
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
  toleranceRows,
}: {
  row: number | null
  currentTopRow: number
  activeScrollDirection: "up" | "down" | null
  toleranceRows: number
}): number | null {
  if (row === null || activeScrollDirection === null) return row
  if (activeScrollDirection === "up" && row > currentTopRow + toleranceRows) return null
  if (activeScrollDirection === "down" && row < currentTopRow - toleranceRows) return null
  return row
}

function anchorAtRow(
  model: HeightModel,
  keyAtIndex: (index: number) => string | number | null,
  row: number,
): VisibleContentAnchor | null {
  return captureViewportAnchor({ model, keyAtIndex, viewportTopRow: row })
}

export function captureViewportAnchor({
  model,
  keyAtIndex,
  viewportTopRow,
}: {
  model: HeightModel
  keyAtIndex: (index: number) => string | number | null
  viewportTopRow: number
}): VisibleContentAnchor | null {
  const index = model.indexAtRow(viewportTopRow)
  if (index === null) return null
  const key = keyAtIndex(index)
  if (key === null) return null
  return {
    key,
    offsetWithinItem: Math.max(0, viewportTopRow - model.rowOfIndex(index)),
  }
}

export function resolveViewportAnchor({
  anchor,
  model,
  keyToIndex,
  viewportHeight,
  maxTopRow,
}: {
  anchor: VisibleContentAnchor | null
  model: HeightModel
  keyToIndex: ReadonlyMap<string | number, number>
  viewportHeight: number
  maxTopRow: number
}): number | null {
  if (anchor === null) return null

  if (anchor.key === END_ANCHOR_KEY) {
    return Math.max(0, Math.min(maxTopRow, model.totalRows() - viewportHeight))
  }

  const index = keyToIndex.get(anchor.key)
  if (index === undefined) return null

  const desiredTopRow = model.rowOfIndex(index) + anchor.offsetWithinItem
  return Math.max(0, Math.min(maxTopRow, desiredTopRow))
}

function resolveMaintainedTopRow({
  anchor,
  keyAtIndex,
  itemCount,
  model,
  currentTopRow,
  maxTopRow,
  toleranceRows,
}: {
  anchor: VisibleContentAnchor | null
  keyAtIndex: (index: number) => string | number | null
  itemCount: number
  model: HeightModel
  currentTopRow: number
  maxTopRow: number
  toleranceRows: number
}): number | null {
  if (anchor === null) return null

  const keyToIndex = new Map<string | number, number>()
  for (let i = 0; i < itemCount; i++) {
    const key = keyAtIndex(i)
    if (key !== null) keyToIndex.set(key, i)
  }

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
  if (maxTopRow <= 0) return null

  const clamped = resolveViewportAnchor({
    anchor,
    model,
    keyToIndex,
    viewportHeight: Math.max(1, model.totalRows() - maxTopRow),
    maxTopRow,
  })
  if (clamped === null) return null
  return Math.abs(clamped - currentTopRow) > toleranceRows ? clamped : null
}
