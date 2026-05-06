import React, { type JSX, useState } from "react"
import { Box } from "../../components/Box"
import { useKineticScroll } from "../../hooks/useKineticScroll"
import { Scrollbar } from "./Scrollbar"

export interface ScrollController {
  contentHeight: number
  viewportHeight: number
  maxScroll: number
  scrollOffset: number
  isScrolling: boolean
  setContentHeight: (height: number) => void
  setViewportHeight: (height: number) => void
  setScrollOffset: (offset: number) => void
  onWheel: (event: { deltaY: number }) => void
}

export interface ScrollAreaProps {
  children: React.ReactNode
  /** Render draggable scrollbar chrome. Defaults to true. */
  scrollbar?: boolean
  /** Forwarded to the outer interaction surface. */
  userSelect?: "text" | "none" | "contain"
}

export function useScrollController(): ScrollController {
  const [contentHeight, setContentHeightState] = useState(0)
  const [viewportHeight, setViewportHeightState] = useState(0)
  const maxScroll = Math.max(0, contentHeight - viewportHeight)
  const { scrollOffset, isScrolling, onWheel, setScrollOffset } = useKineticScroll({
    maxScroll: () => Math.max(0, contentHeight - viewportHeight),
  })

  return {
    contentHeight,
    viewportHeight,
    maxScroll,
    scrollOffset,
    isScrolling,
    setContentHeight: (height: number) => setContentHeightState(Math.max(0, Math.round(height))),
    setViewportHeight: (height: number) => setViewportHeightState(Math.max(0, Math.round(height))),
    setScrollOffset,
    onWheel,
  }
}

/**
 * ScrollArea — canonical vertical scroll surface for plain content.
 *
 * Owns the generic scroll-state loop for non-virtualized content:
 * viewport measurement, content measurement, kinetic wheel scrolling,
 * offset clamping, and scrollbar chrome. Virtualized components such as
 * ListView can still own row-space scrolling, but plain panes should use this
 * instead of reimplementing measurement + `useKineticScroll` glue.
 */
export function ScrollArea({
  children,
  scrollbar = true,
  userSelect,
}: ScrollAreaProps): JSX.Element {
  const controller = useScrollController()

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      minHeight={0}
      position="relative"
      userSelect={userSelect}
    >
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        overflow="scroll"
        scrollOffset={controller.scrollOffset}
        onWheel={controller.onWheel}
        onLayout={(rect) => controller.setViewportHeight(rect.height)}
      >
        <Box
          flexDirection="column"
          flexShrink={0}
          onLayout={(rect) => controller.setContentHeight(rect.height)}
        >
          {children}
        </Box>
      </Box>
      {scrollbar && controller.viewportHeight > 0 ? (
        <Scrollbar
          trackHeight={controller.viewportHeight}
          scrollableRows={controller.maxScroll}
          scrollOffset={controller.scrollOffset}
          onScrollOffsetChange={controller.setScrollOffset}
        />
      ) : null}
    </Box>
  )
}
