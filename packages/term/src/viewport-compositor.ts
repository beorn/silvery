/**
 * Viewport Compositor - Merges frozen history rows with the live viewport.
 *
 * When a user scrolls up into history, the compositor provides the
 * history rows that should be shown. When at the tail (scrollOffset=0),
 * the live React-rendered content is shown instead.
 *
 * scrollOffset uses bottom-origin semantics: scrollOffset=N means
 * "show rows starting at totalHistory - N from the tail".
 *
 * This does NOT replace the React rendering pipeline. It provides
 * overlay data that the rendering layer can use when scrolled up.
 */

import type { HistoryBuffer } from "./history-buffer"

// ============================================================================
// Types
// ============================================================================

export interface ViewportCompositorConfig {
  /** The history buffer containing frozen items */
  history: HistoryBuffer
  /** Height of the viewport in rows */
  viewportHeight: number
  /** Current scroll offset into history (0 = at tail/live) */
  scrollOffset: number
}

export interface ComposedViewport {
  /** History rows to overlay at top of viewport */
  overlayRows: string[]
  /** Number of top rows occupied by history */
  overlayRowCount: number
  /** Number of bottom rows for live content */
  liveRowsVisible: number
  /** Whether viewing history */
  isScrolledUp: boolean
  /** Total scrollable height */
  totalHeight: number
}

// ============================================================================
// Compositor
// ============================================================================

export function composeViewport(config: ViewportCompositorConfig): ComposedViewport {
  const { history, viewportHeight, scrollOffset } = config

  const totalHistory = history.totalRows

  if (scrollOffset <= 0 || totalHistory === 0) {
    return {
      overlayRows: [],
      overlayRowCount: 0,
      liveRowsVisible: viewportHeight,
      isScrolledUp: false,
      totalHeight: totalHistory + viewportHeight,
    }
  }

  // scrollOffset from tail: show rows starting at (totalHistory - clampedOffset)
  const clampedOffset = Math.min(scrollOffset, totalHistory)
  const startRow = Math.max(0, totalHistory - clampedOffset)
  const rowsToShow = Math.min(viewportHeight, totalHistory - startRow)
  const overlayRows = history.getRows(startRow, rowsToShow)
  const liveRowsVisible = viewportHeight - rowsToShow

  return {
    overlayRows,
    overlayRowCount: rowsToShow,
    liveRowsVisible,
    isScrolledUp: true,
    totalHeight: totalHistory + viewportHeight,
  }
}
