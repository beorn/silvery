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
  onApplyTopRow: (row: number) => void
  toleranceRows?: number
}

export interface ScrollAnchoringController {
  maintainedTopRow: number | null
  suppressOnce(): void
}

interface VisibleContentAnchor {
  key: string | number
  offsetWithinItem: number
}

const DEFAULT_TOLERANCE_ROWS = 0.5

export function useScrollAnchoring({
  enabled,
  model,
  keyAtIndex,
  itemCount,
  currentTopRow,
  maxTopRow,
  followOwnsViewport,
  onApplyTopRow,
  toleranceRows = DEFAULT_TOLERANCE_ROWS,
}: ScrollAnchoringOptions): ScrollAnchoringController {
  const anchorRef = useRef<VisibleContentAnchor | null>(null)
  const suppressRef = useRef(false)

  const currentAnchor = anchorAtRow(model, keyAtIndex, currentTopRow)
  const maintainedTopRow =
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

function anchorAtRow(
  model: HeightModel,
  keyAtIndex: (index: number) => string | number | null,
  row: number,
): VisibleContentAnchor | null {
  const index = model.indexAtRow(row)
  if (index === null) return null
  const key = keyAtIndex(index)
  if (key === null) return null
  return {
    key,
    offsetWithinItem: Math.max(0, row - model.rowOfIndex(index)),
  }
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

  let index = -1
  for (let i = 0; i < itemCount; i++) {
    if (keyAtIndex(i) === anchor.key) {
      index = i
      break
    }
  }
  if (index < 0) return null

  const desiredTopRow = model.rowOfIndex(index) + anchor.offsetWithinItem

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

  const clamped = Math.max(0, Math.min(maxTopRow, desiredTopRow))
  return Math.abs(clamped - currentTopRow) > toleranceRows ? clamped : null
}
