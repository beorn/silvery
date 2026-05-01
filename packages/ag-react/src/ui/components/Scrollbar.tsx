/**
 * Scrollbar — draggable scrollbar overlay for any scrollable container.
 *
 * Mirrors the scrollbar chrome that ListView renders inline (visible
 * thumb with eighth-block precision, click-on-track to position,
 * mousedown+mousemove to drag-while-held), but as a standalone
 * component so plain `<Box overflow="scroll">` consumers can render
 * the same chrome without growing into a ListView.
 *
 * Usage:
 *
 *   const { scrollOffset, onWheel } = useKineticScroll({ maxScroll })
 *   <Box position="relative" height={H}>
 *     <Box overflow="scroll" height={H} scrollOffset={scrollOffset} onWheel={onWheel}>
 *       {content}
 *     </Box>
 *     <Scrollbar
 *       trackHeight={H}
 *       scrollableRows={maxScroll}
 *       scrollOffset={scrollOffset}
 *       onScrollOffsetChange={setScrollOffset}
 *     />
 *   </Box>
 *
 * The component renders nothing when `scrollableRows <= 0` (content
 * fits) so the consumer doesn't have to gate manually.
 */

import { type JSX, useCallback, useRef, useState } from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useHover } from "../../hooks/useHover"
import type { SilveryMouseEvent } from "@silvery/ag/mouse-event-types"

export interface ScrollbarProps {
  /** Height of the track in rows. Typically equals the scrollable
   * viewport height. */
  trackHeight: number
  /**
   * Number of rows the user can scroll past the visible viewport —
   * `max(0, contentHeight - viewportHeight)`. When 0 (content fits),
   * the scrollbar does not render.
   */
  scrollableRows: number
  /** Current scroll offset in rows (0 = top). */
  scrollOffset: number
  /** Called when the user clicks or drags to a new scroll position. */
  onScrollOffsetChange: (offset: number) => void
  /**
   * Visibility hint. Defaults to true. Pass `false` (or animate it
   * via the consumer's own auto-hide timer) to fade the bar out
   * during idle. The component itself does not implement auto-hide
   * so the consumer can choose its own UX (always-visible, idle-hide,
   * scroll-only).
   */
  visible?: boolean
}

const EIGHTHS = "▁▂▃▄▅▆▇█"
const EPS = 0.001

