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
  renderScrollRow,
  selectedBoxScrollTo,
}: {
  renderScrollRow: number | null
  selectedBoxScrollTo: number | undefined
}): number | undefined {
  return renderScrollRow !== null ? undefined : selectedBoxScrollTo
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
}

export interface ActiveScrollWindowResult {
  startIndex: number
  endIndex: number
  clamped: boolean
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
