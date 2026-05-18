export type ListViewScrollAuthority =
  | "declarative-row"
  | "follow-end"
  | "wheel-row"
  | "follow-disengage"
  | "visible-anchor"
  | "layout"

export interface ListViewRenderScrollRowInput {
  declarativeScrollRow: number | null
  followPinnedTopRow: number | null
  scrollRow: number | null
  followDisengageTopRow: number | null
  maintainedTopRow: number | null
}

export interface ListViewRenderScrollRowResult {
  row: number | null
  authority: ListViewScrollAuthority
}

export function resolveListViewRenderScrollRow({
  declarativeScrollRow,
  followPinnedTopRow,
  scrollRow,
  followDisengageTopRow,
  maintainedTopRow,
}: ListViewRenderScrollRowInput): ListViewRenderScrollRowResult {
  if (declarativeScrollRow !== null)
    return { row: declarativeScrollRow, authority: "declarative-row" }
  if (followPinnedTopRow !== null) return { row: followPinnedTopRow, authority: "follow-end" }
  if (scrollRow !== null) return { row: scrollRow, authority: "wheel-row" }
  if (followDisengageTopRow !== null)
    return { row: followDisengageTopRow, authority: "follow-disengage" }
  if (maintainedTopRow !== null) return { row: maintainedTopRow, authority: "visible-anchor" }
  return { row: null, authority: "layout" }
}

export function resolveListViewBoxScrollTo({
  scrollAuthority,
  selectedBoxScrollTo,
}: {
  scrollAuthority: ListViewScrollAuthority
  selectedBoxScrollTo: number | undefined
}): number | undefined {
  return scrollAuthority === "declarative-row" || scrollAuthority === "layout"
    ? selectedBoxScrollTo
    : undefined
}

export interface GestureRenderScrollViolationInput {
  gestureDirection: "up" | "down" | null
  previousRenderScrollRow: number | null
  renderScrollRow: number | null
  toleranceRows?: number
}

export interface GestureRenderScrollViolation {
  gestureDirection: "up" | "down"
  previousRenderScrollRow: number
  renderScrollRow: number
  deltaRows: number
  toleranceRows: number
}

export function detectGestureRenderScrollViolation({
  gestureDirection,
  previousRenderScrollRow,
  renderScrollRow,
  toleranceRows = 0.01,
}: GestureRenderScrollViolationInput): GestureRenderScrollViolation | null {
  if (
    gestureDirection === null ||
    previousRenderScrollRow === null ||
    renderScrollRow === null ||
    !Number.isFinite(previousRenderScrollRow) ||
    !Number.isFinite(renderScrollRow)
  )
    return null

  const deltaRows = renderScrollRow - previousRenderScrollRow
  const movedOpposite =
    gestureDirection === "up" ? deltaRows > toleranceRows : deltaRows < -toleranceRows
  if (!movedOpposite) return null
  return {
    gestureDirection,
    previousRenderScrollRow,
    renderScrollRow,
    deltaRows,
    toleranceRows,
  }
}

export interface GestureScrollWindowInput {
  startIndex: number
  endIndex: number
  previousStartIndex: number
  previousEndIndex?: number
  anchorFirstIndex?: number
  anchorLastIndex?: number
  gestureDirection: "up" | "down" | null
  edgeBufferItems?: number
  renderScrollRow?: number | null
  previousRenderScrollRow?: number | null
  leadingHeight?: number | null
  previousLeadingHeight?: number | null
  visibleTopClampedStartIndex?: number
  visibleTopToleranceRows?: number
}

export interface GestureScrollWindowResult {
  startIndex: number
  endIndex: number
  clamped: boolean
}

export function resolveGestureScrollWindow({
  startIndex,
  endIndex,
  previousStartIndex,
  previousEndIndex,
  anchorFirstIndex,
  anchorLastIndex,
  gestureDirection,
  edgeBufferItems = 4,
  renderScrollRow,
  previousRenderScrollRow,
  leadingHeight,
  previousLeadingHeight,
  visibleTopClampedStartIndex,
  visibleTopToleranceRows = 0.5,
}: GestureScrollWindowInput): GestureScrollWindowResult {
  const previousEnd = previousEndIndex ?? previousStartIndex
  const previousWindowKnown =
    previousEndIndex !== undefined && previousEndIndex > previousStartIndex
  const anchorKnown = anchorFirstIndex !== undefined && anchorLastIndex !== undefined
  const previousWindowStillCoversAnchor =
    previousWindowKnown &&
    anchorKnown &&
    anchorFirstIndex >= previousStartIndex &&
    anchorLastIndex < previousEnd
  const canKeepPreviousStartForDown =
    previousWindowStillCoversAnchor && anchorLastIndex < previousEnd - edgeBufferItems
  if (
    gestureDirection !== null &&
    previousWindowKnown &&
    renderScrollRow != null &&
    previousRenderScrollRow != null &&
    leadingHeight != null &&
    previousLeadingHeight != null
  ) {
    const previousVisibleTopRow = previousRenderScrollRow - previousLeadingHeight
    const nextVisibleTopRow = renderScrollRow - leadingHeight
    const visibleTopDelta = nextVisibleTopRow - previousVisibleTopRow
    const movedOpposite =
      gestureDirection === "up"
        ? visibleTopDelta > visibleTopToleranceRows
        : visibleTopDelta < -visibleTopToleranceRows
    if (movedOpposite) {
      const previousWindowCanStillPaintContent =
        gestureDirection === "up" ? previousLeadingHeight <= renderScrollRow : true
      const clampedStart =
        gestureDirection === "up"
          ? previousWindowCanStillPaintContent
            ? previousStartIndex
            : (visibleTopClampedStartIndex ?? previousStartIndex)
          : canKeepPreviousStartForDown
            ? previousStartIndex
            : Math.min(startIndex, visibleTopClampedStartIndex ?? previousStartIndex)
      const clampedEnd =
        gestureDirection === "up" && clampedStart !== previousStartIndex
          ? Math.max(endIndex, clampedStart + 1)
          : Math.max(endIndex, previousEnd, clampedStart + 1)
      return {
        startIndex: clampedStart,
        endIndex: clampedEnd,
        clamped: true,
      }
    }
  }

  if (
    gestureDirection === "down" &&
    startIndex > previousStartIndex &&
    canKeepPreviousStartForDown
  ) {
    return {
      startIndex: previousStartIndex,
      endIndex: Math.max(endIndex, previousEnd),
      clamped: true,
    }
  }
  if (gestureDirection === "up" && startIndex > previousStartIndex) {
    return {
      startIndex: previousStartIndex,
      endIndex: Math.max(endIndex, previousStartIndex + 1),
      clamped: true,
    }
  }
  if (gestureDirection === "down" && startIndex < previousStartIndex) {
    return {
      startIndex: previousStartIndex,
      endIndex: Math.max(endIndex, previousStartIndex + 1),
      clamped: true,
    }
  }
  return { startIndex, endIndex, clamped: false }
}