export function Scrollbar({
  trackHeight,
  scrollableRows,
  scrollOffset,
  onScrollOffsetChange,
  visible = true,
}: ScrollbarProps): JSX.Element | null {
  // Drag state — true between mousedown and the global mouseup so
  // the cursor can drift outside the 1-column track without losing
  // the grip (silvery's per-node mousemove only fires while over
  // the listening node; we route through `term.input.onMouse` for
  // a global capture so vertical drags survive horizontal drift).
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  // Track screen rect captured at mousedown — the global mouse
  // handler converts the live cursor row to a frac using these
  // bounds without having to query the AgNode tree from inside an
  // input-owner callback.
  const trackRectRef = useRef<{ y: number; height: number } | null>(null)
  // Hover state for the track. The thumb brightens when armed
  // (cursor over the track) so the user gets the macOS-style "this
  // is interactive" affordance before they click.
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()

  // Geometry: thumb size is proportional to the visible-vs-total ratio.
  // Floor at 1 so a single-row sliver still draws.
  const totalRows = scrollableRows + trackHeight
  const thumbHeight =
    totalRows > 0 ? Math.max(1, Math.floor((trackHeight * trackHeight) / totalRows)) : 0
  const trackRemainder = trackHeight - thumbHeight

  // Compute scroll offset from a click row inside the track. Centers
  // the thumb on the click so a click at row Y lands the thumb's
  // middle at Y (otherwise a click at the bottom of the track lands
  // (trackHeight-1)/(trackHeight-thumbHeight), never quite frac=1).
  const offsetFromClickY = useCallback(
    (clientY: number, trackTopY: number): number => {
      const relativeY = clientY - trackTopY
      const centeredY = relativeY - thumbHeight / 2
      const denom = Math.max(1, trackRemainder)
      const frac = Math.max(0, Math.min(1, centeredY / denom))
      return frac * scrollableRows
    },
    [scrollableRows, thumbHeight, trackRemainder],
  )

  const stopDrag = useCallback(() => {
    draggingRef.current = false
    setIsDragging(false)
    trackRectRef.current = null
  }, [])

  const handleMouseDown = useCallback(
    (e: SilveryMouseEvent) => {
      const node = e.currentTarget
      const rect = node.screenRect ?? node.boxRect
      if (!rect || rect.height <= 0) return
      draggingRef.current = true
      setIsDragging(true)
      trackRectRef.current = { y: rect.y, height: rect.height }
      onScrollOffsetChange(offsetFromClickY(e.clientY, rect.y))
      e.stopPropagation()
    },
    [offsetFromClickY, onScrollOffsetChange],
  )

  // `mouseCapture` on the track makes these handlers receive move/up for the
  // whole press, even when the cursor leaves the one-column hit box.
  const handleMouseMove = useCallback(
    (e: SilveryMouseEvent) => {
      if (!draggingRef.current) return
      const node = e.currentTarget
      const rect = node.screenRect ?? node.boxRect
      if (!rect || rect.height <= 0) return
      onScrollOffsetChange(offsetFromClickY(e.clientY, rect.y))
      e.stopPropagation()
    },
    [offsetFromClickY, onScrollOffsetChange],
  )

  const handleMouseUp = useCallback(
    (_e: SilveryMouseEvent) => {
      stopDrag()
    },
    [stopDrag],
  )

  // Don't render when content fits, when track is too small, or when
  // the consumer hides us.
  if (!visible || scrollableRows <= 0 || thumbHeight <= 0 || thumbHeight >= trackHeight) {
    return null
  }

  // Convert scrollOffset → frac for thumb position. Snap near-1 to
  // exactly 1 so the thumb reaches the bottom of the track without
  // a 1-cell gap from float drift.
  const rawFrac = scrollableRows > 0 ? scrollOffset / scrollableRows : 0
  const frac = rawFrac > 0.999 ? 1 : rawFrac < 0.001 ? 0 : rawFrac

  const thumbTopFloat = frac * trackRemainder
  const thumbBottomFloat = thumbTopFloat + thumbHeight
  const firstRow = Math.floor(thumbTopFloat)
  const lastRow = Math.min(trackHeight - 1, Math.ceil(thumbBottomFloat) - 1)

  // Armed/hover thumb tone — brighter when the cursor is over the
  // track or actively dragging. The `$primary` swap matches the
  // macOS-style "this is interactive" affordance and signals the
  // user can start a drag.
  const armed = isHovered || isDragging
  const thumbColor = armed ? "$primary" : "$muted"
  const thumbBg = armed ? "$primary" : "$muted"
  const fracInverseFg = armed ? "$bg" : "$bg"

  const rows: JSX.Element[] = []
  for (let r = firstRow; r <= lastRow; r++) {
    const isFirst = r === firstRow
    const isLast = r === lastRow
    const fractionalTop = isFirst && Math.abs(thumbTopFloat - firstRow) > EPS
    const fractionalBottom = isLast && Math.abs(thumbBottomFloat - (lastRow + 1)) > EPS
    if (fractionalTop) {
      const portion = 1 - (thumbTopFloat - firstRow)
      const idx = Math.max(0, Math.round(portion * 8) - 1)
      rows.push(
        <Text key={r} color={thumbColor}>
          {EIGHTHS[idx]!}
        </Text>,
      )
    } else if (fractionalBottom) {
      const portion = thumbBottomFloat - lastRow
      const idx = Math.max(0, Math.round((1 - portion) * 8) - 1)
      rows.push(
        <Text key={r} color={fracInverseFg} backgroundColor={thumbBg}>
          {EIGHTHS[idx]!}
        </Text>,
      )
    } else {
      rows.push(
        <Text key={r} color={thumbColor} backgroundColor={thumbBg}>
          █
        </Text>,
      )
    }
  }

  return (
    <Box
      position="absolute"
      top={0}
      right={0}
      width={1}
      height={trackHeight}
      flexDirection="column"
      // `userSelect="none"` prevents silvery's selection feature from
      // intercepting the mousedown — without it, clicking on the
      // scrollbar starts a text-selection drag and our handlers never
      // fire.
      userSelect="none"
      mouseCapture
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Box position="absolute" top={firstRow} right={0} width={1} flexDirection="column">
        {rows}
      </Box>
    </Box>
  )
}
