/**
 * Popover — hover-driven floating overlay.
 *
 * Canonical silvery primitive, extracted from km-logview (the first consumer,
 * which had this inlined with a structured `{title, lines}` content). This
 * version accepts arbitrary React content so apps can render rich popovers
 * (colored text, nested Boxes, token-styled labels).
 *
 * Semantics:
 *   - `usePopoverHandlers(content)` returns mouse-enter / mouse-leave handlers.
 *     Spread them on any host element (Box or Text). Enter starts a dwell
 *     timer (`HOVER_SHOW_DELAY_MS`); if the cursor stays, the popover shows at
 *     the element's position. Leave cancels any pending show and schedules a
 *     hide with a grace window (`HIDE_DELAY_MS`) so the cursor can transit
 *     into the popover itself without flicker.
 *   - The popover overlay re-cancels the hide on mouse-enter (so you can
 *     actually read / interact with the content) and re-triggers it on leave.
 *   - Overlay is positioned via `position="absolute"` with marginTop /
 *     marginLeft, clamped to the `useWindowSize` viewport. Below-right of the
 *     anchor when it fits; flipped / clamped otherwise.
 *
 * Why in silvery (not per-app): km-logview and silvercode both want hover
 * popovers with the same semantics. Third consumers will come (km-tui omnibox,
 * bead detail peek). Owning this at the framework level removes three copies.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { Box } from "./Box"
import { useHover } from "../hooks/useHover"
import { useWindowSize } from "../hooks/useWindowSize"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PopoverAnchor {
  /** Terminal column (0-indexed) of the anchor point. */
  x: number
  /** Terminal row (0-indexed) of the anchor point. */
  y: number
}

export interface PopoverContent {
  /** Arbitrary React content (Box, Text, nested structures). */
  body: React.ReactNode
  /** Max width in columns. Default: 48. */
  maxWidth?: number
  /**
   * Drop the round border and revert padding to 0. Default: false (border + paddingX={1}).
   * Use for popovers whose body provides its own chrome / framing.
   */
  borderless?: boolean
  /**
   * Anchor flush to the cursor row (no `+1` row gap below). Default: false
   * (one-row gap below the cursor when placing below; no effect when placing above).
   */
  flushTop?: boolean
  /**
   * Horizontal offset added to the anchor column. Positive shifts the popover
   * right of the cursor, leaving the left side of nearby lines visible /
   * hoverable. Default: 0.
   */
  anchorOffsetX?: number
}

interface PopoverState {
  content: PopoverContent | null
  anchor: PopoverAnchor | null
}

interface PopoverCtxValue {
  show(content: PopoverContent, anchor: PopoverAnchor): void
  hide(): void
  /** Cancel a pending hide — call when mouse enters the popover itself. */
  cancelHide(): void
}

// -----------------------------------------------------------------------------
// Timing
// -----------------------------------------------------------------------------

/** Dwell before a hover fires the popover. */
export const HOVER_SHOW_DELAY_MS = 500
/** Grace period for cursor transit from anchor into popover. */
export const HIDE_DELAY_MS = 200

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

const PopoverCtx = createContext<PopoverCtxValue | null>(null)

export function usePopover(): PopoverCtxValue | null {
  return useContext(PopoverCtx)
}

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function PopoverProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<PopoverState>({ content: null, anchor: null })
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const show = useCallback(
    (content: PopoverContent, anchor: PopoverAnchor) => {
      clearHide()
      setState({ content, anchor })
    },
    [clearHide],
  )

  const hide = useCallback(() => {
    clearHide()
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      setState({ content: null, anchor: null })
    }, HIDE_DELAY_MS)
  }, [clearHide])

  const cancelHide = useCallback(() => {
    clearHide()
  }, [clearHide])

  useEffect(() => clearHide, [clearHide])

  const value = useMemo<PopoverCtxValue>(
    () => ({ show, hide, cancelHide }),
    [show, hide, cancelHide],
  )

  return (
    <PopoverCtx.Provider value={value}>
      {children}
      <PopoverOverlay state={state} onEnter={cancelHide} onLeave={hide} />
    </PopoverCtx.Provider>
  )
}

// -----------------------------------------------------------------------------
// Hook: spread handlers onto any element
// -----------------------------------------------------------------------------

/**
 * Returns `{ isHovered, onMouseEnter, onMouseLeave }` for a hover target that
 * also shows a popover after dwell. `isHovered` is true from the moment the
 * cursor enters the element (no dwell) — callers use it to "arm" the element
 * with a hover background so the user sees it's interactive. The popover
 * shows after `HOVER_SHOW_DELAY_MS` of dwell and hides on leave with a grace
 * window so the cursor can transit into the popover itself without flicker.
 */
