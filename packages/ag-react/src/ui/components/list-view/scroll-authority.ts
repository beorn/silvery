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

export interface ActiveScrollWindowInput {
  startIndex: number
  endIndex: number
  previousStartIndex: number
  previousEndIndex?: number
  anchorFirstIndex?: number
  anchorLastIndex?: number
  activeScrollDirection: "up" | "down" | null
  edgeBufferItems?: number
  renderScrollRow?: number | null
  previousRenderScrollRow?: number | null
  leadingHeight?: number | null
  previousLeadingHeight?: number | null
  visibleTopClampedStartIndex?: number
  visibleTopToleranceRows?: number
}

export interface ActiveScrollWindowResult {
  startIndex: number
  endIndex: number
  clamped: boolean
}

export interface ActiveLeadingSpacerInput {
  leadingHeight: number
  activeScrollDirection: "up" | "down" | null
  renderScrollRow?: number | null
  previousRenderScrollRow?: number | null
  previousLeadingHeight?: number | null
  visibleTopToleranceRows?: number
}

export interface ActiveLeadingSpacerResult {
  leadingHeight: number
  carryRows: number
  clamped: boolean
}

export function resolveActiveLeadingSpacer({
  leadingHeight,
  activeScrollDirection,
  renderScrollRow,
  previousRenderScrollRow,
  previousLeadingHeight,
  visibleTopToleranceRows = 0.5,
}: ActiveLeadingSpacerInput): ActiveLeadingSpacerResult {
  if (
    activeScrollDirection !== "up" ||
    renderScrollRow == null ||
    previousRenderScrollRow == null ||
    previousLeadingHeight == null ||
    leadingHeight > renderScrollRow
  ) {
    return { leadingHeight, carryRows: 0, clamped: false }
  }

  const previousVisibleTopRow = previousRenderScrollRow - previousLeadingHeight
  const maxVisibleTopRow = previousVisibleTopRow + visibleTopToleranceRows
  const minLeadingHeight = renderScrollRow - maxVisibleTopRow
  const nonReversingLeadingHeight = Math.ceil(minLeadingHeight - 1e-9)
  const adjustedLeadingHeight = Math.min(
    renderScrollRow,
    Math.max(leadingHeight, nonReversingLeadingHeight),
  )

  if (adjustedLeadingHeight <= leadingHeight) {
    return { leadingHeight, carryRows: 0, clamped: false }
  }

  return {
    leadingHeight: adjustedLeadingHeight,
    carryRows: adjustedLeadingHeight - leadingHeight,
    clamped: true,
  }
}

export function resolveActiveScrollWindow({
  startIndex,
  endIndex,
  previousStartIndex,
  previousEndIndex,
  anchorFirstIndex,
  anchorLastIndex,
  activeScrollDirection,
  edgeBufferItems = 4,
  renderScrollRow,
  previousRenderScrollRow,
  leadingHeight,
  previousLeadingHeight,
  visibleTopClampedStartIndex,
  visibleTopToleranceRows = 0.5,
}: ActiveScrollWindowInput): ActiveScrollWindowResult {
  const previousEnd = previousEndIndex ?? previousStartIndex
  const previousWindowKnown =
    previousEndIndex !== undefined && previousEndIndex > previousStartIndex
  const anchorKnown = anchorFirstIndex !== undefined && anchorLastIndex !== undefined
  const previousWindowStillCoversAnchor =
    previousWindowKnown &&
    anchorKnown &&
    anchorFirstIndex >= previousStartIndex &&
    anchorLastIndex < previousEnd
  const canKeepPreviousStartForUp =
    previousWindowStillCoversAnchor && anchorFirstIndex > previousStartIndex + edgeBufferItems
  const canKeepPreviousStartForDown =
    previousWindowStillCoversAnchor && anchorLastIndex < previousEnd - edgeBufferItems
  if (
    activeScrollDirection !== null &&
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
      activeScrollDirection === "up"
        ? visibleTopDelta > visibleTopToleranceRows
        : visibleTopDelta < -visibleTopToleranceRows
    if (movedOpposite) {
      const previousWindowCanStillPaintContent =
        activeScrollDirection === "up" ? previousLeadingHeight <= renderScrollRow : true
      const clampedStart =
        activeScrollDirection === "up"
          ? previousWindowCanStillPaintContent
            ? previousStartIndex
            : (visibleTopClampedStartIndex ?? previousStartIndex)
          : canKeepPreviousStartForDown
            ? previousStartIndex
            : Math.min(startIndex, visibleTopClampedStartIndex ?? previousStartIndex)
      const clampedEnd =
        activeScrollDirection === "up" && clampedStart !== previousStartIndex
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
    activeScrollDirection === "up" &&
    startIndex < previousStartIndex &&
    canKeepPreviousStartForUp
  ) {
    return {
      startIndex: previousStartIndex,
      endIndex: Math.max(endIndex, previousEnd),
      clamped: true,
    }
  }
  if (
    activeScrollDirection === "down" &&
    startIndex > previousStartIndex &&
    canKeepPreviousStartForDown
  ) {
    return {
      startIndex: previousStartIndex,
      endIndex: Math.max(endIndex, previousEnd),
      clamped: true,
    }
  }
  if (activeScrollDirection === "up" && startIndex > previousStartIndex) {
    return {
      startIndex: previousStartIndex,
      endIndex: Math.max(endIndex, previousStartIndex + 1),
      clamped: true,
    }
  }
  if (activeScrollDirection === "down" && startIndex < previousStartIndex) {
    return {
      startIndex: previousStartIndex,
      endIndex: Math.max(endIndex, previousStartIndex + 1),
      clamped: true,
    }
  }
  return { startIndex, endIndex, clamped: false }
}
