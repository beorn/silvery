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

import { type JSX, useCallback, useLayoutEffect, useRef, useState } from "react"
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
  onScrollOffsetChange: (offset: number, meta?: { dragActive: boolean }) => void
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

type DragGeometry = {
  trackTopY: number
  grabRatio: number
}

export function Scrollbar({
  trackHeight,
  scrollableRows,
  scrollOffset,
  onScrollOffsetChange,
  visible = true,
}: ScrollbarProps): JSX.Element | null {
  // Drag state — true between mousedown and the captured mouseup so the cursor
  // can drift outside the 1-column track without losing the grip.
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragGeometryRef = useRef<DragGeometry | null>(null)
  const lastPointerYRef = useRef<number | null>(null)
  // Track hover reveals hidden scrollbars. Thumb hover arms/brightens the
  // thumb. Keep these separate so the whole scrollbar column can expose the
  // affordance without making the thumb look actively grabbed.
  const {
    isHovered: isTrackHovered,
    onMouseEnter: onTrackMouseEnter,
    onMouseLeave: onTrackMouseLeave,
  } = useHover()
  const {
    isHovered: isThumbHovered,
    onMouseEnter: onThumbMouseEnter,
    onMouseLeave: onThumbMouseLeave,
  } = useHover()

  // Geometry: thumb size is proportional to the visible-vs-total ratio.
  // Floor at 1 so a single-row sliver still draws.
  const totalRows = scrollableRows + trackHeight
  const thumbHeight =
    totalRows > 0 ? Math.max(1, Math.floor((trackHeight * trackHeight) / totalRows)) : 0
  const trackRemainder = trackHeight - thumbHeight
  // Convert scrollOffset → frac for thumb position. Snap near-1 to
  // exactly 1 so the thumb reaches the bottom of the track without
  // a 1-cell gap from float drift.
  const rawFrac = scrollableRows > 0 ? scrollOffset / scrollableRows : 0
  const frac = rawFrac > 0.999 ? 1 : rawFrac < 0.001 ? 0 : rawFrac

  const thumbTopFloat = frac * trackRemainder
  const thumbBottomFloat = thumbTopFloat + thumbHeight

  // Compute scroll offset from a pointer row inside the track. Track clicks
  // center the thumb under the pointer; thumb drags preserve the grabbed row
  // inside the thumb so mousedown does not recenter/jump the viewport.
  const offsetFromPointerY = useCallback(
    (pointerY: number, geometry: DragGeometry): number => {
      const relativeY = pointerY - geometry.trackTopY
      const grabOffsetRows = geometry.grabRatio * thumbHeight
      const centeredY = relativeY - grabOffsetRows
      const denom = Math.max(1, trackRemainder)
      const frac = Math.max(0, Math.min(1, centeredY / denom))
      return frac * scrollableRows
    },
    [scrollableRows, thumbHeight, trackRemainder],
  )

  const stopDrag = useCallback(() => {
    draggingRef.current = false
    setIsDragging(false)
    dragGeometryRef.current = null
    lastPointerYRef.current = null
  }, [])

  useLayoutEffect(() => {
    if (!isDragging) return
    const geometry = dragGeometryRef.current
    const pointerY = lastPointerYRef.current
    if (!geometry || pointerY === null) return
    const nextOffset = offsetFromPointerY(pointerY, geometry)
    if (Math.abs(nextOffset - scrollOffset) < 0.001) return
    onScrollOffsetChange(nextOffset, { dragActive: true })
  }, [isDragging, offsetFromPointerY, onScrollOffsetChange, scrollOffset])

  const handleMouseDown = useCallback(
    (e: SilveryMouseEvent) => {
      const node = e.currentTarget
      const rect = node.screenRect ?? node.boxRect
      if (!rect || rect.height <= 0) return
      draggingRef.current = true
      setIsDragging(true)
      const relativeY = e.y - rect.y
      const hitThumb = relativeY >= thumbTopFloat - EPS && relativeY <= thumbBottomFloat + EPS
      const grabOffsetRows = hitThumb ? relativeY - thumbTopFloat : thumbHeight / 2
      const geometry: DragGeometry = {
        trackTopY: rect.y,
        grabRatio: thumbHeight > 0 ? Math.max(0, Math.min(1, grabOffsetRows / thumbHeight)) : 0.5,
      }
      dragGeometryRef.current = geometry
      lastPointerYRef.current = e.y
      onScrollOffsetChange(offsetFromPointerY(e.y, geometry), { dragActive: true })
      e.stopPropagation()
    },
    [
      offsetFromPointerY,
      onScrollOffsetChange,
      thumbBottomFloat,
      thumbHeight,
      thumbTopFloat,
    ],
  )

  // `mouseCapture` on the track makes these handlers receive move/up for the
  // whole press, even when the cursor leaves the one-column hit box.
  const handleMouseMove = useCallback(
    (e: SilveryMouseEvent) => {
      if (!draggingRef.current) return
      const node = e.currentTarget
      const rect = node.screenRect ?? node.boxRect
      if (!rect || rect.height <= 0) return
      const geometry = dragGeometryRef.current ?? {
        trackTopY: rect.y,
        grabRatio: 0.5,
      }
      lastPointerYRef.current = e.y
      onScrollOffsetChange(offsetFromPointerY(e.y, geometry), { dragActive: true })
      e.stopPropagation()
    },
    [offsetFromPointerY, onScrollOffsetChange],
  )

  const handleMouseUp = useCallback(
    (_e: SilveryMouseEvent) => {
      stopDrag()
    },
    [stopDrag],
  )

  // Don't render when content fits or when track is too small. When the
  // consumer passes `visible={false}`, keep the track's hit box mounted so
  // hovering the scrollbar column can reveal the thumb.
  if (scrollableRows <= 0 || thumbHeight <= 0 || thumbHeight >= trackHeight) {
    return null
  }
  const showThumb = visible || isTrackHovered || isDragging

  const firstRow = Math.floor(thumbTopFloat)
  const lastRow = Math.min(trackHeight - 1, Math.ceil(thumbBottomFloat) - 1)

  // Armed/hover thumb tone — brighter when the cursor is over the
  // track or actively dragging. The `$primary` swap matches the
  // macOS-style "this is interactive" affordance and signals the
  // user can start a drag.
  const armed = isThumbHovered || isDragging
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

  const topSpacerRows = Math.max(0, firstRow)
  const bottomSpacerRows = Math.max(0, trackHeight - firstRow - rows.length)

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
      onMouseEnter={onTrackMouseEnter}
      onMouseLeave={onTrackMouseLeave}
    >
      {showThumb ? (
        <>
          {topSpacerRows > 0 ? <Box height={topSpacerRows} flexShrink={0} /> : null}
          <Box
            width={1}
            flexDirection="column"
            flexShrink={0}
            onMouseEnter={onThumbMouseEnter}
            onMouseLeave={onThumbMouseLeave}
          >
            {rows}
          </Box>
          {bottomSpacerRows > 0 ? <Box height={bottomSpacerRows} flexShrink={0} /> : null}
        </>
      ) : null}
    </Box>
  )
}