export function usePopoverHandlers(content: PopoverContent): {
  isHovered: boolean
  onMouseEnter: (e: SilveryMouseEvent) => void
  onMouseLeave: (e: SilveryMouseEvent) => void
} {
  const popover = usePopover()
  const hover = useHover()
  const pendingShowRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPending = useCallback(() => {
    if (pendingShowRef.current) {
      clearTimeout(pendingShowRef.current)
      pendingShowRef.current = null
    }
  }, [])

  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      hover.onMouseEnter(e)
      if (!popover) return
      // `e` is pooled — capture coords eagerly.
      const anchor = { x: e.clientX, y: e.clientY }
      clearPending()
      pendingShowRef.current = setTimeout(() => {
        pendingShowRef.current = null
        popover.show(content, anchor)
      }, HOVER_SHOW_DELAY_MS)
    },
    [hover, popover, content, clearPending],
  )
  const onMouseLeave = useCallback(
    (e: SilveryMouseEvent) => {
      hover.onMouseLeave(e)
      if (!popover) return
      clearPending()
      popover.hide()
    },
    [hover, popover, clearPending],
  )
  return { isHovered: hover.isHovered, onMouseEnter, onMouseLeave }
}

// -----------------------------------------------------------------------------
// Overlay
// -----------------------------------------------------------------------------

function PopoverOverlay({
  state,
  onEnter,
  onLeave,
}: {
  state: PopoverState
  onEnter: () => void
  onLeave: () => void
}): React.ReactElement | null {
  const { columns, rows } = useWindowSize()
  const { content, anchor } = state
  if (!content || !anchor) return null

  // Edge margins: popover must stay at least this far from the viewport
  // edges. 2 cols (left/right) + 1 row (top/bottom) per design convention.
  const EDGE_X = 2
  const EDGE_Y = 1

  // Cap width at the smaller of the requested maxWidth and the viewport
  // width minus edge margins on both sides.
  const maxWidth = Math.min(content.maxWidth ?? 48, Math.max(20, columns - EDGE_X * 2))

  // Placement heuristic: flip to whichever side has more space. When
  // placing ABOVE, anchor the popover from the viewport BOTTOM (using the
  // `bottom` prop) so the popover's bottom edge sits one row above the
  // hover target. This is critical — using `top = anchor.y - maxHeight`
  // would pin a content-sized Box to the top of the screen (Box auto-
  // sizes to content, so the gap to the anchor was huge). With `bottom`,
  // the Box grows upward from near the anchor.
  const spaceBelow = Math.max(0, rows - anchor.y - 1 - EDGE_Y)
  const spaceAbove = Math.max(0, anchor.y - EDGE_Y)
  const placeAbove = spaceAbove > spaceBelow

  const maxHeight = Math.max(4, placeAbove ? spaceAbove : spaceBelow)

  // Horizontal clamp: prefer anchor.x + offset but enforce both edge margins.
  let left = anchor.x + (content.anchorOffsetX ?? 0)
  if (left + maxWidth > columns - EDGE_X) left = columns - EDGE_X - maxWidth
  if (left < EDGE_X) left = EDGE_X

  // Positional props — pass `top` OR `bottom`, never both. Below-anchor
  // gets `top = anchor.y + 1` for a 1-row gap by default; `flushTop: true`
  // drops the gap so the popover sits directly on the anchor row. Above-
  // anchor: `bottom = rows - anchor.y`.
  const belowTop = (content.flushTop ?? false) ? anchor.y : anchor.y + 1
  const placement = placeAbove ? { bottom: rows - anchor.y } : { top: belowTop }

  // Borderless mode drops the round border and the inner padding so the
  // body's own chrome owns the framing. Default keeps today's surface.
  const borderless = content.borderless ?? false

  return (
    <Box
      position="absolute"
      {...placement}
      left={left}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      flexDirection="column"
      borderStyle={borderless ? undefined : "round"}
      borderColor={borderless ? undefined : "$fg-muted"}
      backgroundColor="$bg-surface-overlay"
      paddingX={borderless ? 0 : 1}
      onMouseEnter={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        onEnter()
      }}
      onMouseLeave={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        onLeave()
      }}
      onClick={(e: SilveryMouseEvent) => {
        // Don't let the underlying row handle a click on the popover chrome.
        e.stopPropagation()
      }}
    >
      {content.body}
    </Box>
  )
}
