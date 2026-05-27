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

export interface ListViewViewportCandidate {
  authority: ListViewScrollAuthority
  row: number | null
  active: boolean
  committed: boolean
}

export interface ListViewViewportFrameResult extends ListViewRenderScrollRowResult {
  candidates: readonly ListViewViewportCandidate[]
  suppressedWriters: readonly ListViewViewportCandidate[]
}

/**
 * Resolve ListView's viewport authority for one render frame.
 *
 * `active` means an input path offered a row-space viewport write this
 * frame. `committed` means the single prioritized authority whose row is
 * actually projected to the scroll container. Suppressed writers are
 * explicit handoffs: they can be diagnosed and tested, but they are not
 * allowed to mutate the viewport for this frame.
 */
export function resolveListViewViewportFrame(
  input: ListViewRenderScrollRowInput,
): ListViewViewportFrameResult {
  const ordered: Array<{ authority: ListViewScrollAuthority; row: number | null }> = [
    { authority: "declarative-row", row: input.declarativeScrollRow },
    { authority: "follow-end", row: input.followPinnedTopRow },
    { authority: "wheel-row", row: input.scrollRow },
    { authority: "follow-disengage", row: input.followDisengageTopRow },
    { authority: "visible-anchor", row: input.maintainedTopRow },
    { authority: "layout", row: null },
  ]
  const committedIndex = ordered.findIndex(
    (candidate) => candidate.authority === "layout" || candidate.row !== null,
  )
  const candidates = ordered.map((candidate, index): ListViewViewportCandidate => {
    const active = candidate.authority !== "layout" && candidate.row !== null
    return {
      ...candidate,
      active,
      committed: index === committedIndex,
    }
  })
  const committed = candidates[committedIndex]!
  return {
    row: committed.row,
    authority: committed.authority,
    candidates,
    suppressedWriters: candidates.filter((candidate) => candidate.active && !candidate.committed),
  }
}

export function resolveListViewRenderScrollRow({
  declarativeScrollRow,
  followPinnedTopRow,
  scrollRow,
  followDisengageTopRow,
  maintainedTopRow,
}: ListViewRenderScrollRowInput): ListViewRenderScrollRowResult {
  const { row, authority } = resolveListViewViewportFrame({
    declarativeScrollRow,
    followPinnedTopRow,
    scrollRow,
    followDisengageTopRow,
    maintainedTopRow,
  })
  return { row, authority }
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
